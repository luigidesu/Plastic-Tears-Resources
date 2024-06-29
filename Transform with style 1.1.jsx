/**
* @@@BUILDINFO@@@ [M] Transform with style 1.1.jsx Sun Oct 01 2017 19:17:36 GMT+0200
*/

/*
    <javascriptresource>
    <name>[M] Transform with style 1.1</name>
    <enableinfo>true</enableinfo>
    <category>Magic</category>
    </javascriptresource>
*/

#target Photoshop

// YOU CAN ADJUST SCRIPT TO FIT YOUR NEEDS. POSSIBLE VALUES ARE "TRUE" OR "FALSE"
settings = {
    keepProportions: true,
    scaleStyle: true,
    scaleShapeStrokeWidth: true,
    scaleShapePatternFill: true,
    scaleShapeGradientFill: true, //only if gradient is not aligned with layer
    scaleShapeStrokeGradient: true, //only if gradient is not aligned with layer
    scaleShapeStrokePattern: true,
    reselectLayersLimit: 20, //we can select layers only with slow method... so if there is too much layers we maybe don't want reselect them because reselecting layers is only nice to have
    remeberLastTransformation: false, // overrides keepProportions
}

/*
    LICENSE
    =======
    This code is provided as is without warranty. The author assumes no responsibility for any inconvenience.
    
    
    Allowed:
    - You may use for commercial and non-commercial purposes without limitations
    - You may copy and distribute the script without restrictions
    - You may include this code in your non-commercial software projects
    - You may modify this script and share if you keep this license
    
    Prohibited
    - You may NOT selling this script without author's permission
    - You may NOT without author's permission using this script as part of software which you want monetize
    - You may NOT distribute script WITHOUT this license informations
    
    
    KNOWN ISSUES
    ============
    - 
    
    
    VERSION HISTORY:
    ================
	1.1:
	- Fixed bug when some layers may have layer effect descriptor but doesn't have layer effects icon in layers panel.
		in this case style scaling would fail
	- Progressbar task should be now cancel-able
	
    1.0:
    - Initial release.
    
    

    Copyright: © 2017 Jaroslav Bereza <http://bereza.cz>
    If you are interested in how the code works, write me at j@bereza.cz  I am open to cooperation.
    
    
    ALGORITHM
    =========
    - get selected layer
    - add layers in groups if there are selected groups
    - filter layer with styles into two separated lists
    - open transformation mode and wait for user input
    - read width and height from transformation
    - apply style scaling
    - apply shape scaling
    
    
    TODO
    ====
    - 
    
    
    Tricky things
    =============
    - scaling value in shape can exists only if is not 100%
    - shape fill (adjustment) is ActionList but seems that contains only one item. If not, script will have problem.
    - script is built for StrokeVersion = 2 ... I have no Idea how this could work with another version
    - you can't scale or transform layer style if native progressbar is shown so I did my own
    
    
    Nice to Have
    ============
    - gradient/shadow/bevel rotation
    - know what is: strokeStyleScaleLock and strokeStyleStrokeAdjust
    - change styles without selecting layer (reference with indexes instead target layers)
    - make checking disabled links more effecient if there are disabled links
    - posibility change style scale without transformation and enter value manualy
	- recognize when layers has empty layer effects. see first bug resolved in 1.1... performance improvement
    
*/





// performance - don't even select shape layer if we won't change shape styles
settings["dontScaleShape"] = (!settings.scaleShapeStrokeWidth && !settings.scaleShapePatternFill && !settings.scaleShapeGradientFill && !settings.scaleShapeStrokeGradient && !settings.scaleShapeStrokePattern);
    

app.bringToFront();
var psVersion=app.version.split('.')[0];

applyPolyfills();
canRunScript();

function canRunScript(){
    if(app.documents.length==0){
        alert("Please open some document");
    }else if(psVersion < 15){
        alert("Sorry. Only Photoshop CC 2014 and higher");
    }
    else{
        app.activeDocument.suspendHistory('[M] Transform with style', 'main()');
    }
}

function saveTransformSettings(desc){
    app.putCustomOptions( "mg_transform_with_style", desc, true );
}

function loadTransformSettings(){
    try{
        var desc = app.getCustomOptions( "mg_transform_with_style" );
    }catch(e){
        return false;
    }
    return desc;
}

function main(){
    var originalSelectedLayers = getSelectedLayers ();
    var selectedLayersWithLinks = addLinkedLayers(originalSelectedLayers.slice(0));
        selectedLayers = addLayersInGroups(selectedLayersWithLinks.slice(0));
    var layersWithStyle = filterLayersWithStyle(selectedLayers);
    var layersWithShape = filterLayersWithShape(selectedLayers);
    
    // because we can't check which linked layer has disabled link so we need use select 
    // linked and this breaks our selection. So we restore it in this case.
    if(!areListsSame(selectedLayersWithLinks,originalSelectedLayers)){
        setSelectedLayers(originalSelectedLayers); 
    }
    
    var desc = transform();
    if(desc === false){return} // can't transform. User canceled or something failed
    if(settings.remeberLastTransformation){
        saveTransformSettings (desc);
    }
    var width = 100, height = 100;
    var scaleFactor = 100;

    if(desc.hasKey(stringIDToTypeID('width'))){
        width = desc.getUnitDoubleValue(stringIDToTypeID('width'));
    }
    if(desc.hasKey(stringIDToTypeID('height'))){
        height = desc.getUnitDoubleValue(stringIDToTypeID('height'));
    }

    scaleFactor = (width + height)/2;
    
    if(scaleFactor == 100){return} // skip effect scaling if nothing would change
    
    
    for(var i = 0, prgs, cancel = false, len = selectedLayers.length; i < len; i++){
        
        if(!prgs){
            prgs=PltProgress(len, "Styles scaling...");
            prgs.show();
        }
        
        var index = selectedLayers[i];
        var hasStyle = layersWithStyle.indexOf(index) >= 0;
        var hasShape = layersWithShape.indexOf(index) >= 0;
        var desc;
        
        if(hasStyle || hasShape){
            desc = getLayerDescriptor (index);
            setSelectedLayer (index);
        }
        
        if(hasStyle){
            cancel = scaleStyles(scaleFactor);
        }
        
        if(hasShape){
            var shapeProperties = {
                scaleRatio: scaleFactor/100,
                strokeWidth: getStrokeWidth(desc),
                
                shapePatternScale: getShapePatternScale(desc),
                shapeGradientScale: getShapeGradientScale(desc),
                
                shapeStrokeGradientScale: getShapeStrokeGradientScale(desc),
                shapeStrokePatternScale: getShapeStrokePatternScale(desc)
            }
            
            var strokeDesc = changeStrokeDesc( desc.getObjectValue(stringIDToTypeID('AGMStrokeStyleInfo')), shapeProperties);
            var fillDesc = changeFillDesc(desc.getList(stringIDToTypeID('adjustment')).getObjectValue(0), shapeProperties);
            var fillKey = getFillKey(fillDesc);
            
            cancel = applyShapeDescriptor (index, fillDesc, strokeDesc, fillKey);
        }
        if(cancel){return;}
        cancel = prgs.update(i,("Styles scaling: "+i+" layers from " + len));
        if(cancel){return;}
    }

    if(originalSelectedLayers.length < settings.reselectLayersLimit){
        setSelectedLayers(originalSelectedLayers);
    }
    
}

function getFillKey(fillDesc){
    var fillKey;
    
    if(fillDesc.hasKey(stringIDToTypeID("pattern"))){
        fillKey = stringIDToTypeID("patternLayer");
    } else if(fillDesc.hasKey(stringIDToTypeID("gradient"))){
        fillKey = stringIDToTypeID("gradientLayer");
    } else {
        fillKey = stringIDToTypeID("solidColorLayer");
    }

    return fillKey;
}

function areListsSame(listA, listB){
    if(listA.length !== listB.length){return false}
    for (var i = 0, len = listA.length; i < len; i++)
    {
        if(listA[i] !== listB[i]){return false}
    }
    return true;    
}

function scaleStyles(value){
    try{
        var idscaleEffectsEvent = stringIDToTypeID( "scaleEffectsEvent" );
            var desc66 = new ActionDescriptor();
            var idScl = charIDToTypeID( "Scl " );
            var idPrc = charIDToTypeID( "#Prc" );
            desc66.putUnitDouble( idScl, idPrc, value );
        executeAction( idscaleEffectsEvent, desc66, DialogModes.NO );
    }catch(e){
        if (e.number === 8007) { // if "User cancelled"   
            return true;
        }
    }
}


function changeFillDesc(desc, props){
    if(props.shapeGradientScale !== false && settings.scaleShapeGradientFill){
        desc.putDouble(stringIDToTypeID('scale'),round2(props.shapeGradientScale * props.scaleRatio));
    }
    if(props.shapePatternScale !== false && settings.scaleShapePatternFill){
        desc.putDouble(stringIDToTypeID('scale'),round2(props.shapePatternScale * props.scaleRatio));
    }

    return desc;
}

function changeStrokeDesc(desc, props){
    if(props.strokeWidth !== false && settings.scaleShapeStrokeWidth){
        var strokeDoubleType = desc.getUnitDoubleType(stringIDToTypeID('strokeStyleLineWidth'));
        desc.putUnitDouble(stringIDToTypeID('strokeStyleLineWidth'), strokeDoubleType ,round2(props.strokeWidth * (props.scaleRatio)));
        // putUnitDouble namísto double
    }
    
    if(props.shapeStrokeGradientScale !== false && settings.scaleShapeStrokeGradient){
        var gradientDesc = desc.getObjectValue(stringIDToTypeID('strokeStyleContent'));
        gradientDesc.putDouble(stringIDToTypeID('scale'),round2(props.shapeStrokeGradientScale * props.scaleRatio));
        desc.putObject(stringIDToTypeID('strokeStyleContent'),stringIDToTypeID('strokeStyleContent'),gradientDesc);
    }
    if(props.shapeStrokePatternScale !== false && settings.scaleShapeStrokePattern){
        var patternDesc = desc.getObjectValue(stringIDToTypeID('strokeStyleContent'));
        patternDesc.putDouble(stringIDToTypeID('scale'),round2(props.shapeStrokePatternScale * props.scaleRatio));
        desc.putObject(stringIDToTypeID('strokeStyleContent'),stringIDToTypeID('strokeStyleContent'),patternDesc);
    }

    return desc;
}

//
// Function: getSelectedLayers
// Usage: creates and array of the currently selected layers
// Input: <none> Must have an open document
// Return: Array selectedLayers
function getSelectedLayers() {
    var selectedLayers = [];
    try {
       var backGroundCounter = 1;
        try {
            var dummy = app.activeDocument.backgroundLayer;
            backGroundCounter = 0;
        }
        catch(e){;} //do nothing
        
        var ref = new ActionReference();
        var keyTargetLayers = app.stringIDToTypeID( 'targetLayers' );
        ref.putProperty( app.charIDToTypeID( 'Prpr' ), keyTargetLayers );
        ref.putEnumerated( app.charIDToTypeID( 'Dcmn' ), app.charIDToTypeID( 'Ordn' ), app.charIDToTypeID( 'Trgt' ) );
        var desc = executeActionGet( ref );
        if ( desc.hasKey( keyTargetLayers ) ) {
            var layersList = desc.getList( keyTargetLayers );
            for ( var i = 0; i < layersList.count; i++) {
                var listRef = layersList.getReference( i );
                selectedLayers.push( listRef.getIndex() + backGroundCounter );
            }
        }
    }catch(e) {
        ; // do nothing
    }
    return selectedLayers;
}

function setSelectedLayers(list){
    setSelectedLayer(list[0]);
    addSelectedLayer(list);
}

function setSelectedLayer( layerIndexOrName ) {
    try {
        var id239 = charIDToTypeID( "slct" );
        var desc45 = new ActionDescriptor();
        var id240 = charIDToTypeID( "null" );
        var ref43 = new ActionReference();
        var id241 = charIDToTypeID( "Lyr " );
        if ( typeof layerIndexOrName == "number" ) {
            ref43.putIndex( id241, layerIndexOrName );
        } else {
            ref43.putName( id241, layerIndexOrName );
        }
        desc45.putReference( id240, ref43 );
        var id242 = charIDToTypeID( "MkVs" );
        desc45.putBoolean( id242, false );
        executeAction( id239, desc45, DialogModes.NO );
    }catch(e) {
        alert(e.message); // do nothing
    }
}

function addSelectedLayer( layerIndexOrName ) {
    try {
        var len=1;
        if( Object.prototype.toString.call( layerIndexOrName ) === '[object Array]' ) {
            len = layerIndexOrName.length;
        }
        for ( var i = 0;i<len;i++){
            var id243 = charIDToTypeID( "slct" );
            var desc46 = new ActionDescriptor();
            var id244 = charIDToTypeID( "null" );
            var ref44 = new ActionReference();
            var id245 = charIDToTypeID( "Lyr " );
            if ( typeof layerIndexOrName == "number" ) {
                ref44.putIndex( id245, layerIndexOrName );
            } 
            else if( Object.prototype.toString.call( layerIndexOrName ) === '[object Array]' ){ //když to je pole
                ref44.putIndex( id245, layerIndexOrName[i] );
            }
            else {
                ref44.putName( id245, layerIndexOrName );
            }
            desc46.putReference( id244, ref44 );
            var id246 = stringIDToTypeID( "selectionModifier" );
            var id247 = stringIDToTypeID( "selectionModifierType" );
            var id248 = stringIDToTypeID( "addToSelection" );
            desc46.putEnumerated( id246, id247, id248 );
            var id249 = charIDToTypeID( "MkVs" );
            desc46.putBoolean( id249, false );
            executeAction( id243, desc46, DialogModes.NO );
        }
    }catch(e) {
        alert(e.message); // do nothing
    }
}

function filterLayersWithStyle(list){
    var result = [];
    
    if(settings.scaleStyle){
        for(var i = 0, len = list.length; i < len; i++){
            var index = list[i];
            var desc = getLayerDescriptor(index) ;
            var hasStyle = desc.hasKey(stringIDToTypeID('layerEffects'));
            if(hasStyle){
                result.push(index);
            }
        }
    }

    return result;
}

function filterLayersWithShape(list){
    var result = [];
    
    if(settings.dontScaleShape === false){
        for(var i = 0, len = list.length; i < len; i++){
            var index = list[i];
            var desc = getLayerDescriptor(index);
            var shapePatternScale = getShapePatternScale(desc);
            var shapeGradientScale = getShapeGradientScale(desc);
            
            if(hasStroke(desc) || shapePatternScale !== false || shapeGradientScale !== false){
                result.push(index);
            }
        }
    }

    return result;
}

function getStrokeWidth(desc){
    if(!desc.getObjectValue(stringIDToTypeID('AGMStrokeStyleInfo')).hasKey(stringIDToTypeID('strokeStyleLineWidth'))){return false}
    
    var result = desc.getObjectValue(stringIDToTypeID('AGMStrokeStyleInfo')).getUnitDoubleValue(stringIDToTypeID('strokeStyleLineWidth'));
    return result;
}

function hasStroke(desc){
    var hasStrokeWidth = desc.hasKey(stringIDToTypeID('AGMStrokeStyleInfo')) && desc.getObjectValue(stringIDToTypeID('AGMStrokeStyleInfo')).hasKey(stringIDToTypeID('strokeStyleLineWidth'));
    var isShape = desc.getInteger(stringIDToTypeID('layerKind')) === 4;
    var has = hasStrokeWidth && isShape;
    return has;
}

function getShapeStrokeGradientScale(desc){
    
    var strokeDesc = desc.getObjectValue(stringIDToTypeID('AGMStrokeStyleInfo'));
    var hasStrokeStyle = strokeDesc.hasKey(stringIDToTypeID('strokeStyleContent'));
    if(!hasStrokeStyle){return false}
    
    var strokeStyleContentDesc = strokeDesc.getObjectValue(stringIDToTypeID('strokeStyleContent'));
    
    var isGradient = strokeStyleContentDesc.hasKey(stringIDToTypeID('gradient'));
    if(!isGradient){return false}
    
    // we don't need scale gradient if align with layer is true
    var isAlignedToLayer = strokeStyleContentDesc.getBoolean(stringIDToTypeID('align'));
    if(isAlignedToLayer){return false}
    
    var strokeGradientScale = strokeStyleContentDesc.getUnitDoubleValue(stringIDToTypeID('scale'));
    
    return strokeGradientScale;
}


function getShapeStrokePatternScale(desc){
    
    var strokeDesc = desc.getObjectValue(stringIDToTypeID('AGMStrokeStyleInfo'));
    var hasStrokeStyle = strokeDesc.hasKey(stringIDToTypeID('strokeStyleContent'));
    if(!hasStrokeStyle){return false}
    
    var strokeStyleContentDesc = strokeDesc.getObjectValue(stringIDToTypeID('strokeStyleContent'));
    
    var isPattern = strokeStyleContentDesc.hasKey(stringIDToTypeID('pattern'));
    if(!isPattern){return false}
    
    var strokePatternScale = strokeStyleContentDesc.getUnitDoubleValue(stringIDToTypeID('scale'));
    
    return strokePatternScale;
}


// fillKey = typeID
// fillDesc = gradientLayer
// strokeDesc = descAGMStrokeStyleInfo
function applyShapeDescriptor(layerIndex, fillDesc, strokeDesc, fillKey){
   var idsetd = charIDToTypeID( "setd" );
        var desc1176 = new ActionDescriptor();
        var idnull = charIDToTypeID( "null" );
            var ref301 = new ActionReference();
            var idcontentLayer = stringIDToTypeID( "contentLayer" );
            var idOrdn = charIDToTypeID( "Ordn" );
            var idTrgt = charIDToTypeID( "Trgt" );
            ref301.putEnumerated( idcontentLayer, idOrdn, idTrgt );
            //ref301.putIndex(idcontentLayer, layerIndex)
        desc1176.putReference( idnull, ref301 );
        var idT = charIDToTypeID( "T   " );
            var descShapeStyle = new ActionDescriptor();
            
            var idFlCn = stringIDToTypeID( "fillContents" );
            descShapeStyle.putObject( idFlCn, fillKey, fillDesc );
            
            var idstrokeStyle = stringIDToTypeID( "strokeStyle" );
            descShapeStyle.putObject( idstrokeStyle, idstrokeStyle, strokeDesc );
            
        var idshapeStyle = stringIDToTypeID( "shapeStyle" );
        desc1176.putObject( idT, idshapeStyle, descShapeStyle );
    try{
        executeAction( idsetd, desc1176, DialogModes.NO );
    }catch(e){
		if (e.number === 8007) { // if "User cancelled"   
            return true;
        }
		throw e;  
    }
}


function getShapePatternScale(desc){
    // adjustments present
    if(!desc.hasKey(stringIDToTypeID('adjustment'))){return false;}
    
    // patternLayer present
    var adjustmentList = desc.getList(stringIDToTypeID('adjustment'));
    var patternLayerPosition = getKeyPositionInActionList(adjustmentList, stringIDToTypeID("patternLayer"));
    if( patternLayerPosition === -1 ){return false}
    
    var patternDesc = adjustmentList.getObjectValue(patternLayerPosition);
    
    // if everything except scale exists then scale should be 100%
    var hasScaleKey = patternDesc.hasKey(stringIDToTypeID('scale'));
    if( !hasScaleKey ){return 100}
    
    // get scale value
    var patternScale = patternDesc.getUnitDoubleValue(stringIDToTypeID('scale'));
    return patternScale;
}

function getShapeGradientScale(desc){
    
    // adjustments present
    if(!desc.hasKey(stringIDToTypeID('adjustment'))){return false;}
    
    // patternLayer present
    var adjustmentList = desc.getList(stringIDToTypeID('adjustment'));
    var gradientLayerPosition = getKeyPositionInActionList(adjustmentList, stringIDToTypeID("gradientLayer"));
    if( gradientLayerPosition === -1 ){return false}
    
    var gradientDesc = adjustmentList.getObjectValue(gradientLayerPosition);
    
    // we don't need scale gradient if align with layer is true
    var hasAlignKey = gradientDesc.hasKey(stringIDToTypeID('align'));
    if( !hasAlignKey ){return false}
    
    // if everything except scale exists then scale should be 100%
    var hasScaleKey = gradientDesc.hasKey(stringIDToTypeID('scale'));
    if( !hasScaleKey ){return 100}
    
    var gradientScale = gradientDesc.getUnitDoubleValue(stringIDToTypeID('scale'))
    
    return gradientScale;

}

// objectType
// key = typeID
function getKeyPositionInActionList(list, key){
    for (var i = 0, len = list.count; i < len; i++){
        var isKeyFound = list.getObjectType(i) == key;
        if(isKeyFound){
            return i;
        }
    }
    return -1;
}

function getLayerDescriptor(index){
    var ref = new ActionReference();  
    ref.putIndex( charIDToTypeID( "Lyr " ), index );    
    var desc = executeActionGet(ref); 
    return desc;
}

function getLayerIndexByID(id){
    var backGroundCounter = 0;
        try {
            var dummy = app.activeDocument.backgroundLayer;
            backGroundCounter = -1;
        }
        catch(e){;} //do nothing
    
    var ref = new ActionReference();  
    ref.putProperty(charIDToTypeID( "Prpr" ), stringIDToTypeID("itemIndex"));
    ref.putIdentifier( charIDToTypeID( "Lyr " ), id );    
    var desc = executeActionGet(ref); 
    var index = desc.getInteger(stringIDToTypeID('itemIndex')) + backGroundCounter;
    return index;
}

function transform(){
    var desc54;
    var idTrnf = charIDToTypeID( "Trnf" );
    
    if(!settings.remeberLastTransformation || loadTransformSettings()===false){
            desc54 = new ActionDescriptor();
            var idnull = charIDToTypeID( "null" );
                var ref7 = new ActionReference();
                var idLyr = charIDToTypeID( "Lyr " );
                var idOrdn = charIDToTypeID( "Ordn" );
                var idTrgt = charIDToTypeID( "Trgt" );
                ref7.putEnumerated( idLyr, idOrdn, idTrgt );
            desc54.putReference( idnull, ref7 );
            var idFTcs = charIDToTypeID( "FTcs" );
            var idQCSt = charIDToTypeID( "QCSt" );
            var idQcsa = charIDToTypeID( "Qcsa" );
            desc54.putEnumerated( idFTcs, idQCSt, idQcsa );
            var idOfst = charIDToTypeID( "Ofst" );
                var desc55 = new ActionDescriptor();
                var idHrzn = charIDToTypeID( "Hrzn" );
                var idPxl = charIDToTypeID( "#Pxl" );
                desc55.putUnitDouble( idHrzn, idPxl, 0 );
                var idVrtc = charIDToTypeID( "Vrtc" );
                var idPxl = charIDToTypeID( "#Pxl" );
                desc55.putUnitDouble( idVrtc, idPxl, 0 );
            var idOfst = charIDToTypeID( "Ofst" );
            desc54.putObject( idOfst, idOfst, desc55 );
            var idLnkd = charIDToTypeID( "Lnkd" );
            desc54.putBoolean( idLnkd, settings.keepProportions );
            var idIntr = charIDToTypeID( "Intr" );
            var idIntp = charIDToTypeID( "Intp" );
            var idbicubicAutomatic = stringIDToTypeID( "bicubicAutomatic" );
            desc54.putEnumerated( idIntr, idIntp, idbicubicAutomatic );
    }else{
        desc54 = loadTransformSettings ();
    }
    
    var desc;
    try{
        desc = executeAction( idTrnf, desc54, DialogModes.ALL );
    }catch(e){
        if (e.number != 8007) { // if not "User cancelled"  
            throw e; 
        }
        return false;
    }
    return desc;
}

function addLinkedLayers(list){
/*
    Jednodušší postup:
    - vyber vrstvu ze seznamu, pokud není v novém seznamu
    - pokud má klíč linked layers, spusti selectedLinked
    - pokud má dokument vybrán stejný počet vrstev, prostě je přidej do nového seznamu (pokud už v poli nejsou)
    - jinak
        - vyber první nalinkovanou vrstvu
        - pokud je výběr možný přidej jí do nového seznamu vč. všech vybraných vrstev (pokud už není v poli), jinak nic nepřidávej
        - pokračuj dalšími vrstvami v seznamu
    
    OPRAVIT
    - pokud je vybraná vrstva s vypnutým linkem, tak to nic nepřidá
*/    
    
    var tempList = [];
    var originalList = list.slice(0);
    
    for (var i = 0; i < originalList.length; i++){ //změna
        var index = originalList[i];
        
        //nechceme to kontrolovat zbytečně dvakrát
        if(tempList.indexOf(index) !== -1){continue}
        
        var desc = getLayerDescriptor (index);
        
        if(!desc.hasKey(stringIDToTypeID('linkedLayerIDs'))){continue}
        var linkedLayerIDs = desc.getList(stringIDToTypeID('linkedLayerIDs'));
        setSelectedLayer (index);
        var isLinkEnabled = selectedLinkedLayers();
    
        if(isLinkEnabled){
            var linkedLayersList = getSelectedLayers();
            if(linkedLayerIDs.count === linkedLayersList.length-1){
                for(var j = 0, len = linkedLayerIDs.count; j < len; j++){
                    var id = linkedLayerIDs.getInteger(j);
                    var indexLinked = getLayerIndexByID (id);
                    addIndex(indexLinked);
                }
            }else{
                for(var j = 0, len = linkedLayerIDs.count; j < len; j++){
                    var id = linkedLayerIDs.getInteger(j);
                    var indexLinked = getLayerIndexByID (id);
                    setSelectedLayer (indexLinked);
                    var isParticularLinkEnabled = selectedLinkedLayers();
                    if(isParticularLinkEnabled ){
                        addIndex(indexLinked);
                    }
                }
            }
        }/*else{ //změna
            for(var j = 0, len = linkedLayerIDs.count; j < len; j++){
                    setSelectedLayer (index);
                    var id = linkedLayerIDs.getInteger(j);
                    var indexLinked = getLayerIndexByID (id);
                    if(originalList.indexOf(indexLinked) === -1){
                        originalList.push(indexLinked);
                    }
                }
            list.splice(list.indexOf(index),1); //odeberu z listu vrstvu, která má vypnutý link
        }*/
    }

    function addIndex(k){
        if(list.indexOf(k) === -1){
            tempList.push(k);
        }
    }

    var mergedList = list.concat(tempList);
    return mergedList;
}

function selectedLinkedLayers(){
    try{
        var idslct = charIDToTypeID( "slct" );
            var desc135 = new ActionDescriptor();
            var idnull = charIDToTypeID( "null" );
                var ref63 = new ActionReference();
                var idMn = charIDToTypeID( "Mn  " );
                var idMnIt = charIDToTypeID( "MnIt" );
                var idplacedLayerEditContents = stringIDToTypeID( "selectLinkedLayers" );
                ref63.putEnumerated( idMn, idMnIt, idplacedLayerEditContents );
            desc135.putReference( idnull, ref63 );
        executeAction( idslct, desc135, DialogModes.NO );
        return true;
    }catch(e){
        if(e.number == -25920){ // menu item not available
            return false;
        }
        throw e;
    }
}


function addLayersInGroups(list){
    var originalList = list.slice(0);
    
    for (var i = 0, len = originalList.length; i < len; i++){
        var index = originalList[i];
        var desc = getLayerDescriptor (index);
        var isFolder = desc.getEnumerationValue(stringIDToTypeID('layerSection')) == stringIDToTypeID("layerSectionStart");
        if(!isFolder) continue;
        
        for(var j = index - 1, nestingLevel = 1; nestingLevel > 0 && j >= 0; j--){
            var nestedDesc = getLayerDescriptor (j);
            var isFolderEnd = nestedDesc.getEnumerationValue(stringIDToTypeID('layerSection')) == stringIDToTypeID("layerSectionEnd");
            var isFolderStart = nestedDesc.getEnumerationValue(stringIDToTypeID('layerSection')) == stringIDToTypeID("layerSectionStart");
            
            if(isFolderStart){
                nestingLevel++;
                addIndex(j);
            }else if(isFolderEnd){
                nestingLevel--;
            }else{
                addIndex(j);
            }
        }
    }

    function addIndex(k){
        if(list.indexOf(k) === -1){
            list.push(k);
        }
    }

    return list;
    
}

function round2 (num){
    return Math.round(num * 100) / 100;
}

function applyPolyfills(){
    if (!Array.prototype.indexOf) {
      Array.prototype.indexOf = function(searchElement, fromIndex) {
        var k;
        if (this == null) {
          throw new TypeError('"this" is null or not defined');
        }

        var o = Object(this);
        var len = o.length >>> 0;
        if (len === 0) {
          return -1;
        }
        var n = fromIndex | 0;
        if (n >= len) {
          return -1;
        }
        k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
        while (k < len) {
          if (k in o && o[k] === searchElement) {
            return k;
          }
          k++;
        }
        return -1;
      };
    }
}


function PltProgress(maximum, message) {
    var obj = {};
    var win;
    var closed = false;
    var max = maximum;
    var msg = message;
  
    obj.show = function() {
         var winContructorString = """palette{
            text:'Progress',
            message:StaticText{text:'"""+msg+""""',alignment: 'fill'},
            myRow: Panel { 
                orientation: 'row',
                margins:0,
                properties:{borderStyle: none}
                panel:Panel{
                    margins:0,
                    bar:Progressbar{
                        bounds:[20,20,280,31], 
                        value:0,
                        maxvalue:"""+max+"""
                    }
                },
                cancel:Button{ 
                    text: 'Cancel', 
                    properties:{name:'cancel'}
                }
            }
            
            };""";
            win = new Window(winContructorString);
            win.onClose = function(){
                win.close();
                closed = true;
            }

            win.myRow.cancel.onClick = function(){
                win.close();
                closed = true;
            }
            win.show();
            
            return closed;
    };
    obj.hide = function() {
        closed = true;
        win.close();
    };
    obj.update = function(step, updateMessage){
        win.myRow.panel.bar.value = step;
        win.message.text = updateMessage;
        if(step === max){closed = true;win.close();}
        return closed;
    }
    return obj;
}









