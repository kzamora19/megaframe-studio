#!/usr/bin/env python3
"""Stage only approved static PWA files for GitHub Pages. No user files or secrets."""
from pathlib import Path
from shutil import copy2, copytree, rmtree
import sys

root = Path(__file__).resolve().parent.parent
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "_site"
if not destination.is_absolute():
    destination = root / destination
if destination.resolve() == root.resolve():
    raise SystemExit("Refusing to overwrite the repository root")
if destination.exists():
    rmtree(destination)
destination.mkdir(parents=True)

files = [
    "index.html", "manifest.webmanifest", "service-worker.js", "pwa-client.js",
    "editor.js", "shared.js", "cloud-config.js",
    *[f"sample_image-{i}.js" for i in range(6)],
    *[f"gold_image-{i}.js" for i in range(4)],
]
for name in files:
    source = root / name
    if not source.is_file():
        raise SystemExit(f"Missing required deployment file: {name}")
    copy2(source, destination / name)

copytree(root / "icons", destination / "icons")
(destination / ".nojekyll").touch()
print(f"GitHub Pages site staged at {destination} ({len(files)} HTML/JS files + icons)")
