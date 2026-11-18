"""Build "PM Glyphs", a tiny pixel font holding the site's arrows and symbols.

None of the brand webfonts (Fraunces, Geist, Geist Mono, Pixelify Sans) ship
arrows, so without this font they fall back to whatever the OS has. This
font is limited by unicode-range to these code points only, and draws them
on the same pixel grid as the mascot.

    python3 tools/build-glyphs.py   ->  public/fonts/pm-glyphs.woff2
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
CELL = 100          # 7x7 grid → 700 units tall, sits on the baseline
LSB = 60
ADV = 7 * CELL + 2 * LSB

GLYPHS = {
    "arrowright": (0x2192, """
.......
...#...
....#..
#######
....#..
...#...
......."""),
    "arrowleft": (0x2190, """
.......
...#...
..#....
#######
..#....
...#...
......."""),
    "arrowup": (0x2191, """
...#...
..###..
.#.#.#.
#..#..#
...#...
...#...
...#..."""),
    "arrowdown": (0x2193, """
...#...
...#...
...#...
#..#..#
.#.#.#.
..###..
...#..."""),
    "arrownortheast": (0x2197, """
..#####
.....##
....#.#
...#..#
..#....
.#.....
#......"""),
    "checkmark": (0x2713, """
.......
......#
.....#.
#...#..
.#.#...
..#....
......."""),
    "sparkle": (0x273A, """
#..#..#
.#.#.#.
..###..
#######
..###..
.#.#.#.
#..#..#"""),
}


def draw(rows):
    pen = TTGlyphPen(None)
    rows = [r for r in rows.strip("\n").split("\n")]
    h = len(rows)
    # merge horizontal runs into rectangles (fewer contours, no seams)
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] == "#":
                x0 = x
                while x < len(row) and row[x] == "#":
                    x += 1
                top = (h - y) * CELL - 20  # optical: lift slightly toward x-height centre
                bot = top - CELL
                l, r = LSB + x0 * CELL, LSB + x * CELL
                pen.moveTo((l, bot)); pen.lineTo((l, top)); pen.lineTo((r, top)); pen.lineTo((r, bot)); pen.closePath()
            else:
                x += 1
    return pen.glyph()


def main():
    order = [".notdef", "space"] + list(GLYPHS)
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {0x20: "space"}
    cmap.update({cp: name for name, (cp, _) in GLYPHS.items()})
    fb.setupCharacterMap(cmap)
    empty = TTGlyphPen(None).glyph()
    glyf = {".notdef": empty, "space": empty}
    glyf.update({name: draw(rows) for name, (_, rows) in GLYPHS.items()})
    fb.setupGlyf(glyf)
    metrics = {name: (ADV, LSB) for name in order}
    metrics["space"] = (300, 0)
    metrics[".notdef"] = (ADV, 0)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-250)
    fb.setupNameTable({"familyName": "PM Glyphs", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-250, usWinAscent=900, usWinDescent=250)
    fb.setupPost()
    out = Path(__file__).resolve().parent.parent / "public" / "fonts" / "pm-glyphs.woff2"
    out.parent.mkdir(parents=True, exist_ok=True)
    fb.font.flavor = "woff2"
    fb.save(out)
    ranges = ",".join(f"U+{cp:04X}" for cp, _ in GLYPHS.values())
    print(f"wrote {out} ({out.stat().st_size} bytes)  unicode-range: {ranges}")


if __name__ == "__main__":
    main()
