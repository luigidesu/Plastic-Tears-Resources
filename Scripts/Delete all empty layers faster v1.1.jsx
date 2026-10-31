//------------------------------------------------------------------------------
// File: "[M] Delete all empty layers faster v1.1.js"
// Version: 1.1
// Release Date: 30. 4. 2017
// Copyright: © 2017 Jaroslav Bereza <http://bereza.cz>
// Thx to Naoki Hada from Adobe for original script and Javier Aroche for debugging tool: https://github.com/JavierAroche/descriptor-info
// Licence: GPL <http://www.gnu.org/licenses/gpl.html>
//------------------------------------------------------------------------------
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
//------------------------------------------------------------------------------

/*
<javascriptresource>
<name>[M] Delete all empty layers faster v1.1</name>
<enableinfo>true</enableinfo>
<category>Magic</category>
</javascriptresource>
*/

/* 
    Version History:
    1.1: (30. 4. 2017)
    - removed JAM "framework"
    - big code cleaning
    - better performance. Up to 9× faster than version 1.0
    - keeps selected layers
    - improved compatibility - works with CS6 and higher
    - fixed layers and groups counter
    - progressbar can now show deleting progress
    - fixed - if clipped layers was attached to empty locked layer then visibility was turned off. (script shouldn't remove locked layers)

    1.0: (19. 5. 2016)
    - Initial release.
    
*/


////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Do not look down here. If you try to understand my code, you will waste a lot of time. 
// This code is optimized for performance with low level AM code and no recursion.
////////////////////////////////////////////////////////////////////////////////////////////////////////////

/*
TROUBLE SHOOTING:
    - deleting layers according layerID may not work properly if they are not sorted by layerIndex
    
TODO:
    -
*/

#target Photoshop
app.bringToFront();

//$.level = 1;

var psVersion=app.version.split('.')[0];
cTID = function(s) { return cTID[s] || (cTID[s] = charIDToTypeID(s)); };
sTID = function(s) { return stringIDToTypeID(s); }; 

// caching precalculated typeID numbers for saving a bit miliseconds
var TID = {
    idPrpr: charIDToTypeID( "Prpr" ),
    idBounds: stringIDToTypeID( "bounds" ),
    idLyr: charIDToTypeID( "Lyr " ),
    top: stringIDToTypeID('top'),
    bottom: stringIDToTypeID('bottom'),
    layerLocking: stringIDToTypeID( "layerLocking" ),
    protectAll: stringIDToTypeID('protectAll'),
    layerID: stringIDToTypeID( "layerID" ),
    group: stringIDToTypeID( "group" ),
    layerSection: stringIDToTypeID( "layerSection" ),
    textKey: stringIDToTypeID( "textKey" ),
    idNull: charIDToTypeID( "null" ),
    idDlt: charIDToTypeID( "Dlt " )
    
    
}

app.activeDocument.suspendHistory("Delete all empty layers faster", "initialize()");

function initialize(){
    try {
        if(app.documents.length < 1){
            alert("You must have a document open.");
            return;
        }
        main();
        
    } catch(e) {
        alert("Deleting layers failed. "+e);
    	return 'cancel';
    }
}

function main() {
    
    var layerCount = getLayersCount();
    
    function getLayersCount(){
        var ref = new ActionReference(); 
        ref.putProperty(charIDToTypeID( "Prpr" ), stringIDToTypeID("numberOfLayers"));
        ref.putEnumerated( charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt") );  
        var desc = executeActionGet(ref); 
        var numberOfLayers = desc.getDouble(stringIDToTypeID ("numberOfLayers"));
        return numberOfLayers;
    }
    if(layerCount <= 1){
        alert("The document must have more layers.");
        return;
    }
    var deleteList = [];
    var hideList = [];
    var tr = [];
    var maximalDepth=0;
    var regularLayersCount=0;
    var groupLayersCount=0; 
    var removeRegularLayersCount=0;
    var removeGroupLayersCount=0;
    
    if(psVersion < 16){
        analyze();
    }else{
        app.doProgress("Layers scanning...","analyze()");
    }
    
    function analyze(){
        for (var layerIndex = layerCount, stepsInside=0; layerIndex > 0; layerIndex--){ // stepsInside = how deep I am in folder structure
            if(psVersion > 16){
                var canContinue = app.doProgressSegmentTask(1,layerCount-layerIndex,layerCount,"segmentTask()");
                if(!canContinue) return;
            }else{
                segmentTask();
            }
        
            function segmentTask(){
                var nullHeight = hasNullHeight(layerIndex);
                var locked = isLocked (layerIndex);
                var id = getLayerId(layerIndex);
                var layerType = getLayerType(layerIndex);
                var isClipped = getIsClipped(layerIndex); // isClipped = cliped layer
                var isTextLayerEmpty = hasEmptyTextContent(layerIndex);
                var shouldRemove;
                var depth;
                
                //regular layer
                if(layerType=='item'){
                    regularLayersCount++;
                    depth = stepsInside+1;
                    
                    if((nullHeight || isTextLayerEmpty) && !locked){
                        shouldRemove = true;
                    }else{
                        shouldRemove = false;
                    }
                }
                //group end - closing (invisible) layer
                else if(layerType=='end'){
                    depth = stepsInside;
                    shouldRemove = false;
                    stepsInside--;
                }
                //group start - opening layer
                else if(layerType=='start'){
                   stepsInside++;
                   groupLayersCount++;
                   depth = stepsInside;
                   shouldRemove = true;
                }
            
                if(depth>maximalDepth){
                    maximalDepth = depth;
                }
            
                var layerInfo = {
                    depth: depth,
                    layerType: layerType,
                    itemIndex: layerIndex,
                    itemID: id,
                    remove: shouldRemove,
                    locked: locked,
                    isClipped: isClipped
                }
            
                tr.push (layerInfo);
            }
        }
    }
    
    treatLockedLayers();
    addItemsToDeleteList();
    
    if (deleteList && deleteList.length) { // if there is something to delete
        
        // if layer which we want delete has cliping mask, then we hide clipping mask layers
        if (hideList && hideList.length) {
            hideMulti(hideList);
        }
        
        deleteMulti(deleteList);
        var bgCount = hasBackground ();
        alert(
            removeRegularLayersCount+" layers and "+removeGroupLayersCount+" groups were removed.\n"+
            "Your document now contains "+(regularLayersCount-removeRegularLayersCount+bgCount)+" layers and "+(groupLayersCount-removeGroupLayersCount)+" groups.\n"+
            "(artboards are counted as groups)"
        );
    }
    else{
        alert("There is nothing to delete.");
    }
    
    
    function treatLockedLayers(){
        var max = maximalDepth;
        var len = tr.length;
        
        for(var j = 1; j < max;max--){ // j = 1 protože úroven nula bude mít nastavené mazání z podmínek uvnitř cyklu a itemy mě nezajímají
            for(var i = 0; i < len;i++){
                var lyr = tr[i];
                
                if(lyr.depth === max){
                    var parent = getParent(i);
                    
                    if (lyr.layerType=="item" && !lyr.remove){ // don't remove classic layer
                        tr[parent].remove = false;
                    }
                    if(lyr.locked && lyr.layerType == "start"){ // locked parent group
                        tr[parent].remove = false;
                    }
                    if(!lyr.remove && lyr.layerType == "start"){ // don't remove parent folder if children folder shouldn't be deleted
                        tr[parent].remove = false;
                    }
                }
            }  
        }
    
        for(var j = 0; j < len; j++){ // browse once all layers and if parrent group is locked then it excludes all child from delete list
            if (tr[j].locked && tr[j].layerType=="start"){
                var initialDepthLevel = tr[j].depth;
                j++;
                while(initialDepthLevel < tr[j].depth){
                    tr[j].remove = false;
                    j++;
                }
            }
        }
    
        for(var j = 0; j < len; j++){ // don't mess up cliping mask layers
            var lyr = tr[j];
            if (lyr.isClipped){
                var tempList=[];
                while(tr[j].isClipped){
                    tempList.push(tr[j].itemIndex);           
                    j++;
                }
                if(tr[j].remove && !tr[j].locked){
                    hideList = hideList.concat(tempList);
                }
            }
        }
    }

    function addItemsToDeleteList(){
        for (var j = 0, len = tr.length;j<len;j++){
            var lyr = tr[j];
            if(lyr.remove && !lyr.locked){
                deleteList.push(lyr.itemID);
                
                if(lyr.layerType=="start"){
                    removeGroupLayersCount++;
                }else{
                    removeRegularLayersCount++;
                }
            }
        }
    }

    function getParent(p){ //pomocná funkce, která najde děcku rodiče
        for (var i = p-1; i > 0; i--){
            if(tr[i].depth==tr[p].depth-1){
                return i;
            }
        }
        return 0;
    }
}



function hasNullHeight(index){
    var ref = new ActionReference();
    ref.putProperty( TID.idPrpr, TID.idBounds );
    ref.putIndex( TID.idLyr, index );
    var desc = executeActionGet(ref);
    var bounds = desc.getObjectValue(TID.idBounds);
    var top = bounds.getDouble(TID.top);
    var bottom = bounds.getDouble(TID.bottom);
    
    var nullHeight = top===bottom;
    return nullHeight;
}

function isLocked(index){
    var ref = new ActionReference();
    ref.putProperty( TID.idPrpr, TID.layerLocking );
    ref.putIndex( TID.idLyr, index );
    var desc = executeActionGet(ref);
    var descLocking = desc.getObjectValue(TID.layerLocking);
    var locked = descLocking.getBoolean(TID.protectAll);
    
    return locked;
}

function getLayerId(index){
    var ref = new ActionReference();
    ref.putProperty( TID.idPrpr, TID.layerID );
    ref.putIndex( TID.idLyr, index );
    var desc = executeActionGet(ref);
    var id = desc.getInteger(TID.layerID);
    
    return id;
}

function getIsClipped(index){
    var ref = new ActionReference();
    ref.putProperty( TID.idPrpr, TID.group );
    ref.putIndex( TID.idLyr, index );
    var desc = executeActionGet(ref);
    var group = desc.getBoolean(TID.group);
    
    return group;
}

function getLayerType(index){
    var ref = new ActionReference();
    ref.putProperty( TID.idPrpr, TID.layerSection );
    ref.putIndex( TID.idLyr, index );
    var desc = executeActionGet(ref);
    var type = desc.getEnumerationValue(TID.layerSection);
    type = typeIDToStringID(type);
    
    switch(type){
        case 'layerSectionEnd':
            return 'end';
        case 'layerSectionStart':
            return 'start';
        case 'layerSectionContent':
            return 'item';
        default:
            return undefined;
    }
}

function hasEmptyTextContent(index){
 var ref = new ActionReference();
    ref.putProperty( TID.idPrpr, TID.textKey );
    ref.putIndex( TID.idLyr, index );
    var textKey = executeActionGet(ref);
    
    var isTextLayer = textKey.hasKey(TID.textKey);
    if(!isTextLayer){
        return false;
    }
    var textKey = textKey.getObjectValue(TID.textKey);
    var contentString = textKey.getString(TID.textKey);
    var result = contentString === "";
    return result;   
}


function hideMulti(list){ 
    var idHd = charIDToTypeID( "Hd  " );
        var desc19 = new ActionDescriptor();
            var list9 = new ActionList();
            for(var i = 0, len = list.length; i < len; i++){
                var ref = new ActionReference();
                ref.putIndex( TID.idLyr, list[i] );
                list9.putReference( ref );
            }
        desc19.putList( TID.idNull, list9 );
    executeAction( idHd, desc19, DialogModes.NO );
}


function deleteMulti (list){
    function progressTask(){
        for(var i = list.length-1, len = i; i >= 0; i--){
            if(psVersion > 16){
                if(i%5===0){ // fast updating takes time. Update text for every five layer
                    app.changeProgressText("I am removing layers. Removed: "+(len-i)+" layers from "+len+"");
                }
                var canContinue = app.doProgressSubTask(len-i,len,"segmentTask("+list[i]+")");
                if(!canContinue) return;
            }else{
                segmentTask(list[i]);
            }
        }
    }

    function segmentTask(id){
        var desc13 = new ActionDescriptor();
        var layerRef = new ActionReference();
        layerRef.putIdentifier( TID.idLyr, id );
        desc13.putReference( TID.idNull, layerRef );
        executeAction( TID.idDlt, desc13, DialogModes.NO );
    }

    if(psVersion > 16){
        app.doProgress("I am removing layers, give me a moment please.","progressTask()");
    }else{
        progressTask();
    }
}

function hasBackground(){
    try {
        var dummy = app.activeDocument.backgroundLayer;
        return 1;
    }
    catch(e){
        return 0;
    } 
}