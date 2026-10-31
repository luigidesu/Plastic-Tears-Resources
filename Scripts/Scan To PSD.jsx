/* 
Scan To PSD.jsx 
v1.3, 19th August, 2025 by Luigi (https://plastictearsmanga.com/)

Description:
    This script automates the process of pasting images into PSD documents. 
    - Input folder: contains image files (JPG/PNG/PSD/etc.)
    - Output folder: contains target PSD files.
    - Optionally supports "double spread" logic for double spreads.
	
Installation:
1. Place script in:
   PC:  C:\<Program Files>\Adobe\Adobe Photoshop <version>\Presets\Scripts\
   Mac: <hard drive>/Applications/Adobe Photoshop <version>/Presets/Scripts/
2. Restart Photoshop.
3. Choose File > Scripts > Scan To PSD

*/


// ====== USER SETTINGS ======
var baseLayerName        = "Scanned Version"; // Base name for pasted layers
var useDoubleSpreadLogic = true; // true = paste two scans on wide PSDs, false = always one per PSD
var pasteAsSmartObject   = true; // true = wrap pasted layer into a Smart Object, false = leave raster
// ===========================

/*
<javascriptresource>
<name>Scan To PSD v1.3 [Plastic Tears]</name>
<enableinfo>true</enableinfo>
<category>Plastic Tears</category>
</javascriptresource>
*/

#target photoshop
app.displayDialogs = DialogModes.NO;

var inputFolder = Folder.selectDialog("Select the folder with your scans");
if (!inputFolder) {
    throw new Error("No input folder selected. Select the folder, dummy.");
}

var outputFolder = Folder.selectDialog("Select the folder with your PSD files");
if (!outputFolder) {
    throw new Error("No output folder selected. Select a folder, come on, I won't bite ya.");
}

// Allow common image/psd sources for copying
var inputFiles  = inputFolder.getFiles(/\.(jpg|jpeg|png|tif|tiff|psd|raw|gif)$/i);
// Targets should be PSDs
var outputFiles = outputFolder.getFiles(/\.(psd)$/i);

if (inputFiles.length === 0 || outputFiles.length === 0) {
    alert("Make sure there are files in both folders.");
    throw new Error("Empty folder.");
}

// Basic sanity check (note: double-spread pages may need 2 images each)
if (inputFiles.length < outputFiles.length) {
    alert("Not enough images to cover each PSD. Check your input folder.");
    throw new Error("Insufficient images.");
}

OpenFolder();

function OpenFolder() {
    var filesOpened = 0;
    var imageIndex = 0;

    for (var i = 0; i < outputFiles.length; i++) {
        open(outputFiles[i]);
        var outputFile = app.activeDocument;

        var isDoubleSpread = outputFile.width > outputFile.height;

        if (useDoubleSpreadLogic && isDoubleSpread) {
            // Double-spread: paste two images (Right then Left for manga)
            if (imageIndex < inputFiles.length - 1) {
                pasteImage(inputFiles[imageIndex],     baseLayerName + " (Right)");
                pasteImage(inputFiles[imageIndex + 1], baseLayerName + " (Left)");
                imageIndex += 2;
            } else {
                alert("Not enough images for a double page spread PSD. Stopping.");
                break;
            }
        } else {
            // Single-page: paste one image
            if (imageIndex < inputFiles.length) {
                pasteImage(inputFiles[imageIndex], baseLayerName);
                imageIndex++;
            } else {
                alert("No more images to paste. Stopping.");
                break;
            }
        }

        outputFile.save();
        outputFile.close(SaveOptions.DONOTSAVECHANGES);
        filesOpened++;
    }

    return filesOpened;
}

function pasteImage(imageFile, layerName) {
    var doc = app.activeDocument;

    // Open source image, copy pixels, close without saving
    var image = open(imageFile);
    image.selection.selectAll();
    image.selection.copy();
    image.close(SaveOptions.DONOTSAVECHANGES);

    // Paste into target document (this creates a raster layer by default)
    doc.paste();

    // Optionally convert the freshly pasted layer into a Smart Object
    if (pasteAsSmartObject) {
        convertActiveLayerToSmartObject();
    }

    // Name the (possibly converted) layer uniquely
    var pastedLayer = doc.activeLayer;
    pastedLayer.name = getUniqueLayerName(layerName);
}

// Wrap the active layer into a Smart Object (works across PS versions)
function convertActiveLayerToSmartObject() {
    try {
        // Most versions
        executeAction(stringIDToTypeID("newPlacedLayer"), new ActionDescriptor(), DialogModes.NO);
    } catch (e) {
        try {
            // Fallback on some builds
            executeAction(stringIDToTypeID("placedLayerMake"), new ActionDescriptor(), DialogModes.NO);
        } catch (e2) {
            // If both fail, leave as raster silently
        }
    }
}

function getUniqueLayerName(baseName) {
    var layerCount = 1;
    var uniqueName = baseName;
    var exists = true;

    while (exists) {
        exists = false;
        var layers = app.activeDocument.layers;
        for (var i = 0; i < layers.length; i++) {
            if (layers[i].name === uniqueName) {
                exists = true;
                layerCount++;
                uniqueName = baseName + " " + layerCount;
                break;
            }
        }
    }
    return uniqueName;
}
