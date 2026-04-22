# TODO — Statio Plateau

## 1. Lien vers gabfortin.com (en haut à droite) ✅
- [x] Créer le dossier `img/` et y ajouter la photo de profil (`img/Gabriel Fortin.png`)
- [x] Ajouter dans la navbar un lien `<a href="https://gabfortin.com">` avec avatar rond + texte
- [x] Styliser le lien (discret, positionné en haut à droite, texte masqué sur très petit écran)

---

## 2. Sélection d'un parking — effets visuels sur la carte

### Rétrécissement des autres icônes ✅
- [x] Au clic sur un marqueur parking, réduire la taille de tous les autres marqueurs de parking

### Mise en valeur des pistes cyclables à proximité
- [ ] Identifier ou charger un layer GeoJSON des pistes cyclables (ex. données ouvertes Montréal)
- [ ] Au clic sur un parking, filtrer et afficher uniquement les segments de pistes cyclables dans un rayon raisonnable (ex. ~1 km)
- [ ] Styliser les pistes mises en valeur (couleur distincte, épaisseur plus grande)
- [ ] Masquer ou atténuer les pistes hors proximité

### Affichage des stations Bixi à proximité (<15 min de marche, ~1 km)
- [ ] Charger les données des stations Bixi (API ou GeoJSON statique)
- [ ] Au clic sur un parking, filtrer les stations Bixi dans un rayon de ~1 km (~15 min de marche)
- [ ] Afficher ces stations sur la carte avec un marqueur distinctif (icône Bixi)
- [ ] Masquer les stations Bixi quand aucun parking n'est sélectionné

---

## 3. Cercles de distance autour du parking sélectionné ✅
- [x] Au clic sur un parking, dessiner deux cercles centrés sur ce parking :
  - **Cercle vert** : rayon 1 km (~15 min de marche à ~4 km/h)
  - **Cercle bleu** : rayon 3,75 km (~15 min à vélo à ~15 km/h)
- [x] Supprimer les cercles lors de la désélection (clic ailleurs ou sur un autre parking)

---

## 4. Visibilité réduite pour les stationnements sans info ✅
- [x] Règle : un parking est « complètement inconnu » s'il n'a ni horaire, ni places, ni adresse, ni notes (type=inconnu)
- [x] Pour ces parkings, marqueur plus petit (18×26 px) et opacité 35%
- [x] Un parking avec tarif inconnu mais autres infos conserve la taille normale

---

## 5. Icône de l'application ✅
- [x] Créé `img/icon.svg` : roundrect `#1a1a2e` avec emoji 🚗
- [x] Ajouté `<link rel="icon">` dans `index.html`
- [x] Icône visible dans la barre principale (header-brand)

---

## 6. Bannière « En développement » ✅
- [x] Bannière fixe en bas, fond jaune `#facc15`, icône 🚧 + texte
- [x] `main` a un padding-bottom de 52px pour ne pas être masqué par la bannière
