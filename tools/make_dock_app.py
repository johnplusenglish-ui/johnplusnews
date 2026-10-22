#!/usr/bin/env python3
"""Make the Dock apps for the two publishers.

    python3 tools/make_dock_app.py            both apps
    python3 tools/make_dock_app.py photos     just the photo publisher

Each app is a tiny launcher that opens its .command file (which must stay in the same folder
as the app) in Terminal. The article publisher gets a blue square with a white dot and a plus;
the photo publisher gets an amber square with a white camera, so the two are easy to tell apart
in the Dock. Needs the macOS tools osacompile, sips, iconutil and codesign. Nothing is installed
anywhere else, and the finished apps are not committed to git (they are in .gitignore).
"""
import math
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1024
WHITE = (255, 255, 255)

SCRIPT = '''-- Opens the johnplusnews __WHAT__ in Terminal.
set appPath to POSIX path of (path to me)
set projectDir to do shell script "dirname " & quoted form of appPath
set launcher to projectDir & "/__COMMAND__"
try
	do shell script "test -f " & quoted form of launcher
on error
	display dialog "I could not find \\"__COMMAND__\\" next to this app. Please keep this app inside the johnplusnews folder." buttons {"OK"} default button "OK" with icon caution
	return
end try
do shell script "open -a Terminal " & quoted form of launcher
'''


def coverage(d):
    """Anti-aliased edge: d is the signed distance in pixels (negative = inside)."""
    return max(0.0, min(1.0, 0.5 - d))


def rounded_box(px, py, cx, cy, hw, hh, r):
    qx, qy = abs(px - cx) - (hw - r), abs(py - cy) - (hh - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def plus_glyph(px, py, c, bottom):
    """A white dot with a plus cut into it: add an article."""
    dot = coverage(math.hypot(px - c, py - c) - 215)
    plus = max(coverage(rounded_box(px, py, c, c, 118, 30, 30)),
               coverage(rounded_box(px, py, c, c, 30, 118, 30))) * dot
    return [(dot, WHITE), (plus, bottom)]


def camera_glyph(px, py, c, bottom):
    """A white camera with a coloured lens: the pictures and prompts tool."""
    cy = c + 24
    body = coverage(rounded_box(px, py, c, cy, 252, 174, 48))
    bump = coverage(rounded_box(px, py, c - 118, cy - 192, 74, 48, 22))
    lens = coverage(math.hypot(px - c, py - cy) - 98)
    return [(max(body, bump), WHITE), (lens * max(body, bump), bottom)]


APPS = {
    "article": {"app": "Publish an article.app", "command": "Publish an article.command",
                "what": "publisher", "glyph": plus_glyph,
                "top": (0x3B, 0x82, 0xF7), "bottom": (0x1D, 0x5F, 0xE0)},
    "photos": {"app": "Photo publisher.app", "command": "Open the photo publisher.command",
               "what": "photo publisher", "glyph": camera_glyph,
               "top": (0xFB, 0xBF, 0x24), "bottom": (0xD9, 0x77, 0x06)},
}


def draw_icon(spec):
    c = SIZE / 2
    body = 412           # half of the 824px icon body macOS uses inside a 1024px canvas
    rows = []
    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            px, py = x + 0.5, y + 0.5
            a_body = coverage(rounded_box(px, py, c, c, body, body, 186))
            if a_body <= 0.0:
                row += b"\x00\x00\x00\x00"
                continue
            t = (py - (c - body)) / (2 * body)
            r, g, b = (spec["top"][i] + (spec["bottom"][i] - spec["top"][i]) * t for i in range(3))
            for alpha, paint in spec["glyph"](px, py, c, spec["bottom"]):
                r, g, b = (v + (w - v) * alpha for v, w in zip((r, g, b), paint))
            row += bytes((round(r), round(g), round(b), round(a_body * 255)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("{} failed: {}".format(cmd[0], (r.stderr or r.stdout).strip()))


def build(spec):
    app = ROOT / spec["app"]
    work = Path(tempfile.mkdtemp(prefix="jpn-icon-"))
    try:
        print("Drawing the icon for {}...".format(spec["app"]))
        master = work / "master.png"
        write_png(master, draw_icon(spec))
        iconset = work / "AppIcon.iconset"
        iconset.mkdir()
        for base in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                px = base * scale
                name = "icon_{0}x{0}{1}.png".format(base, "@2x" if scale == 2 else "")
                run(["sips", "-z", str(px), str(px), str(master), "--out", str(iconset / name)])
        icns = work / "AppIcon.icns"
        run(["iconutil", "-c", "icns", str(iconset), "-o", str(icns)])

        print("Building the app...")
        script = work / "launcher.applescript"
        script.write_text(SCRIPT.replace("__COMMAND__", spec["command"]).replace("__WHAT__", spec["what"]),
                          encoding="utf-8")
        if app.exists():
            shutil.rmtree(app)
        run(["osacompile", "-o", str(app), str(script)])
        shutil.copy2(icns, app / "Contents" / "Resources" / "applet.icns")
        # osacompile points the app at a built-in icon in Assets.car; remove that so our icon is the one used.
        plist = app / "Contents" / "Info.plist"
        subprocess.run(["/usr/libexec/PlistBuddy", "-c", "Delete :CFBundleIconName", str(plist)], capture_output=True)
        (app / "Contents" / "Resources" / "Assets.car").unlink(missing_ok=True)
        # Changing the contents broke the app's seal, so sign it again (a plain local signature, nothing is sent anywhere).
        run(["codesign", "--force", "--deep", "--sign", "-", str(app)])
        app.touch()
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print("Done: {}".format(app))


def main():
    for tool in ("osacompile", "sips", "iconutil", "codesign"):
        if not shutil.which(tool):
            sys.exit("This needs the macOS tool '{}', which was not found.".format(tool))
    wanted = sys.argv[1:] or list(APPS)
    for name in wanted:
        if name not in APPS:
            sys.exit("I do not know an app called '{}'. Try: {}".format(name, ", ".join(APPS)))
    for name in wanted:
        build(APPS[name])
    print("\nDrag them onto your Dock. Keep them in this folder, next to their .command files.")


if __name__ == "__main__":
    main()
