#!/usr/bin/env python3
"""Build public/apple-touch-icon.png — the 口 viewfinder mark, rasterised.

Same geometry as public/favicon.svg (viewBox 32, stroke 2.4, square caps), drawn at
180×180 with 3× supersampling so the brackets stay crisp. Pure stdlib (zlib PNG);
no Pillow. Re-run after touching favicon.svg:

    python3 tools/build-touch-icon.py
"""
import struct
import zlib
from pathlib import Path

SIZE = 180
SS = 3  # supersample factor
BG = (13, 15, 18)        # #0d0f12, same as the favicon plate
FG = (239, 235, 227)     # #efebe3

# favicon.svg geometry, viewBox 32 → pixels (×5.625)
K = SIZE / 32
H = 1.2 * K  # half stroke (stroke-width 2.4)

# each arm: (x0, y0, x1, y1) rectangles already including stroke and square caps
STROKES = [
    # top-left: M6 12V6h6
    (6 * K - H, 6 * K, 6 * K + H, 12 * K + H),
    (6 * K, 6 * K - H, 12 * K + H, 6 * K + H),
    # top-right: M20 6h6v6
    (20 * K - H, 6 * K - H, 26 * K, 6 * K + H),
    (26 * K - H, 6 * K, 26 * K + H, 12 * K + H),
    # bottom-right: M26 20v6h-6
    (26 * K - H, 20 * K - H, 26 * K + H, 26 * K),
    (20 * K - H, 26 * K - H, 26 * K, 26 * K + H),
    # bottom-left: M12 26H6v-6
    (6 * K, 26 * K - H, 12 * K + H, 26 * K + H),
    (6 * K - H, 20 * K - H, 6 * K + H, 26 * K),
    # the pip: rect 17 17 5.5 5.5
    (17 * K, 17 * K, 22.5 * K, 22.5 * K),
]


def render():
    n = SIZE * SS
    # supersampled coverage grid: 0 = bg, 1 = fg
    grid = bytearray(n * n)
    for (x0, y0, x1, y1) in STROKES:
        xs0, xs1 = max(0, int(x0 * SS)), min(n, int(x1 * SS + 0.999))
        ys0, ys1 = max(0, int(y0 * SS)), min(n, int(y1 * SS + 0.999))
        for y in range(ys0, ys1):
            row = y * n
            for x in range(xs0, xs1):
                grid[row + x] = 1
    # box downsample
    px = bytearray()
    inv = 1 / (SS * SS)
    for y in range(SIZE):
        for x in range(SIZE):
            c = 0
            for dy in range(SS):
                row = (y * SS + dy) * n + x * SS
                for dx in range(SS):
                    c += grid[row + dx]
            a = c * inv
            px += bytes(
                round(BG[i] + (FG[i] - BG[i]) * a) for i in range(3)
            )
    return bytes(px)


def write_png(path, rgb):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(
        b"\x00" + rgb[y * SIZE * 3 : (y + 1) * SIZE * 3] for y in range(SIZE)
    )
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    Path(path).write_bytes(png)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "public" / "apple-touch-icon.png"
    write_png(out, render())
    print(f"wrote {out} ({out.stat().st_size} bytes)")
