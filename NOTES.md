# Notes : mise aux normes de design (novembre 2026)

L'appli avait son propre design (feuille coulissante en bas sur téléphone,
colonne flottante sur ordinateur, police système, bleu comme couleur
d'accent). Elle suit maintenant le système commun des cartes
(`~/Developer/MAP-DESIGN-SYSTEM.md`), dialecte `gf-`, comme
`pistes-plateau` et `website/cartes/reseau-arteriel`.

## Ce qui a changé

| Avant | Maintenant | Pourquoi |
|---|---|---|
| `.topbar` avec filtres et avatar | `.gf-header` : ← vers gabfortin.com/cartes, marque, géolocalisation, bouton « i » | Bandeau standard ; l'appli est listée sur gabfortin.com/cartes |
| `.sheet` (feuille du bas sur téléphone) | `.gf-sidebar` + burger `.gf-sidebar-toggle` ; sur téléphone, panneau en surimpression avec scrim, fermé par défaut | Choix de Gabriel : norme stricte, carte plein écran sur téléphone |
| Section « À propos / FAQ » au bas de la liste | Modale `.gf-info-overlay` (texte, données, FAQ, fiche de l'auteur, lien Confidentialité) | Patron canonique du bouton « i » |
| Avatar en haut à droite | Badge de crédits `.watermark` en bas à gauche (« Développé par Gabriel Fortin · Confidentialité ») | SIGNATURE-ET-CONFIDENTIALITE.md |
| Police système | Inter + Poppins, hébergées dans `fonts/` | Norme ; hébergées localement plutôt que Google Fonts, dans l'esprit de `vendor/` (aucun CDN) et pour garder la page de confidentialité courte |
| Accent bleu `#2563eb` | Marque indigo `--brand: #4f46e5` (même dégradé que `img/icon.svg`) | Le bleu, le vert et l'orange restent réservés aux catégories (mixte, gratuit, payant) |
| Fiches `<article role="button">` | `<li><button>` | ACCESSIBILITE.md : vrais boutons |
| Pas de GoatCounter ni de confidentialité | GoatCounter dans les deux pages + `confidentialite.html` | Règle 3 du CLAUDE.md commun |

## Mode sombre

La norme disait « les cartes plein écran restent claires ». Gabriel a
décidé que **toutes les cartes ont désormais un mode sombre**, aux couleurs
du dashboard verre (`requetes-311/docs/glass.css`). Statio-plateau est la
première carte à l'appliquer ; la recette est documentée dans
MAP-DESIGN-SYSTEM.md (section « Mode sombre »).

- Toutes les couleurs passent par des jetons redéfinis sous
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`.
- Jetons ajoutés au standard, nécessaires au sombre : `--brand-ink` (texte
  de marque lisible sur verre sombre), `--surface-hover`, `--surface-active`,
  `--chip`, `--hairline`, `--overlay`, `--scrim`, `--map-bg`, `--tile-filter`.
- Tuiles OSM : `invert(1) hue-rotate(180deg) saturate(.35) brightness(.88)
  contrast(.92)`. Les tuiles CARTO sombres demanderaient une clé API.
- Couleurs de catégorie éclaircies en sombre (`--c-gratuit` etc.) pour garder
  le contraste des étiquettes.

## Écarts assumés par rapport au standard

- `--sidebar-w: 340px` au lieu de 260 px : les fiches de stationnement ont
  une adresse, des étiquettes et des heures.
- Le bouton de géolocalisation (`.gf-icon-btn`) est un composant propre à
  l'appli, rond comme le bouton « i » mais en verre.
- La modale « À propos » dépasse les 3 paragraphes de REDACTION.md : elle
  contient aussi la FAQ (qui sert au référencement, voir le JSON-LD
  `FAQPage`).
- Sur téléphone, l'attribution Leaflet est remontée au-dessus du badge de
  crédits pour ne pas le chevaucher.

## Vérifications faites

Captures Playwright à 375 px et à 1280 px, en clair et en sombre
(carte, panneau ouvert, stationnement sélectionné, panneau replié, modale).
Console sans erreur, sauf les 502/504 d'Overpass, attendus quand l'API est
surchargée (déjà gérés sans bruit par l'appli).
