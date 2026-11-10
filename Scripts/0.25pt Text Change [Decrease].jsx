/*
PrecisionTextResizer.jsx - Fast Edition (v2.1)
-----------------------------------------------------------------------
Description: Increases or decreases font size of selected text layers
             by a specific decimal amount (e.g., 0.25 pt).
             Ignores non-text layers and Groups.

v2.1: Speed rewrite.
      - The old bottleneck was looking up each selected layer by walking
        the whole layer tree once PER layer (O(n^2)). This now grabs the
        selected layer IDs in one call, then walks the tree a single time
        and bails out early once every selected layer has been found.
      - Sizing still goes through textItem.size (points), so it is
        resolution-independent. No DPI conversion, no under-the-hood
        pixel math.
      - Selection is never touched. Still one undo step for the batch.
      - Behaviour on mixed-size layers is unchanged from the original.
-----------------------------------------------------------------------
*/

#target photoshop

// ====================================================================
// --- USER SETTINGS --------------------------------------------------
// ====================================================================

// How much to change the size by (in points)
var stepSize = 0.25;

// Set to "increase" to make text bigger, or "decrease" to make it smaller
var mode = "decrease";

// ====================================================================
// --- MAIN SCRIPT (DO NOT EDIT BELOW) --------------------------------
// ====================================================================

app.bringToFront();

// Type IDs used for reading the current selection. Resolved once.
var S = stringIDToTypeID;
var kProperty        = S("property");
var kLayer           = S("layer");
var kDocument        = S("document");
var kOrdinal         = S("ordinal");
var kTargetEnum      = S("targetEnum");
var kTargetLayersIDs = S("targetLayersIDs");
var kTargetLayers    = S("targetLayers");
var kLayerID         = S("layerID");
var kHasBackground   = S("hasBackgroundLayer");

if (app.documents.length > 0) {
    // Whole batch collapses into a single Undo.
    app.activeDocument.suspendHistory("Precision Text Resize", "run()");
}

function run() {
    var doc = app.activeDocument;
    var delta = stepSize * (mode.toLowerCase() === "decrease" ? -1 : 1);

    // 1) Get the IDs of the selected layers in one shot.
    var ids = getSelectedLayerIDs();
    if (!ids.length) return;

    // 2) Build a lookup set and count unique targets (for early exit).
    var sel = {};
    var remaining = 0;
    for (var i = 0; i < ids.length; i++) {
        if (!sel[ids[i]]) {
            sel[ids[i]] = true;
            remaining++;
        }
    }

    // 3) Single pass over the tree; resize matches as they turn up.
    var state = { remaining: remaining };
    processTree(doc, sel, state, delta);
}

// Walks the layer tree once. For every layer whose ID is in the
// selection set, decrements the counter and (if it is a text layer)
// resizes it. Stops the instant all selected layers have been visited.
function processTree(container, sel, state, delta) {
    var layers = container.layers;
    for (var i = 0; i < layers.length; i++) {
        if (state.remaining <= 0) return;

        var layer = layers[i];

        if (sel[layer.id]) {
            state.remaining--;
            if (layer.typename === "ArtLayer" && layer.kind === LayerKind.TEXT) {
                resizeTextLayer(layer, delta);
            }
        }

        // Always descend into groups: a selected text layer can live
        // inside a group that isn't itself selected.
        if (layer.typename === "LayerSet") {
            processTree(layer, sel, state, delta);
            if (state.remaining <= 0) return;
        }
    }
}

// Same resize logic as the original: read points, add delta, clamp,
// write points. Resolution-independent by virtue of textItem.size.
function resizeTextLayer(layer, delta) {
    try {
        var cur = layer.textItem.size;
        var val = (cur instanceof UnitValue) ? cur.value : parseFloat(cur);

        var next = val + delta;
        if (next <= 0.1) next = 0.1; // never let size hit zero/negative

        layer.textItem.size = new UnitValue(next, "pt");
    } catch (e) {
        // Locked/odd layer - skip it, same as before.
    }
}

// Returns the IDs of the currently selected layers.
// Tier 1: direct ID list (CC 2018+). Tier 2: index list -> IDs.
// Tier 3: the single active layer.
function getSelectedLayerIDs() {
    var ids = [];
    var ref, desc;

    // Tier 1
    ref = new ActionReference();
    ref.putProperty(kProperty, kTargetLayersIDs);
    ref.putEnumerated(kDocument, kOrdinal, kTargetEnum);
    try {
        desc = executeActionGet(ref);
        if (desc.hasKey(kTargetLayersIDs)) {
            var list = desc.getList(kTargetLayersIDs);
            for (var i = 0; i < list.count; i++) {
                ids.push(list.getReference(i).getIdentifier());
            }
            return ids;
        }
    } catch (e) {}

    // Tier 2
    ref = new ActionReference();
    ref.putProperty(kProperty, kTargetLayers);
    ref.putEnumerated(kDocument, kOrdinal, kTargetEnum);
    try {
        desc = executeActionGet(ref);
        if (desc.hasKey(kTargetLayers)) {
            var offset = hasBackgroundLayer() ? 0 : 1;
            var idxList = desc.getList(kTargetLayers);
            for (var j = 0; j < idxList.count; j++) {
                var idx = idxList.getReference(j).getIndex() + offset;
                var idRef = new ActionReference();
                idRef.putProperty(kProperty, kLayerID);
                idRef.putIndex(kLayer, idx);
                ids.push(executeActionGet(idRef).getInteger(kLayerID));
            }
            return ids;
        }
    } catch (e2) {}

    // Tier 3
    ref = new ActionReference();
    ref.putProperty(kProperty, kLayerID);
    ref.putEnumerated(kLayer, kOrdinal, kTargetEnum);
    try {
        ids.push(executeActionGet(ref).getInteger(kLayerID));
    } catch (e3) {}

    return ids;
}

function hasBackgroundLayer() {
    var ref = new ActionReference();
    ref.putProperty(kProperty, kHasBackground);
    ref.putEnumerated(kDocument, kOrdinal, kTargetEnum);
    try {
        return executeActionGet(ref).getBoolean(kHasBackground);
    } catch (e) {
        return false;
    }
}