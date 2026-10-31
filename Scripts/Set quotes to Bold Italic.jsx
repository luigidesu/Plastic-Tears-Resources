/*
Set Quotes to Bold Italic.jsx v1.8
28th August, 2026 by Luigi (https://plastictearsmanga.com/)
Modified to include Mixed-Style Safety Check + correct style range rebuilding

Description:
This script detects text inside quotes—single, double, or curly—and changes both the quotes and their contents to bold italic style, leaving the rest untouched.
If the document is in RGB mode and the text is colored, it assumes colored manga and changes the text color to red.

Installation:
1. Place script in:
   PC:  C:\<Program Files>\Adobe\Adobe Photoshop <version>\Presets\Scripts\
   Mac: <hard drive>/Applications/Adobe Photoshop <version>/Presets/Scripts/
2. Restart Photoshop.
3. Choose File > Scripts > Set Quotes to Bold Italic
*/

// ============ USER SETTINGS ============

var fullAutoMode = true; // Toggle: false = only selected layers, true = process ALL text layers in the document.

var processMixedStyles = true; // false = Ignore layers that have been edited (mixed fonts/styles). true = Process everything.

var italicSuffix = "-BoldItalic"; // Suffix used for italic/bold-italic PostScript name.

var removeQuotesAfterStyling = true; // true = remove quotes after bolding

var showSummary = false; // true = report what was changed when the script finishes. Set to false when running inside a batch action.

var redColor = new ActionDescriptor(); // Set Red Color. [Based on the JoJoLion colored manga] 
redColor.putDouble(stringIDToTypeID("red"), 160);
redColor.putDouble(stringIDToTypeID("green"), 0);
redColor.putDouble(stringIDToTypeID("blue"), 20);

// =======================================

/*
<javascriptresource>
<name>Set Quotes to Bold Italic v1.8 [Plastic Tears]</name>
<enableinfo>true</enableinfo>
<category>Plastic Tears</category>
</javascriptresource>
*/

#target photoshop
app.displayDialogs = DialogModes.NO;

// Used only by the unpaired-quote report at the end of processLayer().
var reQuoteScan = /['\u2018\u2019\u201A\u201B]/g;
var reLetter    = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]/;

// ---------- MAIN ----------
if (!app.documents.length) {
    alert("Open a document first.");
} else {
    var isRGB = (app.activeDocument.mode === DocumentMode.RGB);
    var stats = { scanned: 0, changed: 0, spans: 0, errors: [], warnings: [] };

    app.activeDocument.suspendHistory("Set quotes to Bold Italic", "main()");

    if (showSummary) {
        var msg = "Text layers scanned: " + stats.scanned
                + "\nLayers restyled: "   + stats.changed
                + "\nQuoted spans found: " + stats.spans;
        if (stats.errors.length)   msg += "\n\nSkipped:\n" + stats.errors.join("\n");
        if (stats.warnings.length) msg += "\n\nCheck by hand:\n" + stats.warnings.join("\n");
        alert(msg);
    }
}

function main() {
    if (!app.documents.length) return;

    var doc = app.activeDocument;

    if (fullAutoMode) {
        var allTextLayers = [];
        getAllTextLayers(doc, allTextLayers);
        for (var i = 0; i < allTextLayers.length; i++) {
            try {
                processLayer(allTextLayers[i]);
            } catch (e) {
                stats.errors.push(allTextLayers[i].name + " - " + e);
                $.writeln("Error processing layer: " + allTextLayers[i].name + " - " + e);
            }
        }
    } else {
        var selectedIds = getSelectedLayerIDs();
        if (!selectedIds || selectedIds.length === 0) return;

        for (var i = 0; i < selectedIds.length; i++) {
            var layer = findLayerById(doc, selectedIds[i]);
            if (layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT) {
                try {
                    processLayer(layer);
                } catch (e) {
                    stats.errors.push(layer.name + " - " + e);
                    $.writeln("Error processing layer id " + selectedIds[i] + ": " + e);
                }
            }
        }
    }
}

// Recursively collect all text layers from the document
function getAllTextLayers(container, outArray) {
    for (var i = 0; i < container.layers.length; i++) {
        var lyr = container.layers[i];
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.TEXT) {
            outArray.push(lyr);
        } else if (lyr.typename === "LayerSet") {
            getAllTextLayers(lyr, outArray);
        }
    }
}

// ---------- Get selected layer IDs ----------
function getSelectedLayerIDs() {
    var ids = [];
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("targetLayers"));
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    try {
        var desc = executeActionGet(ref);
        var list = desc.getList(stringIDToTypeID("targetLayers"));
        for (var i = 0; i < list.count; i++) {
            var idx = list.getReference(i).getIndex();
            var ref2 = new ActionReference();
            ref2.putIndex(charIDToTypeID("Lyr "), idx);
            var desc2 = executeActionGet(ref2);
            var layerId = desc2.getInteger(stringIDToTypeID("layerID"));
            ids.push(layerId);
        }
    } catch (e) {
        try {
            var r = new ActionReference();
            r.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerID"));
            r.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
            var d = executeActionGet(r);
            ids.push(d.getInteger(stringIDToTypeID("layerID")));
        } catch (ee) {}
    }
    return ids;
}

// ---------- Find layer by id ----------
function findLayerById(container, id) {
    for (var i = 0; i < container.layers.length; i++) {
        var lyr = container.layers[i];
        if (lyr.typename === "ArtLayer") {
            if (lyr.id === id) return lyr;
        } else if (lyr.typename === "LayerSet") {
            if (lyr.id === id) return lyr;
            var found = findLayerById(lyr, id);
            if (found) return found;
        }
    }
    return null;
}

// ---------- Get the original style descriptor for a character position ----------
// Finds whichever range in styleList contains charPos, so bold-italic inherits
// the correct font size/color from that specific range (not always index 0).
function getStyleAtIndex(styleList, charPos) {
    for (var i = 0; i < styleList.count; i++) {
        var rangeDesc = styleList.getObjectValue(i);
        var from = rangeDesc.getInteger(stringIDToTypeID("from"));
        var to   = rangeDesc.getInteger(stringIDToTypeID("to"));
        if (charPos >= from && charPos < to) {
            return rangeDesc.getObjectValue(stringIDToTypeID("textStyle"));
        }
    }
    // Fallback: return the last range's style
    return styleList.getObjectValue(styleList.count - 1).getObjectValue(stringIDToTypeID("textStyle"));
}

// ---------- Copy original style ranges that overlap [origStart, origEnd) into finalStyles ----------
// Splits ranges at the segment boundaries so non-quoted text keeps its exact original styling.
// newStart is where this segment begins in the new (post-removal) string.
function addOriginalStyleRanges(styleList, origStart, origEnd, newStart, finalStyles) {
    for (var i = 0; i < styleList.count; i++) {
        var rangeDesc = styleList.getObjectValue(i);
        var from  = rangeDesc.getInteger(stringIDToTypeID("from"));
        var to    = rangeDesc.getInteger(stringIDToTypeID("to"));
        var style = rangeDesc.getObjectValue(stringIDToTypeID("textStyle"));

        var overlapStart = Math.max(from, origStart);
        var overlapEnd   = Math.min(to, origEnd);

        if (overlapStart >= overlapEnd) continue;

        var newFrom = newStart + (overlapStart - origStart);
        var newTo   = newStart + (overlapEnd   - origStart);

        var newRange = new ActionDescriptor();
        newRange.putInteger(stringIDToTypeID("from"), newFrom);
        newRange.putInteger(stringIDToTypeID("to"),   newTo);
        newRange.putObject(stringIDToTypeID("textStyle"), stringIDToTypeID("textStyle"), style);
        finalStyles.putObject(stringIDToTypeID("textStyleRange"), newRange);
    }
}

// ---------- Process one text layer ----------
function processLayer(textLayer) {
    var textItem = textLayer.textItem;
    var contents = String(textItem.contents);
    stats.scanned++;

    // --- Regex Setup ---
    var matches = [];
    var doubleRegex = /([\u0022\u201C\u201D\u00AB\u00BB])([\s\S]*?)([\u0022\u201C\u201D\u00AB\u00BB])/g;
    var m;
    while ((m = doubleRegex.exec(contents)) !== null) {
        matches.push({ start: m.index, end: doubleRegex.lastIndex, type: 'double', innerText: m[2] });
    }

    // Single Regex: matched by POSITION, not by punctuation, so Spanish emphasis
    // like 'DOLARES' or 'MUERTOS' is caught while apostrophes are still ignored.
    //   1. opening quote must sit at the start or after a space / opening punctuation,
    //      so the apostrophe in DON'T or D'ARBY can never open a span;
    //   2. no space may follow the opening quote, and none may precede the closing one;
    //   3. closing quote must be followed by end, space or closing punctuation;
    //   4. the span MAY contain a quote character, but only one that rule 3 disqualifies
    //      as a closing quote -- i.e. one not followed by end/space/closing punctuation.
    //      That is what an apostrophe inside a word always looks like, so DON'T, YOU'D,
    //      O'CLOCK and 'EM are absorbed into the span with no list of words anywhere.
    //      It still cannot leap over a real closing quote to reach a far-away one,
    //      because the moment a quote qualifies under rule 3 the span ends there.
    var singleRegex = /(^|[\s,;:!?"\u201C\u201D\u00AB\u00BB\u00A1\u00BF\(\[\{\-\u2013\u2014\u2026])(['\u2018\u2019\u201A\u201B])(?![\s'\u2018\u2019\u201A\u201B])((?:[^'\u2018\u2019\u201A\u201B]|['\u2018\u2019\u201A\u201B](?!$|[\s,;:!?."\u201C\u201D\u00AB\u00BB\)\]\}\-\u2013\u2014\u2026]))*?[^\s'\u2018\u2019\u201A\u201B])(['\u2018\u2019\u201A\u201B])(?=$|[\s,;:!?."\u201C\u201D\u00AB\u00BB\)\]\}\-\u2013\u2014\u2026])/g;
    while ((m = singleRegex.exec(contents)) !== null) {
        var actualStart = m.index + m[1].length;
        matches.push({
            start: actualStart,
            end: actualStart + m[2].length + m[3].length + m[4].length,
            type: 'single',
            innerText: m[3]
        });
    }

    if (matches.length === 0) return;
    
    // Sort matches chronologically
    matches.sort(function(a, b) { return a.start - b.start; });

    // --- THE OVERLAP FILTER ---
    // Destroys nested matches so they don't corrupt the string indexing
    var filteredMatches = [];
    var currentMatch = null;
    for (var j = 0; j < matches.length; j++) {
        if (!currentMatch) {
            currentMatch = matches[j];
            filteredMatches.push(currentMatch);
        } else {
            // If the next match starts before the current one ends, it is a nested overlap. Skip it.
            if (matches[j].start < currentMatch.end) {
                continue;
            } else {
                currentMatch = matches[j];
                filteredMatches.push(currentMatch);
            }
        }
    }
    matches = filteredMatches; // Reassign the clean array

    // --- UNPAIRED SINGLE QUOTE CHECK ---
    // A single quote left over after a span WAS bolded on this layer is the ambiguous
    // case no rule can settle (THE BOYS' CLUB, GOIN'). Report it so a human can glance
    // at it, rather than letting it fail silently.
    var stray = 0, sm;
    reQuoteScan.lastIndex = 0;
    while ((sm = reQuoteScan.exec(contents)) !== null) {
        var covered = false;
        for (var q = 0; q < matches.length; q++) {
            if (sm.index >= matches[q].start && sm.index < matches[q].end) { covered = true; break; }
        }
        if (covered) continue;
        // A quote with a letter on both sides is just an apostrophe (DON'T) -- not a loose quote.
        var chBefore = sm.index > 0 ? contents.charAt(sm.index - 1) : "";
        var chAfter  = contents.charAt(sm.index + 1);
        if (reLetter.test(chBefore) && reLetter.test(chAfter)) continue;
        stray++;
    }
    if (stray > 0) {
        stats.warnings.push(textLayer.name + " - " + stray + " unpaired single quote(s)");
    }

    // --- Retrieve Action Descriptors ---
    var getRef = new ActionReference();
    getRef.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("textKey"));
    getRef.putIdentifier(charIDToTypeID("TxLr"), textLayer.id);
    var layerDesc = executeActionGet(getRef);
    var textDesc  = layerDesc.getObjectValue(stringIDToTypeID("textKey"));
    var styleList = textDesc.getList(stringIDToTypeID("textStyleRange"));

    // ============================================================
    // CHECK FOR MANUALLY EDITED LAYERS (MIXED STYLES)
    // ============================================================
    if (!processMixedStyles) {
        if (styleList.count > 1) {
            var firstStyle = styleList.getObjectValue(0).getObjectValue(stringIDToTypeID("textStyle"));
            var firstFont  = "";
            try { firstFont = firstStyle.getString(stringIDToTypeID("fontPostScriptName")); } catch(e) {}

            for (var k = 1; k < styleList.count; k++) {
                var nextStyle = styleList.getObjectValue(k).getObjectValue(stringIDToTypeID("textStyle"));
                var nextFont  = "";
                try { nextFont = nextStyle.getString(stringIDToTypeID("fontPostScriptName")); } catch(e) {}

                if (firstFont !== nextFont) {
                    stats.errors.push(textLayer.name + " - mixed fonts, left alone");
                    return;
                }
            }
        }
    }
    // ============================================================

    // --- Build segments covering the ENTIRE text string ---
    // Each segment is either plain (keep original style) or bold (apply bold-italic).
    // This ensures Photoshop always gets a complete, gap-free style range list,
    // which prevents bidi/punctuation rendering issues like the !WOW flip.
    var segments = [];
    var cursor = 0;
    for (var j = 0; j < matches.length; j++) {
        var match = matches[j];
        if (cursor < match.start) {
            segments.push({ start: cursor, end: match.start, isBold: false });
        }
        segments.push({ start: match.start, end: match.end, isBold: true, innerText: match.innerText });
        cursor = match.end;
    }
    if (cursor < contents.length) {
        segments.push({ start: cursor, end: contents.length, isBold: false });
    }

    // --- Walk segments to build new content string and complete style list ---
    var newContents = "";
    var finalStyles = new ActionList();
    var newPos = 0;

    for (var j = 0; j < segments.length; j++) {
        var seg     = segments[j];
        var origLen = seg.end - seg.start;

        if (!seg.isBold) {
            // Plain segment: append original text, preserve original styling
            newContents += contents.substring(seg.start, seg.end);
            addOriginalStyleRanges(styleList, seg.start, seg.end, newPos, finalStyles);
            newPos += origLen;

        } else {
            // Bold segment: use innerText if removing quotes, full text otherwise
            var displayText = removeQuotesAfterStyling ? seg.innerText : contents.substring(seg.start, seg.end);
            var displayLen  = displayText.length;
            newContents += displayText;

            // Get the style that covers THIS match's position (fixes the size-change bug)
            var baseStyle = getStyleAtIndex(styleList, seg.start);
            var baseFont  = "";
            try { baseFont = baseStyle.getString(stringIDToTypeID("fontPostScriptName")); } catch(e) {}
            var fontBase  = baseFont ? baseFont.split("-")[0] : String(textItem.font).split("-")[0];

            var boldStyle = new ActionDescriptor();
            boldStyle.fromStream(baseStyle.toStream());

            try {
                boldStyle.putString(stringIDToTypeID("fontPostScriptName"), fontBase + italicSuffix);
                var styleName = italicSuffix.replace("-", "").replace(/([a-z])([A-Z])/g, "$1 $2");
                boldStyle.putString(stringIDToTypeID("fontStyleName"), styleName);
            } catch (e) {}

            if (isRGB && boldStyle.hasKey(stringIDToTypeID("color"))) {
                var col = boldStyle.getObjectValue(stringIDToTypeID("color"));
                try {
                    var r = 0, g = 0, b = 0;
                    
                    // Extract RGB values if they exist (Grayscale or CMYK text might not have these keys)
                    if (col.hasKey(stringIDToTypeID("red"))) r = Math.round(col.getDouble(stringIDToTypeID("red")));
                    if (col.hasKey(stringIDToTypeID("green"))) g = Math.round(col.getDouble(stringIDToTypeID("green")));
                    if (col.hasKey(stringIDToTypeID("blue"))) b = Math.round(col.getDouble(stringIDToTypeID("blue")));

                    // Define a tolerance to catch pure and near-pure black/white
                    var isBlack = (r <= 10 && g <= 10 && b <= 10);
                    var isWhite = (r >= 245 && g >= 245 && b >= 245);

                    // If the text is NOT black and NOT white, apply the custom red
                    if (!isBlack && !isWhite) {
                        boldStyle.putObject(stringIDToTypeID("color"), stringIDToTypeID("RGBColor"), redColor);
                    }
                } catch(e) {}
            }

            var rangeDesc = new ActionDescriptor();
            rangeDesc.putInteger(stringIDToTypeID("from"), newPos);
            rangeDesc.putInteger(stringIDToTypeID("to"),   newPos + displayLen);
            rangeDesc.putObject(stringIDToTypeID("textStyle"), stringIDToTypeID("textStyle"), boldStyle);
            finalStyles.putObject(stringIDToTypeID("textStyleRange"), rangeDesc);

            newPos += displayLen;
        }
    }

    // --- Apply ---
    stats.changed++;
    stats.spans += matches.length;

    if (removeQuotesAfterStyling) {
        textDesc.putString(stringIDToTypeID("textKey"), newContents);
    }
    textDesc.putList(stringIDToTypeID("textStyleRange"), finalStyles);

    var setRef = new ActionReference();
    setRef.putIdentifier(charIDToTypeID("TxLr"), textLayer.id);
    var setDesc = new ActionDescriptor();
    setDesc.putReference(charIDToTypeID("null"), setRef);
    setDesc.putObject(charIDToTypeID("T   "), charIDToTypeID("TxLr"), textDesc);
    executeAction(charIDToTypeID("setd"), setDesc, DialogModes.NO);
}