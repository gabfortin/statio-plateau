# TODO — Statio Plateau

## 1. Lien vers gabfortin.com (en haut à droite) ✅
- [x] Photo de profil dans `img/avatar.jpg` (112 px, 4 Ko)
- [x] Avatar rond cliquable vers `https://gabfortin.com` dans la barre du haut
- [x] Carte « Conçu par » dans la section À propos, avec titre d'élu et liens vers les profils

---

## 2. Sélection d'un parking — effets visuels sur la carte

### Rétrécissement des autres icônes ✅
- [x] Au clic sur un marqueur, les autres deviennent de petites pastilles rondes
- [x] Le marqueur sélectionné grossit et reçoit un anneau pulsé

### Mise en valeur des pistes cyclables à proximité ✅
- [x] Charger les pistes cyclables depuis OpenStreetMap (instantané `data/cycling.json`, mis à jour via Overpass)
- [x] Au clic sur un parking, mettre en évidence les segments dans un rayon de 2,5 km
- [x] Styliser les pistes mises en valeur (trait plein, plus épais, plus opaque)
- [x] Atténuer les pistes hors proximité

### Affichage des stations Bixi à proximité (<15 min de marche, ~1 km)
- [ ] Charger les données des stations Bixi (API GBFS ou GeoJSON statique)
- [ ] Au clic sur un parking, filtrer les stations Bixi dans un rayon de ~1 km (~15 min de marche)
- [ ] Afficher ces stations sur la carte avec un marqueur distinctif (icône Bixi)
- [ ] Masquer les stations Bixi quand aucun parking n'est sélectionné

---

## 3. Cercles de distance autour du parking sélectionné ✅
- [x] Au clic sur un parking, dessiner deux cercles centrés sur ce parking :
  - **Cercle bleu** : rayon 1 km (~15 min de marche)
  - **Cercle vert** : rayon 2,5 km (~10 min à vélo)
- [x] Étiquettes « 🚶 15 min » et « 🚴 10 min » sur les cercles
- [x] Supprimer les cercles lors de la désélection (clic ailleurs ou sur un autre parking)

---

## 4. Visibilité réduite pour les stationnements sans info ✅
- [x] Règle : un parking est « complètement inconnu » s'il n'a ni horaire, ni places, ni adresse, ni notes (type=inconnu)
- [x] Pour ces parkings, goutte plus petite (22 px au lieu de 30 px) et opacité 75 %
- [x] Un parking avec tarif inconnu mais autres infos conserve la taille normale

---

## 5. Icône de l'application ✅
- [x] `img/icon.svg` : carré arrondi en dégradé indigo avec un « P », assorti aux icônes de gabfortin.com/cartes
- [x] Utilisée dans la barre du haut, comme favicon, icône iPhone/Android et dans l'image de partage

---

## 6. Mention « en développement » ✅
- [x] Pastille « Bêta » à côté du sous-titre (remplace l'ancienne bannière jaune fixe)
