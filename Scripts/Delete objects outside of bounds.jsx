#target photoshop

var doc = new AM('document'),
    lr = new AM('layer'),
    units = (new AM('application')).getProperty('rulerUnits').value,
    len = doc.getProperty('numberOfLayers'),
    smartObjects = [];
	
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


for (var i = 1; i <= len; i++) {
    if (lr.getProperty('layerSection', i, true).value == 'layerSectionEnd') continue;
    if (lr.getProperty('layerKind', i, true) == 3) { //Layer value here
        smartObjects.push({
            id: id = lr.getProperty('layerID', i, true),
            bounds: lr.descToObject(lr.getProperty('bounds', i, true).value)
        })
    }
}

if (smartObjects.length) {
    doc.setRulerUnits('rulerPixels')
    docBounds = { top: 0, left: 0, right: doc.getProperty('width'), bottom: doc.getProperty('height'), }
    doc.setRulerUnits(units)

    var toDelete = []
    do { if (!intersect((so = smartObjects.shift()).bounds, docBounds)) toDelete.push(so.id) } while (smartObjects.length)

    if (toDelete.length) doc.deleteLayers(toDelete) 
}

function intersect(lrA, lrB) {
    return (lrB.right < lrA.left || lrB.left > lrA.right) || (lrB.top > lrA.bottom || lrB.bottom < lrA.top) ? false : true
}

function AM(target, order) {
    var s2t = stringIDToTypeID,
        t2s = typeIDToStringID;

    target = target ? s2t(target) : null;

    this.getProperty = function (property, id, idxMode) {
        property = s2t(property);
        (r = new ActionReference()).putProperty(s2t('property'), property);
        id != undefined ? (idxMode ? r.putIndex(target, id) : r.putIdentifier(target, id)) :
            r.putEnumerated(target, s2t('ordinal'), order ? s2t(order) : s2t('targetEnum'));
        return getDescValue(executeActionGet(r), property)
    }

    this.descToObject = function (d) {
        var o = {}
        for (var i = 0; i < d.count; i++) {
            var k = d.getKey(i)
            o[t2s(k)] = getDescValue(d, k)
        }
        return o
    }

    this.setRulerUnits = function (units) {
        (r = new ActionReference()).putProperty(s2t('property'), s2t('unitsPrefs'));
        r.putEnumerated(s2t('application'), s2t('ordinal'), s2t('targetEnum'));
        (d = new ActionDescriptor).putReference(s2t('null'), r);
        (d1 = new ActionDescriptor).putEnumerated(s2t('rulerUnits'), s2t('rulerUnits'), s2t(units));
        d.putObject(s2t('to'), s2t('unitsPrefs'), d1);
        executeAction(s2t('set'), d, DialogModes.NO);
    }

    this.deleteLayers = function (list) {
        var r = new ActionReference();
        do { r.putIdentifier(s2t('layer'), list.shift()) } while (list.length);
        (d = new ActionDescriptor()).putReference(s2t('null'), r);
          executeAction(s2t('delete'), d, DialogModes.NO);
    }

    function getDescValue(d, p) {
        switch (d.getType(p)) {
            case DescValueType.OBJECTTYPE: return { type: t2s(d.getObjectType(p)), value: d.getObjectValue(p) };
            case DescValueType.LISTTYPE: return d.getList(p);
            case DescValueType.REFERENCETYPE: return d.getReference(p);
            case DescValueType.BOOLEANTYPE: return d.getBoolean(p);
            case DescValueType.STRINGTYPE: return d.getString(p);
            case DescValueType.INTEGERTYPE: return d.getInteger(p);
            case DescValueType.LARGEINTEGERTYPE: return d.getLargeInteger(p);
            case DescValueType.DOUBLETYPE: return d.getDouble(p);
            case DescValueType.ALIASTYPE: return d.getPath(p);
            case DescValueType.CLASSTYPE: return d.getClass(p);
            case DescValueType.UNITDOUBLE: return (d.getUnitDoubleValue(p));
            case DescValueType.ENUMERATEDTYPE: return { type: t2s(d.getEnumerationType(p)), value: t2s(d.getEnumerationValue(p)) };
            default: break;
        };
    }
}