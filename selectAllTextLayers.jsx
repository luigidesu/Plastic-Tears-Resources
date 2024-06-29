// selectAllTextLayersWithSpecificFont.jsx - Adobe Photoshop Script
// Version: 0.2.0
// Requirements: Adobe Photoshop CC or higher
// Author: Anton Lyubushkin (nvkz.nemo@gmail.com)
// Website: http://uberplugins.cc/
// ============================================================================

#target photoshop

try {
    var textLayers;
    app.bringToFront();
    selectAllLayers();
    textLayers = getSelectedTextLayersIndexs();
    if (textLayers.length > 0) {
        selectLayersByIndex(textLayers);
    } else {
        deselectLayers();
    }

    function selectAllLayers() {
        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
        desc1.putReference(charIDToTypeID('null'), ref1);
        executeAction(stringIDToTypeID('selectAllLayers'), desc1, DialogModes.NO);
    }

    function deselectLayers() {
        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
        desc1.putReference(charIDToTypeID('null'), ref1);
        executeAction(stringIDToTypeID('selectNoLayers'), desc1, DialogModes.NO);
    }

    function getSelectedTextLayersIndexs() {
        var lyrs = [];
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID('Dcmn'), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
        if (executeActionGet(ref).hasKey(stringIDToTypeID("targetLayers"))) {
            var targetLayers = executeActionGet(ref).getList(stringIDToTypeID("targetLayers"));
            for (var i = 0; i < targetLayers.count; i++) {
                var ref2 = new ActionReference();
                try {
                    activeDocument.backgroundLayer;
                    ref2.putIndex(charIDToTypeID('Lyr '), targetLayers.getReference(i).getIndex());
                    var layerDesc = executeActionGet(ref2);
                    if (layerDesc.hasKey(stringIDToTypeID('textKey'))) {
                        var textKey = layerDesc.getObjectValue(stringIDToTypeID('textKey'));
                        var textStyle = textKey.getList(stringIDToTypeID('textStyleRange')).getObjectValue(0).getObjectValue(stringIDToTypeID('textStyle'));
                        var fontName = textStyle.getString(stringIDToTypeID('fontPostScriptName'));
                        if (fontName && fontName === "CCJScottCampbell-Italic") {
                            lyrs.push(layerDesc.getInteger(stringIDToTypeID("itemIndex")) - 1);
                        }
                    }
                } catch (o) {
                    ref2.putIndex(charIDToTypeID('Lyr '), targetLayers.getReference(i).getIndex() + 1);
                    var layerDesc = executeActionGet(ref2);
                    if (layerDesc.hasKey(stringIDToTypeID('textKey'))) {
                        var textKey = layerDesc.getObjectValue(stringIDToTypeID('textKey'));
                        var textStyle = textKey.getList(stringIDToTypeID('textStyleRange')).getObjectValue(0).getObjectValue(stringIDToTypeID('textStyle'));
                        var fontName = textStyle.getString(stringIDToTypeID('fontPostScriptName'));
                        if (fontName && fontName === "CCJScottCampbell-Italic") {
                            lyrs.push(layerDesc.getInteger(stringIDToTypeID("itemIndex")));
                        }
                    }
                }
            }
        } else {
            var ref2 = new ActionReference();
            ref2.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("ItmI"));
            ref2.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
            if (app.activeDocument.activeLayer.kind == LayerKind.TEXT) {
                try {
                    activeDocument.backgroundLayer;
                    lyrs.push(executeActionGet(ref2).getInteger(charIDToTypeID("ItmI")) - 1);
                } catch (o) {
                    lyrs.push(executeActionGet(ref2).getInteger(charIDToTypeID("ItmI")));
                }
            }
        }
        return lyrs
    }

    function selectLayersByIndex(_arrayOfIndexes) {
        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        for (var i in _arrayOfIndexes) {
            ref1.putIndex(charIDToTypeID('Lyr '), _arrayOfIndexes[i]);
        }
        desc1.putReference(charIDToTypeID('null'), ref1);
        desc1.putBoolean(charIDToTypeID('MkVs'), false);
        executeAction(charIDToTypeID('slct'), desc1, DialogModes.NO);
    }

} catch (e) {
    alert(e.line + '\n' + e);
}
