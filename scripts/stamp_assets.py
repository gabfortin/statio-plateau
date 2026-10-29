#!/usr/bin/env python3
"""Add a content hash to asset URLs in index.html (style.css?v=…, app.js?v=…).

GitHub Pages lets browsers cache files for 10 minutes, so right after a deploy a
visitor can get the new app.js with the old style.css (e.g. unstyled map pins).
A URL that changes with the file's content makes that mix-up impossible.

Run before committing whenever style.css or app.js changed:
    python3 scripts/stamp_assets.py
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ["style.css", "app.js"]


def main():
    index = ROOT / "index.html"
    html = index.read_text()
    for name in ASSETS:
        digest = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()[:10]
        pattern = rf'((?:href|src)="){re.escape(name)}(?:\?v=[^"]*)?(")'
        html, count = re.subn(pattern, rf"\g<1>{name}?v={digest}\g<2>", html)
        if count != 1:
            raise SystemExit(f"expected exactly one reference to {name} in index.html, found {count}")
        print(f"{name}?v={digest}")
    index.write_text(html)


if __name__ == "__main__":
    main()
