#target photoshop

/*
 * BouncySFX - v2.0
 *
 * Gives repeated letters in a sound effect an alternating rhythm: in a run of
 * 3+ identical characters every other letter is lifted off the baseline, and
 * the ones left sitting on the baseline get extra tracking so the run doesn't
 * bunch up.
 *
 * v2.0
 *   - AUTO MODE. The script finds the SFX layers itself (see CFG.MODE), so
 *     there's no hand-picking layers in the Layers panel and missing one.
 *   - Character styling is PRESERVED. v1 rebuilt every character's style from
 *     scratch out of font + size + colour, which silently reset everything it
 *     didn't know about: kerning dropped from optical back to metrics, and the
 *     OpenType features (ligatures, alternate ligatures, contextual
 *     alternates) that "Correct Spanish SFX Text Settings" switches on were
 *     switched back off. v2 reads each character's existing style and
 *     overwrites nothing but baselineShift and tracking.
 *   - Tracking unit fixed. v1 wrote `tracking * 0.001` (inherited from
 *     PrimePussify.jsx), so ADDED_TRACKING of 50 was applied as 0.05/1000 em -
 *     never visible - and any tracking already on the layer was flattened to
 *     zero on the way past. Tracking is stored in 1/1000 em, the same number
 *     the Character panel shows, and is now written as-is in whatever numeric
 *     type Photoshop stored it as.
 *   - Re-runnable. The layer's own baseline/tracking are worked out from the
 *     text as a whole instead of being read off character 0, so running this
 *     twice - or over a page that's already bounced - lands on the same result
 *     rather than stacking a second helping of tracking on top.
 *   - Layers with no run of repeated letters are left completely untouched,
 *     and the original layer selection is put back when it's done.
 * v2.1
 *   - Alerts are off by default (CFG.ALERTS). A batch run over a folder no
 *     longer stops on a dialog when a page happens to have no SFX on it.
 *   - Baseline shift is written in points again, and the implied* keys
 *     Photoshop reports next to the real ones are dropped rather than cloned
 *     back; between them those two were swallowing the bounce.
 * v1.0
 *   - Original: manual selection, per-character rebuild.
 */

var s2t = stringIDToTypeID;
var c2t = charIDToTypeID;

var CFG = {
    // ---- which layers get bounced ---------------------------------------
    // "smart"     : 2+ layers highlighted -> exactly those; otherwise scan
    //               the whole document for SFX layers.            (default)
    // "auto"      : always scan the whole document, ignore the selection.
    // "selection" : only the highlighted layers (v1 behaviour). Highlight a
    //               group to mean every text layer inside it. Use this when
    //               you want to bounce one single layer that isn't in an SFX
    //               font - a scream in a balloon, say.
    MODE: "smart",

    // Fonts that mark a text layer as SFX. Matched loosely: case, spaces and
    // dashes are ignored and the entry only has to appear somewhere inside
    // the font name, so "Scott Campbell" catches CCJScottCampbell-Italic,
    // "CCJ Scott Campbell-Italic" and every other cut of the family.
    SFX_FONTS: ["Scott Campbell"],

    // Anything inside a group with one of these names counts as SFX too.
    // Empty list = off.
    SFX_GROUPS: ["SFX"],

    // ...and any layer whose own name matches. Empty list = off.
    SFX_LAYER_NAMES: [],

    // ---- the bounce itself ----------------------------------------------
    SHIFT_AMOUNT: 0.5,     // baseline lift, in points
    ADDED_TRACKING: 50,    // extra tracking on the letters left down (1/1000 em)
    TRIGGER_COUNT: 3,      // identical letters in a row before it kicks in
    LETTERS_ONLY: true,    // false = punctuation runs ("...", "!!!") bounce too

    // ---- reporting -------------------------------------------------------
    // "off"      : never puts a dialog on screen, so a batch runs start to
    //              finish untended. Nothing is reported, errors included.
    // "problems" : speak up only when nothing got bounced or a layer failed.
    // "always"   : also confirm the pages that worked.
    ALERTS: "off",

    // Lists every font in the document with a * on the ones CFG.SFX_FONTS
    // matches, then stops. Always shows its list - there'd be nowhere else to
    // put it - so leave it off unless you're tuning the font list.
    REPORT_FONTS: false
};

// A "letter" for run detection: any character with a distinct upper and lower
// case. That covers A-Z plus the accented Latin-1 letters (tildes, enye,
// dieresis) without putting non-ASCII characters in this file, since
// Photoshop does not guarantee how it decodes a .jsx.
function isLetter(ch) {
    return ch.toLowerCase() !== ch.toUpperCase();
}

if (!app.documents.length) {
    say("Open a document first.");
} else {
    app.activeDocument.suspendHistory("Bouncy SFX", "main()");
}

function main() {
    try {
        if (CFG.REPORT_FONTS) { reportFonts(); return; }

        var selected = getSelectedLayerIDs();
        var mode = (CFG.MODE === "smart") ? (selected.length >= 2 ? "selection" : "auto") : CFG.MODE;
        var targets = (mode === "selection") ? collectTextTargets(selected) : scanForSFX();

        var stats = { done: 0, skipped: 0 };
        var issues = [];

        for (var i = 0; i < targets.length; i++) {
            try {
                processLayer(targets[i], stats);
            } catch (e) {
                issues.push(layerNameByID(targets[i]) + " - " + e.message);
            }
        }

        restoreSelection(selected);
        report(mode, stats, issues);
    } catch (fatal) {
        say("BouncySFX stopped: " + fatal.message);
    }
}

// ============================================================================
// PICKING THE LAYERS
// ============================================================================

// Every text layer that carries an SFX font / sits in an SFX group.
function scanForSFX() {
    var out = [];
    eachTextLayer(function (id, name, groups) {
        if (isSFX(id, name, groups)) out.push(id);
    });
    return out;
}

function isSFX(id, name, groups) {
    var i;
    for (i = 0; i < groups.length; i++) {
        if (matchesAny(groups[i], CFG.SFX_GROUPS)) return true;
    }
    if (matchesAny(name, CFG.SFX_LAYER_NAMES)) return true;

    if (CFG.SFX_FONTS.length) {
        var fonts = fontsOf(textKeyByID(id));
        for (i = 0; i < fonts.length; i++) {
            if (matchesAny(fonts[i], CFG.SFX_FONTS)) return true;
        }
    }
    return false;
}

// Single top-to-bottom pass over the layer stack, handing every text layer to
// fn along with its name and the names of the groups it sits inside.
function eachTextLayer(fn) {
    var n = docProp('numberOfLayers').getInteger(s2t('numberOfLayers'));
    var lowest = hasBackground() ? 0 : 1;
    var groups = [];

    for (var idx = n; idx >= lowest; idx--) {
        var section = layerProp(idx, 'layerSection').getEnumerationValue(s2t('layerSection'));

        // Descending the stack we meet a group's header first and its hidden
        // closing divider last, so start pushes and end pops.
        if (section === s2t('layerSectionEnd')) { groups.pop(); continue; }
        if (section === s2t('layerSectionStart')) {
            groups.push(layerProp(idx, 'name').getString(s2t('name')));
            continue;
        }
        if (layerProp(idx, 'layerKind').getInteger(s2t('layerKind')) !== 3) continue; // 3 = text

        fn(layerProp(idx, 'layerID').getInteger(s2t('layerID')),
           layerProp(idx, 'name').getString(s2t('name')),
           groups);
    }
}

// IDs of text layers that are selected outright or sit inside a selected group.
function collectTextTargets(selectedIDs) {
    var out = [];
    var isSel = {};
    for (var i = 0; i < selectedIDs.length; i++) isSel[selectedIDs[i]] = true;

    var n = docProp('numberOfLayers').getInteger(s2t('numberOfLayers'));
    var lowest = hasBackground() ? 0 : 1;
    var covered = 0;
    var stack = [];

    for (var idx = n; idx >= lowest; idx--) {
        var section = layerProp(idx, 'layerSection').getEnumerationValue(s2t('layerSection'));

        if (section === s2t('layerSectionEnd')) {
            if (stack.pop()) covered--;
            continue;
        }

        var id = layerProp(idx, 'layerID').getInteger(s2t('layerID'));
        var pick = covered > 0 || isSel[id] === true;

        if (section === s2t('layerSectionStart')) {
            stack.push(pick);
            if (pick) covered++;
        } else if (pick && layerProp(idx, 'layerKind').getInteger(s2t('layerKind')) === 3) {
            out.push(id);
        }
    }
    return out;
}

// ============================================================================
// THE BOUNCE
// ============================================================================

function processLayer(id, stats) {
    selectLayerByID(id);

    var tk = textKeyOfActive();
    var text = tk.getString(s2t('textKey'));
    var ranges = tk.getList(s2t('textStyleRange'));
    if (!text.length || !ranges.count) return;

    var runs = findRuns(text);
    if (!runs.any) { stats.skipped++; return; }   // nothing to do: don't touch it at all

    var srcOf = mapCharsToRanges(ranges, text.length);
    var cur = readCurrent(ranges, srcOf, text.length);
    var base = deriveBase(cur, runs, text.length);

    var plan = [];
    for (var k = 0; k < text.length; k++) plan[k] = targetFor(k, runs, base, cur[k]);

    var aaBefore = tk.hasKey(s2t('antiAlias')) ? tk.getEnumerationValue(s2t('antiAlias')) : null;
    writeRanges(ranges, srcOf, plan, text.length);
    restoreAntiAlias(aaBefore);

    stats.done++;
}

// Runs of 3+ identical characters -> { index in the string : position in the run }.
function findRuns(text) {
    var pos = {}, any = false, run = [], i, j;

    for (i = 0; i <= text.length; i++) {
        var repeats = i > 0 && i < text.length &&
                      counts(text.charAt(i)) &&
                      text.charAt(i).toLowerCase() === text.charAt(i - 1).toLowerCase();
        if (repeats) { run.push(i); continue; }

        if (run.length >= CFG.TRIGGER_COUNT) {
            for (j = 0; j < run.length; j++) { pos[run[j]] = j; any = true; }
        }
        run = (i < text.length && counts(text.charAt(i))) ? [i] : [];
    }
    return { any: any, pos: pos };
}

function counts(ch) {
    return CFG.LETTERS_ONLY ? isLetter(ch) : /\S/.test(ch);
}

// Odd positions in the run ride up; the even ones stay down and take the
// extra tracking so the run doesn't close up under them.
function deltaFor(k, runs) {
    var p = runs.pos[k];
    if (p === undefined) return { baseline: 0, tracking: 0 };
    return (p % 2 === 1)
        ? { baseline: CFG.SHIFT_AMOUNT, tracking: 0 }
        : { baseline: 0, tracking: CFG.ADDED_TRACKING };
}

function targetFor(k, runs, base, cur) {
    if (runs.pos[k] !== undefined) {
        var d = deltaFor(k, runs);
        return { baseline: base.baseline + d.baseline, tracking: base.tracking + d.tracking };
    }
    // Outside a run: leave the character as it is, unless it's still carrying
    // a bounce from an earlier run of this script over different text.
    return {
        baseline: near(cur.baseline, base.baseline + CFG.SHIFT_AMOUNT) ? base.baseline : cur.baseline,
        tracking: near(cur.tracking, base.tracking + CFG.ADDED_TRACKING) ? base.tracking : cur.tracking
    };
}

// The layer's own baseline/tracking, read off the characters this effect
// leaves where they are - they carry the layer's real value whether or not
// the layer has been bounced before, which is what makes a second run over
// the same page land on the same result. (Reading character 0 instead, as v1
// did, compounds the tracking every time, because character 0 is itself often
// the head of a run.) A run is at least 3 long, so there is always at least
// one unmoved character to ask.
function deriveBase(cur, runs, len) {
    var bl = [], tr = [];
    for (var k = 0; k < len; k++) {
        var d = deltaFor(k, runs);
        if (d.baseline === 0) bl.push(cur[k].baseline);
        if (d.tracking === 0) tr.push(cur[k].tracking);
    }
    return { baseline: modeOf(bl, 0), tracking: modeOf(tr, 0) };
}

// Which style range each character draws its styling from.
function mapCharsToRanges(ranges, len) {
    var map = [], i, r;
    for (i = 0; i < len; i++) map[i] = 0;

    for (r = 0; r < ranges.count; r++) {
        var d = ranges.getObjectValue(r);
        var from = d.getInteger(s2t('from'));
        var to = d.getInteger(s2t('to'));
        for (i = Math.max(from, 0); i < to && i < len; i++) map[i] = r;
    }
    return map;
}

function readCurrent(ranges, srcOf, len) {
    var out = [], cache = {};
    for (var k = 0; k < len; k++) {
        var r = srcOf[k];
        if (cache[r] === undefined) {
            var st = ranges.getObjectValue(r).getObjectValue(s2t('textStyle'));
            cache[r] = {
                baseline: numOf(st, 'baselineShift', 0),
                tracking: numOf(st, 'tracking', 0)
            };
        }
        out[k] = cache[r];
    }
    return out;
}

// Rebuild the style ranges, merging neighbours that share a source style and
// land on the same numbers so the layer keeps as few ranges as it started with.
function writeRanges(ranges, srcOf, plan, len) {
    var list = new ActionList();
    var start = 0;

    for (var k = 1; k <= len; k++) {
        var same = k < len && srcOf[k] === srcOf[start] &&
                   near(plan[k].baseline, plan[start].baseline) &&
                   near(plan[k].tracking, plan[start].tracking);
        if (same) continue;

        list.putObject(s2t('textStyleRange'), rangeFor(ranges, srcOf[start], start, k, plan[start]));
        start = k;
    }

    var to = new ActionDescriptor();
    to.putList(s2t('textStyleRange'), list);

    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putEnumerated(s2t('textLayer'), s2t('ordinal'), s2t('targetEnum'));
    d.putReference(s2t('null'), r);
    d.putObject(s2t('to'), s2t('textLayer'), to);
    executeAction(s2t('set'), d, DialogModes.NO);
}

// getObjectValue hands back a private copy, so this edits the character's real
// style - every key we don't touch (kerning, ligatures, caps, language, faux
// styles, scale, colour, size...) rides along untouched.
function rangeFor(ranges, srcIdx, from, to, target) {
    var style = ranges.getObjectValue(srcIdx).getObjectValue(s2t('textStyle'));

    // Always write the shift in points, the way v1 did, rather than in
    // whatever unit Photoshop reported it in: a shift of "0.5" handed back in
    // pixels is invisible on an HD page, which is what swallowed the bounce.
    style.putUnitDouble(s2t('baselineShift'), s2t('pointsUnit'), target.baseline);
    putNum(style, 'tracking', target.tracking);

    // Photoshop reports these next to the real values and honours them when
    // the two disagree, so a cloned style would keep re-asserting the old
    // shift. Drop the partners of the keys we just set and let Photoshop work
    // them out again. (v1 never sent them, having built its style from bare.)
    eraseKey(style, 'impliedBaselineShift');
    eraseKey(style, 'impliedTracking');

    var d = new ActionDescriptor();
    d.putInteger(s2t('from'), from);
    d.putInteger(s2t('to'), to);
    d.putObject(s2t('textStyle'), s2t('textStyle'), style);
    return d;
}

function restoreAntiAlias(before) {
    if (before === null) return;
    var tk = textKeyOfActive();
    var after = tk.hasKey(s2t('antiAlias')) ? tk.getEnumerationValue(s2t('antiAlias')) : null;
    if (after === null || after === before) return;

    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putProperty(s2t('property'), s2t('antiAlias'));
    r.putEnumerated(s2t('textLayer'), s2t('ordinal'), s2t('targetEnum'));
    d.putReference(s2t('null'), r);
    d.putEnumerated(s2t('to'), s2t('antiAliasType'), before);
    executeAction(s2t('set'), d, DialogModes.NO);
}

// ============================================================================
// REPORTING
// ============================================================================

// Anything the script wants to say goes through here, so CFG.ALERTS is the
// one place that decides whether a dialog is allowed to interrupt.
function say(msg) {
    if (CFG.ALERTS !== "off") alert(msg);
}

function report(mode, stats, issues) {
    if (CFG.ALERTS === "off") return;

    var problem = !stats.done || issues.length > 0;
    if (CFG.ALERTS !== "always" && !problem) return;   // quiet when it just worked

    var lines = [];
    lines.push(stats.done ? "Bounced " + stats.done + " layer(s)." : "Nothing to bounce.");

    if (stats.skipped) {
        lines.push(stats.skipped + " layer(s) had no run of " +
                   CFG.TRIGGER_COUNT + "+ repeated letters - left alone.");
    }
    if (!stats.done && !stats.skipped && mode === "auto") {
        lines.push("No SFX layers found. Check CFG.SFX_FONTS, or set");
        lines.push("CFG.REPORT_FONTS to true to list the fonts this document uses.");
    }
    if (issues.length) lines.push("", "Issues:", issues.join("\n"));

    say(lines.join("\n"));
}

function reportFonts() {
    var seen = [];
    eachTextLayer(function (id) {
        var fonts = fontsOf(textKeyByID(id));
        for (var i = 0; i < fonts.length; i++) {
            var hit = null;
            for (var j = 0; j < seen.length; j++) {
                if (seen[j].name === fonts[i]) { hit = seen[j]; break; }
            }
            if (hit) hit.n++;
            else seen.push({ name: fonts[i], n: 1, sfx: matchesAny(fonts[i], CFG.SFX_FONTS) });
        }
    });

    if (!seen.length) { alert("No text layers in this document."); return; }

    var lines = ["Fonts in this document (* = matches CFG.SFX_FONTS):", ""];
    for (var k = 0; k < seen.length; k++) {
        lines.push((seen[k].sfx ? "  * " : "    ") + seen[k].name + "   (" + seen[k].n + ")");
    }
    alert(lines.join("\n"));
}

// Every PostScript and family name used anywhere in one text layer.
function fontsOf(tk) {
    var out = [];
    var list = tk.getList(s2t('textStyleRange'));
    for (var i = 0; i < list.count; i++) {
        var st = list.getObjectValue(i).getObjectValue(s2t('textStyle'));
        if (st.hasKey(s2t('fontPostScriptName'))) out.push(st.getString(s2t('fontPostScriptName')));
        else if (st.hasKey(s2t('fontName'))) out.push(st.getString(s2t('fontName')));
    }
    return out;
}

// ============================================================================
// SMALL HELPERS
// ============================================================================

function norm(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchesAny(hay, needles) {
    if (!needles || !needles.length) return false;
    var h = norm(hay);
    for (var i = 0; i < needles.length; i++) {
        var n = norm(needles[i]);
        if (n && h.indexOf(n) !== -1) return true;
    }
    return false;
}

function near(a, b) {
    return Math.abs(a - b) < 0.001;
}

function modeOf(values, dflt) {
    if (!values.length) return dflt;
    var buckets = [], i, j;

    for (i = 0; i < values.length; i++) {
        var hit = null;
        for (j = 0; j < buckets.length; j++) {
            if (near(buckets[j].v, values[i])) { hit = buckets[j]; break; }
        }
        if (hit) hit.n++;
        else buckets.push({ v: values[i], n: 1 });
    }

    var best = buckets[0];
    for (j = 1; j < buckets.length; j++) if (buckets[j].n > best.n) best = buckets[j];
    return best.v;
}

function numOf(desc, key, dflt) {
    var id = s2t(key);
    if (!desc.hasKey(id)) return dflt;
    var t = desc.getType(id);
    if (t === DescValueType.UNITDOUBLE) return desc.getUnitDoubleValue(id);
    if (t === DescValueType.INTEGERTYPE) return desc.getInteger(id);
    if (t === DescValueType.DOUBLETYPE) return desc.getDouble(id);
    return dflt;
}

// Writes back using the type Photoshop stored the key as, so tracking stays an
// integer where Photoshop had it as one.
function putNum(desc, key, value) {
    var id = s2t(key);
    if (desc.hasKey(id)) {
        var t = desc.getType(id);
        if (t === DescValueType.UNITDOUBLE) {
            desc.putUnitDouble(id, desc.getUnitDoubleType(id), value);
            return;
        }
        if (t === DescValueType.INTEGERTYPE) {
            desc.putInteger(id, Math.round(value));
            return;
        }
    }
    desc.putDouble(id, value);
}

function eraseKey(desc, key) {
    var id = s2t(key);
    if (!desc.hasKey(id)) return;
    try { desc.erase(id); } catch (e) {}
}

// ============================================================================
// ACTION MANAGER HELPERS
// ============================================================================

function getSelectedLayerIDs() {
    var ids = [], list, i;

    try {
        list = docProp('targetLayersIDs').getList(s2t('targetLayersIDs'));
        for (i = 0; i < list.count; i++) {
            try { ids.push(list.getReference(i).getIdentifier()); }
            catch (eRef) { ids.push(list.getInteger(i)); }
        }
        return ids;
    } catch (eIDs) {}

    // Older Photoshop: transient indices, 1-based when there's no Background.
    try {
        list = docProp('targetLayers').getList(s2t('targetLayers'));
        var offset = hasBackground() ? 0 : 1;
        for (i = 0; i < list.count; i++) {
            var r = new ActionReference();
            r.putIndex(c2t('Lyr '), list.getReference(i).getIndex() + offset);
            ids.push(executeActionGet(r).getInteger(s2t('layerID')));
        }
    } catch (eIdx) {}
    return ids;
}

function selectLayerByID(id) {
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putIdentifier(c2t('Lyr '), id);
    d.putReference(s2t('null'), r);
    d.putBoolean(s2t('makeVisible'), false);
    executeAction(s2t('select'), d, DialogModes.NO);
}

function restoreSelection(ids) {
    for (var i = 0; i < ids.length; i++) {
        var d = new ActionDescriptor();
        var r = new ActionReference();
        r.putIdentifier(c2t('Lyr '), ids[i]);
        d.putReference(s2t('null'), r);
        if (i > 0) d.putEnumerated(s2t('selectionModifier'), s2t('selectionModifierType'), s2t('addToSelection'));
        d.putBoolean(s2t('makeVisible'), false);
        try { executeAction(s2t('select'), d, DialogModes.NO); } catch (e) {}
    }
}

function textKeyOfActive() {
    var r = new ActionReference();
    r.putProperty(s2t('property'), s2t('textKey'));
    r.putEnumerated(s2t('layer'), s2t('ordinal'), s2t('targetEnum'));
    return executeActionGet(r).getObjectValue(s2t('textKey'));
}

function textKeyByID(id) {
    var r = new ActionReference();
    r.putProperty(s2t('property'), s2t('textKey'));
    r.putIdentifier(c2t('Lyr '), id);
    return executeActionGet(r).getObjectValue(s2t('textKey'));
}

function docProp(prop) {
    var r = new ActionReference();
    r.putProperty(s2t('property'), s2t(prop));
    r.putEnumerated(s2t('document'), s2t('ordinal'), s2t('targetEnum'));
    return executeActionGet(r);
}

function layerProp(idx, prop) {
    var r = new ActionReference();
    r.putProperty(s2t('property'), s2t(prop));
    r.putIndex(c2t('Lyr '), idx);
    return executeActionGet(r);
}

function hasBackground() {
    try { return docProp('hasBackgroundLayer').getBoolean(s2t('hasBackgroundLayer')); }
    catch (e) { return false; }
}

function layerNameByID(id) {
    try {
        var r = new ActionReference();
        r.putProperty(s2t('property'), s2t('name'));
        r.putIdentifier(c2t('Lyr '), id);
        return '"' + executeActionGet(r).getString(s2t('name')) + '"';
    } catch (e) { return 'layer id ' + id; }
}
