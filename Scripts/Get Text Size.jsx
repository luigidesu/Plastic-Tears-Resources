#target photoshop
if (app.documents.length > 0) {
    var doc = app.activeDocument;
    if (doc.activeLayer.kind == LayerKind.TEXT) {
        var textSize = doc.activeLayer.textItem.size;
        alert("The current text layer size is " + textSize + " points.");
    } else {
        alert("Please select a text layer.");
    }
} else {
    alert("No document open.");
}
