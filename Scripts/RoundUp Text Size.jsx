/*
Simple RoundUp Text Size (Fixed)
- Supports Nested Folders
- Rounds to nearest integer (Math.round)
- No weird list of numbers
*/

#target photoshop

app.bringToFront();

if (app.documents.length > 0) {
    main();
}

function main() {
    try {
        var doc = app.activeDocument;
        var originalRulerUnits = app.preferences.rulerUnits;
        
        // CHANGE THIS TO Units.POINTS IF YOU WANT TO ROUND PT SIZE
        app.preferences.rulerUnits = Units.PIXELS; 

        // Start recursive loop
        processLayers(doc.layers);

        // Restore user units
        app.preferences.rulerUnits = originalRulerUnits;
        
    } catch (e) {
        alert("Error: " + e + " line " + e.line);
    }
}

function processLayers(layersCollection) {
    for (var i = 0; i < layersCollection.length; i++) {
        var layer = layersCollection[i];

        // 1. If Folder, dig deeper
        if (layer.typename == "LayerSet") {
            processLayers(layer.layers);
        }
        // 2. If Text, round the size
        else if (layer.kind == LayerKind.TEXT) {
            // Note: Remove this check if you want to edit hidden layers too
            if(layer.visible){
                 layer.textItem.size = Math.round(layer.textItem.size);
            }
        }
    }
}