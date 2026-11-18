# Rififi dans l'Arizona

Dossier interactif sur la crise de la coalition Arizona (gouvernement De Wever, novembre 2026), lue à travers les relations entre ses acteurs.

**Aucune étape de compilation.** Ce sont des fichiers statiques : HTML, CSS, JavaScript (module ES) et données JSON.

```
index.html
assets/css/style.css
assets/js/app.js        # rendu : réseau, matrice, chronologie, citations, fiches
assets/favicon.svg
data/acteurs.json       # partis, couleurs, fiches des acteurs
data/relations.json     # états, positions du graphe, liens entre acteurs
data/chronologie.json   # événements datés (type, acteurs, sources)
data/citations.json     # petites phrases (qui → qui, ton, média, sources)
data/dossier.json       # synthèse, scénarios, signaux, analyses, divergences
data/sources.json       # sources citées (identifiant → URL)
.nojekyll
```

## Mettre à jour
Il suffit de modifier les fichiers JSON. Les sources se citent par leur identifiant (`"sources": ["dh-1118"]`) ; la numérotation et les ancres se génèrent automatiquement. Pour ajouter une personne au graphe, il faut lui donner des coordonnées dans `relations.json > positions` (le cadre fait 1040 × 640).

## Prévisualiser en local
`python3 -m http.server` puis http://localhost:8000. Les données sont chargées avec `fetch`, donc ouvrir directement le fichier en `file://` ne fonctionne pas.

## Publier sur GitHub Pages
Pousser le contenu à la racine du dépôt `rififi`, puis activer Pages (branche `main`, dossier `/`). Tous les chemins sont relatifs, ce qui permet au site de fonctionner sous `/rififi/`.
