//------------------------------------------------------------------------------
// File: "[M] Align to baseline v1.1.js"
// Version: 1.1
// Release Date: 29. 4. 2017
// Copyright: © 2016 Jaroslav Bereza <http://bereza.cz>
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
// Version History:
//  1.1: date: 29. 4. 2017
//  - removed JAM "framework" and code clean up
//  - completely rewritten code into pure action manager low level code
//  - performance improvement. Script is 2×-3× faster
//  - added support for CS6
//
//  1.0: date: 15. 5. 2016
//  - Initial release.
//------------------------------------------------------------------------------

/*
<javascriptresource>
<name>[M] Align to baseline 1.1</name>
<enableinfo>true</enableinfo>
<category>Magic</category>
</javascriptresource>
*/

//#target Photoshop
app.bringToFront();

cTID = function(s) { return cTID[s] || (cTID[s] = app.charIDToTypeID(s)); };
sTID = function(s) { return app.stringIDToTypeID(s); }; 
idTS = function(id) { return app.typeIDToStringID (id);};


const psVersion=app.version.split('.')[0];
var startDisplayDialogs = app.displayDialogs;
app.displayDialogs = DialogModes.NO;


initialize();
function initialize(){
    
    if(app.documents.length==0){
        alert("Please open some document and select text layers");
        return;
    }
    
    var selected = getSelectedLayers ();
    selected = filterEditableTextLayers (selected);
    
    if(selected.length<=1){
        alert("Please select two or more visible unlocked text layers");
        return; // not enough layers for alignment
    }
    
    app.activeDocument.suspendHistory("Align text to baseline","main(selected);");
    app.displayDialogs = startDisplayDialogs;
}


function main(selected){
    var initalPosition;
    
    for(var i=0, len = selected.length; i < len;  i++){
        var textDescriptor = getTextKey (selected[i]);
        var boxTypeDifference = 0;
        
        if(!isTextPointType(textDescriptor)){
            // distance from clickPoint to top rectangle edge of text layer
            var boxPosition;
            if(psVersion <= 13){
                boxPosition = getBoundsTopLegacy(selected[i]);  
            }
            else{
                boxPosition = getBoundsTop(textDescriptor);    
            }
            
            // new temporary copy - we need use get because cloning is not so simply
            var tempTextDescriptor = getTextKey (selected[i]);      
            
            // preparing descriptor for conversion to point text
            tempTextDescriptor = setPointTextToDescriptor(tempTextDescriptor);
            
            // apply modified descriptor
            applyTextKey (tempTextDescriptor, selected[i]);        
            
            // load new data into descriptor
            tempTextDescriptor = getTextKey (selected[i]);
            
            // distance from clickPoint to top rectangle edge of text layer
            var pointPosition;
            if(psVersion <= 13){
                pointPosition = getBoundsTopLegacy(selected[i]);  
            }
            else{
                pointPosition = getBoundsTop(tempTextDescriptor);    
            }
            
            
            // compare old and new distance and convert pixels to percentage
            boxTypeDifference = ((pointPosition - boxPosition) / getDocumentHeight()) * 100;
            
            // restore text layer
            applyTextKey (textDescriptor, selected[i]);
        }
        
        if(!initalPosition){
            initalPosition = getBaseline(textDescriptor) - boxTypeDifference;
        }
        else{
            textDescriptor = setTextPositionToDescriptor (textDescriptor, initalPosition + boxTypeDifference);
            applyTextKey (textDescriptor, selected[i]);
        }
    }
}

///////////////////
// Helpers
///////////////////

function setTextPositionToDescriptor(textKey, position){
    var textClickPoint = textKey.getObjectValue(sTID ('textClickPoint'));
    textClickPoint.putDouble(sTID ('vertical'), position); //percent
    textKey.putObject(sTID ('textClickPoint'), sTID ('textKey'), textClickPoint);
    //var adescObject = descriptorInfo.getProperties( textKey, descFlags);
    return  textKey;
}

function setPointTextToDescriptor(textKey){
    var textShapeList = textKey.getList(sTID ('textShape'));
    var textShapeItem = textShapeList.getObjectValue(0);
    textShapeItem.putEnumerated(sTID ('textType'),sTID ('textType'), sTID('point'));
    textShapeList.clear();
    textShapeList.putObject(sTID ('textShape'),textShapeItem)
    textKey.putList(sTID ('textShape'),textShapeList)
    
    return textKey;
}

function applyTextKey(textKey, index){
    var layerRef = new ActionReference();
    layerRef.putIndex( cTID('Lyr '), index );
    var idsetd = charIDToTypeID( "setd" );
    var desc151 = new ActionDescriptor();
        desc151.putReference( charIDToTypeID( "null" ), layerRef );
        var idT = charIDToTypeID( "T   " );
        var idTxLr = charIDToTypeID( "TxLr" );
        desc151.putObject( idT, idTxLr, textKey );
        
    executeAction( idsetd, desc151, DialogModes.NO ); 
}

// check if it is box text or point text
function isTextPointType(textKey){
    var textShapeList = textKey.getList(sTID ('textShape'));
    var textShapeItem = textShapeList.getObjectValue(0);
    
    var textType = textShapeItem.getEnumerationValue(sTID ('textType'));
    var textType = idTS (textType);
    
    if(textType == "box"){
        return false;
    }
    else{
        return true;
    }
}

// decimal pixel values
function getBoundsTop(textKey){
    var textClickPoint = textKey.getObjectValue(sTID ('bounds'));
    var top = textClickPoint.getDouble(sTID ('top')); //percent
    return  top;
}

// rounded pixel values. CS6 support
function getBoundsTopLegacy(index){
    
    var ref = new ActionReference();
    var idPrpr = charIDToTypeID( "Prpr" );
    var idTxtS = stringIDToTypeID( "bounds" );
    ref.putProperty( idPrpr, idTxtS );
    var lyr = charIDToTypeID( "Lyr " );
    ref.putIndex( lyr, index );
    var desc = executeActionGet(ref);
    var bounds = desc.getObjectValue(sTID ('bounds'));
    var top = bounds.getDouble(stringIDToTypeID('top'));

    return top;
}

//
// get baseline of layer
function getBaseline(textKey){
    var textClickPoint = textKey.getObjectValue(sTID ('textClickPoint'));
    var vertical = textClickPoint.getDouble(sTID ('vertical')); //percent
    return  vertical;
}

function getBgCounter(){
    var backGroundCounter = 1;
    try {
        var dummy = app.activeDocument.backgroundLayer;
        backGroundCounter = 0;
    }
    catch(e){;} //do nothing
    return backGroundCounter;
}


function getSelectedLayers() {
    var selectedLayers = [];
        var backGroundCounter = getBgCounter();
        var ref = new ActionReference();
        var keyTargetLayers = app.stringIDToTypeID( 'targetLayers' );
        ref.putProperty( app.charIDToTypeID( 'Prpr' ), keyTargetLayers );
        ref.putEnumerated( app.charIDToTypeID( 'Dcmn' ), app.charIDToTypeID( 'Ordn' ), app.charIDToTypeID( 'Trgt' ) );
        var desc = executeActionGet( ref );
        if ( desc.hasKey( keyTargetLayers ) ) {
            var layersList = desc.getList( keyTargetLayers );
            for ( var j = 0; j < layersList.count; j++) {
                var listRef = layersList.getReference( j );
                selectedLayers.push( listRef.getIndex() + backGroundCounter );
            }
        }
    return selectedLayers;
}

function getTextKey(layerIndex){
    var ref = new ActionReference();
    var idPrpr = charIDToTypeID( "Prpr" );
    var idTxtS = stringIDToTypeID( "textKey" );
    ref.putProperty( idPrpr, idTxtS );
    var lyr = charIDToTypeID( "Lyr " );
    ref.putIndex( lyr, layerIndex );

    // step inside
    var desc = executeActionGet(ref);
    var descTextKey = desc.getObjectValue(stringIDToTypeID('textKey'));

    return descTextKey;
}

function getDocumentHeight(){
    var ref = new ActionReference(); 
    ref.putProperty(charIDToTypeID( "Prpr" ), sTID("height"));
    ref.putEnumerated( charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt") );  
    var desc = executeActionGet(ref); 
    var height = desc.getDouble(sTID ("height"))    
    return height;
}

function filterEditableTextLayers(list){
    for (var i = 0, len = list.length; i < len; i++){
        var ref166 = new ActionReference();
        var idLyr = charIDToTypeID( "Lyr " );
        ref166.putIndex( idLyr, list[i] );
        var desc = executeActionGet(ref166);
        
        var isNotTextLayer = !desc.hasKey(stringIDToTypeID('textKey'));
        var descLocking = desc.getObjectValue(stringIDToTypeID('layerLocking'));
        var locked = descLocking.getBoolean(stringIDToTypeID('protectAll'));
        var isNotVisible = !desc.getBoolean(sTID ('visible'));
        
        if(isNotTextLayer || locked || isNotVisible){
            list.splice(i,1);
            i--;
            len--;
            continue;
        }
    
        var textKey = desc.getObjectValue(stringIDToTypeID('textKey'));
        var contentString = textKey.getString(stringIDToTypeID('textKey'));
        if(contentString == ""){
            list.splice(i,1);
            i--;
            len--;
            continue;
        }
    }
    return list;
}