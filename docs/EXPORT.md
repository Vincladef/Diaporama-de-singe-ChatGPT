# Export PowerPoint et compatibilité Google Slides

## Périmètre

Cette étape concerne uniquement Diaporama de singe, version ChatGPT. L'export s'effectue dans le navigateur ; il utilise PptxGenJS pour le PowerPoint, html-to-image pour les captures HTML/CSS et un modèle de diapositives versionné. Aucun serveur Chromium ni accès Google OAuth ne sont nécessaires pour télécharger un PPTX.

## Mode : visuel fidèle

Chaque diapositive HTML/CSS est capturée à sa résolution de référence et insérée comme image couvrant la page PowerPoint.

- Atouts : liberté graphique, gradients, typographies, compositions libres et superpositions.
- Limites : éléments individuels non éditables ; ce procédé reste une capture HTML-to-image, pas une capture écran Chromium exactement pixel par pixel ; certains effets CSS, polices ou médias peuvent différer.
- Les animations Web ne sont pas transposées.

## Mode : objets modifiables

Le moteur crée des objets PowerPoint natifs lorsqu'ils sont représentés par les éléments structurés du document.

- Textes : boîtes de texte éditables avec leurs propriétés essentielles.
- Formes : objets vectoriels simples avec couleur et position.
- Images : photographies natives avec cadrage cover/contain.
- Notes : notes du présentateur conservées.

Le HTML/CSS libre reste un fond image ; les objets structurés sont superposés comme objets PowerPoint. Les éléments complexes non convertibles (groupes, SVG, masques, filtres, transformations) déclenchent un rendu image de secours. L'apparence peut donc différer du navigateur en mode éditable.

## Google Slides

L'éditeur Web propose désormais le bouton **Exporter vers Google Slides**. Il suit ce parcours :

1. Choix du mode PPTX fidèle/éditable et vérification des révisions Neon.
2. Autorisation Google Identity Services (popup OAuth, scope minimal `drive.file`). Le jeton reste en mémoire.
3. Génération du même PPTX validé par `buildPowerPoint`, sans téléchargement local.
4. Import multipart/related `Drive API files.create` avec média PPTX et métadonnées `mimeType: application/vnd.google-apps.presentation`. Drive effectue la conversion native.
5. Contrôle du MIME de réponse et affichage d'un lien vers la présentation Google Slides.

Le client OAuth Web de l'application est configuré par le développeur, dans le projet Google Cloud « Atelier Slides ChatGPT » (origine `https://diaporama-de-singe-chatgpt.netlify.app`, API Drive activée, audience externe en production). L'utilisateur final n'a **aucune configuration** à effectuer : il choisit son compte Google et autorise le droit minimal `drive.file`. Pour une installation distincte, définir `VITE_GOOGLE_OAUTH_CLIENT_ID` au build ou remplacer l'identifiant public par défaut. Aucun secret OAuth n'est distribué dans le JavaScript.

Aucun jeton Google ou secret client n'est stocké dans Neon ni dans localStorage. L'application ne sollicite pas un accès général aux fichiers Drive. En cas d'incertitude réseau, elle ne répète pas l'import automatiquement, pour éviter les doublons.

Le MCP ne dispose pas encore d'un outil de publication Google Slides côté serveur. L'import manuel d'un PPTX reste disponible. Les contenus librement composés sont capturés en image et les animations Web ne sont pas exportées ; aucun aller-retour ni synchronisation bidirectionnelle n'est promis.

## Protection et fiabilité

- Les diapositives sont capturées dans un iframe temporaire avec allow-same-origin mais sans allow-scripts, avec une CSP qui interdit les scripts et les connexions réseau actives.
- Les images natives doivent être fournies en HTTPS ou en data URL reconnue ; les règles CORS de la source peuvent empêcher leur lecture depuis le navigateur.
- Le fichier est contrôlé avant téléchargement : signature ZIP et présence de tous les fichiers XML des diapositives.
- Un lien direct pour enregistrer le PPTX est proposé en complément du téléchargement automatique.
- Les fichiers d'export sont assemblés localement dans le navigateur ; ils ne sont pas enregistrés dans Neon.

## Tests réalisés le 8 novembre 2026

Un jeu de tests de quatre diapositives a été utilisé dans la base ChatGPT :
- Une composition HTML/CSS libre, avec couleurs et gradients.
- Une diapositive avec textes et forme structurés.
- Une composition hybride : fond libre et titre éditable.
- Une diapositive avec photographie HTTPS Unsplash et titre natif.

L'inspection du fichier OOXML a confirmé : une archive ZIP valide, les diapositives attendues, les médias et notes, la présence d'objets de texte/formes éditables et d'une photographie native. La requête d'image distante a réussi avec CORS.

Le rendu a été validé structurellement et par les aperçus Web. Il reste à comparer les pixels avec un rendu réel dans PowerPoint et à effectuer un import réel dans Google Slides.

## Pistes pour les évolutions

- Rendu Playwright/Chromium dédié à une comparaison visuelle plus stricte.
- Conversion native de certains éléments issus du HTML libre.
- Export des séquences d'animation.
- Création Google Slides directe via OAuth.
- Vérification automatisée des sorties PPTX dans un logiciel Office.

## Étape 8 : tests de réimport PowerPoint

L'éditeur propose désormais `Importer`, qui peut relire les PPTX générés par son propre export. Le mode **Objets modifiables** conserve la structure native des zones de texte, photographies et formes compatibles ; des ombres purement décoratives peuvent être omises afin de préserver la modifiabilité du texte. Les transformations CSS complexes et le HTML libre restent potentiellement rasterisés.

Un test en navigateur sur deux diapositives importées, dont une avec image et notes, a confirmé la création de copie graphique, l'export en PPTX modifiable, puis le réimport des textes, photographies et notes. Ce test ne constitue pas une comparaison des pixels dans PowerPoint ou Google Slides. Voir `docs/INTEGRATION_IMPORT.md`.

## Étape 11 : vérification avant l'export

Le modèle de prédiagnostic `src/export/preflight.ts` distingue les objets convertibles nativement, les compositions hybrides et les captures raster intégrales ; il repère les animations Web, images HTTPS externes et changements de proportions. L'éditeur vérifie les révisions distantes juste avant le PPTX. Le moteur d'export réutilise les images identiques durant une opération, avec bornes de téléchargement. Le MCP retourne les avertissements depuis `prepare_export`, sans prétendre créer le PowerPoint lui-même. L'import dans Google Slides reste celui d'un PPTX via Drive, sans publication automatique dans le compte Google.
