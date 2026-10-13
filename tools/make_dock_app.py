#!/usr/bin/env python3
"""Make "Publish an article.app" so the publisher can live in the Dock.

    python3 tools/make_dock_app.py

The app is a tiny launcher that opens "Publish an article.command" (which must stay in the
same folder as the app) in Terminal. It has its own icon: a blue rounded square with a white
dot and a plus. Needs the macOS tools osacompile, sips, iconutil and codesign. Nothing is installed
anywhere else, and the finished app is not committed to git (it is in .gitignore).
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
APP = ROOT / "Publish an article.app"
SIZE = 1024
COBALT_TOP = (0x3B, 0x82, 0xF7)
COBALT_BOTTOM = (0x1D, 0x5F, 0xE0)
WHITE = (255, 255, 255)

SCRIPT = '''-- Opens the johnplusnews publisher in Terminal.
set appPath to POSIX path of (path to me)
set projectDir to do shell script "dirname " & quoted form of appPath
set launcher to projectDir & "/Publish an article.command"
try
	do shell script "test -f " & quoted form of launcher
on error
	display dialog "I could not find \\"Publish an article.command\\" next to this app. Please keep this app inside the johnplusnews folder." buttons {"OK"} default button "OK" with icon caution
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


def draw_icon():
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
            r, g, b = (COBALT_TOP[i] + (COBALT_BOTTOM[i] - COBALT_TOP[i]) * t for i in range(3))
            a_dot = coverage(math.hypot(px - c, py - c) - 215)
            r, g, b = (v + (w - v) * a_dot for v, w in zip((r, g, b), WHITE))
            a_plus = max(coverage(rounded_box(px, py, c, c, 118, 30, 30)), coverage(rounded_box(px, py, c, c, 30, 118, 30))) * a_dot
            r, g, b = (v + (k - v) * a_plus for v, k in zip((r, g, b), COBALT_BOTTOM))
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


def main():
    for tool in ("osacompile", "sips", "iconutil", "codesign"):
        if not shutil.which(tool):
            sys.exit("This needs the macOS tool '{}', which was not found.".format(tool))
    work = Path(tempfile.mkdtemp(prefix="jpn-icon-"))
    try:
        print("Drawing the icon...")
        master = work / "master.png"
        write_png(master, draw_icon())
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
        script.write_text(SCRIPT, encoding="utf-8")
        if APP.exists():
            shutil.rmtree(APP)
        run(["osacompile", "-o", str(APP), str(script)])
        shutil.copy2(icns, APP / "Contents" / "Resources" / "applet.icns")
        # osacompile points the app at a built-in icon in Assets.car; remove that so our icon is the one used.
        plist = APP / "Contents" / "Info.plist"
        subprocess.run(["/usr/libexec/PlistBuddy", "-c", "Delete :CFBundleIconName", str(plist)], capture_output=True)
        (APP / "Contents" / "Resources" / "Assets.car").unlink(missing_ok=True)
        # Changing the contents broke the app's seal, so sign it again (a plain local signature, nothing is sent anywhere).
        run(["codesign", "--force", "--deep", "--sign", "-", str(APP)])
        APP.touch()
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print("Done: {}".format(APP))
    print("Drag it onto your Dock. Keep it in this folder, next to 'Publish an article.command'.")


if __name__ == "__main__":
    main()
