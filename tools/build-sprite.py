"""
Pocketmelon mascot — pixel sprite source of truth.

Hand-authored from the brand logo (cat in a stitched pocket, holding a
watermelon slice). Every animatable part lives on its own layer so the
runtime (src/modules/pixelcat.js) can blink, twitch, nibble and bite.

Run:  python3 tools/build-sprite.py
Outputs:
  src/modules/cat-sprite.json   layer data consumed by the runtime
  public/favicon.svg            static mark as crisp SVG rects
  public/brand/pocketmelon-mark.svg
  .arena/logo/preview.png       (dev preview, optional — needs Pillow)
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = H = 44

PALETTE = {
    "k": "#2b2421",  # ink outline
    "o": "#f6b98a",  # peach fur
    "c": "#fff4e2",  # cream fur
    "w": "#ffffff",  # eye shine
    "p": "#f2877a",  # ear inner / blush
    "n": "#ef6a5d",  # nose
    "r": "#f26d60",  # melon flesh
    "R": "#f99b8c",  # flesh highlight
    "e": "#fff1dc",  # rind (cream)
    "g": "#6b8a4e",  # pocket
    "G": "#536f3b",  # pocket outline
    "t": "#fdf3df",  # stitches
    "s": "#2b2421",  # seeds
    "x": "#f2877a",  # sparkle coral
    "y": "#6b8a4e",  # sparkle green
}


def row(*parts):
    return "".join(parts)


def interior(s):
    assert len(s) == 22, (len(s), s)
    return ".k" + s + "k."


# ---------------------------------------------------------------- head (26w)
head = [
    row(".kk", "." * 20, "kk."),
    row(".kok", "." * 18, "kok."),
    row(".kpok", "." * 16, "kopk."),
    row(".kppok", "." * 14, "koppk."),
    row(".kpppo", "k" * 14, "opppk."),
    interior("pp" + "o" * 8 + "cc" + "o" * 8 + "pp"),
    interior("p" + "o" * 8 + "cccc" + "o" * 8 + "p"),
    interior("o" * 8 + "c" * 6 + "o" * 8),
    interior("o" * 6 + "c" * 10 + "o" * 6),
    interior("o" * 4 + "c" * 14 + "o" * 4),
    interior("ooo" + "c" * 16 + "ooo"),           # r10 eyes live on their own layer
    interior("oo" + "c" * 18 + "oo"),
    interior("oo" + "c" * 8 + "nn" + "c" * 8 + "oo"),
    interior("o" + "cc" + "pp" + "c" * 12 + "pp" + "cc" + "o"),
    interior("o" + "c" * 20 + "o"),
    interior("o" + "c" * 20 + "o"),
    interior("c" * 22),
    interior("c" * 22),
]
for r in head:
    assert len(r) == 26, (len(r), r)

# eyes: 2x3, placed at head cols 7 and 17, row 10
eye_open = ["wk", "kk", "kk"]
eye_blink = ["..", "..", "kk"]
eye_happy = ["....", ".kk.", "k..k"]   # 4 wide, offset -1

# mouth variants: 6 wide, placed at head col 10, row 13
mouth_w = ["k.kk.k", ".k..k."]
mouth_open = ["..kk..", ".kppk.", "..kk.."]
mouth_chew = ["......", ".kkkk."]

# whiskers: drawn relative to head (cols -2..1 and 24..27) at rows 11,13,15
whisker_rows = [11, 13, 15]

# paws 6x5
paw = [
    ".kkkk.",
    "kcccck",
    "kckckk",
    ".kkkk.",
]
paw_r = [
    ".kkkk.",
    "kcccck",
    "kkckck",
    ".kkkk.",
]

# ---------------------------------------------------------------- melon 26x12
MW, MH = 30, 13


def melon():
    rows = []
    cx, rx, ry = 15.0, 15.0, 13.4
    for y in range(MH):
        line = ""
        for x in range(MW):
            px, py = x + 0.5, y + 0.5
            outer = ((px - cx) / rx) ** 2 + (py / ry) ** 2 <= 1
            inner = ((px - cx) / (rx - 2)) ** 2 + (py / (ry - 2)) ** 2 <= 1
            if not outer:
                line += "."
            elif not inner:
                line += "e"
            elif y == 0:
                line += "R"
            else:
                line += "r"
        rows.append(line)
    seeds = [(7, 2), (8, 3), (22, 2), (21, 3), (11, 5), (11, 6), (18, 5), (18, 6), (14, 9), (15, 9)]
    rows = [list(r) for r in rows]
    for x, y in seeds:
        rows[y][x] = "s"
    return ["".join(r) for r in rows]


melon_rows = melon()

# ---------------------------------------------------------------- pocket 34x22
PW, PH = 34, 22


def pocket():
    cx = PW / 2

    def inside(x, y, inset=0):
        px, py = x + 0.5, y + 0.5
        hw = cx - inset
        if py < inset:
            return False
        flat = 9
        if py <= flat:
            return abs(px - cx) <= hw
        ry = (PH - flat) - inset
        k = (py - flat) / ry
        if k > 1:
            return False
        return abs(px - cx) <= hw * math.sqrt(1 - k * k)

    grid = [["." for _ in range(PW)] for _ in range(PH)]
    for y in range(PH):
        for x in range(PW):
            if inside(x, y):
                edge = any(
                    not (0 <= x + dx < PW and 0 <= y + dy < PH and inside(x + dx, y + dy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                ) or y == 0
                grid[y][x] = "G" if edge else "g"
    # dashed stitch ring, 3px in
    ring = [
        (x, y)
        for y in range(PH)
        for x in range(PW)
        if inside(x, y, 2.6) and not inside(x, y, 3.6) and y > 3
    ]
    ring.sort(key=lambda p: math.atan2(p[1] - 2, p[0] + 0.5 - cx))
    for i, (x, y) in enumerate(ring):
        if (i // 2) % 2 == 0:
            grid[y][x] = "t"
    return ["".join(r) for r in grid]


pocket_rows = pocket()

sparkles = {
    "big": ["..x..", "..x..", "xxxxx", "..x..", "..x.."],
    "mid": [".x.", "xxx", ".x."],
    "dot": ["x"],
}

layout = {
    "head": [9, 4],
    "eyes": [[7, 10], [17, 10]],   # relative to head
    "mouth": [10, 13],             # relative to head
    "melon": [7, 21],
    "pocket": [5, 21],
    "paws": [[10, 19], [28, 19]],
    "sparkles": [
        {"x": 0, "y": 18, "color": "x", "size": "big"},
        {"x": 38, "y": 8, "color": "y", "size": "big"},
        {"x": 39, "y": 16, "color": "x", "size": "mid"},
    ],
    "whiskers": whisker_rows,
}

data = {
    "w": W,
    "h": H,
    "palette": PALETTE,
    "layout": layout,
    "head": head,
    "eyes": {"open": eye_open, "blink": eye_blink, "happy": eye_happy},
    "mouth": {"w": mouth_w, "open": mouth_open, "chew": mouth_chew},
    "paw": paw,
    "pawR": paw_r,
    "melon": melon_rows,
    "pocket": pocket_rows,
    "sparkles": sparkles,
}


# ---------------------------------------------------------------- compose static
def compose(eyes="open", mouth="w"):
    g = [[None] * W for _ in range(H)]

    def stamp(rows, ox, oy, color=None):
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch != "." and 0 <= ox + x < W and 0 <= oy + y < H:
                    g[oy + y][ox + x] = color or ch

    stamp(pocket_rows, *layout["pocket"])
    hx, hy = layout["head"]
    stamp(head, hx, hy)
    for ex, ey in layout["eyes"]:
        stamp(data["eyes"][eyes], hx + ex, hy + ey)
    stamp(data["mouth"][mouth], hx + layout["mouth"][0], hy + layout["mouth"][1])
    for wy in whisker_rows:
        stamp(["kkk"], hx - 2, hy + wy)
        stamp(["kkk"], hx + 25, hy + wy)
    stamp(melon_rows, *layout["melon"])
    stamp(paw, *layout["paws"][0])
    stamp(paw_r, *layout["paws"][1])
    for s in layout["sparkles"]:
        stamp(sparkles[s["size"]], s["x"], s["y"], s["color"])
    return g


def to_svg(g, pad=0, bg=None):
    rects = []
    for y in range(H):
        x = 0
        while x < W:
            ch = g[y][x]
            if ch is None:
                x += 1
                continue
            run = 1
            while x + run < W and g[y][x + run] == ch:
                run += 1
            rects.append(f'<rect x="{x+pad}" y="{y+pad}" width="{run}" height="1" fill="{PALETTE[ch]}"/>')
            x += run
    size = W + pad * 2
    bgrect = f'<rect width="{size}" height="{size}" rx="{size*0.22:.1f}" fill="{bg}"/>' if bg else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" shape-rendering="crispEdges">'
        + bgrect + "".join(rects) + "</svg>"
    )


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "src/modules"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "public/brand"), exist_ok=True)
    with open(os.path.join(ROOT, "src/modules/cat-sprite.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    g = compose()
    with open(os.path.join(ROOT, "public/favicon.svg"), "w") as f:
        f.write(to_svg(g, pad=3, bg="#fdf9ef"))
    with open(os.path.join(ROOT, "public/brand/pocketmelon-mark.svg"), "w") as f:
        f.write(to_svg(g))
    try:
        from PIL import Image

        S = 12
        img = Image.new("RGB", (W * S, H * S), (253, 249, 239))
        for y in range(H):
            for x in range(W):
                ch = g[y][x]
                if ch:
                    c = PALETTE[ch]
                    col = tuple(int(c[i : i + 2], 16) for i in (1, 3, 5))
                    for yy in range(S):
                        for xx in range(S):
                            img.putpixel((x * S + xx, y * S + yy), col)
        os.makedirs(os.path.join(ROOT, ".arena/logo"), exist_ok=True)
        img.save(os.path.join(ROOT, ".arena/logo/preview.png"))
    except ImportError:
        pass
    print("sprite built")
