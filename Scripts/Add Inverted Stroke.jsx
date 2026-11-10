/*
<javascriptresource>
<name>Add Inverted Stroke [Plastic Tears]</name>
<category>Plastic Tears</category>
<menu>automate</menu>
<eventid>6031dfdd-0ec8-4039-b0e5-d14a560385d6</eventid>
<about>
Add Inverted Stroke v1.9 by Plastic Tears

https://plastictearsmanga.com/
</about>
</javascriptresource>
*/


/*
Add Inverted Stroke v1.9

Gives text layers an stroke so you don't have to do it manually every time.
It uses the inverted text color to create the stroke, 
but you can set it to only generate black/white strokes; toggle ColoredMangaMode for it.

Run it with one or more layers selected. Non-text layers are ignored, and
existing layer styles (shadows, gradients, glows...) are left untouched.

The outline scales with the page size by default; set FixedStrokeSize
below if you want an exact pixel size every time instead.

INSTALL:
1. Place the script in:
   PC:  C:\<Program Files>\Adobe\Adobe Photoshop <version>\Presets\Scripts\
   Mac: <hard drive>/Applications/Adobe Photoshop <version>/Presets/Scripts/
2. Restart Photoshop.
3. Find it in File > Automate > Add Inverted Stroke.

CREDITS & THANKS:
  - cicerociceronis - original code (2023).
  - m3mber - Multi-layer support.
  - Luigi - Everything else.
  
https://plastictearsmanga.com/

*/

// ================= USER SETTINGS =================
var StrokePercentage = 0.25;  // Stroke size as a percentage of canvas height. Used when FixedStrokeSize is 0.
var FixedStrokeSize  = 0;    // Stroke size in exact pixels. Set above 0 to IGNORE the percentage and always use this value.
var OverwriteStroke  = true; // true = overwrite stroke size, false = increment existing stroke by +1px.
var ColoredMangaMode = true; // true = anything not Pure White gets a White stroke. false = exact inverse color.
var ShowSkipSummary  = true; // true = ONE alert at the very end listing skipped layers (never interrupts mid-batch). false = fully silent.
// =================================================

#target photoshop
app.displayDialogs = DialogModes.NO;

(function () {

    // Nothing open? Bail quietly instead of letting suspendHistory throw an ugly error.
    if (!app.documents.length) return;

    // -------------------------------------------------------------------
    // Cached type IDs
    // Computed once here instead of on every layer, which keeps the
    // per-layer loop lean. (These lookups are cheap, but there's no
    // reason to repeat them dozens of times in a big batch.)
    // -------------------------------------------------------------------
    var kLayer        = charIDToTypeID("Lyr ");
    var kOrdinal      = charIDToTypeID("Ordn");
    var kTarget       = charIDToTypeID("Trgt");
    var kPercentUnit  = charIDToTypeID("#Prc");
    var kPixelUnit    = charIDToTypeID("#Pxl");
    var kLayerEffects = stringIDToTypeID("layerEffects");
    var kFrameFX      = stringIDToTypeID("frameFX");
    var kFrameFXMulti = stringIDToTypeID("frameFXMulti");
    var kScale        = stringIDToTypeID("scale");
    var kSize         = stringIDToTypeID("size");
    var kMasterSwitch = stringIDToTypeID("masterFXSwitch");

    // Layers that couldn't be processed, reported ONCE at the end (batch friendly).
    var skipped = [];

    // Save and force pixel units so canvas math is predictable, then ALWAYS restore.
    // (doc.height.as('px') is not safe here: UnitValue assumes 72 dpi, so it lies
    // on 300+ dpi scans. Save / set / restore is the reliable pattern.)
    var originalRulerUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    try {
        app.activeDocument.suspendHistory("Add Inverse Stroke", "main()");
    } finally {
        app.preferences.rulerUnits = originalRulerUnits;
    }

    if (ShowSkipSummary && skipped.length > 0) {
        alert("Add Inverted Stroke finished.\n\nSkipped " + skipped.length + " layer(s):\n- " + skipped.join("\n- "));
    }

    // -------------------------------------------------------------------
    // Main flow
    // -------------------------------------------------------------------
    function main() {
        // Pick the sizing mode. FixedStrokeSize above 0 wins over the percentage;
        // both settings live in the file, but only one is ever active.
        var strokeSize;
        if (FixedStrokeSize > 0) {
            strokeSize = FixedStrokeSize;
        } else {
            strokeSize = Number(app.activeDocument.height) * (StrokePercentage * 0.01);
        }

        var layers = getSelectedLayersInfo();

        for (var i = 0; i < layers.length; i++) {
            selectByID(layers[i].id);
            stroke_adding(strokeSize, layers[i].name);
        }

        // Reselect everything the user originally had selected.
        for (var i = 0; i < layers.length; i++) {
            selectByID(layers[i].id, true);
        }
    }

    // -------------------------------------------------------------------
    // Layer selection helpers
    // -------------------------------------------------------------------
    function getSelectedLayersInfo() {
        var lyrs = [];
        var ref = new ActionReference();
        ref.putProperty(stringIDToTypeID("property"), stringIDToTypeID("targetLayers"));
        ref.putEnumerated(charIDToTypeID("Dcmn"), kOrdinal, kTarget);
        var targetLayers = executeActionGet(ref).getList(stringIDToTypeID("targetLayers"));

        // targetLayers indices are 0-based when a Background layer exists and
        // 1-based when it doesn't. Check which case we're in ONCE, outside the
        // loop, instead of throwing and catching per layer like older versions did.
        var hasBackground;
        try {
            activeDocument.backgroundLayer;
            hasBackground = true;
        } catch (e) {
            hasBackground = false;
        }

        for (var i = 0; i < targetLayers.count; i++) {
            var ref2 = new ActionReference();
            var desc, tempIndex;

            if (hasBackground) {
                ref2.putIndex(kLayer, targetLayers.getReference(i).getIndex());
                desc = executeActionGet(ref2);
                tempIndex = desc.getInteger(stringIDToTypeID("itemIndex")) - 1;
            } else {
                ref2.putIndex(kLayer, targetLayers.getReference(i).getIndex() + 1);
                desc = executeActionGet(ref2);
                tempIndex = desc.getInteger(stringIDToTypeID("itemIndex"));
            }

            lyrs.push({
                index: tempIndex,
                id: desc.getInteger(stringIDToTypeID("layerID")),
                name: desc.getString(charIDToTypeID("Nm  "))
            });
        }
        return lyrs;
    }

    function selectByID(id, add) {
        if (add == undefined) add = false;
        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putIdentifier(kLayer, id);
        desc1.putReference(charIDToTypeID("null"), ref1);
        if (add) desc1.putEnumerated(stringIDToTypeID("selectionModifier"), stringIDToTypeID("selectionModifierType"), stringIDToTypeID("addToSelection"));
        executeAction(charIDToTypeID("slct"), desc1, DialogModes.NO);
    }

    // -------------------------------------------------------------------
    // Per-layer work
    // -------------------------------------------------------------------
    function stroke_adding(strokeSize, layerName) {
        try {
            var activeLayer = app.activeDocument.activeLayer;

            // Non-text and empty layers are skipped silently ON PURPOSE:
            // selecting a whole group with dividers or SFX layers in it is normal batch use.
            if (activeLayer.kind != LayerKind.TEXT) return;
            if (activeLayer.textItem.contents.replace(/\s/g, "").length == 0) return;

            // A text layer with MIXED colors (two or more colors in one layer) throws
            // when reading .color, so catch that case and report it instead of failing silently.
            var textColor;
            try {
                textColor = activeLayer.textItem.color.rgb;
            } catch (colorErr) {
                skipped.push(layerName + " (mixed text colors - can't read a single color)");
                return;
            }

            var r = Math.round(textColor.red);
            var g = Math.round(textColor.green);
            var b = Math.round(textColor.blue);

            // Decide the stroke color.
            var strokeR, strokeG, strokeB;
            if (ColoredMangaMode) {
                // >= 254 (instead of == 255) is INTENTIONAL: it catches "near-white" text
                // from antialiasing, color-profile drift, or scans where white is 254,254,254.
                if (r >= 254 && g >= 254 && b >= 254) {
                    strokeR = 0; strokeG = 0; strokeB = 0;
                } else {
                    strokeR = 255; strokeG = 255; strokeB = 255;
                }
            } else {
                strokeR = Math.abs(r - 255);
                strokeG = Math.abs(g - 255);
                strokeB = Math.abs(b - 255);
            }

            // ONE ActionManager round-trip per layer: the same container is used both
            // to read the current stroke size (increment mode) and to write back.
            // Older versions fetched it up to three times per layer.
            var effects = getEffectsContainer();

            // In increment mode, bump the existing stroke by 1px if there is one;
            // otherwise (or in overwrite mode) use the computed size.
            var size = strokeSize;
            if (!OverwriteStroke && effects !== null && effects.hasKey(kFrameFX)) {
                try {
                    size = effects.getObjectValue(kFrameFX).getUnitDoubleValue(kSize) + 1;
                } catch (e) {
                    // Stroke exists but its size is unreadable: fall back to the computed size.
                }
            }

            applyStroke(effects, size, strokeR, strokeG, strokeB);

        } catch (e) {
            // Anything unexpected gets logged to the end-of-run summary instead of vanishing.
            skipped.push(layerName + " (error: " + e.message + ")");
        }
    }

    // -------------------------------------------------------------------
    // Effects container handling
    //
    // Preservation strategy: grab the layer's ENTIRE existing 'layerEffects'
    // descriptor and only swap the stroke key in. putObject() on an existing
    // key replaces it in place, so nothing can get dropped: scale, every
    // effect type, multi-instance effects (dropShadowMulti etc.), and
    // whatever Adobe adds in the future all ride along untouched.
    // -------------------------------------------------------------------

    // Returns the layer's whole effects descriptor, or null if it has none.
    function getEffectsContainer() {
        try {
            var ref = new ActionReference();
            ref.putEnumerated(kLayer, kOrdinal, kTarget);
            return executeActionGet(ref).getObjectValue(kLayerEffects);
        } catch (e) {
            return null;
        }
    }

    // Builds the descriptor for one stroke effect:
    // outside position, solid color fill, normal blend mode, 100% opacity.
    function buildStrokeDescriptor(strokeSize, r, g, b) {
        var effectDescriptor = new ActionDescriptor();
        var effectColor = new ActionDescriptor();
        effectDescriptor.putBoolean(charIDToTypeID("enab"), true);
        effectDescriptor.putEnumerated(charIDToTypeID("Styl"), charIDToTypeID("FStl"), charIDToTypeID("OutF"));
        effectDescriptor.putEnumerated(charIDToTypeID("PntT"), charIDToTypeID("FrFl"), charIDToTypeID("SClr"));
        effectDescriptor.putEnumerated(charIDToTypeID("Md  "), charIDToTypeID("BlnM"), charIDToTypeID("Nrml"));
        effectDescriptor.putUnitDouble(charIDToTypeID("Opct"), kPercentUnit, 100.0);
        effectDescriptor.putUnitDouble(charIDToTypeID("Sz  "), kPixelUnit, strokeSize);
        effectColor.putDouble(charIDToTypeID("Rd  "), r);
        effectColor.putDouble(charIDToTypeID("Grn "), g);
        effectColor.putDouble(charIDToTypeID("Bl  "), b);
        effectDescriptor.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), effectColor);
        return effectDescriptor;
    }

    // Inserts the stroke into the effects container and writes it back to the layer.
    function applyStroke(effects, size, r, g, b) {
        // No existing effects on this layer: start a fresh container with the default scale.
        if (effects === null) {
            effects = new ActionDescriptor();
            effects.putUnitDouble(kScale, kPercentUnit, 100.0);
        }

        // Newer Photoshop versions can hold MULTIPLE strokes in 'frameFXMulti'.
        // Clear those so the single stroke below doesn't fight with leftovers.
        if (effects.hasKey(kFrameFXMulti)) {
            effects.erase(kFrameFXMulti);
        }

        // Make sure effects are actually visible in case the user had toggled the
        // whole fx stack off. Otherwise the new stroke would apply but not show.
        effects.putBoolean(kMasterSwitch, true);

        // Insert or overwrite ONLY the stroke key. Everything else is untouched.
        effects.putObject(kFrameFX, kFrameFX, buildStrokeDescriptor(size, r, g, b));

        // Write the container back to the layer.
        var ref = new ActionReference();
        var setDesc = new ActionDescriptor();
        ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("Lefx"));
        ref.putEnumerated(kLayer, kOrdinal, kTarget);
        setDesc.putReference(charIDToTypeID("null"), ref);
        setDesc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lefx"), effects);
        executeAction(charIDToTypeID("setd"), setDesc, DialogModes.NO);
    }

})();
