# Stationnement Plateau-Mont-Royal

Carte interactive des stationnements hors rue publics du Plateau-Mont-Royal, à Montréal. Données OpenStreetMap, affichées instantanément à partir d'un instantané intégré au site et mises à jour en arrière-plan.

**En ligne :** [parking.gabfortin.com](https://parking.gabfortin.com)

## Fonctionnalités

- Carte plein écran avec panneaux translucides (feuille coulissante sur mobile, colonne latérale sur desktop) et mode sombre automatique
- Marqueurs en goutte colorés par tarif, dans le style des cartes [Avant / Après](https://avant-apres.ca) et [carte-au](https://carte-au.gabfortin.com)
- Filtres : Gratuit · Mixte · Payant · Inconnu, avec le nombre de stationnements par catégorie
- Tri par distance avec géolocalisation
- Infos par stationnement : adresse, tarif, heures, nombre de places, lien d'itinéraire
- Au clic sur un stationnement : rayons de 15 min à pied (1 km) et 10 min à vélo (2,5 km), pistes cyclables à proximité mises en évidence
- Section À propos / FAQ, données structurées (JSON-LD), `llms.txt`, `sitemap.xml` et manifest pour l'installation sur téléphone

## Données

Un instantané des données OSM est versionné dans [`data/`](data/) et affiché immédiatement. Au chargement, l'app tente de le mettre à jour via l'API Overpass en arrière-plan ; si Overpass est injoignable (ce qui arrive souvent), l'instantané reste affiché, sans erreur.

L'instantané est rafraîchi chaque lundi par la GitHub Action [`update-osm-data`](.github/workflows/update-osm-data.yml), ou à la main :

```bash
python3 scripts/update_osm_data.py
```

Les requêtes Overpass sont définies à la fois dans `app.js` et dans ce script : les garder synchronisées.

Les données proviennent d'OpenStreetMap et sont de qualité variable. À valider sur le terrain avant de s'y fier.

## Utilisation locale

Requiert un serveur local (le chargement des données ne fonctionne pas via `file://`) :

```bash
python3 -m http.server 8765
```

Puis ouvrir [http://localhost:8765](http://localhost:8765).

## Déploiement

Le site est servi par GitHub Pages depuis la branche `main` (domaine dans `CNAME`).

Avant de commiter un changement à `style.css` ou `app.js`, mettre à jour leurs empreintes dans `index.html` :

```bash
python3 scripts/stamp_assets.py
```

Sinon, un visiteur peut recevoir le nouveau JS avec l'ancien CSS pendant les 10 minutes de cache de GitHub Pages.

Pour que la GitHub Action puisse commiter l'instantané : *Settings → Actions → General → Workflow permissions → Read and write permissions*.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Page, métadonnées SEO, JSON-LD, FAQ |
| `app.js` | Carte, chargement des données, filtres, géolocalisation |
| `style.css` | Design (panneaux translucides, pins, mode sombre) |
| `data/` | Instantané OSM (stationnements, pistes cyclables) |
| `vendor/leaflet-1.9.4/` | Leaflet hébergé localement, pour ne dépendre d'aucun CDN |
| `scripts/update_osm_data.py` | Rafraîchit l'instantané depuis Overpass |
| `scripts/stamp_assets.py` | Versionne `style.css` et `app.js` dans `index.html` |
| `img/` | Icônes, avatar, image de partage (`og.jpg`) |
| `llms.txt`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest` | Référencement et installation |

## Technologies

- [Leaflet](https://leafletjs.com) 1.9.4, hébergé dans `vendor/`
- [OpenStreetMap](https://www.openstreetmap.org) : tuiles de carte et données, via l'[API Overpass](https://overpass-api.de)
- HTML, CSS et JavaScript sans framework ni étape de build

## Auteur

Conçu par [Gabriel Fortin](https://gabfortin.com), conseiller d'arrondissement du Plateau-Mont-Royal (district de Jeanne-Mance). Projet personnel, non officiel : ce site n'est pas un service de l'arrondissement ni de la Ville de Montréal.
