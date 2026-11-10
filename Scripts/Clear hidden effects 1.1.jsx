/**
* @@@BUILDINFO@@@ [M] Clear hidden effects 1.1.jsx Mon Jun 05 2017 21:55:20 GMT+0200
*/

/*
    <javascriptresource>
    <name>[M] Clear hidden effects 1.1</name>
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
    - You may modify this script and share if you keep this license
    
    Prohibited
    - You may NOT selling this script without author's permission
    - You may NOT without author's permission using this script as part of software which you want monetize
    - You may NOT distribute script WITHOUT this license informations
    
    
    KNOWN ISSUES
    ============
    - removes effects/styles from layers inside locked folder
    
    
    VERSION HISTORY:
    ================
    1.1:
    - completely rewriten code because Adobe did 10+ bugs in AM code so version 1.0 couldn't do this job correctly
    - added progressbar
    - fixed layer stats
    - fixed PS crash
    
    1.0:
    - Initial release.
    
    

    Copyright: © 2017 Jaroslav Bereza <http://bereza.cz>
    If you are interested in how the code works, write me at j@bereza.cz  I am open to cooperation.
    
    

    ALGORITHM
    =========
    - Since CC2015 and higher there is change in layer styles so you can have multiple effect of same kind
    - So we need recognize object-type and list-type. List-type is list of objects
    - Since CC2015 there are 3 states for effect
        - enabled = if effect is applied on layer (not new)
        - present = if effect is shown in layers panel (new)
        - showInDialog = if effect is shown in style dialog (new)
        > This means that you can have effect which you can see in layers panel, is enabled but is not in style dialog (showInDialog)
        > Styles also can have more effects in descriptor than you can see in layers panel (present)
        - limit effects of same kind in single style is 10
    - Moving whole style means removing style from current layer and replacing in target layer
    - Moving single effect means removing style from current layer and replacing in target layer if it's not multi-effect otherwise is added to others.
    - Runing actions in Photoshop takes a lot time but reading descriptors is fast. So I analyze a lot data in order to minimize number of steps.
    
    
    PS FX/Styles bugs (10+)
    =========================
    - the workaround with dummy layer may seems to be stupid, but belive me. I tried everything and this is only zero bug solution I know.
    - vote for fix from Adobe here: https://feedback.photoshop.com/photoshop_family/topics/layer-effects-scripting-10-bugs-am-code
    
     
    Good luck if you want do something with styles.
    You definitely will need luck because Adobe did a lot bugs in AM code
    that is almost impossible scripting something bulletproof.
    Here is the wizard for this strange kind of magic.
    She will not help you, it's just a psychological support.
    If you want real help, hire ($) me (j@bereza.cz)
                   .
             /^\     .
        /\   "V"
       /__\   |      0  1
      //..\\  |     .
      \].`[/  |
      /l\/j\  (]    .  1
     /. ~~ ,\/|          .
     \\L__j^\/|       0
      \/--v}  |     1   .
      |    |  |   _________
      |    |  | c(`       ')o
      |    l  |   \.     ,/
    _/j  L l\_!  _//^---^\\_ 

    

*/

#target Photoshop
app.bringToFront();
cTID = function(s) { return cTID[s] || (cTID[s] = app.charIDToTypeID(s)); };
sTID = function(s) { return app.stringIDToTypeID(s); }; 
idTS = function(id) { return app.typeIDToStringID (id);};
var psVersion=app.version.split('.')[0];
var topLayerIndex;
var dummyLayer;

var stats = {
    completeFxRemove: 0,
    affectedLayers: 0,
    removedEffects: 0
}

carRunScript();
function carRunScript(){
    if(app.documents.length==0){
        alert("Please open some document");
    }else{
        app.activeDocument.suspendHistory('[M] Clear hidden effects', 'setUpProgressBar()');
    }
}

function setUpProgressBar(){
    var selectedLayers = getSelectedLayers();
    
    if(psVersion < 16){
        main();
    }else{
        app.doProgress("Style magic in progress...","main()");
    }

    if(selectedLayers.length >= 1){
        setSelectedLayer(selectedLayers[0]);
        addSelectedLayer (selectedLayers);
    }
}


function main(){
    var len = getLayersCount() + addBackgroundToIndex();
    topLayerIndex = len;
    var bgCounter = getBgCounter();
    // Go through all the layers
    for(var i = 0; i < len; i++){
        if(psVersion > 16){
            var canContinue = app.doProgressSubTask(i,len,"checkLayer("+i+")");
            if(!canContinue) return;
        }else{
            checkLayer(i);
        }
    }

    if(dummyLayer){
        dummyLayer.remove();
    }

    function checkLayer(i){
        var index = i + bgCounter;
        if(isLocked(index) || !hasFxKey(index)){
            return;
        }
        
        var fxDescriptor = getFxDescriptor(index);
        var hasOnlyNotPresentEffects = false;
        if(psVersion > 16){
            hasOnlyNotPresentEffects = getHasOnlyNotPresentEffects(fxDescriptor);
        }
        
        var shouldClearWholeLayerFx = !isLayerFXVisible(index) && !isLocked(index) && !hasOnlyNotPresentEffects;
        
        if(shouldClearWholeLayerFx || !hasOnlyNotPresentEffects){
            if(!dummyLayer){
                dummyLayer = app.activeDocument.artLayers.add();
            }
        }
        
        if(shouldClearWholeLayerFx){
            // could fail if parent group is locked
            try{
                moveStyleToEmptyLayer (index, topLayerIndex);
                stats.completeFxRemove++;
                stats.affectedLayers++;
            }catch(ignore){
                //$.writeln(ignore);
            }
            return;
        } else if(!hasOnlyNotPresentEffects) {
            // could fail if parent group is locked
            try{ 
                var dummyLayerFxDescriptor = new ActionDescriptor();
                dummyLayerFxDescriptor = getFxDescriptor(topLayerIndex + bgCounter);
                var resetDummyLayer = hasStyleTooMuchEffects (dummyLayerFxDescriptor);
                if(resetDummyLayer){
                    dummyLayer.remove();
                    dummyLayer = app.activeDocument.artLayers.add();
                }
                var isLayerAffected = removeFxOneByOne(index);
                if(isLayerAffected){
                    stats.affectedLayers++;
                }
            }catch(ignore){
                //$.writeln(ignore);
            }
        }
    }

    alert("Affected layers: "+stats.affectedLayers+"\n"+"Layer with completely removed styles: "+stats.completeFxRemove+"\nRemoved effects: "+stats.removedEffects);
}

// only PS 16+
// because you can have layers with effects which are disabled and not visible in layers panel. 
// We don't want change layers where already are all layers "not present" So we can save significant amount of time
function getHasOnlyNotPresentEffects(fxDescriptor){
    var len = fxDescriptor.count;
    for (var i = len-1; i >= 0; i--){
        var singleFxName = fxDescriptor.getKey(i); //typeID
        var type = fxDescriptor.getType(singleFxName);
        var singleFxDesc = fxDescriptor.getList(singleFxName);
        
        if(type == "DescValueType.LISTTYPE"){
            for (var j = 0, lenJ = singleFxDesc.count; j < lenJ; j++){
                var present = singleFxDesc.getList(j).getObjectValue(0).getBoolean(sTID('present'));
                if(present){
                    return false;
                }
            }
        }
        else if(type == "DescValueType.OBJECTTYPE"){
            var present = singleFxDesc.getObjectValue(0).getBoolean(sTID('present'));
            
            if(present){
                return false;
            }
        }
    }
    return true;
}

function moveStyleToEmptyLayer(from, to){
    var idmove = charIDToTypeID( "move" );
        var desc1635 = new ActionDescriptor();
        var idnull = charIDToTypeID( "null" );
            var ref434 = new ActionReference();
            var idLefx = charIDToTypeID( "Lefx" );
            ref434.putClass( idLefx );
            var idLyr = charIDToTypeID( "Lyr " );
            ref434.putIndex( idLyr, from );
        desc1635.putReference( idnull, ref434 );
        var idT = charIDToTypeID( "T   " );
            var ref435 = new ActionReference();
            var idLyr = charIDToTypeID( "Lyr " );
            ref435.putIndex( idLyr, to );
        desc1635.putReference( idT, ref435 );
    executeAction( idmove, desc1635, DialogModes.NO );
}

function moveEffect(fromLayerIndex, toLayerIndex, effectIndex, fxKey){
    if(!effectIndex){
        effectIndex=1;
    }
    
    var idmove = charIDToTypeID( "move" );
        var desc1727 = new ActionDescriptor();
        var idnull = charIDToTypeID( "null" );
            var ref493 = new ActionReference();
            if(psVersion > 16){
                ref493.putIndex( fxKey, effectIndex );
            }else{
                ref493.putClass( fxKey );
            }
            var idLyr = charIDToTypeID( "Lyr " );
            ref493.putIndex( idLyr, fromLayerIndex );
        desc1727.putReference( idnull, ref493 );
        var idT = charIDToTypeID( "T   " );
            var ref494 = new ActionReference();
            var idLyr = charIDToTypeID( "Lyr " );
            ref494.putIndex( idLyr, toLayerIndex );
        desc1727.putReference( idT, ref494 );
    executeAction( idmove, desc1727, DialogModes.NO );
}

function hasStyleTooMuchEffects(fxDescriptor){
    var len = fxDescriptor.count;
    for (var i = len-1; i >= 0; i--){
        var singleFxName = fxDescriptor.getKey(i); //typeID
        var type = fxDescriptor.getType(singleFxName);
        var singleFxDesc = fxDescriptor.getList(singleFxName);
        
        if(type == "DescValueType.LISTTYPE"){
            if(singleFxDesc.count >= 10)
            {
                return true;
            }
        }
    }
    return false;
}


function removeFxOneByOne(layerIndex){
    var affected = false;
    fxDescriptor = new ActionDescriptor();
    fxDescriptor = getFxDescriptor (layerIndex);
    
    for (var i = 0, len = fxDescriptor.count; i < len; i++){
        var singleFxName = fxDescriptor.getKey(i); //typeID
        var type = fxDescriptor.getType(singleFxName);
        var singleFxDesc = fxDescriptor.getList(singleFxName);
        var j = 0;
        
        if(type == "DescValueType.LISTTYPE"){
            for (j = 0; j < singleFxDesc.count; j++){
                var singleSubFxList = singleFxDesc.getList(j);
                var fxKey = singleSubFxList.getClass(0);
                var breakLoop = setSingleFx(singleSubFxList, fxKey , true, j+1);
            }
            
        }
        else if(type == "DescValueType.OBJECTTYPE"){
            var breakLoop = setSingleFx(singleFxDesc, singleFxName);
            if(breakLoop){
                return;
            }
        }
    
        function setSingleFx(singleFxDesc, fxName, isList,fxIndex){
            var fxEnabled = singleFxDesc.getObjectValue(0).getBoolean(sTID('enabled'));
            var fxPresent = true;
            if(psVersion >= 16){
                fxPresent = singleFxDesc.getObjectValue(0).getBoolean(sTID('present'));
            }
            
            if(!fxEnabled && fxPresent){
                moveEffect(layerIndex,topLayerIndex,fxIndex,fxName)
                stats.removedEffects++;
                affected = true;
            }
        }
    }
    return affected;
    
}

function isLayerFXVisible(layerIndex){
    var ref = new ActionReference();
    var idPrpr = charIDToTypeID( "Prpr" );
    var layerEffects = stringIDToTypeID( "layerFXVisible" );
    ref.putProperty( idPrpr, layerEffects );
    var lyr = charIDToTypeID( "Lyr " );
    ref.putIndex( lyr, layerIndex );
    var desc = executeActionGet(ref);
    
    if(desc.hasKey(sTID('layerFXVisible'))){
        var visible = desc.getBoolean(stringIDToTypeID('layerFXVisible'));
        return visible;
    }

    return false;
}

function hasFxKey(layerIndex){
    var ref = new ActionReference();
    var idPrpr = charIDToTypeID( "Prpr" );
    var layerEffects = stringIDToTypeID( "layerEffects" );
    ref.putProperty( idPrpr, layerEffects );
    var lyr = charIDToTypeID( "Lyr " );
    ref.putIndex( lyr, layerIndex );
    var desc = executeActionGet(ref);
    
    var result = desc.hasKey(sTID('layerEffects'));
    return result;
}

function getFxDescriptor(layerIndex){
    var ref = new ActionReference();
    var idPrpr = charIDToTypeID( "Prpr" );
    var layerEffects = stringIDToTypeID( "layerEffects" );
    ref.putProperty( idPrpr, layerEffects );
    var lyr = charIDToTypeID( "Lyr " );
    ref.putIndex( lyr, layerIndex );

    // step inside
    var desc = executeActionGet(ref);
    if(desc.hasKey(sTID('layerEffects'))){
        var descTextKey = desc.getObjectValue(stringIDToTypeID('layerEffects'));
        return descTextKey;
    }

    return false;
}

function getBgCounter(){
    // 0 = there is background layer
    // 1 = there is not background layer
    var backGroundCounter = 1;
    try {
        var dummy = app.activeDocument.backgroundLayer;
        backGroundCounter = 0;
    }
    catch(e){;} //do nothing
    return backGroundCounter;
}

function addBackgroundToIndex(){
    
    var backGroundCounter = -1;
    try {
        var dummy = app.activeDocument.backgroundLayer;
        backGroundCounter = 1;
    }
    catch(e){;} //do nothing
    return backGroundCounter;
}

function getLayersCount(){
    var ref = new ActionReference(); 
    ref.putProperty(charIDToTypeID( "Prpr" ), stringIDToTypeID("numberOfLayers"));
    ref.putEnumerated( charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt") );  
    var desc = executeActionGet(ref); 
    var numberOfLayers = desc.getDouble(stringIDToTypeID ("numberOfLayers")) + getBgCounter();
    return numberOfLayers;
}

function isLocked(index){
    var ref = new ActionReference();
    ref.putProperty( charIDToTypeID( "Prpr" ), stringIDToTypeID( "layerLocking" ) );
    ref.putIndex( charIDToTypeID( "Lyr " ), index );
    var desc = executeActionGet(ref);
    var descLocking = desc.getObjectValue(stringIDToTypeID( "layerLocking" ));
    var locked = descLocking.getBoolean(stringIDToTypeID('protectAll'));
    return locked;
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

///////////////////////////////////////////////////////////////////////////////
// Function: addSelectedLayer
// Usage: adds the rest of the layers in the array to the first layer
// Input:  Array selectedLayers or name or single number
// Return: <none>
///////////////////////////////////////////////////////////////////////////////
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
            else if( Object.prototype.toString.call( layerIndexOrName ) === '[object Array]' ){
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