/*
Select All Text Layers with Effects.jsx
v1.0, 10th June 2024, Stephen Marsh
https://community.adobe.com/t5/photoshop-ecosystem-discussions/selecting-text-layers-with-effects/td-p/14671058
*/

#target photoshop

var selectedLayers = []; // Array to keep track of layers with effects

if (!documents.length) {
    alert('There are no documents open!');
} else {
    processAllLayersAndSets(app.activeDocument);
    selectLayersWithEffects(); // Select all layers with effects at the end
}

function processAllLayersAndSets(obj) {
    // Process Layers 
    for (var i = obj.artLayers.length - 1; 0 <= i; i--) {
        app.activeDocument.activeLayer = obj.artLayers[i];
        if (app.activeDocument.activeLayer.kind == LayerKind.TEXT && haslayerEffects() === true) {
            selectedLayers.push(app.activeDocument.activeLayer); // Add layer to selected layers array
        }
    }
    // Process Layer Set Layers 
    for (var j = obj.layerSets.length - 1; 0 <= j; j--) {
        processAllLayersAndSets(obj.layerSets[j]);
    }
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

function selectLayersWithEffects() {
    if (selectedLayers.length > 0) {
        var desc = new ActionDescriptor();
        var ref = new ActionReference();

        for (var i = 0; i < selectedLayers.length; i++) {
            ref.putIdentifier(stringIDToTypeID("layer"), selectedLayers[i].id);
        }

        desc.putReference(stringIDToTypeID("null"), ref);
        desc.putBoolean(stringIDToTypeID("addToSelection"), true);

        executeAction(stringIDToTypeID("select"), desc, DialogModes.NO);
    }
}
