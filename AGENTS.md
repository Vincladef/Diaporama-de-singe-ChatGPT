# Agents et contributeurs : périmètre impératif

Ce dépôt appartient **exclusivement** au projet Diaporama de singe, version ChatGPT.

## Ressources autorisées

- GitHub : `Vincladef/Diaporama-de-singe-ChatGPT`
- Netlify : `diaporama-de-singe-chatgpt`, site ID `62280335-f588-4932-bdc4-b7fb7fac797a`
- Neon : `soft-lake-83106970`, branche `br-polished-tree-bdckw8ri`, base `diaporama_singe_chatgpt`

**Ne jamais modifier** `Vincladef/Diaporama-de-singe`, le site `diaporama-de-singe` ni le projet Neon `frosty-mouse-37678120` : ils constituent la version Codex, totalement indépendante.

## Méthode

1. Lire `README.md` et `docs/ARCHITECTURE.md`.
2. Garder un modèle de présentation Web à documents JSON versionnés, en préservant la liberté HTML/CSS.
3. Respecter l'ergonomie minimale et ne pas ajouter de contenus décoratifs non demandés.
4. Réduire le travail de l'IA par appel MCP, tout en assurant des opérations ciblées.
5. N'appliquer les migrations SQL qu'à la base ChatGPT. Ne jamais restaurer les tables d'une ancienne version par copie.
6. Tester le type-check, les tests et le build, puis contrôler le déploiement Netlify.
7. Garder `DATABASE_URL` côté serveur. Aucune route d'écriture anonyme.

## Phase du projet

Étape 8 : import PPTX/JSON/HTML, récupération des textes, images et notes, copies graphiques sans écrasement, contrôle qualité partagé entre éditeur et MCP, et tests de réimport PowerPoint. L'éditeur et le MCP utilisent le même document de référence dans Neon ChatGPT. Limites : certains effets et masques PowerPoint ne sont pas modifiables ; aucune synchronisation directe Google Slides ni export d'animations Web vers PowerPoint natif ; connexion MCP ChatGPT toujours soumise à l'autorisation de l'utilisateur. Voir `docs/INTEGRATION_IMPORT.md`.

## Étape 9

Trois outils de haut niveau : `compose_slides`, `review_slides`, `repair_slides`. Utiliser l'aperçu signé et un navigateur pour juger la composition réelle avant toute retouche. `workspace_status` retourne `toolCount` et `toolNames` pour comparer le catalogue effectif au cache ChatGPT. Préserver les fonds plein cadre et HTML/CSS ; les corrections dangereuses nécessitent confirmation et révision. Les tests figurent dans `src/mcp/visual.test.ts`. Documentation : `docs/AI_STEP9.md`.

## Étape 10

Prioriser la variété éditoriale, les grandes images sourcées, les schémas explicatifs utiles et la préservation du contenu. Le MCP 0.10.0 ajoute `compose_diagrams`, `curate_images`, `apply_images`, `compare_variants`, `revise_variant` ; six directions visuelles sont disponibles. Les liens de prévisualisation signés peuvent viser les variantes enregistrées. Toujours contrôler les droits déclarés sur la page du fournisseur, et ne pas inventer de clés API. Voir `docs/CREATIVITY_STEP10.md`. Répertoire Codex strictement interdit.

## Étape 11

Le projet ChatGPT possède désormais un historique persistant, un éditeur HTML/CSS agrandi, un export PPTX soumis à contrôle des révisions et une synchronisation renforcée, ainsi qu'un mode de projection B/G et une photothèque Google Images sans clé via URL manuelle. Le serveur MCP 0.11.0 publie 39 outils. Un checkpoint d'historique est conservé après chaque sauvegarde réussie, avec avertissement possible en cas d'échec indépendant. Les éditions HTML/CSS et les médias restent des créations libres ; ne pas promettre une conversion parfaite en Google Slides, une publication directe Google ni une extraction automatique d'images Google. Référence : docs/FINALISATION_STEP11.md. Codex strictement hors périmètre.

## Workflow de création approuvé le 12 novembre 2026

Cette application ne doit pas générer immédiatement un diaporama à partir d'une consigne vague. Respecter deux étapes, sauf demande explicite d'exécution directe :

1. **Préconception dans le chat** : présenter plusieurs directions graphiques avec références ou miniatures vérifiables ; détailler les images et schémas prévus, leurs sources, licences ou méthodes de création (photo authentique, SVG, figure de données vérifiées, illustration IA). Proposer la mise en page de chaque diapositive, les textes réellement affichés et les animations. Demander le choix ou les corrections de l'utilisateur. Ne pas écrire de présentation en phase 1.
2. **Production après validation** : créer dans l'application avec les choix adoptés, réaliser les variantes utiles et inspecter les captures réelles avant de conclure. Un ordre explicite de l'utilisateur de créer maintenant vaut validation.

**Anti-remplissage textuel, priorité élevée.** Interdire par défaut les microtitres fabriqués, mentions « Field Notes », « Experiment 01 », « Diagram 2A », « Laboratory Exhibit », numéros de page, sous-titres pseudo-scientifiques, signatures et bandeaux de rubrique sans fonction. Toute mention visible doit servir le contenu ou la lecture ; les métadonnées vont dans les notes et l'éditeur. Pour un deck de questions, n'afficher que chaque question, sauf texte expressément souhaité.

**Boucle de feedback** : utiliser le journal réel `prompt_feedback_journal` (outils MCP `list_prompt_feedback` et `save_prompt_feedback`) ; dater et classer les retours, distinguer goûts attestés et suppositions, puis reporter les règles générales dans les instructions persistantes. Préserver l'historique de chaque slide et les variantes au cours des corrections. Ne modifier que le projet ChatGPT, jamais la branche Codex.
