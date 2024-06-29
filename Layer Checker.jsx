//This script checks for layers, to log the files that dont meet the structure.
//It currently checks for a "Español" folder, an "Enlgish" folder, a "cleaning" layer and a "Background" layer. 

var spanishTextFolderName = "Text";
var englishTextFolderName = "Text";
var cleaningLayerName = "Cleaning";
var backgroundLayerName = "Background";
var logFileName = "Log.txt";

var checkedFiles = 0;
var filesWithErrors = 0;

var psdFiles = File.openDialog("Select PSD files", "*.psd", true);

if (psdFiles && psdFiles.length > 0) {
    var logFilePath = new File(psdFiles[0].path + "/" + logFileName);
    var logFile = new File(logFilePath);
    logFile.open("w");

    for (var i = 0; i < psdFiles.length; i++) {
        var doc = open(psdFiles[i]);
        checkedFiles++;

        var textFolder;
        try {
            textFolder = doc.layers.getByName(spanishTextFolderName);
        } catch (e) {
            textFolder = null;
        }
        if (!textFolder) {
            logFile.writeln("Document: " + doc.name + " - Missing '" + spanishTextFolderName + "' Text folder");
            filesWithErrors++;
        }

        try {
            textFolder = doc.layers.getByName(englishTextFolderName);
        } catch (e) {
            textFolder = null;
        }
        if (!textFolder) {
            logFile.writeln("Document: " + doc.name + " - Missing '" + englishTextFolderName + "' Text folder");
            filesWithErrors++;
        }

        var cleaningLayer, backgroundLayer;
        try {
            cleaningLayer = doc.layers.getByName(cleaningLayerName);
            backgroundLayer = doc.layers.getByName(backgroundLayerName);
        } catch (e) {
            cleaningLayer = backgroundLayer = null;
        }

        if (!cleaningLayer || !backgroundLayer) {
            logFile.writeln("Document: " + doc.name + " - Missing '" + cleaningLayerName + "' or '" + backgroundLayerName + "' layer");
            filesWithErrors++;
        }

        if (doc.layers.length > 3) {
            logFile.writeln("Document: " + doc.name + " - Extra layers found");
            filesWithErrors++;
        }

        doc.close(SaveOptions.DONOTSAVECHANGES);
    }

    logFile.close();

    alert("Checked " + checkedFiles + " files. Found errors in " + filesWithErrors + " files. Log file created in the original file location.");
} else {
    alert("No PSD files selected. The script will not run.");
}
