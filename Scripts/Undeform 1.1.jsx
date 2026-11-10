/**
 * @@@BUILDINFO@@@ [M] Undeform 1.1.jsx Sun Feb 03 2019 17:32:50 GMT+0100
 */

/*
<javascriptresource>
<name>[M] Undeform 1.1</name>
<enableinfo>true</enableinfo>
<category>Magic</category>
</javascriptresource>
*/

/*
    
	LICENSE
	=======
	This code is provided as is without warranty. The author assumes no responsibility for any inconvenience.


	Allowed:
	- You may use for commercial and non-commercial purposes without limitations
	- You may copy and distribute the script without restrictions
	- You may include this code in your non-commercial software projects

	Prohibited
	- You may NOT selling this script without author's permission
	- You may NOT without author's permission using this script as part of software which you want monetize
	- You may NOT distribute script WITHOUT this license informations


	VERSION HISTORY:
	================
	1.1:
	- Adds perspective transformation support
	- Improves performance by doing only necessary actions

	1.0:
	- Initial release.


	Copyright: © 2017 Jaroslav Bereza <http://bereza.cz>
	If you are interested in how the code works, write me at j@bereza.cz  I am open to cooperation.


	ALGORITHM
	=========
	SmartObject magic:
	- move first point to x:0 y:0 and recalculate other points
	- find first vector in shape
	- find angle between first vector and x axis
	- recalculate points after rotation
	- find angle between first and fouth vector
	- recalculate points after shear aplication
	- calculate height including mirroring
	- calculate width including mirroring
	- translate shape, new shape center should be in same place as old. Include whole pixel rounding
	- apply calculated values in same order as transformations
	- if warp found with AM code apply new warp

	TextLayers magic:
	- usual AM magic
	- read descriptor
	- change values
	- apply changed descriptor


	TODO:
	- fix problem with chained layers
	- fix filters?
	- what about masks destructive transforming
	- parent folder locked
	- folder nesting exceeded

	http://www.sharetechnote.com/html/Handbook_EngMath_Matrix_InnerProduct.html
	http://www.euclideanspace.com/maths/algebra/vectors/angleBetween/
    
*/

#target Photoshop
app.bringToFront();

var psVersion = app.version.split('.')[0];
var layers;

cTT = charIDToTypeID;
sTT = stringIDToTypeID;
tTI = typeIDToStringID;

canRunScript();

function canRunScript() {

	// In CC 2015 and lower we can't read smart object corners data

	
	if(psVersion < 17){
	    alert("This script works only with Photoshop CC 2015.5 and higher. :-(");
	    return;
	}

	if (app.documents.length == 0) {
		alert("Please open some document and select layers");
		return;
	} else {
		layers = getSelectedLayers();
		layers = filterEditableLayers(layers);

		if (layers.textLayers.length === 0 && layers.smartLayers.length === 0) {
			alert("Please select one or more text layer or smart object layer which is NOT: \n- empty, \n- linked with another layer \n- locked\n- placed in locked group");
		} else {
			app.activeDocument.suspendHistory("[M] Undeform", "main()");
		}
	}
}

/////////////////////
//      MAIN
/////////////////////
function main() {

	// There is bug in Photoshop, you can't transform layer while there is progressbar. Uncomment this when Adobe fix it.
	//app.doProgress("So many things to do, give me a moment please.","progressTask()");
	progressTask()

	function progressTask() {

		var bothLength = layers.textLayers.length + layers.smartLayers.length;
		var smartLen = layers.smartLayers.length;
		var txtLen = layers.textLayers.length;
		var bothLength = smartLen + txtLen;

		for (var i = 0; i < txtLen; i++) {
			//app.doProgressSubTask(i,bothLength,"changeText("+i+")");        
			changeText(i)
		}

		if (smartLen > 0) {
			// remember selected layers
			var originalLayers = getSelectedLayers();
			for (var i = 0; i < smartLen; i++) {
				//app.doProgressSubTask(i+txtLen,bothLength,"changeSmartObject("+i+")");        
				changeSmartObject(i);
			}
			setSelectedLayer(originalLayers[0]);
			addSelectedLayer(originalLayers);
			// restore selected layers
		}
	}

	function changeText(i) {
		var itemIndex = layers.textLayers[i].itemIndex;
		var textKey = layers.textLayers[i].textKey;
		textKey = removeText2DMatrix(textKey);
		textKey = removeTextWarp(textKey);
		applyTextKey(textKey, itemIndex);

		function removeText2DMatrix(textKey) {
			textKey.erase(sTT('transform'));
			var desc792 = new ActionDescriptor();
			var idxx = stringIDToTypeID("xx");
			desc792.putDouble(idxx, 1);
			var idxy = stringIDToTypeID("xy");
			desc792.putDouble(idxy, 0);
			var idyx = stringIDToTypeID("yx");
			desc792.putDouble(idyx, 0);
			var idyy = stringIDToTypeID("yy");
			desc792.putDouble(idyy, 1);
			var idtx = stringIDToTypeID("tx");
			desc792.putDouble(idtx, 0);
			var idty = stringIDToTypeID("ty");
			desc792.putDouble(idty, 0);
			textKey.putObject(cTT("Trnf"), cTT("Trnf"), desc792);
			return textKey;
		}

		function removeTextWarp(textKey) {
			textKey.erase(sTT('warp'));
			var desc847 = new ActionDescriptor();
			desc847.putEnumerated(sTT("warpStyle"), sTT("warpStyle"), sTT("warpNone"));
			var idwarpValue = sTT("warpValue");
			desc847.putDouble(idwarpValue, 0);
			desc847.putDouble(sTT("warpPerspective"), 0);
			desc847.putDouble(sTT("warpPerspectiveOther"), 0);
			desc847.putEnumerated(sTT("warpRotate"), sTT("Ornt"), sTT("Hrzn"));
			textKey.putObject(sTT("warp"), sTT("warp"), desc847);
			return textKey;
		}

	}

	function changeSmartObject(i) {
		var index = layers.smartLayers[i].itemIndex;
		setSelectedLayer(index);
		unTransformSmartObject(layers.smartLayers[i]);
	}
}

/////////////////////
//     PURE MATH
/////////////////////

//moves left top point to 0,0 and recalculate rest
function movePointsToBase(currentPoints) {
	currentPoints['origin'] = {
		x: currentPoints.leftTop.x,
		y: currentPoints.leftTop.y
	}

	var difX = currentPoints.leftTop.x;
	var difY = currentPoints.leftTop.y;

	currentPoints.leftTop.x -= difX;
	currentPoints.leftTop.y -= difY;

	currentPoints.leftBottom.x -= difX;
	currentPoints.leftBottom.y -= difY;

	currentPoints.rightTop.x -= difX;
	currentPoints.rightTop.y -= difY;

	currentPoints.rightBottom.x -= difX;
	currentPoints.rightBottom.y -= difY;

	return currentPoints;
}

function round(number) {
	return Math.round(number * 10) / 10;
}

// angle between vector from first and second points vs. x axis
// http://www.fundza.com/vectors/normalize/
// http://www.euclideanspace.com/maths/algebra/vectors/angleBetween/

function RotateVector2d(vector, radians) {
	var result = {
		x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
		y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians)
	};
	return result;
}

function getOriginalCenterPoint(currentPoints) {
	var result = {
		x: currentPoints.leftTop.x + currentPoints.rightTop.x / 2 + currentPoints.leftBottom.x / 2,
		y: currentPoints.leftTop.y + currentPoints.rightTop.y / 2 + currentPoints.leftBottom.y / 2
	}
	currentPoints['centerPointOriginal'] = result;
	return currentPoints;
}

function getNewCenterPoint(currentPoints) {
	var result = {
		x: currentPoints.leftTop.x + currentPoints.rightTop.x / 2 + currentPoints.leftBottom.x / 2,
		y: currentPoints.leftTop.y + currentPoints.rightTop.y / 2 + currentPoints.leftBottom.y / 2
	}
	currentPoints['centerPointNew'] = result;
	return currentPoints;
}

function getTranslate(currentPoints) {
	var difX = currentPoints.centerPointOriginal.x - currentPoints.centerPointNew.x;
	var difY = currentPoints.centerPointOriginal.y - currentPoints.centerPointNew.y;

	currentPoints.leftTop.x += difX + currentPoints.origin.x;
	currentPoints.leftTop.y += difY + currentPoints.origin.y;

	// I want pixel perfect result. Same bitmap as inside SO without some "half pixel translation bluring"
	// Btw smartobject layer in master document can't handle color profile inside smartobject child document
	// Make sure you have all color profiles off inside child document if you want exactly same pixels
	var roundX = currentPoints.leftTop.x - Math.floor(currentPoints.leftTop.x);
	var roundY = currentPoints.leftTop.y - Math.floor(currentPoints.leftTop.y);
	difX -= roundX;
	difY -= roundY;

	var result = {
		x: difX,
		y: difY
	}
	currentPoints['translate'] = result;

	currentPoints.leftTop.x -= roundX;
	currentPoints.leftTop.y -= roundY;

	currentPoints.leftBottom.x += difX + currentPoints.origin.x;
	currentPoints.leftBottom.y += difY + currentPoints.origin.y;

	currentPoints.rightTop.x += difX + currentPoints.origin.x;
	currentPoints.rightTop.y += difY + currentPoints.origin.y;

	currentPoints.rightBottom.x += difX + currentPoints.origin.x;
	currentPoints.rightBottom.y += difY + currentPoints.origin.y;

	//showPoints(currentPoints,"fin"); //uncoment for debug
	return currentPoints;
}

function getAngle(currentPoints) {
	var firstVectorOfShape = [currentPoints.rightTop.x, currentPoints.rightTop.y];
	var shapeVectorLength = Math.sqrt(firstVectorOfShape[0] * firstVectorOfShape[0] + firstVectorOfShape[1] * firstVectorOfShape[1]);

	firstVectorOfShape[0] /= shapeVectorLength;
	firstVectorOfShape[1] /= shapeVectorLength;

	var dotProduct = firstVectorOfShape[0]; // xAxis vector is already normalised [1,0] so we can simplify dotProduct formula
	var angleRad = Math.acos(dotProduct);
	if (currentPoints.rightTop.y > 0) { // because angleRad can't be more than PI (180°)
		angleRad *= -1;
	}
	var angleDeg = angleRad * (180 / Math.PI);
	currentPoints['angle'] = angleDeg;

	currentPoints.leftTop = RotateVector2d(currentPoints.leftTop, angleRad);
	currentPoints.leftBottom = RotateVector2d(currentPoints.leftBottom, angleRad);
	currentPoints.rightTop = RotateVector2d(currentPoints.rightTop, angleRad);
	currentPoints.rightBottom = RotateVector2d(currentPoints.rightBottom, angleRad);

	return currentPoints;
}

function cot(aValue) {
	return 1 / Math.tan(aValue);
}

function getSkew(currentPoints) {
	var firstVectorOfShape = [currentPoints.rightTop.x, currentPoints.rightTop.y];
	var fourthVectorOfShape = [currentPoints.leftBottom.x, currentPoints.leftBottom.y];

	// we need vector length for vector normalizing
	var firstVectorLength = Math.sqrt(firstVectorOfShape[0] * firstVectorOfShape[0] + firstVectorOfShape[1] * firstVectorOfShape[1]);
	var fourthVectorLength = Math.sqrt(fourthVectorOfShape[0] * fourthVectorOfShape[0] + fourthVectorOfShape[1] * fourthVectorOfShape[1]);

	// vector normalizing
	firstVectorOfShape[0] /= firstVectorLength;
	firstVectorOfShape[1] /= firstVectorLength;

	fourthVectorOfShape[0] /= fourthVectorLength;
	fourthVectorOfShape[1] /= fourthVectorLength;

	var skewDirection = -1;
	if (currentPoints.leftTop.y > currentPoints.leftBottom.y) {
		skewDirection = +1;
	}

	var dotProduct = (firstVectorOfShape[0] * fourthVectorOfShape[0]) + (firstVectorOfShape[1] * fourthVectorOfShape[1]);
	var originalSkew = Math.acos(dotProduct);
	var skewRad = Math.PI / 2 - originalSkew;
	var skewDeg = -(skewRad * (180 / Math.PI) * -skewDirection);
	currentPoints['skew'] = skewDeg;

	var shearFactor = cot(originalSkew) * skewDirection;
	currentPoints.leftTop.x = currentPoints.leftTop.x + (shearFactor * currentPoints.leftTop.y);
	currentPoints.leftBottom.x = currentPoints.leftBottom.x + (shearFactor * currentPoints.leftBottom.y);
	currentPoints.rightTop.x = currentPoints.rightTop.x + (shearFactor * currentPoints.rightTop.y);
	currentPoints.rightBottom.x = currentPoints.rightBottom.x + (shearFactor * currentPoints.rightBottom.y);

	return currentPoints;
}

function getScale(currentPoints) {
	var width = currentPoints.originalSize.width / (currentPoints.rightTop.x - currentPoints.leftTop.x);
	var height = currentPoints.originalSize.height / (currentPoints.leftBottom.y - currentPoints.leftTop.y);

	currentPoints.leftTop.x = currentPoints.leftTop.x * width;
	currentPoints.leftBottom.x = currentPoints.leftBottom.x * width;
	currentPoints.rightTop.x = currentPoints.rightTop.x * width;
	currentPoints.rightBottom.x = currentPoints.rightBottom.x * width;

	currentPoints.leftTop.y = currentPoints.leftTop.y * height;
	currentPoints.leftBottom.y = currentPoints.leftBottom.y * height;
	currentPoints.rightTop.y = currentPoints.rightTop.y * height;
	currentPoints.rightBottom.y = currentPoints.rightBottom.y * height;

	currentPoints['scale'] = {
		width: width * 100,
		height: height * 100
	};
	return currentPoints
}

/////////////////////
//   AM GETTERS
/////////////////////

function getSOSize(smartObjectMore) {
	var size = smartObjectMore.getObjectValue(sTT('size'));
	var size = {
		width: size.getDouble(sTT('width')),
		height: size.getDouble(sTT('height'))
	};
	return size;
}

function getNonAffinePoints(smartObjectMore) {
	var nonAffineTransform = smartObjectMore.getList(sTT('nonAffineTransform'));
	var nonAffineTransformTemp = [];
	for (var i = 0, len = nonAffineTransform.count; i < len; i++) {
		nonAffineTransformTemp.push(nonAffineTransform.getDouble(i));
	}
	return nonAffineTransformTemp;
}

function getTextKey(layerIndex) {
	var ref = new ActionReference();
	var idPrpr = charIDToTypeID("Prpr");
	var idTxtS = stringIDToTypeID("textKey");
	ref.putProperty(idPrpr, idTxtS);
	var lyr = charIDToTypeID("Lyr ");
	ref.putIndex(lyr, layerIndex);

	// step inside
	var desc = executeActionGet(ref);
	var descTextKey = desc.getObjectValue(stringIDToTypeID('textKey'));

	return descTextKey;
}


function getSmartObjectMore(layerIndex) {
	var ref166 = new ActionReference();
	var idLyr = charIDToTypeID("Lyr ");
	ref166.putIndex(idLyr, layerIndex);
	var desc = executeActionGet(ref166);
	var smartObjectMore = desc.getObjectValue(stringIDToTypeID('smartObjectMore'));

	return smartObjectMore;
}

function getSelectedLayers() {
	var selectedLayers = [];

	function getBgCounter() {
		var backGroundCounter = 1;
		try {
			var dummy = app.activeDocument.backgroundLayer;
			backGroundCounter = 0;
		} catch (e) {
			;
		} //do nothing
		return backGroundCounter;
	}
	var backGroundCounter = getBgCounter();
	var ref = new ActionReference();
	var keyTargetLayers = app.stringIDToTypeID('targetLayers');
	ref.putProperty(app.charIDToTypeID('Prpr'), keyTargetLayers);
	ref.putEnumerated(app.charIDToTypeID('Dcmn'), app.charIDToTypeID('Ordn'), app.charIDToTypeID('Trgt'));
	var desc = executeActionGet(ref);
	if (desc.hasKey(keyTargetLayers)) {
		var layersList = desc.getList(keyTargetLayers);
		for (var j = 0; j < layersList.count; j++) {
			var listRef = layersList.getReference(j);
			selectedLayers.push(listRef.getIndex() + backGroundCounter);
		}
	}
	return selectedLayers;
}

/** 
 * Input: items array [1,4,9]
 */
function filterEditableLayers(list) {
	var result = {
		textLayers: [],
		smartLayers: []
	}

	// input - textKey / smartObjectMore
	// output - Boolean
	function hasWarp(desc) {
		var warp = desc.getObjectValue(sTT('warp'));
		var hasWarp = tTI(warp.getEnumerationValue(sTT('warpStyle'))) != "warpNone";
		return hasWarp;
	}

	function hasModifiedMatrix(desc) {
		var hasTransform = desc.hasKey(sTT('transform'));
		if (!hasTransform) {
			return false;
		}
		var matrix = desc.getObjectValue(stringIDToTypeID('transform'));

		return (
			(matrix.getDouble(stringIDToTypeID('xx')) !== 1) ||
			(matrix.getDouble(stringIDToTypeID('xy')) !== 0) ||
			(matrix.getDouble(stringIDToTypeID('yx')) !== 0) ||
			(matrix.getDouble(stringIDToTypeID('yy')) !== 1) ||
			(matrix.getDouble(stringIDToTypeID('tx')) !== 0) ||
			(matrix.getDouble(stringIDToTypeID('ty')) !== 0)
		)
	}

	for (var i = 0, len = list.length; i < len; i++) {
		var ref166 = new ActionReference();
		var idLyr = charIDToTypeID("Lyr ");
		ref166.putIndex(idLyr, list[i]);
		var desc = executeActionGet(ref166);

		var isTextLayer = desc.hasKey(stringIDToTypeID('textKey'));
		var hasSmartObjectMore = desc.hasKey(stringIDToTypeID('smartObjectMore'));
		var descLocking = desc.getObjectValue(stringIDToTypeID('layerLocking'));
		var locked = descLocking.getBoolean(stringIDToTypeID('protectAll')) || descLocking.getBoolean(stringIDToTypeID('protectPosition'));
		var isLinked = desc.hasKey(stringIDToTypeID('linkedLayerIDs'));

		// we can't transform SO with zero dimension
		var bounds = desc.getObjectValue(stringIDToTypeID('bounds'));
		var top = bounds.getDouble(stringIDToTypeID('top'));
		var bottom = bounds.getDouble(stringIDToTypeID('bottom'));

		var nullHeight = top === bottom;

		// skip what we can't transform
		if (locked || nullHeight || isLinked) {
			continue;
		}
		// include only supported layers
		else if (isTextLayer) {
			var textKey = desc.getObjectValue(stringIDToTypeID('textKey'));
			var contentString = textKey.getString(stringIDToTypeID('textKey'));
			if (contentString != "" && (hasModifiedMatrix(textKey) || hasWarp(textKey))) {
				result.textLayers.push({
					itemIndex: list[i],
					textKey: textKey,
					hasWarp: hasWarp(textKey)
				});
			}
		} else if (hasSmartObjectMore) {
			var smartObjectMore = getSmartObjectMore(list[i]);
			result.smartLayers.push({
				itemIndex: list[i],
				smartObjectMore: smartObjectMore,
				hasWarp: hasWarp(smartObjectMore)
			});
		}


	}
	return result;
}

//////////////////////////////////////////
//   CHANGES DOCUMENT
//////////////////////////////////////////

//matrixFromSO();
function unTransformSmartObject(lyr) {
	if (lyr.hasWarp) {
		removeWarp(); // this is first because otherwise there would be really ugly math.
		lyr.smartObjectMore = getSmartObjectMore(lyr.itemIndex); // we need update points data after unwarp
	}

	var smartObjectMore = lyr.smartObjectMore; //descriptor
	// var transform = getAffinePoints(smartObjectMore); // we don't need it now but could be handy in next version
	var nonAffineTransform = getNonAffinePoints(smartObjectMore);
	var size = getSOSize(smartObjectMore);

	var tr = nonAffineTransform;

	var currentPoints = {
		leftTop: {
			x: tr[0],
			y: tr[1]
		},
		rightTop: {
			x: tr[2],
			y: tr[3]
		},
		rightBottom: {
			x: tr[4],
			y: tr[5]
		},
		leftBottom: {
			x: tr[6],
			y: tr[7]
		},
		originalSize: {
			width: size.width,
			height: size.height
		}
	};

	currentPoints = movePointsToBase(currentPoints);
	currentPoints = getOriginalCenterPoint(currentPoints)
	currentPoints = getAngle(currentPoints);
	currentPoints = getSkew(currentPoints);
	currentPoints = getScale(currentPoints);
	currentPoints = getNewCenterPoint(currentPoints);
	currentPoints = getTranslate(currentPoints);

	// my order - 3× slower than single step would be
	// unfortunately transforming takes most time
	// performance conditions... do only necessary actions
	if (currentPoints.angle !== 0) {
		doRotate(currentPoints);
	}
	if (currentPoints.skew !== 0) {
		doSkew(currentPoints);
	}
	if (!(Number(currentPoints.scale.width) === 100 && Number(currentPoints.scale.height) === 100 && Number(currentPoints.translate.x) === 0 && Number(currentPoints.translate.y) === 0)) {
		doScaleAndTranslate(currentPoints);
	}
	// performance conditions are inside
	doPerspective(lyr.itemIndex, currentPoints);

	// native Photoshop order required in single step
	// you need totaly different math magic for this order
	/*
	doScale(currentPoints);
	doSkew(currentPoints);
	doRotate(currentPoints);
	doTranslate(currentPoints);
	*/
}

function doPerspective(layerIndex, currentPoints) {

	var currentDesc = getSmartObjectMore(layerIndex);
	var currSOCorners = getNonAffinePoints(currentDesc);
	var lt_cornerX = currSOCorners[0];
	var lt_cornerY = currSOCorners[1];
	var rt_cornerX = currSOCorners[2];
	var rt_cornerY = currSOCorners[3];
	var rb_cornerX = currSOCorners[4];
	var rb_cornerY = currSOCorners[5];
	var lb_cornerX = currSOCorners[6];
	var lb_cornerY = currSOCorners[7];
	var targetX = currentPoints.originalSize.width + currSOCorners[0];
	var targetY = currentPoints.originalSize.height + currSOCorners[1];
	var targetWidth = currentPoints.originalSize.width;
	var targetHeight = currentPoints.originalSize.height;

	var targetRect = [
		lt_cornerX,
		lt_cornerY,
		targetX,
		targetY
	];

	//debugger;
	groupSelectedLayers(); //solves PS bug

	var xFinal, yFinal;
	var xError, yError;
	var changeHorizontalDirection = (rt_cornerX - rb_cornerX) !== 0;
	var changeVerticalDirection = (lb_cornerY - rb_cornerY) !== 0
	// horizontal

	if (changeHorizontalDirection) {
		var slope = ((rt_cornerY - rb_cornerY) / (rt_cornerX - rb_cornerX));
		var b = rt_cornerY - slope * rt_cornerX;
		var xCross = (lb_cornerY - b) / slope;
		var bottomWidth = xCross - lb_cornerX;
		// xFinal = leftBottom_corner_X + (šířka - ( přesah_prodloužený ( šířka_rect / šířka_prodloužená)))
		xFinal = lb_cornerX + (targetWidth - ((bottomWidth - targetWidth) * (targetWidth / bottomWidth)));

		if (isNaN(xFinal) || Math.abs(xFinal) > 300000) {
			xError = true;
		}
	}

	// vertical
	if (changeVerticalDirection) {
		var slope = ((lb_cornerX - rb_cornerX) / (lb_cornerY - rb_cornerY));
		var b = lb_cornerX - slope * lb_cornerY;
		var yCross = (rt_cornerX - b) / slope;
		var rightHeight = yCross - rt_cornerY;
		yFinal = rt_cornerY + (targetHeight - ((rightHeight - targetHeight) * (targetHeight / rightHeight)));

		if (isNaN(yFinal) || Math.abs(yFinal) > 300000) {
			yError = true;
		}
	}

	if (xError || yError) {
		alert("Perspective transform can be performed because two of four corners have almost same possitions. Please move corner manually in order to make it look more like rectangle and less like triangle.")
		unGroupSelectedLayers();
		return;
	}

	if (changeHorizontalDirection) {
		doRectangularToQuadrilateral(
			targetRect, [
				lt_cornerX,
				lt_cornerY,
				rt_cornerX,
				rt_cornerY,
				xFinal,
				targetY,
				lb_cornerX,
				lb_cornerY
			]
		);
	}

	if (changeVerticalDirection) {
		doRectangularToQuadrilateral(
			targetRect, [
				lt_cornerX,
				lt_cornerY,
				rt_cornerX,
				rt_cornerY,
				targetX,
				yFinal,
				lb_cornerX,
				lb_cornerY
			]
		);
	}

	unGroupSelectedLayers();
}


function doRectangularToQuadrilateral(rect, target) {
	var args = new ActionDescriptor();
	var quadRect = new ActionList();
	var trgtCorners = new ActionList();
	var px = charIDToTypeID('#Pxl');

	//original rectangular shape
	quadRect.putUnitDouble(px, rect[0]); // x
	quadRect.putUnitDouble(px, rect[1]); // y

	quadRect.putUnitDouble(px, rect[2]); // x
	quadRect.putUnitDouble(px, rect[3]); // y

	// new quadrilateral shape
	trgtCorners.putUnitDouble(px, target[0]); //left top
	trgtCorners.putUnitDouble(px, target[1]);

	trgtCorners.putUnitDouble(px, target[2]); //right top
	trgtCorners.putUnitDouble(px, target[3]);

	trgtCorners.putUnitDouble(px, target[4]); //right bottom
	trgtCorners.putUnitDouble(px, target[5]);

	trgtCorners.putUnitDouble(px, target[6]); //left bottom
	trgtCorners.putUnitDouble(px, target[7]);

	args.putList(stringIDToTypeID("rectangle"), quadRect);
	args.putList(stringIDToTypeID("quadrilateral"), trgtCorners);

	executeAction(charIDToTypeID('Trnf'), args, DialogModes.NO);
}

function doRotate(trData) {
	var idTrnf = charIDToTypeID("Trnf");
	var desc119 = new ActionDescriptor();
	desc119.putEnumerated(cTT("FTcs"), cTT("QCSt"), cTT("Qcsi"));
	var descPos = new ActionDescriptor();
	descPos.putUnitDouble(cTT("Hrzn"), cTT("#Pxl"), trData.origin.x);
	descPos.putUnitDouble(cTT("Vrtc"), cTT("#Pxl"), trData.origin.y);
	desc119.putObject(cTT("Pstn"), cTT("Pnt "), descPos);
	var idAngl = charIDToTypeID("Angl");
	var idAng = charIDToTypeID("#Ang");
	desc119.putUnitDouble(idAngl, idAng, trData.angle);

	executeAction(idTrnf, desc119, DialogModes.NO);
}

function doSkew(trData) {
	var idTrnf = charIDToTypeID("Trnf");
	var desc119 = new ActionDescriptor();
	desc119.putEnumerated(cTT("FTcs"), cTT("QCSt"), cTT("Qcsi"));
	var descPos = new ActionDescriptor();
	descPos.putUnitDouble(cTT("Hrzn"), cTT("#Pxl"), trData.origin.x);
	descPos.putUnitDouble(cTT("Vrtc"), cTT("#Pxl"), trData.origin.y);
	desc119.putObject(cTT("Pstn"), cTT("Pnt "), descPos);

	var idSkew = charIDToTypeID("Skew");
	var desc121 = new ActionDescriptor();
	var idHrzn = charIDToTypeID("Hrzn");
	var idAng = charIDToTypeID("#Ang");
	desc121.putUnitDouble(idHrzn, idAng, trData.skew);
	var idVrtc = charIDToTypeID("Vrtc");
	var idAng = charIDToTypeID("#Ang");
	desc121.putUnitDouble(idVrtc, idAng, 0);
	var idPnt = charIDToTypeID("Pnt ");
	desc119.putObject(idSkew, idPnt, desc121);

	executeAction(idTrnf, desc119, DialogModes.NO);
}

function doScaleAndTranslate(trData) { //including reflection
	var idTrnf = charIDToTypeID("Trnf");
	var desc119 = new ActionDescriptor();
	desc119.putEnumerated(cTT("FTcs"), cTT("QCSt"), cTT("Qcsi"));
	var descPos = new ActionDescriptor();
	descPos.putUnitDouble(cTT("Hrzn"), cTT("#Pxl"), trData.origin.x);
	descPos.putUnitDouble(cTT("Vrtc"), cTT("#Pxl"), trData.origin.y);
	desc119.putObject(cTT("Pstn"), cTT("Pnt "), descPos);

	var idWdth = charIDToTypeID("Wdth");
	var idPrc = charIDToTypeID("#Prc");
	desc119.putUnitDouble(idWdth, idPrc, trData.scale.width);
	var idHght = charIDToTypeID("Hght");
	var idPrc = charIDToTypeID("#Prc");
	desc119.putUnitDouble(idHght, idPrc, trData.scale.height);

	var idOfst = charIDToTypeID("Ofst");
	var desc120 = new ActionDescriptor();
	var idHrzn = charIDToTypeID("Hrzn");
	var idPxl = charIDToTypeID("#Pxl");
	desc120.putUnitDouble(idHrzn, idPxl, trData.translate.x);
	var idVrtc = charIDToTypeID("Vrtc");
	var idPxl = charIDToTypeID("#Pxl");
	desc120.putUnitDouble(idVrtc, idPxl, trData.translate.y);
	var idOfst = charIDToTypeID("Ofst");
	desc119.putObject(idOfst, idOfst, desc120);

	executeAction(idTrnf, desc119, DialogModes.NO);
}

function removeWarp() {
	var idTrnf = charIDToTypeID("Trnf");
	var desc553 = new ActionDescriptor();
	var idFTcs = charIDToTypeID("FTcs");
	var idQCSt = charIDToTypeID("QCSt");
	var idQcsa = charIDToTypeID("Qcsa");
	desc553.putEnumerated(idFTcs, idQCSt, idQcsa);

	var idwarp = stringIDToTypeID("warp");
	var desc556 = new ActionDescriptor();
	var idwarpStyle = stringIDToTypeID("warpStyle");
	var idwarpStyle = stringIDToTypeID("warpStyle");
	var idwarpArc = stringIDToTypeID("warpArc"); // warpNone doesn't works. Arc with zero values is interpreted as warpCustom and looks same as like warpNone
	desc556.putEnumerated(idwarpStyle, idwarpStyle, idwarpArc);
	var idwarpValue = stringIDToTypeID("warpValue");
	desc556.putDouble(idwarpValue, 0);
	var idwarpPerspective = stringIDToTypeID("warpPerspective");
	desc556.putDouble(idwarpPerspective, 0);
	var idwarpPerspectiveOther = stringIDToTypeID("warpPerspectiveOther");
	desc556.putDouble(idwarpPerspectiveOther, 0);
	var idwarpRotate = stringIDToTypeID("warpRotate");
	var idOrnt = charIDToTypeID("Ornt");
	var idHrzn = charIDToTypeID("Hrzn");
	desc556.putEnumerated(idwarpRotate, idOrnt, idHrzn);
	var iduOrder = stringIDToTypeID("uOrder");
	desc556.putInteger(iduOrder, 4);
	var idvOrder = stringIDToTypeID("vOrder");
	desc556.putInteger(idvOrder, 2);
	var idwarp = stringIDToTypeID("warp");
	desc553.putObject(idwarp, idwarp, desc556);
	executeAction(idTrnf, desc553, DialogModes.NO);
}

function groupSelectedLayers() {
	var idMk = charIDToTypeID("Mk  ");
	var desc2372 = new ActionDescriptor();
	var idnull = charIDToTypeID("null");
	var ref424 = new ActionReference();
	var idlayerSection = stringIDToTypeID("layerSection");
	ref424.putClass(idlayerSection);
	desc2372.putReference(idnull, ref424);
	var idFrom = charIDToTypeID("From");
	var ref425 = new ActionReference();
	var idLyr = charIDToTypeID("Lyr ");
	var idOrdn = charIDToTypeID("Ordn");
	var idTrgt = charIDToTypeID("Trgt");
	ref425.putEnumerated(idLyr, idOrdn, idTrgt);
	desc2372.putReference(idFrom, ref425);
	executeAction(idMk, desc2372, DialogModes.NO);
}

function unGroupSelectedLayers() {
	var idungroupLayersEvent = stringIDToTypeID("ungroupLayersEvent");
	var desc2483 = new ActionDescriptor();
	var idnull = charIDToTypeID("null");
	var ref449 = new ActionReference();
	var idLyr = charIDToTypeID("Lyr ");
	var idOrdn = charIDToTypeID("Ordn");
	var idTrgt = charIDToTypeID("Trgt");
	ref449.putEnumerated(idLyr, idOrdn, idTrgt);
	desc2483.putReference(idnull, ref449);
	executeAction(idungroupLayersEvent, desc2483, DialogModes.NO);
}

//
// select single layer
function setSelectedLayer(layerIndexOrName) {
	try {
		var id239 = charIDToTypeID("slct");
		var desc45 = new ActionDescriptor();
		var id240 = charIDToTypeID("null");
		var ref43 = new ActionReference();
		var id241 = charIDToTypeID("Lyr ");
		if (typeof layerIndexOrName == "number") {
			ref43.putIndex(id241, layerIndexOrName);
		} else {
			ref43.putName(id241, layerIndexOrName);
		}
		desc45.putReference(id240, ref43);
		var id242 = charIDToTypeID("MkVs");
		desc45.putBoolean(id242, false);
		executeAction(id239, desc45, DialogModes.NO);
	} catch (e) {
		alert(e.message); // do nothing
	}
}

///////////////////////////////////////////////////////////////////////////////
// Function: addSelectedLayer
// Usage: adds the rest of the layers in the array to the first layer
// Input:  Array selectedLayers or name or single number
// Return: <none>
///////////////////////////////////////////////////////////////////////////////
function addSelectedLayer(layerIndexOrName) {
	try {
		var len = 1;
		if (Object.prototype.toString.call(layerIndexOrName) === '[object Array]') {
			len = layerIndexOrName.length;
		}
		for (var i = 0; i < len; i++) {
			var id243 = charIDToTypeID("slct");
			var desc46 = new ActionDescriptor();
			var id244 = charIDToTypeID("null");
			var ref44 = new ActionReference();
			var id245 = charIDToTypeID("Lyr ");
			if (typeof layerIndexOrName == "number") {
				ref44.putIndex(id245, layerIndexOrName);
			} else if (Object.prototype.toString.call(layerIndexOrName) === '[object Array]') { //když to je pole
				ref44.putIndex(id245, layerIndexOrName[i]);
			} else {
				ref44.putName(id245, layerIndexOrName);
			}
			desc46.putReference(id244, ref44);
			var id246 = stringIDToTypeID("selectionModifier");
			var id247 = stringIDToTypeID("selectionModifierType");
			var id248 = stringIDToTypeID("addToSelection");
			desc46.putEnumerated(id246, id247, id248);
			var id249 = charIDToTypeID("MkVs");
			desc46.putBoolean(id249, false);
			executeAction(id243, desc46, DialogModes.NO);
		}
	} catch (e) {
		alert(e.message); // do nothing
	}
}

function applyTextKey(textKey, index) {
	var layerRef = new ActionReference();
	layerRef.putIndex(cTT('Lyr '), index);
	var idsetd = charIDToTypeID("setd");
	var desc151 = new ActionDescriptor();
	desc151.putReference(charIDToTypeID("null"), layerRef);
	var idT = charIDToTypeID("T   ");
	var idTxLr = charIDToTypeID("TxLr");
	desc151.putObject(idT, idTxLr, textKey);

	executeAction(idsetd, desc151, DialogModes.NO);
}



/////////////////////
//     DEBUG
/////////////////////

// function for debugging - shows points using count tool
/*function showPoints(currentPoints, name){
    app.activeDocument.suspendHistory ("points", "show()");
    function show(){
        var idcountAddGroup = stringIDToTypeID( "countAddGroup" );
            var desc374 = new ActionDescriptor();
            var idNm = charIDToTypeID( "Nm  " );
            desc374.putString( idNm, name );
        executeAction( idcountAddGroup, desc374, DialogModes.NO );
        
        addCounter(currentPoints.leftTop);
        addCounter(currentPoints.rightTop);
        addCounter(currentPoints.rightBottom);
        addCounter(currentPoints.leftBottom);
        
        function addCounter(point){
            var idcountAdd = stringIDToTypeID( "countAdd" );
                var desc345 = new ActionDescriptor();
                var idX = charIDToTypeID( "X   " );
                desc345.putDouble( idX, point.x );
                var idY = charIDToTypeID( "Y   " );
                desc345.putDouble( idY, point.y );
            executeAction( idcountAdd, desc345, DialogModes.NO );
        }
    }
}*/