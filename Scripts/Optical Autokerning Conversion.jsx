//This script edits all the current document text layers properties.
//You can add more features from the textitem documentation (https://documentation.help/Photoshop-CS5/pc_TextItem.html)

var doc = app.activeDocument;

function replaceFont(target)
{
    var layers = target.layers;
    for (var i = 0; i < layers.length; i++) {

        if (layers[i].typename == "LayerSet") {

            replaceFont(layers[i]);

        } else if (layers[i].kind == LayerKind.TEXT) {

            var currentText = layers[i].textItem;

            currentText.autoKerning = AutoKernType.OPTICAL;
			currentText.antiAliasMethod = AntiAlias.SMOOTH;
			currentText.language = Language.SPANISH;
			currentText.hyphenation = false;
			currentText.alternateLigatures = true;
			currentText.kind = TextType.PARAGRAPHTEXT;
			currentText.ligatures = true;
			currentText.tracking = 0;
        };
    };
};
replaceFont(doc);