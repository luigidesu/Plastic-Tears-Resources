/*
Markdown Text Styling 1.0.jsx
Based on "Set Quotes to Bold Italic" structure.

Description:
Parses text layers for Markdown syntax:
*Italic*
**Bold**
***Bold Italic***
Removes the asterisks and applies the font style to the content.

Usage:
1. Edit the "USER SETTINGS" below to match your font names.
2. Run via File > Scripts > Browse...
*/

// ============ USER SETTINGS ============

var fullAutoMode = true; // true = Process ALL text layers; false = Only selected layers.

// IMPORTANT: These must match the PostScript suffix of your fonts.
// Example: If font is "Font-Regular", the Bold version is assumed to be "Font-Bold".
var boldSuffix = "-Bold";
var italicSuffix = "-Italic";
var boldItalicSuffix = "-BoldItalic";

// =======================================

#target photoshop
app.displayDialogs = DialogModes.NO;

// ---------- MAIN ----------
app.activeDocument.suspendHistory("Apply Markdown Styles", "main()");

function main() {
    if (!app.documents.length) return;
    var doc = app.activeDocument;

    if (fullAutoMode) {
        var allTextLayers = [];
        getAllTextLayers(doc, allTextLayers);
        for (var i = 0; i < allTextLayers.length; i++) {
            processLayer(allTextLayers[i]);
        }
    } else {
        var selectedIds = getSelectedLayerIDs();
        for (var i = 0; i < selectedIds.length; i++) {
            var layer = findLayerById(doc, selectedIds[i]);
            if (layer && layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT) {
                processLayer(layer);
            }
        }
    }
}

// Recursively collect all text layers
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

// Get selected layer IDs
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
            ids.push(desc2.getInteger(stringIDToTypeID("layerID")));
        }
    } catch (e) {
        // Fallback for single selection
        var r = new ActionReference();
        r.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerID"));
        r.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        try { ids.push(executeActionGet(r).getInteger(stringIDToTypeID("layerID"))); } catch (e) {}
    }
    return ids;
}

function findLayerById(container, id) {
    for (var i = 0; i < container.layers.length; i++) {
        var lyr = container.layers[i];
        if (lyr.typename === "ArtLayer") {
            if (lyr.id === id) return lyr;
        } else if (lyr.typename === "LayerSet") {
            var found = findLayerById(lyr, id);
            if (found) return found;
        }
    }
    return null;
}

// ---------- PROCESS LAYER LOGIC ----------
function processLayer(textLayer) {
    var textItem = textLayer.textItem;
    var originalContents = String(textItem.contents);
    
    // 1. Find all matches (BoldItalic, then Bold, then Italic)
    // We prioritize longest match first (***) so it doesn't get eaten by (*)
    var matches = [];
    // Regex explanation:
    // Group 1: ***, Group 2: content (BoldItalic)
    // Group 3: **, Group 4: content (Bold)
    // Group 5: *, Group 6: content (Italic)
    var regex = /(\*{3})([^*]+?)\1|(\*{2})([^*]+?)\3|(\*{1})([^*]+?)\5/g;
    
    var m;
    while ((m = regex.exec(originalContents)) !== null) {
        var matchObj = {
            fullMatch: m[0],
            index: m.index,
            length: m[0].length
        };

        if (m[1]) { // *** Bold Italic
            matchObj.type = "BoldItalic";
            matchObj.content = m[2];
        } else if (m[3]) { // ** Bold
            matchObj.type = "Bold";
            matchObj.content = m[4];
        } else if (m[5]) { // * Italic
            matchObj.type = "Italic";
            matchObj.content = m[6];
        }
        matches.push(matchObj);
    }

    if (matches.length === 0) return;

    // 2. Get the Base Style from the layer
    var getRef = new ActionReference();
    getRef.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("textKey"));
    getRef.putIdentifier(charIDToTypeID("TxLr"), textLayer.id);
    var layerDesc = executeActionGet(getRef);
    var textKey = layerDesc.getObjectValue(stringIDToTypeID("textKey"));
    var styleList = textKey.getList(stringIDToTypeID("textStyleRange"));
    
    // We assume the first style in the layer is the "Base" font.
    var baseStyleObj = styleList.getObjectValue(0).getObjectValue(stringIDToTypeID("textStyle"));
    var baseFontName = "";
    try { baseFontName = baseStyleObj.getString(stringIDToTypeID("fontPostScriptName")); } catch(e){}
    
    // Attempt to clean the base font name (remove existing suffixes like -Regular or -Italic to find the root)
    // Common convention: "Arial-Regular" -> "Arial"
    var fontRoot = baseFontName.split("-")[0];

    // 3. Reconstruct String and Styles
    var finalStyles = new ActionList();
    var newString = "";
    var currentReadIndex = 0;

    for (var i = 0; i < matches.length; i++) {
        var match = matches[i];

        // A. Handle text BEFORE this match (Plain Base Style)
        if (match.index > currentReadIndex) {
            var plainText = originalContents.substring(currentReadIndex, match.index);
            addStyleRange(finalStyles, newString.length, newString.length + plainText.length, baseStyleObj, baseFontName);
            newString += plainText;
        }

        // B. Handle the MATCHED text (Styled)
        var content = match.content;
        var targetSuffix = "";
        if (match.type === "Bold") targetSuffix = boldSuffix;
        if (match.type === "Italic") targetSuffix = italicSuffix;
        if (match.type === "BoldItalic") targetSuffix = boldItalicSuffix;

        var targetFontName = fontRoot + targetSuffix;

        // Clone base style and update font
        var newStyle = new ActionDescriptor();
        newStyle.fromStream(baseStyleObj.toStream());
        newStyle.putString(stringIDToTypeID("fontPostScriptName"), targetFontName);
        // Note: We don't change 'fontStyleName' strictly because PS relies mostly on PostScriptName

        addStyleRange(finalStyles, newString.length, newString.length + content.length, newStyle, targetFontName);
        newString += content;

        currentReadIndex = match.index + match.length;
    }

    // C. Handle any remaining text AFTER the last match
    if (currentReadIndex < originalContents.length) {
        var remainingText = originalContents.substring(currentReadIndex);
        addStyleRange(finalStyles, newString.length, newString.length + remainingText.length, baseStyleObj, baseFontName);
        newString += remainingText;
    }

    // 4. Apply changes to layer
    textKey.putString(stringIDToTypeID("textKey"), newString);
    textKey.putList(stringIDToTypeID("textStyleRange"), finalStyles);

    var setRef = new ActionReference();
    setRef.putIdentifier(charIDToTypeID("TxLr"), textLayer.id);
    var setDesc = new ActionDescriptor();
    setDesc.putReference(charIDToTypeID("null"), setRef);
    setDesc.putObject(charIDToTypeID("T   "), charIDToTypeID("TxLr"), textKey);
    executeAction(charIDToTypeID("setd"), setDesc, DialogModes.NO);
}

// Helper to push a style range into the ActionList
function addStyleRange(actionList, start, end, styleDesc, fontName) {
    var rangeDesc = new ActionDescriptor();
    rangeDesc.putInteger(stringIDToTypeID("from"), start);
    rangeDesc.putInteger(stringIDToTypeID("to"), end);
    rangeDesc.putObject(stringIDToTypeID("textStyle"), stringIDToTypeID("textStyle"), styleDesc);
    actionList.putObject(stringIDToTypeID("textStyleRange"), rangeDesc);
}