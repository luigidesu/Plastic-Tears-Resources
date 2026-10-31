# Manga Spread Toolkit v1.5
# (= Manga Page Joiner v2.2 + Manga Slicer, fused into one tool)
#
# v1.5: REMOVED the self-syncing "mixed case" step. When one page of a pair
#       had a border and the other didn't, merge mode used to shift the
#       pairing by one page to re-align itself. In practice the pages fed to
#       it are always already in order, so every time it fired it was a false
#       alarm that knocked the rest of the batch off by one. Pages are now
#       paired strictly as given: 1+2, 3+4, 5+6... A pair with a border on one
#       side only is simply skipped (nothing deleted), with a hint to
#       dumb-merge it if it really was a spread.
#       SPEED: with pairs now independent of each other, merge mode processes
#       them in parallel like split mode already did.
#       Files are sorted naturally (p2 before p10) and case-insensitively, the
#       same order Explorer shows them in.
#       FIXED: merged-filename builder now falls back to the [tag]/word
#       tokenizer when the underscore one fails, so an underscore inside a tag
#       ("[Plastic_Tears]") no longer forces the "keep page 1's name" fallback.
#       1-bit (bilevel) pages load as grayscale instead of being blown up to
#       RGB. Closing the window mid-batch asks first.
# v1.4: real GUI. Everything lives in one themed (ttk) window with a live log
#       pane — progress messages stream there instead of a console, so the
#       file is now .pyw and the black console window is gone. Processing runs
#       on a background thread (window never freezes) and you can run as many
#       batches as you want without restarting. Missing Pillow/numpy shows an
#       error popup instead of dying silently.
# v1.3: output format is now picked in the startup window (Original/PNG/JPG/
#       WEBP radio buttons) instead of editing OUTPUT_FORMAT in the source.
#       Default is "keep original format".
#       FIXED: if a merged filename couldn't be built, the fallback reused
#       page 1's name — the spread was saved over the original and then
#       deleted right after. Output paths that collide with a source file
#       are no longer deleted.
# v1.2: added DUMB merge mode (third button) — merges every consecutive pair
#       with border detection turned off. Sorting, RTL order, naming, resizing,
#       grayscale flattening and OUTPUT_FORMAT still work normally.
# v1.1: added OUTPUT_FORMAT setting — force all output to PNG/JPG/WEBP, or
#       leave it "" to keep each file's original format. Default is PNG so
#       merge/split cycles never stack JPEG generational noise on your pages.
#
# MERGE mode: joins two manga pages into a spread (RTL order), detecting
#   full-bleed art at the borders to decide which pairs are actually spreads.
#   Pages are paired strictly in the order they sort: 1+2, 3+4, 5+6...
# SPLIT mode: slices double spreads back into two pages. Proportions decide:
#   wider than 1:1 = spread (sliced), taller = single page (skipped).
#   Right half = first page, left half = second page (RTL).
#
# Supports simple ("The_JOJOLands_ch000_001-002.jpg") and complex
# ("The JOJOLands [chi] - c000 - p001-p002 - [mag] [Plastic Tears].png")
# filenames in both directions. [https://github.com/Daiz/manga-naming-scheme]
#
# https://plastictearsmanga.com/
#
# --- Changes vs. the two separate scripts ---
# ADDED: startup window to pick Merge or Split.
# REMOVED: "keep originals?" prompt. Originals are DELETED after processing.
#          If you mess up it's because you're a dummy. (Flip KEEP_ORIGINALS
#          below if you ever get cold feet.)
# SPEED: border detection now converts only two 5-pixel strips to numpy
#          instead of the whole page (one full-page memory copy less per page).
# SPEED: (gone in v1.5 along with the re-sync step) pages carried over by the
#          self-syncing i+=1 step were cached instead of decoded twice.
# SPEED: grayscale-mode files skip the RGB conversion AND the color check
#          entirely; an L + L pair merges straight into an L canvas.
# SPEED: the color check runs on a 1/10-size NEAREST thumbnail instead of
#          copying the full double-width canvas into numpy first.
# SPEED: split mode processes files in parallel (one thread per CPU core) —
#          Pillow releases the GIL during decode/encode so this scales well.
# ADDED: .webp supported in both modes (saved lossless so nothing degrades).
# FIXED (slicer): the strict "p040-p041" pattern now uses the same validation
#          as the spaced one (matching prefixes or consecutive numbers), so a
#          stray "c036-p040" style token can't get mangled.
# FIXED (slicer): file handles managed with context managers; palette/RGBA
#          images get converted before a JPEG save instead of crashing.

import os
import queue
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from tkinter import Tk, StringVar, filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

try:
    import numpy as np
    from PIL import Image
except ImportError as e:
    # .pyw has no console, so a silent import crash would look like "nothing
    # happened". Show a popup instead.
    _r = Tk(); _r.withdraw()
    messagebox.showerror("Manga Spread Toolkit",
                         f"Missing dependency: {e}\n\n"
                         "Install with:  pip install pillow numpy")
    raise SystemExit(1)

# ----------------------------- Settings -------------------------------------
KEEP_ORIGINALS = False  # True = keep source files after merging/splitting

# EDGE_MODE controls which edges count when deciding if a page is a "single page":
#   "both"  = a white/black strip on EITHER the left or right edge means single
#             page. Only merges full-bleed spreads. (Classic behavior.)
#   "inner" = only checks the edge that touches the gutter (page 1's LEFT edge,
#             page 2's RIGHT edge, since page 1 sits on the right in RTL). Also
#             catches spreads that keep their outer margins. Slightly more
#             aggressive — flip it on if you notice missed spreads.
EDGE_MODE = "inner"

BORDER_WIDTH = 5        # how many pixel columns from the edge to sample
WHITE_THRESHOLD = 241   # pixel channel value >= this counts as "white"
BLACK_THRESHOLD = 30    # pixel channel value <  this counts as "black"
BORDER_PURITY = 0.99    # fraction of the strip that must be white/black to
                        # count as a border (1.0 = all-or-nothing)

COLOR_THRESHOLD = 10    # mean channel deviation above this = colored page
COLOR_SHRINK = 10       # color check runs on a 1/Nth-size thumbnail

# OUTPUT_FORMAT forces every saved image into one format, no matter what the
# source was. "PNG" and "WEBP" are lossless — recommended for pages you're
# going to work on, since every JPEG re-save adds a new generation of noise.
# This is just the STARTUP DEFAULT now — the actual format is picked with the
# radio buttons in the startup window. "" = keep each file's original format.
OUTPUT_FORMAT = ""      # "PNG", "JPG", "WEBP", or "" = keep original format

JPEG_QUALITY = 100      # saved JPEG quality

# Parallel workers for merge and split. Each one holds a few full-size pages
# in RAM at once, so this is capped: 8 workers on 3000px+ raws is already a
# couple of GB in flight.
WORKER_THREADS = min(os.cpu_count() or 4, 8)
# -----------------------------------------------------------------------------

IMAGE_FILETYPES = [("Image files", ("*.jpg", "*.jpeg", "*.png", "*.webp"))]


# ============================ Shared helpers =================================

def natural_key(path):
    """Sort key: 'p2' before 'p10', case-insensitive — the order Explorer shows."""
    return [int(tok) if tok.isdigit() else tok.lower()
            for tok in re.split(r"(\d+)", path)]


def load_page(path):
    """Open an image, fully load it, and release the file handle immediately.

    Native L (grayscale) and RGB modes are kept as-is so grayscale pages can
    skip RGB conversion; 1-bit scans become L; anything exotic (P, RGBA, ...)
    becomes RGB.
    """
    with Image.open(path) as f:
        if f.mode in ("RGB", "L"):
            return f.copy()
        if f.mode == "1":
            return f.convert("L")
        return f.convert("RGB")


_FORMAT_EXTENSIONS = {"PNG": ".png", "JPG": ".jpg", "JPEG": ".jpg", "WEBP": ".webp"}


def apply_output_format(filename):
    """Swap the file extension according to OUTPUT_FORMAT ("" = leave as-is)."""
    fmt = OUTPUT_FORMAT.strip().upper()
    if not fmt:
        return filename
    if fmt not in _FORMAT_EXTENSIONS:
        print(f"    (Unknown OUTPUT_FORMAT '{OUTPUT_FORMAT}', keeping original format)")
        return filename
    base, _ = os.path.splitext(filename)
    return base + _FORMAT_EXTENSIONS[fmt]


def save_image(img, output_path):
    """Save with the right per-format settings (max-quality JPEG, lossless webp)."""
    ext = os.path.splitext(output_path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")  # JPEG can't store palette/alpha modes
        img.save(output_path, quality=JPEG_QUALITY, subsampling=0)
    elif ext == ".webp":
        img.save(output_path, lossless=True)
    else:
        img.save(output_path)


def remove_original(path):
    if KEEP_ORIGINALS:
        return
    try:
        os.remove(path)
    except OSError as e:
        print(f"    Couldn't delete {os.path.basename(path)} ({e})")


# ============================== MERGE mode ===================================

def is_image_colorful(image, threshold=COLOR_THRESHOLD, shrink=COLOR_SHRINK):
    """True if the page has real color, not just gray values stored as RGB."""
    if image.mode != "RGB":
        return False

    # NEAREST resize = the same point-sampling as slicing every Nth pixel,
    # but without copying the full-resolution canvas into numpy first.
    w, h = image.size
    thumb = image.resize((max(1, w // shrink), max(1, h // shrink)), Image.NEAREST)

    # int16 cast is important: uint8 subtraction wraps around and silently
    # reports colorful pixels as gray (and vice versa).
    arr = np.asarray(thumb).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    color_deviation = np.abs(r - g) + np.abs(r - b) + np.abs(g - b)
    return color_deviation.mean() > threshold


def edge_has_border(image, side):
    """True if one vertical edge strip is (almost) all white or all black.

    Only the strip itself is converted to numpy — never the whole page.
    """
    w, h = image.size
    bw = min(BORDER_WIDTH, w)
    box = (0, 0, bw, h) if side == "left" else (w - bw, 0, w, h)
    strip = np.asarray(image.crop(box))

    if strip.ndim == 3:  # RGB(A): a pixel counts only if ALL channels agree
        strip = strip[..., :3]
        white_pixels = np.all(strip >= WHITE_THRESHOLD, axis=2)
        black_pixels = np.all(strip < BLACK_THRESHOLD, axis=2)
    else:                # grayscale: compare directly, no conversion needed
        white_pixels = strip >= WHITE_THRESHOLD
        black_pixels = strip < BLACK_THRESHOLD

    return (white_pixels.mean() >= BORDER_PURITY
            or black_pixels.mean() >= BORDER_PURITY)


def page_is_single(image, inner_side=None):
    """
    Decide if a page looks like a standalone page (has a margin) rather than
    half of a spread (art bleeding to the edge).

    inner_side: which edge touches the gutter ("left" for page 1, "right" for
    page 2). Only used when EDGE_MODE == "inner".
    """
    if EDGE_MODE == "inner" and inner_side is not None:
        return edge_has_border(image, inner_side)
    return edge_has_border(image, "left") or edge_has_border(image, "right")


_SIMPLE_TOKENS = r"[^_]+"              # simple scheme: underscore-separated
_COMPLEX_TOKENS = r"\[[^\]]+\]|\w+"    # complex scheme: [tags] and words


def merge_page_numbers_in_filename(name1, name2):
    """
    Build the combined filename: find the first token where the two names
    differ, and if it's a (prefix + number) token, turn it into "num1-num2".
    Tokens are spliced by exact position so a chapter number that happens to
    contain the page number can't get hit by mistake.

    Returns None when no such token exists.
    """
    base1, ext = os.path.splitext(name1)
    base2, _ = os.path.splitext(name2)

    # Underscore-split first when both names use it; the [tag]/word tokenizer
    # is the fallback so an underscore hiding inside a tag ("[Plastic_Tears]")
    # can't sink the whole thing.
    patterns = [_COMPLEX_TOKENS]
    if "_" in base1 and "_" in base2:
        patterns.insert(0, _SIMPLE_TOKENS)

    for token_pattern in patterns:
        tokens1 = re.finditer(token_pattern, base1)
        tokens2 = re.finditer(token_pattern, base2)

        for m1, m2 in zip(tokens1, tokens2):
            a, b = m1.group(), m2.group()
            if a == b:
                continue

            match_a = re.fullmatch(r"([a-zA-Z]*)(\d+)", a)
            match_b = re.fullmatch(r"([a-zA-Z]*)(\d+)", b)

            if match_a and match_b and match_a.group(1) == match_b.group(1):
                prefix = match_a.group(1)
                num_a, num_b = match_a.group(2), match_b.group(2)
                # numeric comparison, but keep the original zero-padded strings
                lo, hi = (num_a, num_b) if int(num_a) <= int(num_b) else (num_b, num_a)
                combined = f"{prefix}{lo}-{prefix}{hi}"
                return base1[: m1.start()] + combined + base1[m1.end():] + ext

            break  # first differing token wasn't a numbered one; try the next tokenizer

    return None


def build_spread(img1, img2):
    """Paste the two pages side by side, RTL: page 1 (lower number) on the RIGHT."""
    if img2.height != img1.height:
        # Scanned pairs sometimes differ by a few pixels; scale page 2 to match.
        new_w = round(img2.width * img1.height / img2.height)
        img2 = img2.resize((new_w, img1.height), Image.LANCZOS)

    # Two grayscale pages merge straight into a grayscale canvas —
    # no RGB round-trip, no color check needed later.
    if img1.mode == "L" and img2.mode == "L":
        canvas = Image.new("L", (img1.width + img2.width, img1.height), 255)
    else:
        # convert("RGB") on an RGB image is a full-page copy; skip it.
        if img1.mode != "RGB":
            img1 = img1.convert("RGB")
        if img2.mode != "RGB":
            img2 = img2.convert("RGB")
        canvas = Image.new("RGB", (img1.width + img2.width, img1.height), "white")

    canvas.paste(img2, (0, 0))                # left half  = higher page number
    canvas.paste(img1, (img2.width, 0))       # right half = lower page number
    return canvas


def merge_one(img_path1, img_path2, dumb=False):
    """Merge one pair of pages. Returns its log message (thread-safe printing).

    dumb=True skips border detection entirely: the pair gets merged, no
    questions asked. RTL order, naming, resizing, grayscale flattening and
    OUTPUT_FORMAT logic all still apply — only the brain is turned off.
    """
    name1 = os.path.basename(img_path1)
    name2 = os.path.basename(img_path2)
    log = [f"Checking pages:\n    {name1}\n    {name2}"]

    try:
        image1 = load_page(img_path1)
        image2 = load_page(img_path2)

        if dumb:
            log.append("Dumb mode → merging, no questions asked...")
        else:
            single1 = page_is_single(image1, inner_side="left")
            single2 = page_is_single(image2, inner_side="right")
            if single1 and single2:
                log.append("Borders on both → single pages, skipping.\n")
                return "\n".join(log)
            if single1 or single2:
                # One bordered, one not. Used to shift the pairing by one page
                # here to "re-sync"; it only ever derailed the rest of the batch.
                log.append(f"Border on {name1 if single1 else name2} only → not a spread, "
                           "skipping. (Dumb-merge this pair if it really is one.)\n")
                return "\n".join(log)
            log.append("No borders → double spread, merging...")

        canvas = build_spread(image1, image2)
        if canvas.mode == "RGB" and not is_image_colorful(canvas):
            canvas = canvas.convert("L")

        new_filename = merge_page_numbers_in_filename(name1, name2)
        if new_filename is None:
            log.append(f"    (Couldn't build a merged filename, keeping: {name1})")
            new_filename = name1
        output_path = os.path.join(os.path.dirname(img_path1), apply_output_format(new_filename))
        save_image(canvas, output_path)

        # Never delete a source the spread was just saved over (can happen
        # when the merged-filename fallback reuses page 1's name).
        for src in (img_path1, img_path2):
            if os.path.abspath(src) != os.path.abspath(output_path):
                remove_original(src)
        log.append(f"Saved: {os.path.basename(output_path)}\n")

    except Exception as e:
        # Nothing is deleted until the spread is safely saved, so a failure
        # anywhere above leaves both originals untouched.
        log.append(f"    Error ({e}) → skipping this pair, originals untouched.\n")

    return "\n".join(log)


def merge_pages(image_paths, dumb=False):
    """Pair the files strictly in sorted order (1+2, 3+4, ...) and merge each pair.

    No re-syncing, no second-guessing: if the selection is off by one, every
    pair will be off by one — that's on whoever picked the files.
    """
    image_paths = sorted(image_paths, key=natural_key)
    pairs = list(zip(image_paths[0::2], image_paths[1::2]))

    # Pairs don't depend on each other any more, so merge them in parallel
    # exactly like split mode does.
    with ThreadPoolExecutor(max_workers=WORKER_THREADS) as pool:
        for message in pool.map(lambda pair: merge_one(*pair, dumb=dumb), pairs):
            print(message)

    if len(image_paths) % 2:
        print(f"Warning: odd number of files — unpaired page at the end left untouched:\n"
              f"    {os.path.basename(image_paths[-1])}\n")


# ============================== SPLIT mode ===================================

def get_split_filenames(filename):
    """Turn a spread filename back into its two page filenames."""
    base, ext = os.path.splitext(filename)

    # 1. STRICT MATCH: hyphen with NO spaces ("p040-p041", "001-002").
    #    Validated so a stray "c036-p040" style token can't hijack it:
    #    prefixes must match OR the numbers must be consecutive.
    # 2. FALLBACK MATCH: ranges WITH spaces ("040 - 041"), same validation.
    for pattern in (r"([a-zA-Z]*)(\d+)-([a-zA-Z]*)(\d+)",
                    r"([a-zA-Z]*)(\d+)\s+-\s+([a-zA-Z]*)(\d+)"):
        for m in re.finditer(pattern, base):
            p1, n1, p2, n2 = m.groups()
            if p1 == p2 or abs(int(n2) - int(n1)) == 1:
                return (
                    base[: m.start()] + p1 + n1 + base[m.end():] + ext,
                    base[: m.start()] + p2 + n2 + base[m.end():] + ext,
                )

    # 3. ULTIMATE FALLBACK if no recognizable page range is found
    return f"{base}_p1{ext}", f"{base}_p2{ext}"


def split_one(img_path):
    """Split a single file. Returns its log message (thread-safe printing)."""
    filename = os.path.basename(img_path)

    try:
        with Image.open(img_path) as img:
            width, height = img.size

            # Check proportions: if wider than 1:1, it's a spread
            if width <= height:
                return f"Skipping single page (taller than 1:1): {filename}\n"

            mid = width // 2

            # Manga reads right-to-left: right half is the FIRST page
            right_half = img.crop((mid, 0, width, height))
            left_half = img.crop((0, 0, mid, height))

            name1, name2 = (apply_output_format(n) for n in get_split_filenames(filename))
            folder = os.path.dirname(img_path)
            save_image(right_half, os.path.join(folder, name1))
            save_image(left_half, os.path.join(folder, name2))

        remove_original(img_path)
        return (f"Splitting double spread: {filename}\n"
                f"  -> Saved Right Half as: {name1}\n"
                f"  -> Saved Left Half as:  {name2}\n")

    except Exception as e:
        return f"Error processing {filename}: {e}\n"


def split_pages(image_paths):
    # Files are independent, so split them in parallel. Pillow releases the
    # GIL while decoding/encoding, so threads give a real speedup here.
    with ThreadPoolExecutor(max_workers=WORKER_THREADS) as pool:
        for message in pool.map(split_one, sorted(image_paths, key=natural_key)):
            print(message)


# ================================ UI =========================================

MODE_TITLES = {"merge": "Select Pages to Merge",
               "dumb_merge": "Select Pages to Merge (dumb mode)",
               "split": "Select Spreads to Split"}


class _QueueWriter:
    """File-like stand-in for stdout that ships text into a thread-safe queue,
    so print() calls from the worker thread land in the GUI log pane."""

    def __init__(self, q):
        self.q = q

    def write(self, text):
        if text:
            self.q.put(text)

    def flush(self):
        pass


class App:
    def __init__(self, root):
        self.root = root
        root.title("Manga Spread Toolkit v1.5")
        root.minsize(540, 480)
        root.protocol("WM_DELETE_WINDOW", self._on_close)

        self.running = False
        self.log_queue = queue.Queue()
        sys.stdout = _QueueWriter(self.log_queue)  # every print() goes to the log

        outer = ttk.Frame(root, padding=(16, 14, 16, 8))
        outer.pack(fill="both", expand=True)

        ttk.Label(outer, text="Manga Spread Toolkit",
                  font=("Segoe UI", 13, "bold")).pack(anchor="w")
        ttk.Label(outer, text="Join pages into right-to-left spreads, or slice spreads back apart.",
                  foreground="gray40").pack(anchor="w", pady=(0, 12))

        self.controls = []

        btns = ttk.Frame(outer)
        btns.pack(fill="x")
        for col, (text, mode) in enumerate((
                ("Merge into spreads", "merge"),
                ("Merge EVERYTHING\n(dumb mode)", "dumb_merge"),
                ("Split into pages", "split"))):
            b = ttk.Button(btns, text=text, command=lambda m=mode: self.start(m))
            b.grid(row=0, column=col, sticky="nsew", padx=(0 if col == 0 else 6, 0), ipady=8)
            btns.columnconfigure(col, weight=1)
            self.controls.append(b)

        # "ORIG" sentinel instead of "": an empty-string Radiobutton value
        # collides with ttk's tristate default and renders the button greyed out.
        self.fmt_var = StringVar(master=root, value=OUTPUT_FORMAT or "ORIG")
        fmt_box = ttk.LabelFrame(outer, text="Output format", padding=(10, 4, 10, 8))
        fmt_box.pack(fill="x", pady=(12, 0))
        for text, value in (("Keep original", "ORIG"), ("PNG (lossless)", "PNG"),
                            ("JPG", "JPG"), ("WEBP (lossless)", "WEBP")):
            rb = ttk.Radiobutton(fmt_box, text=text, variable=self.fmt_var, value=value)
            rb.pack(side="left", padx=(0, 14))
            self.controls.append(rb)

        ttk.Label(outer, foreground="gray40", justify="left",
                  text="Merging: pages are paired strictly in order (1+2, 3+4, …) — deselect covers "
                       "or start from a\npair-numbered page, or every pair ends up off by one. A pair "
                       "bordered on one side only is skipped.\nDumb mode merges every pair, no border "
                       "detection. Originals are deleted after processing.") \
            .pack(anchor="w", pady=(8, 8))

        self.log = ScrolledText(outer, height=14, state="disabled",
                                font=("Consolas", 9), relief="flat",
                                background="gray12", foreground="gray85")
        self.log.pack(fill="both", expand=True)

        self.status = StringVar(master=root, value="Ready.")
        ttk.Label(outer, textvariable=self.status, foreground="gray40") \
            .pack(anchor="w", pady=(6, 0))

        root.after(100, self._drain_log)
        root.update_idletasks()
        root.eval("tk::PlaceWindow . center")

    # ---- run flow ----

    def start(self, mode):
        paths = filedialog.askopenfilenames(parent=self.root, title=MODE_TITLES[mode],
                                            filetypes=IMAGE_FILETYPES)
        if not paths:
            return
        if mode in ("merge", "dumb_merge") and len(paths) < 2:
            print("Need at least two images to merge.\n")
            return

        global OUTPUT_FORMAT
        fmt = self.fmt_var.get()
        OUTPUT_FORMAT = "" if fmt == "ORIG" else fmt

        self._set_running(True)
        print(f"――― {len(paths)} file(s) | mode: {mode} | "
              f"format: {OUTPUT_FORMAT or 'keep original'} ―――\n")
        threading.Thread(target=self._worker, args=(mode, paths), daemon=True).start()

    def _worker(self, mode, paths):
        try:
            if mode == "split":
                split_pages(paths)
            else:
                merge_pages(paths, dumb=(mode == "dumb_merge"))
            print("All done!\n")
        except Exception as e:
            print(f"Unexpected error: {e}\n")
        finally:
            self.log_queue.put(None)  # sentinel: tell the GUI thread we're done

    # ---- GUI-thread plumbing ----

    def _set_running(self, running):
        self.running = running
        for c in self.controls:
            c.state(["disabled"] if running else ["!disabled"])
        self.status.set("Working..." if running else "Ready.")

    def _on_close(self):
        # A batch killed halfway can leave a half-written spread behind (the
        # originals are only deleted after a successful save, so nothing is
        # lost — but ask anyway).
        if self.running and not messagebox.askyesno(
                "Manga Spread Toolkit", "Still working on a batch. Quit anyway?",
                icon="warning", parent=self.root):
            return
        self.root.destroy()

    def _drain_log(self):
        try:
            while True:
                item = self.log_queue.get_nowait()
                if item is None:
                    self._set_running(False)
                    continue
                self.log.configure(state="normal")
                self.log.insert("end", item)
                self.log.see("end")
                self.log.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(100, self._drain_log)


def main():
    root = Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
