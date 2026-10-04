#!/usr/bin/env python3
"""Generate ChronoPulse AI launcher icons and splash screens for Android.

Dependency free: every asset is rasterised from signed-distance fields and
encoded to PNG with zlib, so this runs on a stock macOS / CI machine without
ImageMagick, librsvg or any npm package.

    python3 scripts/generate-android-assets.py
"""

import math
import os
import struct
import zlib

# Brand palette (matches the web app's tailwind indigo theme).
BRAND_TOP = (0x4F, 0x46, 0xE5)  # indigo-600
BRAND_BOTTOM = (0x63, 0x66, 0xF1)  # indigo-500
GLYPH_COLOR = (0xFF, 0xFF, 0xFF)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RES_DIR = os.path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'res')

# density suffix -> (legacy icon px, adaptive foreground px)
MIPMAP_DENSITIES = [
    ('mdpi', 48, 108),
    ('hdpi', 72, 162),
    ('xhdpi', 96, 216),
    ('xxhdpi', 144, 324),
    ('xxxhdpi', 192, 432),
]

SPLASH_SIZES = [
    ('drawable', 480, 320),
    ('drawable-land-mdpi', 480, 320),
    ('drawable-land-hdpi', 800, 480),
    ('drawable-land-xhdpi', 1280, 720),
    ('drawable-land-xxhdpi', 1600, 960),
    ('drawable-land-xxxhdpi', 1920, 1280),
    ('drawable-port-mdpi', 320, 480),
    ('drawable-port-hdpi', 480, 800),
    ('drawable-port-xhdpi', 720, 1280),
    ('drawable-port-xxhdpi', 960, 1600),
    ('drawable-port-xxxhdpi', 1280, 1920),
]


# --------------------------------------------------------------------------- #
# PNG encoding
# --------------------------------------------------------------------------- #
def write_png(path, width, height, rgba):
    """Write an 8-bit RGBA PNG. ``rgba`` is a flat bytearray of w*h*4 bytes."""
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, payload):
        return (
            struct.pack('>I', len(payload))
            + tag
            + payload
            + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as handle:
        handle.write(png)


# --------------------------------------------------------------------------- #
# Signed-distance fields (all in normalised 0..1 icon space)
# --------------------------------------------------------------------------- #
def sdf_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length_sq = vx * vx + vy * vy
    t = 0.0 if length_sq == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / length_sq))
    return math.hypot(wx - t * vx, wy - t * vy)


def sdf_rounded_box(px, py, half, radius):
    qx = abs(px - 0.5) - (half - radius)
    qy = abs(py - 0.5) - (half - radius)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - radius


def sdf_clock_glyph(px, py):
    """A clock: outer ring plus an hour hand up and a minute hand pointing to 3."""
    distance = math.hypot(px - 0.5, py - 0.5)
    ring = max(0.256 - distance, distance - 0.315)
    hour = sdf_segment(px, py, 0.5, 0.5, 0.5, 0.335) - 0.028
    minute = sdf_segment(px, py, 0.5, 0.5, 0.712, 0.5) - 0.026
    return min(ring, hour, minute)


def coverage(sdf_value, units_per_pixel):
    """Convert an SDF value into 1px-wide antialiased coverage."""
    return max(0.0, min(1.0, 0.5 - sdf_value / units_per_pixel))


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# --------------------------------------------------------------------------- #
# Rasterisers
# --------------------------------------------------------------------------- #
def render_mark(size, glyph_scale=1.0, background=True, shape='square'):
    """Rasterise the brand mark.

    ``background=False`` yields a transparent canvas (used for the adaptive
    icon's foreground layer). ``glyph_scale`` shrinks the mark so it stays
    inside an adaptive icon's guaranteed-visible safe zone.
    """
    buffer = bytearray(size * size * 4)
    units_per_pixel = 1.0 / size
    glyph_units_per_pixel = units_per_pixel / glyph_scale
    inset = (1.0 - glyph_scale) / 2.0

    for y in range(size):
        v = (y + 0.5) * units_per_pixel
        row = y * size * 4
        for x in range(size):
            u = (x + 0.5) * units_per_pixel

            glyph = coverage(
                sdf_clock_glyph((u - inset) / glyph_scale, (v - inset) / glyph_scale),
                glyph_units_per_pixel,
            )

            if background:
                if shape == 'round':
                    plate = coverage(math.hypot(u - 0.5, v - 0.5) - 0.5, units_per_pixel)
                else:
                    plate = coverage(sdf_rounded_box(u, v, 0.5, 0.235), units_per_pixel)
                base = mix(BRAND_TOP, BRAND_BOTTOM, min(1.0, max(0.0, u * 0.45 + v * 0.55)))
                red, green, blue = mix(base, GLYPH_COLOR, glyph)
                alpha = plate
            else:
                red, green, blue = GLYPH_COLOR
                alpha = glyph

            offset = row + x * 4
            buffer[offset] = int(red + 0.5)
            buffer[offset + 1] = int(green + 0.5)
            buffer[offset + 2] = int(blue + 0.5)
            buffer[offset + 3] = int(alpha * 255 + 0.5)

    return buffer


def render_splash(width, height, mark_cache):
    """Indigo gradient canvas with the white mark centred, used as the launch
    theme background."""
    buffer = bytearray(width * height * 4)
    logo_box = int(min(width, height) * 0.45)
    left = (width - logo_box) // 2
    top = (height - logo_box) // 2

    # Fast path: lay down one uniform gradient row at a time (C-level slicing),
    # then only loop over the small square the mark occupies.
    for y in range(height):
        row_color = mix(BRAND_TOP, BRAND_BOTTOM, y / max(1, height - 1))
        row = y * width * 4
        buffer[row:row + width * 4] = (
            bytes((int(row_color[0] + 0.5), int(row_color[1] + 0.5),
                   int(row_color[2] + 0.5), 255)) * width
        )

    if logo_box not in mark_cache:
        mark_cache[logo_box] = render_mark(logo_box, glyph_scale=1.0, background=False)
    mark = mark_cache[logo_box]

    for y in range(logo_box):
        mark_row = y * logo_box * 4
        row_color = mix(BRAND_TOP, BRAND_BOTTOM, (top + y) / max(1, height - 1))
        row = (top + y) * width * 4
        for x in range(logo_box):
            alpha = mark[mark_row + x * 4 + 3]
            if alpha == 0:
                continue
            red, green, blue = mix(row_color, GLYPH_COLOR, alpha / 255.0)
            offset = row + (left + x) * 4
            buffer[offset] = int(red + 0.5)
            buffer[offset + 1] = int(green + 0.5)
            buffer[offset + 2] = int(blue + 0.5)

    return buffer


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def main():
    written = []

    for density, legacy_px, foreground_px in MIPMAP_DENSITIES:
        folder = os.path.join(RES_DIR, 'mipmap-%s' % density)
        write_png(
            os.path.join(folder, 'ic_launcher.png'),
            legacy_px, legacy_px,
            render_mark(legacy_px, glyph_scale=1.0, shape='square'),
        )
        written.append('mipmap-%s/ic_launcher.png' % density)

        write_png(
            os.path.join(folder, 'ic_launcher_round.png'),
            legacy_px, legacy_px,
            render_mark(legacy_px, glyph_scale=1.0, shape='round'),
        )
        written.append('mipmap-%s/ic_launcher_round.png' % density)

        write_png(
            os.path.join(folder, 'ic_launcher_foreground.png'),
            foreground_px, foreground_px,
            render_mark(foreground_px, glyph_scale=0.88, background=False),
        )
        written.append('mipmap-%s/ic_launcher_foreground.png' % density)

    mark_cache = {}
    for folder, width, height in SPLASH_SIZES:
        write_png(
            os.path.join(RES_DIR, folder, 'splash.png'),
            width, height,
            render_splash(width, height, mark_cache),
        )
        written.append('%s/splash.png' % folder)

    print('Generated %d Android assets:' % len(written))
    for entry in written:
        print('  ' + entry)


if __name__ == '__main__':
    main()
