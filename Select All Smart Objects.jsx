/*
https://community.adobe.com/t5/photoshop-ecosystem-discussions/select-only-the-text-layers/m-p/11017429
by jazz-y
*/

// Select ALL Layers of Specific Layer Kind - Works with layer sets and nested sets!

var AM = new ActionManager
    if (app.documents.length) selectLayerKind ()

function selectLayerKind() {
    var output = [],
        from = AM.getDocProperty('hasBackgroundLayer') ? 0 : 1,
        to = AM.getDocProperty('numberOfLayers')
        
        if (to) AM.deselectLayers ()
        
    for (var i = from; i <= to; i++) {

        // Any Layer = 0
        // Pixel Layer  = 1 (including Background layer)
        // Adjustment Layer = 2
        // Text Layer = 3
        // Vector Layer = 4
        // SmartObject Layer = 5
        // Video Layer = 6
        // LayerGroup Layer = 7
        // 3D Layer = 8
        // Gradient Layer = 9
        // Pattern Layer = 10
        // Solid Color Layer = 11
        // Background Layer = 12
        // HiddenSectionBounder = 13

        // Change the number as above!
        if (AM.getLayerProperty('layerKind', i) == 5) AM.selectLayerByIndex (i,true) 
    }
}

function ActionManager() {

    this.getDocProperty = function (property) {
        property = s2t(property)
        var ref = new ActionReference()
        ref.putProperty(s2t("property"), property)
        ref.putEnumerated(s2t("document"), s2t("ordinal"), s2t("targetEnum"))
        return getDescValue(executeActionGet(ref), property)
    }

    this.getLayerProperty = function (property, index) {
        property = s2t(property)
        var ref = new ActionReference()
        ref.putProperty(s2t("property"), property)
        ref.putIndex(s2t("layer"), index)
        return getDescValue(executeActionGet(ref), property)
    }

    this.selectLayerByIndex = function (idx, addToSelection) {
        var desc = new ActionDescriptor()
        var ref = new ActionReference()
        ref.putIndex(s2t("layer"), idx)
        desc.putReference(s2t("null"), ref)
        if (addToSelection) desc.putEnumerated(s2t("selectionModifier"), s2t("addToSelectionContinuous"), s2t("addToSelection"))
        executeAction(s2t("select"), desc, DialogModes.NO);
    }

    this.deselectLayers = function () {
        var desc = new ActionDescriptor()
        var ref = new ActionReference()
        ref.putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"))
        desc.putReference(s2t("null"), ref)
        executeAction(s2t("selectNoLayers"), desc, DialogModes.NO)
    }

    function getDescValue(desc, property) {

        switch (desc.getType(property)) {
            case DescValueType.OBJECTTYPE:
                return (desc.getObjectValue(property));
                break;
            case DescValueType.LISTTYPE:
                return desc.getList(property);
                break;
            case DescValueType.REFERENCETYPE:
                return desc.getReference(property);
                break;
            case DescValueType.BOOLEANTYPE:
                return desc.getBoolean(property);
                break;
            case DescValueType.STRINGTYPE:
                return desc.getString(property);
                break;
            case DescValueType.INTEGERTYPE:
                return desc.getInteger(property);
                break;
            case DescValueType.LARGEINTEGERTYPE:
                return desc.getLargeInteger(property);
                break;
            case DescValueType.DOUBLETYPE:
                return desc.getDouble(property);
                break;
            case DescValueType.ALIASTYPE:
                return desc.getPath(property);
                break;
            case DescValueType.CLASSTYPE:
                return desc.getClass(property);
                break;
            case DescValueType.UNITDOUBLE:
                return (desc.getUnitDoubleValue(property));
                break;
            case DescValueType.ENUMERATEDTYPE:
                return (t2s(desc.getEnumerationValue(property)));
                break;
            case DescValueType.RAWTYPE:
                var tempStr = desc.getData(property);
                var rawData = new Array();
                for (var tempi = 0; tempi < tempStr.length; tempi++) {
                    rawData[tempi] = tempStr.charCodeAt(tempi);
                }
                return rawData;
                break;
            default:
                break;
        };
    }

    function s2t(s) { return stringIDToTypeID(s) }
    function t2s(t) { return typeIDToStringID(t) }
}
