// Select Any Layers.jsx by jazz-y
// https://community.adobe.com/t5/photoshop-ecosystem-discussions/select-only-the-text-layers/m-p/11017696

#target Photoshop

// ---------------------------------------------------------------------------
// CONFIG
// Leave the array empty to select EVERY layer (pixel, adjustment, fill, text,
// smart object, groups, the Background - the lot).
// To limit it, list the layerKind numbers you want, e.g.
//    var LAYER_KINDS = [1]              // pixel layers only
//    var LAYER_KINDS = [2, 9, 10, 11]   // adjustment + fill layers
//    var LAYER_KINDS = [3]              // text layers only
// See the SheetKind table at the bottom of this file for the numbers.
// ---------------------------------------------------------------------------
var LAYER_KINDS = [];

var AM = new ActionManager
    if (app.documents.length) selectLayers ()

function selectLayers() {
    var from = AM.getDocProperty('hasBackgroundLayer') ? 0 : 1,
        to = AM.getDocProperty('numberOfLayers'),
        kind;

        if (to) AM.deselectLayers ()

    for (var i = from; i <= to; i++) {
        kind = AM.getLayerProperty("layerKind", i);

        // 13 = kHiddenSectionBounder, the invisible "end of group" marker.
        // It takes up an index but isn't a real layer - selecting it errors out.
        if (kind != 13 && wantedKind(kind)) AM.selectLayerByIndex (i, true);
    }
}

function wantedKind(kind) {
    if (!LAYER_KINDS.length) return true; // empty config = take everything
    for (var k = 0; k < LAYER_KINDS.length; k++) {
        if (LAYER_KINDS[k] == kind) return true;
    }
    return false;
}

/* SheetKind definitions from USheet.h
const kAnySheet = 0;
const kPixelSheet = 1;
const kAdjustmentSheet = 2;
const kTextSheet = 3;
const kVectorSheet = 4;
const kSmartObjectSheet = 5;
const kVideoSheet = 6;
const kLayerGroupSheet = 7;
const k3DSheet = 8;
const kGradientSheet = 9;
const kPatternSheet = 10;
const kSolidColorSheet = 11;
const kBackgroundSheet = 12;
const kHiddenSectionBounder = 13;
*/

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
        if (addToSelection) desc.putEnumerated(s2t("selectionModifier"), s2t("selectionModifierType"), s2t("addToSelection"))
        desc.putBoolean(s2t("makeVisible"), false)
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
