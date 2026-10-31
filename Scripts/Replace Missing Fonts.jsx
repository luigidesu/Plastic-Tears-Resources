/*

Replace Missing Fonts.jsx

Description:
Automatically replaces missing fonts in text layers with the installed versions on the user's system. 
Useful when Photoshop does not detect or match updated font versions correctly. 
Assumes the user already has the correct version of the fonts installed.

Installation:
1. Place script in:
   PC:  C:\<Program Files>\Adobe\Adobe Photoshop <version>\Presets\Scripts\
   Mac: <hard drive>/Applications/Adobe Photoshop <version>/Presets/Scripts/
2. Restart Photoshop.
3. Choose File > Scripts > Replace Missing Fonts

Changelog:
v1.0 – 23 May 2025 – Kewl0210 – Initial version.
v1.1 – 20 August 2025 – Luigi – Updated to work with any font/style automatically.
v1.2 – 13 July 2026 – Luigi – Minimal textStyleRange-only set (full textKey rebuild could
       zero properties via the parent-style hierarchy and silently dropped descriptor
       types the copy switch didn't cover), cached font lookup, Regular-preferring
       family fallback, consistent metadata on replacement (fontName / fontStyleName /
       fontPostScriptName all updated), end-of-run summary alert with SHOW_SUMMARY
       toggle, displayDialogs now saved and restored.

*/

/*
<javascriptresource>
<name>Replace Missing Fonts v1.2 [Plastic Tears]</name>
<enableinfo>true</enableinfo>
<category>Plastic Tears</category>
</javascriptresource>
*/

#target photoshop

// ===== Config =====

// true  = show an end-of-run summary alert (replaced / partial / not fixed)
// false = fully silent, batch-friendly
var SHOW_SUMMARY = false;

// Styles tried, in order, when the requested style isn't installed for a family
var FALLBACK_STYLES = ["Regular", "Roman", "Book", "Plain", "Normal", "Medium"];

// ===== Run state =====
var replacedLog = [];
var partialLog = [];
var failedLog = [];
var fontIndex = null; // built once on first lookup

if (app.documents.length > 0) {
    app.activeDocument.suspendHistory("Replace Missing Fonts", "main()");
}

function main() {
    replacedLog = [];
    partialLog = [];
    failedLog = [];
    fontIndex = null;

    var savedDialogs = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;
    try {
        var doc = app.activeDocument;
        for (var i = 0; i < doc.layers.length; i++) {
            processLayer(doc.layers[i]);
        }
        if (SHOW_SUMMARY) showSummary();
    } finally {
        app.displayDialogs = savedDialogs;
    }
}

// Extension points — identity by default. Override these to remap renamed
// families/styles (e.g. return "CC Wild Words 2" when given "CC Wild Words").
function getReplacementFontName(originalFontName) {
    return originalFontName;
}

function getReplacementFontStyle(originalFontStyle, originalFontName) {
    return originalFontStyle;
}

function processLayer(layer) {
    if (layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT) {
        try {
            fixLayerFonts(layer);
        } catch (e) {
            failedLog.push('Layer "' + layer.name + '" — ' + e.message);
            $.writeln("Error processing layer: " + layer.name + " — " + e.message);
        }
    } else if (layer.typename === "LayerSet") {
        for (var i = 0; i < layer.layers.length; i++) {
            processLayer(layer.layers[i]);
        }
    }
}

function fixLayerFonts(layer) {
    var ref = new ActionReference();
    ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
    var desc = executeActionGet(ref);
    var textKey = desc.getObjectValue(stringIDToTypeID("textKey"));

    var textStyleRange = textKey.getList(stringIDToTypeID("textStyleRange"));
    var newRangeList = new ActionList();
    var replaced = false;

    for (var j = 0; j < textStyleRange.count; j++) {
        var rangeDesc = textStyleRange.getObjectValue(j);
        var textStyle = rangeDesc.getObjectValue(stringIDToTypeID("textStyle"));

        if (textStyle.hasKey(stringIDToTypeID("fontAvailable")) &&
            !textStyle.getBoolean(stringIDToTypeID("fontAvailable"))) {

            var wantName = getReplacementFontName(
                textStyle.getString(stringIDToTypeID("fontName"))
            );
            var wantStyle = getReplacementFontStyle(
                textStyle.getString(stringIDToTypeID("fontStyleName")),
                wantName
            );

            var match = findInstalledFont(wantName, wantStyle);
            if (match === null) {
                failedLog.push('Layer "' + layer.name + '": no installed match for ' + wantName + " " + wantStyle);
            } else {
                // Write all three keys so the font panel metadata matches what's applied
                textStyle.putString(stringIDToTypeID("fontName"), match.family);
                textStyle.putString(stringIDToTypeID("fontStyleName"), match.style);
                textStyle.putString(stringIDToTypeID("fontPostScriptName"), match.postScriptName);
                replaced = true;

                var entry = 'Layer "' + layer.name + '": ' + wantName + " " + wantStyle + " → " + match.postScriptName;
                if (match.partial) {
                    partialLog.push(entry + ' (style "' + wantStyle + '" not installed, used "' + match.style + '")');
                } else {
                    replacedLog.push(entry);
                }
            }
        }

        var newRange = new ActionDescriptor();
        newRange.putInteger(stringIDToTypeID("from"), rangeDesc.getInteger(stringIDToTypeID("from")));
        newRange.putInteger(stringIDToTypeID("to"), rangeDesc.getInteger(stringIDToTypeID("to")));
        newRange.putObject(stringIDToTypeID("textStyle"), stringIDToTypeID("textStyle"), textStyle);
        newRangeList.putObject(stringIDToTypeID("textStyleRange"), newRange);
    }

    if (!replaced) return;

    // DOM snapshots for properties PS has been seen to reset on text descriptor pushes
    var ti = layer.textItem;
    var savedKind = ti.kind;
    var savedAA = ti.antiAliasMethod;

    // Minimal set: push only textStyleRange. Rebuilding the full textKey lets the
    // parent-style hierarchy zero unrelated properties (baselineShift et al.) and
    // drops any key whose DescValueType a copy switch doesn't cover.
    var newTextDesc = new ActionDescriptor();
    newTextDesc.putList(stringIDToTypeID("textStyleRange"), newRangeList);

    var setDesc = new ActionDescriptor();
    var lyrRef = new ActionReference();
    lyrRef.putIdentifier(charIDToTypeID("Lyr "), layer.id);
    setDesc.putReference(charIDToTypeID("null"), lyrRef);
    setDesc.putObject(charIDToTypeID("T   "), stringIDToTypeID("textLayer"), newTextDesc);
    executeAction(charIDToTypeID("setd"), setDesc, DialogModes.NO);

    if (ti.kind !== savedKind) ti.kind = savedKind;
    if (ti.antiAliasMethod !== savedAA) ti.antiAliasMethod = savedAA;
}

// ===== Font matching =====

function normalize(str) {
    return String(str).toLowerCase().replace(/[\s\-_.]/g, "");
}

function buildFontIndex() {
    fontIndex = { byKey: {}, byFamily: {} };
    for (var i = 0; i < app.fonts.length; i++) {
        var f = app.fonts[i];
        var rec = { family: f.family, style: f.style, postScriptName: f.postScriptName };
        var famKey = normalize(f.family);
        var key = famKey + "|" + normalize(f.style);
        if (!fontIndex.byKey[key]) fontIndex.byKey[key] = rec;
        if (!fontIndex.byFamily[famKey]) fontIndex.byFamily[famKey] = [];
        fontIndex.byFamily[famKey].push(rec);
    }
}

// Returns { family, style, postScriptName, partial } or null if no family match
function findInstalledFont(family, style) {
    if (fontIndex === null) buildFontIndex();

    var famKey = normalize(family);

    var exact = fontIndex.byKey[famKey + "|" + normalize(style)];
    if (exact) {
        return { family: exact.family, style: exact.style, postScriptName: exact.postScriptName, partial: false };
    }

    var fam = fontIndex.byFamily[famKey];
    if (!fam || fam.length === 0) return null;

    // Requested style not installed: prefer an upright cut over enumeration order
    for (var i = 0; i < FALLBACK_STYLES.length; i++) {
        var pref = fontIndex.byKey[famKey + "|" + normalize(FALLBACK_STYLES[i])];
        if (pref) {
            return { family: pref.family, style: pref.style, postScriptName: pref.postScriptName, partial: true };
        }
    }
    var first = fam[0];
    return { family: first.family, style: first.style, postScriptName: first.postScriptName, partial: true };
}

// ===== Summary =====

function showSummary() {
    var total = replacedLog.length + partialLog.length + failedLog.length;
    if (total === 0) {
        alert("Replace Missing Fonts\n\nNo missing fonts found.");
        return;
    }
    var msg = "Replace Missing Fonts — Summary";
    if (replacedLog.length > 0) {
        msg += "\n\nReplaced (" + replacedLog.length + "):\n- " + replacedLog.join("\n- ");
    }
    if (partialLog.length > 0) {
        msg += "\n\nPartial matches (" + partialLog.length + "):\n- " + partialLog.join("\n- ");
    }
    if (failedLog.length > 0) {
        msg += "\n\nNot fixed (" + failedLog.length + "):\n- " + failedLog.join("\n- ");
    }
    alert(msg);
}
