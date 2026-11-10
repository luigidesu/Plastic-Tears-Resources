/*
<javascriptresource>
<name>Set Text Full Black - White v1.0 [Plastic Tears]</name>
<enableinfo>true</enableinfo>
<category>Plastic Tears</category>
</javascriptresource>
*/

/* This script converts all document's text layers to their closest solid Black/White colors.
https://community.adobe.com/t5/photoshop-ecosystem-discussions/rounding-text-color-values/m-p/15077416#M846936

Installation:
1. Place script in:
   PC:  C:\<Program Files>\Adobe\Adobe Photoshop <version>\Presets\Scripts\
   Mac: <hard drive>/Applications/Adobe Photoshop <version>/Presets/Scripts/
2. Restart Photoshop.
3. Choose File > Scripts > Set Text Full Black - White
*/

// ====================
var silentMode = true; // ← set to false/true to see alerts
// ==================== 

#target photoshop
app.displayDialogs = DialogModes.NO;

if (app.documents.length > 0) {
    var myDocument = app.activeDocument;
    var theMode = myDocument.mode;
    switch (theMode) {
        case DocumentMode.RGB:
            var theValue = 128;
            var theTotal = 255;
            break;
        case DocumentMode.GRAYSCALE:
            var theValue = 50;
            var theTotal = 100;
            break;
        default:
            break;
    };
    var changedLayers = changeColorOfTypeLayers();

    if (!silentMode && changedLayers.length > 0) {
        alert(changedLayers.length + "\n\n" + changedLayers.join("\n"));
    }
}

function changeColorOfTypeLayers() {
    var myDocument = app.activeDocument;
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt")); 
    var applicationDesc = executeActionGet(ref);
    var theNumber = applicationDesc.getInteger(stringIDToTypeID("numberOfLayers"));
    var changed = [];

    for (var m = 0; m <= theNumber; m++) {
        try {
            var ref = new ActionReference();
            ref.putIndex(charIDToTypeID("Lyr "), m);
            var layerDesc = executeActionGet(ref);
            var layerSet = typeIDToStringID(layerDesc.getEnumerationValue(stringIDToTypeID("layerSection")));
            var isBackground = layerDesc.getBoolean(stringIDToTypeID("background"));

            if (layerSet !== "layerSectionEnd" && layerSet !== "layerSectionStart" && !isBackground && layerDesc.hasKey(stringIDToTypeID("textKey"))) {
                var theName = layerDesc.getString(stringIDToTypeID('name'));
                var theID = layerDesc.getInteger(stringIDToTypeID('layerID'));
                var textDesc = layerDesc.getObjectValue(stringIDToTypeID("textKey"));
                var rangeList = textDesc.getList(stringIDToTypeID("textStyleRange"));
                var theColor = rangeList.getObjectValue(0).getObjectValue(stringIDToTypeID("textStyle")).getObjectValue(stringIDToTypeID("color"));

                var theBright;
                if (theTotal == 255) {
                    var theRed = theColor.getDouble(stringIDToTypeID('red'));
                    var theGreen = theColor.getDouble(stringIDToTypeID('green'));
                    var theBlue = theColor.getDouble(stringIDToTypeID('blue'));
                    theBright = (theRed + theGreen + theBlue) / 3;
                } else {
                    theBright = theColor.getDouble(stringIDToTypeID('gray'));
                }

                if (theBright !== 0 && theBright !== theTotal) {
                    selectLayerByID(theID, false);
                    var newColor = new SolidColor();

                    if (theBright < theValue) {
                        newColor.rgb.red = 0;
                        newColor.rgb.green = 0;
                        newColor.rgb.blue = 0;
                        if (theTotal === 100) newColor.gray.gray = 0;
                    } else {
                        newColor.rgb.red = 255;
                        newColor.rgb.green = 255;
                        newColor.rgb.blue = 255;
                        if (theTotal === 100) newColor.gray.gray = 100;
                    }

                    myDocument.activeLayer.textItem.color = newColor;
                    changed.push(theName + " (ID: " + theID + ")");
                }
            }
        } catch (e) {
            if (!silentMode) $.writeln("Error on layer " + m + ": " + e.message);
        }
    }

    return changed;
}

function selectLayerByID(id, add) {
    add = add || false;
    var ref = new ActionReference();
    ref.putIdentifier(charIDToTypeID("Lyr "), id);
    var desc = new ActionDescriptor();
    desc.putReference(charIDToTypeID("null"), ref);
    if (add) {
        desc.putEnumerated(stringIDToTypeID("selectionModifier"), stringIDToTypeID("selectionModifierType"), stringIDToTypeID("addToSelection"));
    }
    desc.putBoolean(charIDToTypeID("MkVs"), false);
    try {
        executeAction(charIDToTypeID("slct"), desc, DialogModes.NO);
    } catch (e) {
        if (!silentMode) $.writeln("Select layer failed: " + e.message);
    }
}
