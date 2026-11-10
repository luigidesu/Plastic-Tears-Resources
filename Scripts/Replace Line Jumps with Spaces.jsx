#target photoshop
app.bringToFront();

/*
    CONFIG
    true  = only selected text layers
    false = all text layers in document
*/
var ONLY_SELECTED_LAYERS = true;

// -------------------------

function replaceLineBreaks(layer) {
    if (layer.kind !== LayerKind.TEXT) return;

    var ti = layer.textItem;
    ti.contents = ti.contents.replace(/\r+/g, " ");
}

function walkAllLayers(parent) {
    for (var i = 0; i < parent.layers.length; i++) {
        var layer = parent.layers[i];

        if (layer.typename === "LayerSet") {
            walkAllLayers(layer);
        } else {
            replaceLineBreaks(layer);
        }
    }
}

function getSelectedLayerIDs() {
    var ids = [];

    var ref = new ActionReference();
    ref.putProperty(stringIDToTypeID("property"), stringIDToTypeID("targetLayers"));
    ref.putEnumerated(stringIDToTypeID("document"), stringIDToTypeID("ordinal"), stringIDToTypeID("targetEnum"));

    try {
        var desc = executeActionGet(ref);
        var list = desc.getList(stringIDToTypeID("targetLayers"));

        for (var i = 0; i < list.count; i++) {
            ids.push(list.getReference(i).getIdentifier());
        }
    } catch (e) {
        // single layer selected
        var ref2 = new ActionReference();
        ref2.putProperty(stringIDToTypeID("property"), stringIDToTypeID("layerID"));
        ref2.putEnumerated(stringIDToTypeID("layer"), stringIDToTypeID("ordinal"), stringIDToTypeID("targetEnum"));
        ids.push(executeActionGet(ref2).getInteger(stringIDToTypeID("layerID")));
    }

    return ids;
}

function findLayerByID(parent, id) {
    for (var i = 0; i < parent.layers.length; i++) {
        var layer = parent.layers[i];

        if (layer.id === id) return layer;

        if (layer.typename === "LayerSet") {
            var found = findLayerByID(layer, id);
            if (found) return found;
        }
    }
    return null;
}

// ------------------------- RUN

if (!app.documents.length) {
    alert("No document open.");
    exit();
}

var doc = app.activeDocument;

if (ONLY_SELECTED_LAYERS) {
    var ids = getSelectedLayerIDs();

    for (var i = 0; i < ids.length; i++) {
        var layer = findLayerByID(doc, ids[i]);
        if (layer) replaceLineBreaks(layer);
    }
} else {
    walkAllLayers(doc);
}
