# Trois variantes IA indépendantes (ChatGPT/MCP, phase 3)

## Périmètre absolu

Uniquement `Vincladef/Diaporama-de-singe-ChatGPT`, site `diaporama-de-singe-chatgpt.netlify.app`, Neon `soft-lake-83106970`. Ne pas modifier le projet Codex.

## Avant / après

**Avant :** `VariantsStudio` utilisait son bouton principal « Proposer six directions » pour appeler `proposeGraphicVariants`. Cette fonction modifie systématiquement l'existant (couleurs, polices, positions) ; aucune IA ne crée les six directions.

**Maintenant :** le parcours principal repose sur **deux opérations MCP explicites**. Le bouton dans l'éditeur copie une consigne qui déclenche ces opérations dans ChatGPT ; il ne prétend pas lancer un modèle dans le navigateur.

### 1. `prepare_independent_variants(slideId)`

Cette fonction :

- charge la diapositive complète, les textes, les images, les animations, les notes et la révision ;
- consulte l'ensemble des instructions globales et celles de la présentation, avec leur hiérarchie ;
- infère une *fonction pédagogique probable* à partir du contenu, sans imposer un des trois styles prédéterminés ;
- recherche des pages de référence sélectionnées par fonction et géométrie ;
- en l'absence de prévisualisations, tente un premier rendu des pages 1 à 3 du PowerPoint enregistré ;
- fournit à ChatGPT jusqu'à trois **images PNG réelles** ainsi que leurs sources ;
- demande à ChatGPT d'observer ces images et de créer trois compositions indépendantes.

L'IA doit tirer de chaque référence un principe graphique, pas copier ses textes. Les photos personnelles ou documents sources ne sont pas repris automatiquement.

### 2. `create_independent_variants(slideId, expectedRevision, variants)`

ChatGPT fournit exactement trois **documents complets** et originaux. Chaque entrée comprend :

- `name` : titre de la variante ;
- `designIntent` : intention graphique propre, suffisamment explicite ;
- `referenceObservation` (facultatif) : ce que le modèle a réellement observé ;
- `slide.document` : un `SlideDocument` HTML/CSS/SVG complet avec animation et éléments natifs si utiles ;
- `slide.notes` (facultatif) : notes spécifiques, ajoutées aux notes d'origine.

L'outil applique des contrôles avant la sauvegarde :

- exactement trois variantes et trois concepts décrits distinctement ;
- un vrai document rédigé avec HTML/CSS, et non une transformation implicite d'un modèle ;
- comparaison de **structure HTML, règles de placement CSS et géométrie des objets** après neutralisation de la couleur, des polices et des URL d'images ;
- refus des présentations visuellement identiques au niveau de la structure ou qui reprennent exactement la source ;
- conservation du ratio de diapositive ;
- présence de nouvelles animations si la source en possédait ;
- conservation des notes et sources ; les notes originales sont reprises même lorsque ChatGPT omet `notes` ;
- insertion des trois versions dans `public.slide_variants` via `createVariants`, avec contrôle SQL de la révision d'origine.

Les défauts renvoient un diagnostic détaillé ; aucune variante n'est insérée en cas d'échec de validation. La diapositive active est conservée jusqu'à ce que l'utilisateur sélectionne une version.

Le contrôle de diversité est **une heuristique structurelle**, pas un jugement esthétique. Il ne garantit pas que toutes les propositions seront belles, ni que deux compositions ayant des codes différents paraîtront très distinctes. Une inspection visuelle des variantes reste nécessaire et fera l'objet de la phase 4.

## Interface

Dans `Compositions`, l'action principale devient **« Copier la commande pour ChatGPT »**. Après collage dans une conversation avec le plugin connecté, ChatGPT prépare les références, conçoit les trois variantes et les enregistre. La galerie se synchronise périodiquement avec les versions enregistrées ; un clic sélectionne la variante.

Les anciennes transformations sont disponibles sous **« Variations rapides sans IA »** et ne sont jamais présentées comme de nouvelles créations autonomes.

## Génération depuis l'application

Aucun modèle externe n'est actuellement configuré dans les variables Netlify du site. **Aucune fausse génération autonome** n'est proposée dans l'éditeur. Ce mode pourra être développé seulement si une API de modèle est configurée et si son endpoint effectue de vrais appels de génération. Le parcours ChatGPT est opérationnel sans clé API OpenAI sur Netlify.

## Limites

- Les références sont des PNG rendus par un moteur indépendant, parfois imparfaits selon les polices et effets PowerPoint.
- La vérification de diversité structurelle ne remplace pas une analyse des captures de chaque variante.
- Les animations doivent être **réécrites avec des cibles adaptées** à la nouvelle HTML ; copier des sélecteurs inadaptés n'est pas suffisant.
- Le mode hybride conserve des objets modifiables lorsque l'IA les fournit ; le HTML/CSS libre peut rester rasterisé dans un export PPTX fidèle.
- `create_variants` demeure accessible comme outil de stockage bas niveau ; `create_independent_variants` est le parcours recommandé pour les trois propositions artistiques.

## Vérifications

`npm run check`, `npm run test`, `npm run build` et `npm audit --audit-level=moderate` via GitHub Actions, puis Netlify. La suite de tests vérifie une slide scientifique, un mécanisme psychologique, les différences de géométrie, le rejet d'une simple recoloration, l'intégrité des notes et le refus de perdre les animations.
