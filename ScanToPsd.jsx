// This script pastes an image (PNG/JPG) to a PSD document, useful to update your documents with new images. I use it to paste physical scans into digital PSDs.
// Script made for Plastic Tears scanlations (https://plastictearsmanga.com/).

//This safe mode is useful when you wanna make sure the thing is pasting the correct images.
var useSecureMode = confirm("Enable Safe Mode (Compares filenames before processing)?");

// Check if the user provided folders
var inputFolder = Folder.selectDialog("Select the folder with your scans");
if (!inputFolder) {
  alert("Select the folder, dummy.");
  throw new Error("No input folder selected.");
}

var outputFolder = Folder.selectDialog("Select the folder with your finished PSDs");
if (!outputFolder) {
  alert("Select a folder, come on, I won't bite ya.");
  throw new Error("No output folder selected.");
}

OpenFolder();

function OpenFolder() {
  var filesOpened = 0;
  var fileListIn = inputFolder.getFiles(/\.(jpg|png|psd|raw)$/i);
  var fileListOut = outputFolder.getFiles(/\.(jpg|png|psd|raw)$/i);

  fileListIn.sort();
  fileListOut.sort();

  // This part opens 2 files, so make sure your folders have the same filenames/file amount.
  for (var i = 0; i < fileListIn.length; i++) {
    open(fileListIn[i]);
    var inputFile = app.activeDocument;
    open(fileListOut[i]);
    var outputFile = app.activeDocument;

    // Check filenames if safe Mode is enabled
    if (useSecureMode && !checkDocumentNamesMatch(inputFile, outputFile)) {
      return filesOpened; // Stops processing if names don't match
    }

    filesOpened++;
    app.activeDocument = inputFile;
    duplicateToAll();
    app.activeDocument = outputFile;
    outputFile.save();
    outputFile.close(SaveOptions.DONOTSAVECHANGES);
    inputFile.close(SaveOptions.DONOTSAVECHANGES);
  }

  return filesOpened;
}

// Checks if document names match, ignoring file extensions
function checkDocumentNamesMatch(doc1, doc2) {
  var name1 = doc1.name.replace(/\.[^.]+$/, "");
  var name2 = doc2.name.replace(/\.[^.]+$/, "");

  if (name1 !== name2) {
    alert("Provided files names don't match, make sure your files have the EXACT SAME FILENAMES, stopping now. Name comparison : " + name1 + " / " + name2);
    return false;
  }

  return true;
}

// This is the part where it duplicates the layers
function duplicateToAll() {
  docs = app.documents;
  curDoc = app.activeDocument;
  for (var i = 0; i < docs.length; i++) {
    if (curDoc != docs[i]) {
      var curLayer;
      try {
        curLayer = docs[i].activeLayer;
      } catch (e) {}
      curDoc.activeLayer.duplicate(docs[i], ElementPlacement.PLACEATBEGINNING);
      app.activeDocument = docs[i];
      app.activeDocument.activeLayer.name = "Scanned Raw"; // rename pasted image, figured that "Processed Scan" is a term no one uses actually.
      if (curLayer) {
        docs[i].activeLayer.move(curLayer, ElementPlacement.PLACEBEFORE);
      }
    }
    app.activeDocument = curDoc;
  }
}
