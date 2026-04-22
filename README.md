# Stationnement Plateau-Mont-Royal

Carte interactive des stationnements hors-rue publics du Plateau-Mont-Royal à Montréal. Données en temps réel via OpenStreetMap.

## Fonctionnalités

- Carte interactive avec marqueurs colorés par type de tarif
- Filtres : Gratuit · Mixte · Payant · Inconnu
- Tri par distance avec géolocalisation
- Infos par stationnement : adresse, tarif, heures, nombre de places

## Démo

[Voir l'app sur GitHub Pages](https://gabfortin.github.io/plateau-parking)

## Utilisation locale

Requiert un serveur local (les requêtes API ne fonctionnent pas via `file://`) :

```bash
python3 -m http.server 8765
```

Puis ouvrir [http://localhost:8765](http://localhost:8765).

## Technologies

- [Leaflet.js](https://leafletjs.com) — carte interactive
- [OpenStreetMap](https://www.openstreetmap.org) / [Overpass API](https://overpass-api.de) — données de stationnement
- [CARTO](https://carto.com) — tuiles de carte

## Données

Les données proviennent d'OpenStreetMap et sont de qualité variable. À valider sur le terrain avant de s'y fier.
