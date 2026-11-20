#!/usr/bin/env python3
"""Ajoute une empreinte du contenu aux URL des fichiers d'une page
(style.css?v=…, app.js?v=…), pour les sites sans hook de version.

GitHub Pages laisse les navigateurs garder les fichiers 10 minutes en cache :
juste après une mise en ligne, un visiteur pourrait recevoir le nouveau app.js
avec l'ancien style.css (ou l'inverse). Une URL qui change avec le contenu rend
ce mélange impossible.

Modèle unique : ~/Developer/outils/communs/stamp_assets.py, copié tel quel dans
scripts/ de chaque site (ne pas modifier la copie). Réglages du site, dans
scripts/stamp_assets.json :

    {
      "page": "index.html",
      "fichiers": ["css/style.css", "js/app.js", "vendor/carte/carte.js"],
      "dater_donnees": true
    }

  page           la page dont on réécrit les URL (une seule référence par fichier)
  fichiers       chemins relatifs à la racine du site, tels qu'écrits dans la page
  dater_donnees  facultatif : si data/ a des changements non commités, lancer
                 scripts/date_donnees.py (date des données affichée par la carte)

À lancer avant de commiter un changement à l'un de ces fichiers :
    python3 scripts/stamp_assets.py

Sans dépendance : Python 3 seulement.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGLAGES = Path(__file__).resolve().with_suffix(".json")


def main():
    if not REGLAGES.exists():
        sys.exit(f"Réglages introuvables : {REGLAGES.relative_to(ROOT)}")
    reglages = json.loads(REGLAGES.read_text(encoding="utf-8"))
    page = ROOT / reglages["page"]
    html = page.read_text(encoding="utf-8")
    for nom in reglages["fichiers"]:
        empreinte = hashlib.sha256((ROOT / nom).read_bytes()).hexdigest()[:10]
        motif = rf'((?:href|src)="){re.escape(nom)}(?:\?v=[^"]*)?(")'
        html, n = re.subn(motif, rf"\g<1>{nom}?v={empreinte}\g<2>", html)
        if n != 1:
            sys.exit(f"{nom} : une seule référence attendue dans {reglages['page']}, {n} trouvée(s)")
        print(f"{nom}?v={empreinte}")
    page.write_text(html, encoding="utf-8")
    if reglages.get("dater_donnees"):
        dater_donnees()


def dater_donnees():
    """Met data/meta.json à la date du jour si un autre fichier de data/ a changé."""
    try:
        sortie = subprocess.run(["git", "status", "--porcelain", "--", "data/"], cwd=ROOT,
                                capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        print("data/meta.json : git indisponible, date des données inchangée")
        return
    changements = [l[3:] for l in sortie.splitlines() if l[3:].strip() != "data/meta.json"]
    if changements:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "date_donnees.py")], check=True)


if __name__ == "__main__":
    main()
