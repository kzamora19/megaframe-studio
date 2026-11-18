#!/usr/bin/env python3
"""Build installed-app PNG icons from the approved user-provided artwork source.

Run from the repository root: python scripts/build_icons.py
This performs image resizing only; it does not redraw or recolor the artwork.
"""
from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "custom-icon-source.webp.base64"
TARGETS = (
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon.png", 180),
)

def main() -> None:
    artwork = base64.b64decode(SOURCE.read_text(encoding="ascii").strip(), validate=True)
    original = Image.open(BytesIO(artwork))
    original.load()
    assert original.size == (256, 256), "Unexpected icon source dimensions"
    assert original.format == "WEBP", "Unexpected icon source format"
    icon_dir = ROOT / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    for filename, size in TARGETS:
        resized = original.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
        target = icon_dir / filename
        resized.save(target, format="PNG", optimize=True)
        print(f"{target.relative_to(ROOT)}: {size}x{size}")

if __name__ == "__main__":
    main()
