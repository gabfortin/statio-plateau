# Stationnement Plateau-Mont-Royal

Carte interactive des stationnements hors rue publics du Plateau-Mont-Royal, à
Montréal : tarif, heures, nombre de places, et ce qu'il y a autour à pied ou à
vélo. Pour les résident·es et les visiteur·euses qui cherchent où se garer.
Données OpenStreetMap, affichées instantanément depuis un instantané intégré au
site et mises à jour en arrière-plan.

**En ligne :** [parking.gabfortin.com](https://parking.gabfortin.com)

## Contenu

| Élément | Ce qu'il fait |
|---|---|
| **Carte** | Marqueurs en goutte colorés par tarif, comme les cartes Avant / Après et Montréal Accessible ; le pictogramme ($ ou P) double la couleur |
| **Filtres** | Gratuit · Mixte · Payant · Inconnu, avec le nombre de stationnements par catégorie |
| **Panneau latéral** | Liste cliquable, triée par distance avec la géolocalisation ; repliable (burger), en surimpression sur téléphone |
| **Fiche d'un stationnement** | Adresse, tarif, heures, nombre de places, lien d'itinéraire |
| **Au clic** | Rayons de 15 min à pied (1 km) et de 10 min à vélo (2,5 km), pistes cyclables à proximité mises en évidence |
| **Bouton « i »** | Fenêtre « À propos », FAQ, signature et lien Confidentialité |

Mode sombre selon l'appareil. Accessibilité : liens d'évitement, vrais
boutons, focus gardé dans la fenêtre et déplacé dans les popups au clavier,
mouvement réduit.

## Données

### Sources

| Source | Producteur, licence | Utilisée pour |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org), via l'[API Overpass](https://overpass-api.de) | Contributeurs d'OpenStreetMap, ODbL | Stationnements hors rue et pistes cyclables (`data/`) |

### Mise à jour

**Automatique**, chaque lundi à 8 h 17 (UTC), par
[`.github/workflows/update-osm-data.yml`](.github/workflows/update-osm-data.yml) :
lance `scripts/update_osm_data.py`, puis, si `data/` a changé, commite
(`data: mise à jour hebdomadaire (AAAA-MM-JJ)`) et publie.

**Dans le navigateur** : au chargement, la carte affiche l'instantané de
`data/`, puis tente de le mettre à jour par Overpass. Si Overpass est
injoignable (ce qui arrive souvent), l'instantané reste affiché, sans erreur.

**À la main** : `python3 scripts/update_osm_data.py`. Les requêtes Overpass
sont écrites à la fois dans `app.js` et dans ce script : les garder identiques.

### Mises en garde

- Les données d'OpenStreetMap sont de qualité variable : à valider sur le
  terrain avant de s'y fier.
- Initiative indépendante : ni produite ni approuvée par l'arrondissement ni
  par la Ville de Montréal.

## Utilisation locale

```bash
python3 -m http.server 8000   # http://localhost:8000
```

Un serveur est nécessaire : le chargement des données ne fonctionne pas en `file://`.

## Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | Page, métadonnées SEO, JSON-LD, FAQ (dans la fenêtre « À propos ») |
| `confidentialite.html` | Politique de confidentialité (Loi 25), même style que la carte |
| `app.js` | Carte, chargement des données, filtres, géolocalisation |
| `style.css` | Jetons et composants `gf-` du système de cartes, marqueurs, mode sombre |
| `data/` | Instantané OSM (stationnements, pistes cyclables) |
| `vendor/leaflet-1.9.4/` | Leaflet hébergé dans le dépôt, sans CDN |
| `fonts/` | Inter et Poppins hébergées dans le dépôt (licences OFL incluses) |
| `scripts/update_osm_data.py` | Rafraîchit l'instantané depuis Overpass |
| `scripts/stamp_assets.py` | Écrit les empreintes `?v=` de `style.css` et `app.js` dans `index.html` |
| `img/` | Icônes, avatar, image de partage (`og.jpg`) |
| `llms.txt`, `robots.txt`, `sitemap.xml`, `manifest.webmanifest` | Référencement et installation sur téléphone |

Carte au [système de design des cartes](../MAP-DESIGN-SYSTEM.md), dialecte
`gf-` ; **référence du mode sombre des cartes**. Décisions de la mise aux
normes : [NOTES.md](NOTES.md).

## Publication

GitHub Pages, branche `main`, domaine dans `CNAME`.

Avant de commiter un changement à `style.css` ou `app.js` :

```bash
python3 scripts/stamp_assets.py
```

Sinon, un visiteur peut recevoir le nouveau JS avec l'ancien CSS pendant les
10 minutes de cache de GitHub Pages. (Ce site n'a pas encore le numéro de
version x.y.z des autres sites.) Le robot a besoin de *Settings → Actions →
General → Workflow permissions → Read and write permissions*.

## Confidentialité

Aucun cookie ni compte.

| Quand | Ce qui est envoyé | À qui |
|---|---|---|
| Chaque visite | Page, site d'origine, appareil, pays | GoatCounter (mesure d'audience anonyme) |
| Chaque visite | Requête de mise à jour des données | API Overpass (overpass-api.de, ou overpass.kumi.systems en secours) |
| Carte | Requêtes de tuiles de la zone affichée | OpenStreetMap |
| Tri par distance | Rien : la position reste dans le navigateur | — |
| Clic sur « Itinéraire » | Coordonnées du stationnement choisi (pas la position de la personne) | Google Maps |

Détails : [confidentialite.html](confidentialite.html), à mettre à jour (avec
sa date) si un service externe est ajouté.

## Crédits

- [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2-Clause), hébergé dans `vendor/`
- Polices [Inter](https://rsms.me/inter/) et [Poppins](https://github.com/itfoundry/Poppins) (SIL OFL 1.1), hébergées dans `fonts/`
- Données et fond de carte © les contributeurs d'[OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL)

## Auteur

Développé par [Gabriel Fortin](https://gabfortin.com), conseiller
d'arrondissement du Plateau-Mont-Royal (district de Jeanne-Mance). Projet
personnel, non officiel.

## Documentation détaillée

| Fichier | Contenu |
|---|---|
| [NOTES.md](NOTES.md) | Décisions de la mise aux normes de design (novembre 2026) |
| [A-FAIRE.md](A-FAIRE.md) | Liste des travaux, faits et à faire |
