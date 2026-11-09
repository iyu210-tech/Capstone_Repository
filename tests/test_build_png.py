"""The stdlib PNG writer and the preview images."""

import struct
import zlib

from build_fixtures import REPO, build_site

SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunks(data):
    pos, out = 8, []
    while pos < len(data):
        n = struct.unpack(">I", data[pos:pos + 4])[0]
        tag, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + n]
        crc = struct.unpack(">I", data[pos + 8 + n:pos + 12 + n])[0]
        assert crc == zlib.crc32(tag + body) & 0xFFFFFFFF, tag
        out.append((tag, body))
        pos += 12 + n
    return out


def ihdr(data):
    return struct.unpack(">IIBBBBB", chunks(data)[0][1])


def test_small_png_is_well_formed():
    rgb = bytes([255, 0, 0, 0, 255, 0, 0, 0, 255] * 2)   # 3x2
    data = build_site.png_bytes(3, 2, rgb)
    assert data.startswith(SIGNATURE)
    tags = [t for t, _ in chunks(data)]
    assert tags[0] == b"IHDR" and tags[-1] == b"IEND" and b"IDAT" in tags
    assert ihdr(data) == (3, 2, 8, 2, 0, 0, 0)
    raw = zlib.decompress(b"".join(b for t, b in chunks(data) if t == b"IDAT"))
    assert raw == b"\x00" + rgb[:9] + b"\x00" + rgb[9:]


def test_og_image_is_1200_by_630():
    data = build_site.og_image("Forces & <vectors>", "Physics HL * Theme A",
                               "projectile", build_site.ACCENT)
    assert data.startswith(SIGNATURE)
    assert ihdr(data)[:2] == (1200, 630)


def test_every_demo_shape_draws():
    for demo in ("taylor", "projectile", "boltzmann", "orbitals", None, "unknown"):
        assert ihdr(build_site.og_image("T", "S", demo, build_site.ACCENT))[:2] == (1200, 630)


def test_font_covers_what_titles_use():
    assert build_site.font_text("Electron orbitals — shapes, 4s¹") == "ELECTRON ORBITALS - SHAPES, 4S1"
    assert build_site.font_text("café · x") == "CAFE * X"


def test_same_pixels_different_compression_is_not_a_change(tmp_path):
    """A different zlib must not make the committed images look stale in CI."""
    rgb = bytes(range(256)) * 3 * 4
    path = tmp_path / "x.png"
    assert build_site.write_png(path, build_site.png_bytes(64, 16, rgb))
    recompressed = build_site.png_bytes(64, 16, rgb, level=1)
    assert recompressed != path.read_bytes()
    assert not build_site.write_png(path, recompressed)
    assert build_site.write_png(path, build_site.png_bytes(64, 16, bytes(len(rgb))))


def test_committed_previews_are_1200_by_630():
    images = sorted((REPO / "docs" / "og").glob("*.png"))
    assert any(p.stem == "home" for p in images)
    for p in images:
        assert ihdr(p.read_bytes())[:2] == (1200, 630), p.name
