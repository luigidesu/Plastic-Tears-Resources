/*
Scale Layer Style Effects For All Text Layers.jsx
v1.0, 10th June 2024, Stephen Marsh
https://community.adobe.com/t5/photoshop-ecosystem-discussions/selecting-text-layers-with-effects/td-p/14671058
*/

#target photoshop

var theValue = 833; // Layer style % 

if (!documents.length) {
    alert('There are no documents open!');
} else {
    processAllLayersAndSets(app.activeDocument);
}

function processAllLayersAndSets(obj) {
    // Process Layers 
    for (var i = obj.artLayers.length - 1; 0 <= i; i--) {
        app.activeDocument.activeLayer = obj.artLayers[i];
        if (app.activeDocument.activeLayer.kind == LayerKind.TEXT && haslayerEffects() === true) {
            scaleEffectsEvent(theValue);
        }
    }
    // Process Layer Set Layers 
    for (var j = obj.layerSets.length - 1; 0 <= j; j--) {
        processAllLayersAndSets(obj.layerSets[j]);
    }
}

function scaleEffectsEvent(theScale) {
    try {
        var s2t = function (s) {
            return app.stringIDToTypeID(s);
        };
        var descriptor = new ActionDescriptor();
        descriptor.putUnitDouble(s2t("scale"), s2t("percentUnit"), theScale);
        executeAction(s2t("scaleEffectsEvent"), descriptor, DialogModes.NO);
    } catch (e) {}
}

function haslayerEffects() {
    // by greless
    // returns true or false
    try {
        var r = new ActionReference();
        r.putEnumerated(stringIDToTypeID("layer"), stringIDToTypeID("ordinal"), stringIDToTypeID("targetEnum"));
        var options = executeActionGet(r);
        return options.hasKey(stringIDToTypeID("layerEffects"));
    } catch (e) { }
}