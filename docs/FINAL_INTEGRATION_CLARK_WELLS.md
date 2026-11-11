# Intégration finale du parcours visuel : Clark et Wells

## Démonstration enregistrée

- Présentation Neon : `f193e336-3328-4679-8227-9bd5561d5c95` ; [ouvrir dans l'éditeur](https://diaporama-de-singe-chatgpt.netlify.app/?deck=f193e336-3328-4679-8227-9bd5561d5c95).
- Trois diapositives scientifiques sur : (1) menace sociale anticipée, (2) attention sur soi et image interne, (3) comportements de sécurité.
- Neuf propositions HTML/CSS/SVG distinctes, trois par diapo ; elles sont conservées comme **variantes de chaque page**, non comme neuf nouvelles pages.
- Références sources : Clark et Wells (1995), *A Cognitive Model of Social Phobia* ; Leigh et Clark (2018), *Clinical Child and Family Psychology Review* ; Wells et al. (1995), *Behavior Therapy*, 26(1), 153–161. La série de Wells comprend **huit** patients, sans généralisation causale illimitée.
- Photographies **illustratives, pas preuves scientifiques** : Brooke Cagle, Priscilla Du Preez et Vitaly Gariev (Unsplash). Médias enregistrés dans le catalogue de présentation avec leurs crédits et droits. Plusieurs images candidates ont été comparées ; certaines propositions privilégient un SVG à la photographie.
- Le PPTX fourni `Exemple de slides que je suis susceptible de faire.pptx` reste enregistré comme référence de **forme** ; l'exemple a aussi été ouvert visuellement durant ce test. Son contenu ne doit pas être repris.

## Parcours MCP en version 0.18

1. `get_creation_instructions` fournit les instructions globales et locales, exemples PPTX et mémoire de préférences.
2. `create_presentation` crée les diapositives sources et leurs notes.
3. `prepare_deck_workflow` réunit les sources, fonctions pédagogiques, références sélectionnées, préférences et révisions **pour l'ensemble du diaporama** ; ne lance pas de modèle caché.
4. ChatGPT consulte `prepare_independent_variants` pour les images de références ; cherche et inspecte des photos via `curate_images` et `inspect_photo_candidates`.
5. ChatGPT conçoit et enregistre trois véritables compositions via `create_independent_variants` en fournissant les sources utilisées, l'idée graphique et les notes d'origine.
6. `inspect_visual_render` envoie les **pixels Chromium réels** à ChatGPT ; `apply_visual_correction` corrige les défauts ciblés (max. 3 captures, 2 corrections par session). La présence d'un audit ne remplace pas ces étapes.
7. `verify_deck_workflow` vérifie les variantes Neon, la géométrie, les photos déclarées, les animations, les risques d'export et les **captures réellement persistées**, sans confondre lien de prévisualisation et capture.
8. L'éditeur présente les compositions ; un clic active immédiatement la variante. `slide_visual_preferences` mémorise le signal positif faible ; un avis négatif n'existe qu'après l'action explicite « Je n'aime pas ».

Le MCP pilote l'IA de la conversation. **Le site n'a pas de moteur autonome de génération configuré** ; aucune API de modèle payante n'a été introduite. Les nouveaux outils nécessitent éventuellement une actualisation du catalogue de l'application ChatGPT.

## Tests de non-régression

- `npm run check`, `npm run test`, `npm run build`, `npm audit --audit-level=moderate`.
- `npm run test:export` : export PPTX natif, objets éditables et SVG.
- `npm run test:visual` : deux captures Playwright Chromium.
- `npm run test:integration` : neuf documents récupérés initialement de Neon ; trois signatures spatiales distinctes par diapo, véritables fichiers PNG de tous les rendus, état des polices/images, requêtes échouées, animations ciblées et vérification des débordements hors cadre.
- `npm run test:integration:export` : depuis un vrai Chromium, exporter les trois diapositives scientifiques en modes PowerPoint **fidèle** et **modifiable**, vérifier la structure ZIP/OOXML, les notes et les étapes au clic.

Les artefacts de CI incluent les neuf captures, les diagnostics et les deux fichiers PowerPoint lorsqu'ils sont effectivement produits. Le test d'export ne démontre **pas** la parité des animations natives Google Slides.

## Limites non masquées

- La capture CI prouve que Chromium a rendu une diapo dans l'environnement de test. Seules les sessions `inspect_visual_render` sauvegardées dans Neon constituent la preuve d'une **revue multimodale dans ChatGPT**. `verify_deck_workflow` expose séparément cette distinction.
- Les sources PPTX existent déjà, mais les PNG de certaines pages de référence peuvent devoir être générés à la demande. Le moteur ne doit jamais présenter une référence textuelle comme une image inspectée.
- Les textes HTML sont récupérés comme objets modifiables lorsque la conversion navigateur le permet ; le décor, les schémas complexes et parfois le cadrage des photos restent rasterisés ou adaptés selon l'export.
- Aucune conversion Google Slides avec connexion OAuth n'est attestée par le simple test PPTX.
- Pas de déploiement ni de modification du dépôt Codex.
