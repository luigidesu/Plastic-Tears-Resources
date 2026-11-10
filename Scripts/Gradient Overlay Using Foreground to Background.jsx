/*
Stroke & Gradient Overlay Using Foreground to Background.jsx
https://community.adobe.com/t5/photoshop-ecosystem-discussions/gradient-from-background-and-foreground-can-t-be-automated/td-p/14585544

Description:
This script applies a gradient overlay to every selected layer using the current Foreground
and Background colors.
It also detects each text layer's existing color and adds a stroke in either black or white
— whichever provides the strongest contrast.
When it finishes it copies the resulting style to the clipboard, so you can paste it straight
onto new layers with Layer > Layer Style > Paste Layer Style.
Originally designed for the "JOJOLands" colored manga SFX editing.

NOTE: this REPLACES the layer's existing effects (it sets `layerEffects` wholesale), so any
drop shadow / outer glow / etc. already on the layer is discarded. That is deliberate —
it guarantees a clean, identical style on every layer — but it is worth knowing.

Installation:
1. Place script in:
   PC:  C:\<Program Files>\Adobe\Adobe Photoshop <version>\Presets\Scripts\
   Mac: <hard drive>/Applications/Adobe Photoshop <version>/Presets/Scripts/
2. Restart Photoshop.
3. Choose File > Scripts > Stroke & Gradient Overlay Using Foreground to Background

TO-DO:
- Add multi-layer support. [DONE]
- Add a function to copy the final layer style to the clipboard for quick pasting into
  similar layers. [DONE — on by default, disable with copyStyleAfterApply]

v1.0 – 2 May 2024, Stephen Marsh
v1.1 – 12 August 2025, Luigi
v1.2 – 25 July 2026, Luigi
       - Fixed layer selection on documents with no Background layer (AM index off-by-one).
       - Stroke color now chosen by perceived brightness (Rec. 601 luma) rather than a flat
         RGB average, which mis-read saturated greens and cyans.
       - Removed the two redundant threshold branches (they could never change the result).
       - All tunables collected into SETTINGS; optional stroke scaling by document width.
       - Whole run is a single undo step, and the original multi-selection is restored.
       - Failures are reported instead of vanishing into $.writeln.
       - The finished style is copied to the clipboard when the run ends.
v1.3 – 8 September 2026, Luigi
       Performance pass. The applied style is identical to v1.2 — only the amount of work
       done to produce it changed.
       - stringIDToTypeID results are cached. v1.2 asked Photoshop to resolve 102 string
         IDs per layer, out of only 67 distinct ones in the entire script; after the first
         layer this drops to a hash lookup.
       - The style descriptor is no longer rebuilt per layer. Only two are possible (black
         stroke or white stroke), so both are built once before the loop. Per-layer work is
         now exactly one select + one executeAction.
       - The stroke color is read through Action Manager instead of walking the DOM
         (activeDocument.activeLayer.textItem.color.rgb), which was ~8 round trips a layer.
       - Foreground/background colors and the document are read once per run, not per layer.
       - getIndexOffset() asks the document for hasBackgroundLayer instead of provoking an
         exception (the DOM probe is kept as a fallback).
       BEHAVIOR NOTE: on text with more than one color run, v1.2's textItem.color threw and
       the script fell back to the foreground color as a proxy. v1.3 uses the first run's
       actual color instead. Set useFirstRunColor to false to restore v1.2 exactly.

https://plastictearsmanga.com/
*/

/*
<javascriptresource>
<name>Stroke & Gradient Overlay Using Foreground to Background v1.3 [Plastic Tears]</name>
<enableinfo>true</enableinfo>
<category>Plastic Tears</category>
</javascriptresource>
*/

// ======= SETTINGS =======
var PT_SETTINGS = {

    // --- Stroke ---
    strokeSize: 5,              // px. 5 for JOJOLands (2048px), 6 for JoJolion (3156px Chinese raws)
    strokePosition: "outsetFrame",   // "outsetFrame" | "insetFrame" | "centeredFrame"

    // Optional: derive the stroke size from the document width instead of hard-coding it.
    // Heads up — your two sizes are not proportional (5px @ 2048 vs 6px @ 3156), so this
    // cannot reproduce both. With referenceWidth 3156 / strokeSize 6, a 2048px page gets 4px.
    // Left off by default; flip it on only if you decide one ratio is good enough.
    autoScaleStroke: false,
    referenceWidth: 3156,

    // --- Stroke color decision ---
    // Perceived brightness of the text, 0-255. At or above => black stroke, below => white.
    lumaThreshold: 128,

    // On text with more than one color run, use the FIRST run's color (true), or ignore the
    // text entirely and fall back to the foreground color as a proxy (false, = v1.2).
    useFirstRunColor: true,

    // --- Gradient ---
    gradientAngle: 65,
    gradientReverse: true,
    gradientDither: false,

    // --- Extras ---
    // Copies the finished style to the clipboard when the run ends, so you can
    // Layer > Layer Style > Paste Layer Style onto new layers afterwards.
    // Taken from the last layer processed.
    copyStyleAfterApply: true,
    reportFailures: true        // alert if any selected layer could not be processed
};
// =========================


function ptGradientOverlayMain() {

    var S = PT_SETTINGS;

    // Every stringIDToTypeID() is a call across into Photoshop. The descriptor builder below
    // asks for 102 of them per layer, out of 67 distinct IDs in the whole script, so cache.
    // The typeof guard (rather than a !== undefined check) keeps an ID that happens to
    // collide with an Object.prototype member — "constructor", "toString" — from coming
    // back as a function.
    var idCache = {};
    function s2t(s) {
        var id = idCache[s];
        return (typeof id === "number") ? id : (idCache[s] = stringIDToTypeID(s));
    }

    // Rec. 601 perceived brightness. A flat (r+g+b)/3 under-reads green and over-reads blue,
    // which is exactly wrong for saturated SFX colors.
    function luma(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Action Manager layer index 0 is the Background layer. When a document has no Background,
    // the indices reported by targetLayers sit one below the ones putIndex expects.
    function getIndexOffset() {
        try {
            var ref = new ActionReference();
            ref.putProperty(s2t("property"), s2t("hasBackgroundLayer"));
            ref.putEnumerated(s2t("document"), s2t("ordinal"), s2t("targetEnum"));
            return executeActionGet(ref).getBoolean(s2t("hasBackgroundLayer")) ? 0 : 1;
        } catch (e) {
            // Older versions may not expose the property. Fall back to the v1.2 DOM probe,
            // which costs a thrown exception but only runs once per document.
            try { app.activeDocument.backgroundLayer; return 0; } catch (e2) { return 1; }
        }
    }

    // Selected layers, as indices usable with selectLayerByIndex().
    function getSelectedLayerIndices(offset) {
        var selected = [];
        try {
            var ref = new ActionReference();
            ref.putProperty(s2t("property"), s2t("targetLayers"));
            ref.putEnumerated(s2t("document"), s2t("ordinal"), s2t("targetEnum"));
            var desc = executeActionGet(ref);

            if (desc.hasKey(s2t("targetLayers"))) {
                var list = desc.getList(s2t("targetLayers"));
                for (var i = 0; i < list.count; i++) {
                    selected.push(list.getReference(i).getIndex() + offset);
                }
                return selected;
            }
        } catch (e) {
            // older versions or odd states: fall through to the single-layer path
        }

        // Fallback: ask the target layer for its own AM itemIndex. This is *not* the same as
        // the DOM's activeLayer.itemIndex, which is what v1.1 used by mistake.
        try {
            var ref2 = new ActionReference();
            ref2.putProperty(s2t("property"), s2t("itemIndex"));
            ref2.putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"));
            var idx = executeActionGet(ref2).getInteger(s2t("itemIndex"));
            selected.push(idx - 1 + offset);
        } catch (e2) {
            // nothing selectable
        }
        return selected;
    }

    // Select a layer by AM index. Pass add=true to extend the current selection.
    function selectLayerByIndex(idx, add) {
        var ref = new ActionReference();
        ref.putIndex(s2t("layer"), idx);
        var desc = new ActionDescriptor();
        desc.putReference(s2t("null"), ref);
        // Without this, selecting a hidden layer can turn its visibility back on.
        desc.putBoolean(s2t("makeVisible"), false);
        if (add) {
            desc.putEnumerated(s2t("selectionModifier"), s2t("selectionModifierType"), s2t("addToSelection"));
        }
        executeAction(s2t("select"), desc, DialogModes.NO);
    }

    function selectLayersByIndices(indices) {
        for (var i = 0; i < indices.length; i++) {
            selectLayerByIndex(indices[i], i > 0);
        }
    }

    // Copy the current target layer's style to the clipboard.
    //
    // The event is "copyEffects" (charID "CpFX") and it takes NO descriptor — it acts on
    // whatever layer is targeted. v1.1 had this as "copyLayerStyle" with a layer reference,
    // which is not a real event ID; it fails with "General Photoshop error occurred /
    // The command <unknown> is not currently available".
    //
    // Requires exactly one layer to be targeted.
    function copyLayerStyleToClipboard() {
        try {
            executeAction(s2t("copyEffects"), undefined, DialogModes.NO);
        } catch (e) {
            // fall back to the four-character ID for older versions
            executeAction(charIDToTypeID("CpFX"), undefined, DialogModes.NO);
        }
    }

    // Build the complete "set layerEffects" descriptor: gradient overlay
    // (foreground->background) plus stroke.
    //
    // Nothing in here depends on WHICH layer is targeted — the reference is an ordinal
    // targetEnum, i.e. "whatever is selected at the moment this runs" — so the result can be
    // built once and then executed against every layer in turn. That is the whole trick in
    // v1.3: the loop below stopped rebuilding this ~25-descriptor tree for each layer.
    //
    // strokeR/G/B are 0..255. fg/bg are plain {r,g,b} objects, already rounded.
    function buildStyleDescriptor(strokeR, strokeG, strokeB, strokeSize, fg, bg) {

        var targetRef    = new ActionReference();
        var setDesc      = new ActionDescriptor();
        var effectsDesc  = new ActionDescriptor();
        var gradFxDesc   = new ActionDescriptor();
        var gradientDesc = new ActionDescriptor();
        var fgStopDesc   = new ActionDescriptor();
        var fgColorDesc  = new ActionDescriptor();
        var bgStopDesc   = new ActionDescriptor();
        var bgColorDesc  = new ActionDescriptor();
        var opacity0Desc = new ActionDescriptor();
        var opacity1Desc = new ActionDescriptor();
        var offsetDesc   = new ActionDescriptor();
        var strokeDesc   = new ActionDescriptor();
        var strokeColDsc = new ActionDescriptor();
        var colorStops   = new ActionList();
        var alphaStops   = new ActionList();

        targetRef.putProperty(s2t("property"), s2t("layerEffects"));
        targetRef.putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"));
        setDesc.putReference(s2t("null"), targetRef);

        effectsDesc.putUnitDouble(s2t("scale"), s2t("percentUnit"), 100.000000);

        gradFxDesc.putBoolean(s2t("enabled"), true);
        gradFxDesc.putBoolean(s2t("present"), true);
        gradFxDesc.putBoolean(s2t("showInDialog"), true);
        gradFxDesc.putEnumerated(s2t("mode"), s2t("blendMode"), s2t("normal"));
        gradFxDesc.putUnitDouble(s2t("opacity"), s2t("percentUnit"), 100.000000);

        // Gradient definition
        gradientDesc.putString(s2t("name"), "Foreground to Background");
        gradientDesc.putEnumerated(s2t("gradientForm"), s2t("gradientForm"), s2t("customStops"));
        // Gradient interpolation resolution. The key name is a Photoshop misnomer; 4096 is the
        // value Photoshop itself records, and stop locations below are on this 0..4096 scale.
        gradientDesc.putDouble(s2t("interfaceIconFrameDimmed"), 4096.000000);

        // Foreground color stop.
        // NOTE: "grain" really is the string ID for the green channel in an RGBColor
        // descriptor (charID "Grn "). It is not a typo.
        fgColorDesc.putDouble(s2t("red"),   fg.r);
        fgColorDesc.putDouble(s2t("grain"), fg.g);
        fgColorDesc.putDouble(s2t("blue"),  fg.b);
        fgStopDesc.putObject(s2t("color"), s2t("RGBColor"), fgColorDesc);
        fgStopDesc.putEnumerated(s2t("type"), s2t("colorStopType"), s2t("userStop"));
        fgStopDesc.putInteger(s2t("location"), 0);
        fgStopDesc.putInteger(s2t("midpoint"), 50);
        colorStops.putObject(s2t("colorStop"), fgStopDesc);

        // Background color stop
        bgColorDesc.putDouble(s2t("red"),   bg.r);
        bgColorDesc.putDouble(s2t("grain"), bg.g);
        bgColorDesc.putDouble(s2t("blue"),  bg.b);
        bgStopDesc.putObject(s2t("color"), s2t("RGBColor"), bgColorDesc);
        bgStopDesc.putEnumerated(s2t("type"), s2t("colorStopType"), s2t("userStop"));
        bgStopDesc.putInteger(s2t("location"), 4096);
        bgStopDesc.putInteger(s2t("midpoint"), 50);
        colorStops.putObject(s2t("colorStop"), bgStopDesc);

        gradientDesc.putList(s2t("colors"), colorStops);

        // Opacity stops (fully opaque at both ends)
        opacity0Desc.putUnitDouble(s2t("opacity"), s2t("percentUnit"), 100.000000);
        opacity0Desc.putInteger(s2t("location"), 0);
        opacity0Desc.putInteger(s2t("midpoint"), 50);
        alphaStops.putObject(s2t("transferSpec"), opacity0Desc);

        opacity1Desc.putUnitDouble(s2t("opacity"), s2t("percentUnit"), 100.000000);
        opacity1Desc.putInteger(s2t("location"), 4096);
        opacity1Desc.putInteger(s2t("midpoint"), 50);
        alphaStops.putObject(s2t("transferSpec"), opacity1Desc);

        gradientDesc.putList(s2t("transparency"), alphaStops);
        gradFxDesc.putObject(s2t("gradient"), s2t("gradientClassEvent"), gradientDesc);

        // Gradient angle & type
        gradFxDesc.putUnitDouble(s2t("angle"), s2t("angleUnit"), S.gradientAngle);
        gradFxDesc.putEnumerated(s2t("type"), s2t("gradientType"), s2t("linear"));
        gradFxDesc.putBoolean(s2t("reverse"), S.gradientReverse);
        gradFxDesc.putBoolean(s2t("dither"), S.gradientDither);
        gradFxDesc.putBoolean(s2t("align"), true);
        gradFxDesc.putUnitDouble(s2t("scale"), s2t("percentUnit"), 100.000000);

        offsetDesc.putUnitDouble(s2t("horizontal"), s2t("percentUnit"), 0.000000);
        offsetDesc.putUnitDouble(s2t("vertical"), s2t("percentUnit"), 0.000000);
        gradFxDesc.putObject(s2t("offset"), s2t("paint"), offsetDesc);
        effectsDesc.putObject(s2t("gradientFill"), s2t("gradientFill"), gradFxDesc);

        // Stroke
        strokeDesc.putBoolean(s2t("enabled"), true);
        strokeDesc.putBoolean(s2t("present"), true);
        strokeDesc.putBoolean(s2t("showInDialog"), true);
        strokeDesc.putEnumerated(s2t("style"), s2t("frameStyle"), s2t(S.strokePosition));
        strokeDesc.putEnumerated(s2t("paintType"), s2t("frameFill"), s2t("solidColor"));
        strokeDesc.putEnumerated(s2t("mode"), s2t("blendMode"), s2t("normal"));
        strokeDesc.putUnitDouble(s2t("opacity"), s2t("percentUnit"), 100.000000);
        strokeDesc.putUnitDouble(s2t("size"), s2t("pixelsUnit"), strokeSize);

        strokeColDsc.putDouble(s2t("red"),   strokeR);
        strokeColDsc.putDouble(s2t("grain"), strokeG);
        strokeColDsc.putDouble(s2t("blue"),  strokeB);
        strokeDesc.putObject(s2t("color"), s2t("RGBColor"), strokeColDsc);

        strokeDesc.putBoolean(s2t("overprint"), false);
        effectsDesc.putObject(s2t("frameFX"), s2t("frameFX"), strokeDesc);

        setDesc.putObject(s2t("to"), s2t("layerEffects"), effectsDesc);
        return setDesc;
    }

    // Perceived brightness of the active layer's text, or undefined when there isn't one to
    // read. v1.2 did this through the DOM — activeDocument.activeLayer.textItem.color.rgb —
    // which is roughly eight round trips into Photoshop per layer. Two targeted Action
    // Manager gets do the same job.
    function activeLayerTextLuma() {
        try {
            var kindRef = new ActionReference();
            kindRef.putProperty(s2t("property"), s2t("layerKind"));
            kindRef.putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"));
            // layerKind 3 is a text layer. Groups, shapes, pixel and adjustment layers have
            // no text color to read, so don't pay for the second get.
            if (executeActionGet(kindRef).getInteger(s2t("layerKind")) !== 3) {
                return undefined;
            }

            var textRef = new ActionReference();
            textRef.putProperty(s2t("property"), s2t("textKey"));
            textRef.putEnumerated(s2t("layer"), s2t("ordinal"), s2t("targetEnum"));
            var textKey = executeActionGet(textRef).getObjectValue(s2t("textKey"));

            var ranges = textKey.getList(s2t("textStyleRange"));
            if (!ranges.count) return undefined;
            // v1.2 threw on mixed-color text and fell back to the foreground proxy.
            if (!S.useFirstRunColor && ranges.count > 1) return undefined;

            var style = ranges.getObjectValue(0).getObjectValue(s2t("textStyle"));
            // A run inheriting its color from the default character style has no color key.
            if (!style.hasKey(s2t("color"))) return undefined;

            var c = style.getObjectValue(s2t("color"));
            return luma(c.getDouble(s2t("red")),
                        c.getDouble(s2t("grain")),
                        c.getDouble(s2t("blue")));
        } catch (e) {
            // Non-RGB text color (CMYK/Lab document), odd layer states, older versions.
            return undefined;
        }
    }

    // ---- main ----

    var savedUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    try {
        var doc = app.activeDocument;
        var offset = getIndexOffset();
        var selectedIdx = getSelectedLayerIndices(offset);

        if (!selectedIdx.length) {
            alert("No layer selected.");
            return;
        }

        var strokeSize = S.strokeSize;
        if (S.autoScaleStroke) {
            var docWidth = doc.width.as("px");
            strokeSize = Math.max(1, Math.round(docWidth * S.strokeSize / S.referenceWidth));
        }

        // Snapshot the swatches to plain numbers. Every .red/.green/.blue read crosses into
        // Photoshop, and none of these change during the run.
        var fgRGB = app.foregroundColor.rgb;
        var bgRGB = app.backgroundColor.rgb;
        var fg = { r: Math.round(fgRGB.red), g: Math.round(fgRGB.green), b: Math.round(fgRGB.blue) };
        var bg = { r: Math.round(bgRGB.red), g: Math.round(bgRGB.green), b: Math.round(bgRGB.blue) };

        // Only two styles are possible across the whole run, so build both here instead of
        // reconstructing the descriptor tree for every layer.
        var styleBlackStroke = buildStyleDescriptor(0,   0,   0,   strokeSize, fg, bg);
        var styleWhiteStroke = buildStyleDescriptor(255, 255, 255, strokeSize, fg, bg);
        var setID = s2t("set");

        // Used when a layer has no readable text color — the same proxy v1.2 used, but the
        // comparison is done once here rather than per layer.
        var fallbackIsLight = luma(fg.r, fg.g, fg.b) >= S.lumaThreshold;

        var failures = [];
        var processedCount = 0;
        var lastStyledIdx = null;

        for (var i = 0; i < selectedIdx.length; i++) {
            try {
                selectLayerByIndex(selectedIdx[i], false);

                var brightness = activeLayerTextLuma();
                var isLight = (brightness === undefined)
                    ? fallbackIsLight
                    : (brightness >= S.lumaThreshold);

                // light text -> black stroke, dark text -> white stroke
                executeAction(setID, isLight ? styleBlackStroke : styleWhiteStroke, DialogModes.NO);

                processedCount++;
                lastStyledIdx = selectedIdx[i];
            } catch (err) {
                var label;
                try { label = doc.activeLayer.name; }
                catch (e2) { label = "index " + selectedIdx[i]; }
                failures.push(label + ": " + err);
                $.writeln("Error processing layer " + label + " : " + err);
            }
        }

        // Copy the finished style to the clipboard, ready to paste onto new layers.
        // This has to happen here, while a single layer is still targeted — restoring the
        // multi-selection first would leave nothing valid for Copy Layer Style to read.
        var copyError = null;
        if (S.copyStyleAfterApply && lastStyledIdx !== null) {
            try {
                selectLayerByIndex(lastStyledIdx, false);
                copyLayerStyleToClipboard();
            } catch (e4) {
                copyError = String(e4);
                $.writeln("Could not copy layer style: " + e4);
            }
        }

        // Put the user's original selection back — otherwise only the last layer stays selected.
        try {
            selectLayersByIndices(selectedIdx);
        } catch (e3) { /* not worth failing the run over */ }

        if (S.reportFailures && (failures.length || copyError)) {
            var msg = "Styled " + processedCount + " of " + selectedIdx.length + " layer(s).";
            if (failures.length) {
                msg += "\n\nSkipped:\n" + failures.join("\n");
            }
            if (copyError) {
                msg += "\n\nThe style was applied, but copying it to the clipboard failed:\n" + copyError;
            }
            alert(msg);
        }

    } finally {
        app.preferences.rulerUnits = savedUnits;
    }
}

(function () {
    if (app.documents.length === 0) {
        alert("No document is open.");
        return;
    }
    // Collapse the whole run into one history state so a single Ctrl+Z undoes everything.
    app.activeDocument.suspendHistory(
        "Stroke & Gradient Overlay",
        "ptGradientOverlayMain()"
    );
})();
