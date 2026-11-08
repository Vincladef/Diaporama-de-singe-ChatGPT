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

## Progression pédagogique dans Google Slides et PowerPoint

Le moteur Web conserve les véritables animations `click` et `after-previous`. Le PowerPoint exporté **ne possède pas d'animations d'objet natives** : sa conversion Google Slides ne peut donc pas restituer directement les effets Web.

Le réglage **« Étapes au clic »** (coché par défaut) garantit à présent la progression des cartes mentales dans le fichier exporté :

- Les séquences sont lues avec le même `SlideAnimationPlayer` et `buildPlaybackPlan` que le mode projection Web.
- Pour une page contenant N déclenchements `click`, le PPTX contient N+1 vues successives de cette page, de la disposition initiale à la composition complète.
- Les actions `after-previous` sont regroupées avec leur clic précédent ; les introductions automatiques sont appliquées à la première vue.
- Chaque état est capturé à la fin des animations, sans dépendre de la prise en charge des animations importées par Google.
- Dans Google Slides, **un clic passe à la vue suivante** et révèle le contenu supplémentaire. L'animation est visuelle mais **ce sont des diapositives successives**, pas des animations natives à l'intérieur d'une seule diapositive.
- Les fondus, déplacements, durées, mouvements continus et courbes d'accélération ne sont **pas reproduits** ; seul l'état final après chaque clic est conservé.
- En mode visuel fidèle, les vues successives sont rasterisées. En mode modifiable, le moteur reconstruit les textes HTML et les objets structurés compatibles ; le décor CSS complexe demeure rasterisé.
- Un plafond de 240 vues empêche une multiplication excessive ; le système signale clairement la limite.
- Décocher « Étapes au clic » restaure l'export statique précédent, une vue par diapositive.

Une présentation de 4 diapositives contenant respectivement 2, 5, 9 et 11 clics produit ainsi 31 vues exportées. L'application d'origine demeure en 4 diapositives.

Lorsque le fichier dépasse 5 Mo, la publication utilise désormais un **transfert Google Drive avec reprise** (création de session puis PUT binaire) au lieu du transfert multipart réservé aux petits fichiers. Le jeton OAuth reste en mémoire dans le navigateur et l'URL de session n'est jamais enregistrée ; aucun nouvel envoi automatique n'est effectué après un échec incertain.

## Étape 11 : vérification avant l'export

Le modèle de prédiagnostic `src/export/preflight.ts` distingue les objets convertibles nativement, les compositions hybrides et les captures raster intégrales ; il repère les animations Web, images HTTPS externes et changements de proportions. L'éditeur vérifie les révisions distantes juste avant le PPTX. Le moteur d'export réutilise les images identiques durant une opération, avec bornes de téléchargement. Le MCP retourne les avertissements depuis `prepare_export`, sans prétendre créer le PowerPoint lui-même. L'import dans Google Slides reste celui d'un PPTX via Drive, sans publication automatique dans le compte Google.


## Correction du 8 novembre 2026 : export modifiable et diagnostic du flash

Le système de projection Web utilise maintenant deux iframes : le lecteur conserve la diapositive visible tandis que la suivante charge ses images et polices en arrière-plan. Un échange atomique remplace ensuite l'ancienne page, avec un fond sombre au lieu du blanc implicite. Le composant reste monté lors de la navigation dans la console et l'écran public. Les aperçus temporaires ont également reçu une politique CSP autorisant explicitement les images et polices HTTPS, sans autoriser les scripts des diapositives.

**Mode objets modifiables (nouveau comportement)** :
- Les textes mesurables du HTML libre sont extraits et reconstruits en boîtes de texte PowerPoint. Le calque de décor correspondant est capturé sans ces glyphes pour limiter les doublons.
- Les éléments structurés texte/image/forme restent natifs, y compris dans les vues successives des apparitions au clic.
- Les connexions SVG des schémas structurés deviennent des objets image vectoriels distincts ; leurs points ne deviennent pas éditables individuellement.
- Les fonds de couleur et les dégradés simples des formes structurées deviennent des formes PowerPoint. Les dégradés sont approchés par des bandes colorées, modifiables.
- Le mode modifiable est désormais proposé par défaut dans l'éditeur et dans la préparation d'export MCP.
- L'audit recense aussi les photographies contenues dans le HTML libre, au lieu de compter uniquement les éléments image structurés.

**Frontières techniques toujours présentes** :
- Les photographies et SVG imbriqués dans une composition HTML libre restent dans le calque décor raster ; la conversion générale de tout le DOM/CSS en objets Office n'est pas possible sans perte. Les éléments structurés doivent être privilégiés à la création lorsqu'une édition complète est impérative.
- Les animations Web ne deviennent pas des animations natives PowerPoint. Avec l'option « Étapes au clic », chaque état est une diapositive distincte ; les textes/formes convertibles restent désormais modifiables. Ce procédé fonctionne aussi après import du PPTX dans Google Slides, mais ne conserve pas les fondues/déplacements animés comme effets natifs.
- La fidélité exacte de la typographie HTML et de la mise en page peut varier selon les polices disponibles dans PowerPoint/Google Slides. Le mode « Visuel fidèle » est conservé pour les situations où un rendu identique prime sur la modifiabilité.
- Une vérification de rendu réel dans PowerPoint et une importation Google Slides sont requises avant de garantir une parfaite correspondance.

Tests automatiques : pipeline TypeScript, tests Node, build Netlify ; régression de la visibilité native étape par étape et du comptage des médias HTML.
