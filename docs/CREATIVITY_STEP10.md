# Étape 10 : créativité graphique et ressources visuelles

Périmètre strict : `Vincladef/Diaporama-de-singe-ChatGPT`. Ne jamais toucher au dépôt, au site ni à la base Codex.

## Principes

- Une présentation n'a pas besoin d'une apparence uniforme. Varier la densité, le traitement photographique, les proportions, les compositions et les textures, mais conserver une cohérence éditoriale.
- Privilégier les photographies sourcées, typographies lisibles et diagrammes pertinents ; éviter les décorations qui n'éclairent aucun propos.
- Ne jamais réécrire ou supprimer silencieusement des données, citations, notes ou images originales.
- Le modèle `SlideDocument` reste structuré, libre ou hybride. Toutes les nouvelles commandes sont facultatives ; HTML/CSS original demeure possible avec `edit_slides` et `create_variants`.
- Les transformations automatiques sont déterministes. L'appréciation artistique finale requiert l'examen du rendu navigateur.

## Nouvelles commandes MCP (serveur 0.10.0 : 37 outils)

### `compose_diagrams`

Crée jusqu'à 20 diagrammes dans une requête, par ajout ou remplacement. Six familles : `mindmap`, `flow`, `cycle`, `hierarchy`, `causal` et `matrix`. Le contenu se décrit en termes de nœuds, de liens, d'emphase et de thème (`paper`, `ink`, `marine`, `chalk`, `warm`). Le moteur calcule les positions et génère des textes éditables, des panneaux et un calque de liaisons SVG. Les liens vectoriels se réorganisent en recomposant le diagramme ; chaque ligne n'est pas encore manipulable indépendamment au niveau objet dans l'éditeur.

Les remplacements exigent la confirmation `confirmReplace=true` et une révision exacte. Les notes existantes sont préservées sauf consigne contraire. `dryRun=true` permet une simulation.

### `generate_variants`, `compare_variants`, `revise_variant`

- Le générateur conserve les trois directions initiales et ajoute **Atlas scientifique**, **Papier d'archives** et **Nocturne cinématographique**, six propositions au maximum dans un appel. Des créations librement conçues restent possibles via `create_variants`.
- `compare_variants` présente jusqu'à huit variantes enregistrées : informations de composition, conservation des textes/images/notes, risques géométriques et liens d'aperçu signés valables dix minutes. Il ne prétend **pas** attribuer une note esthétique objective.
- `revise_variant` applique des opérations précises sur une variante enregistrée sans toucher à la diapositive active ; une empreinte SHA-256 obtenue par comparaison est requise. Le stockage effectue une mise à jour conditionnelle (conflit concurrent = aucune écriture).
- Le panneau **Compositions** de l'éditeur propose six directions, avec vignettes et informations comparables.

### `curate_images`

Jusqu'à quatre requêtes textuelles, avec plusieurs sources à la fois, sans gestion manuelle des URL par l'IA. Classement et dédoublonnage selon la pertinence des titres, le format, les dimensions et la diversité des fournisseurs. La réponse compacte fournit une liste réduite, les droits déclarés et les liens vers les pages sources. Ce classement est heuristique, pas une vérification légale.

| Fournisseur | Accès intégré |
| --- | --- |
| Openverse | Sans clé API |
| Wikimedia Commons | Sans clé API |
| Pexels | Clé Netlify `PEXELS_API_KEY` requise |
| Unsplash | Clé Netlify `UNSPLASH_ACCESS_KEY` requise |
| Google Images | Recherche intégrée via `SERPAPI_API_KEY` ; sinon, lien Google Images classique |

Le serveur ne peut pas inventer les clés de services externes. Des erreurs ou limitations d'API n'impliquent pas une absence générale de photographies.

### `apply_images`

En un appel, remplacer, insérer ou traiter jusqu'à 40 photos réparties sur 40 diapositives, avec contrôle des révisions et édition atomique des documents. Sont pris en charge : position, format, point focal, cadrage, luminosité, contraste, saturation, noir et blanc, flou, rotation et opacité. Les autres propriétés de l'objet sont préservées.

Les URL ne sont pas téléchargées par le MCP ; la restitution dépend du fournisseur et de la connexion. L'outil enregistre l'origine et les droits déclarés dans le catalogue Neon, sans réenregistrer inutilement une URL déjà connue. La métadonnée de source est indexée après l'édition ; un échec indépendant est signalé. Le suivi d'une sélection Unsplash est tenté si son URL `downloadLocation` est communiquée.

## Workflow conseillé

1. `get_improvement_brief` ou `list_presentations`, puis détermination d'un langage visuel adapté au sujet.
2. `curate_images` pour proposer de vrais visuels, sous réserve des droits.
3. `compose_slides` ou `compose_diagrams` pour fabriquer plusieurs pages en un appel.
4. `apply_images` pour sélectionner et traiter les photos.
5. `generate_variants`, puis `compare_variants`, éventuellement `revise_variant` et `activate_variant`.
6. `review_slides` et ouverture des aperçus signés dans un navigateur, pour vérifier le rendu réel.

## Sécurité et limites

- Seul le projet ChatGPT est accessible ; pas de clé fournisseur dans les sources ni côté client.
- Toutes les opérations MCP nécessitent l'authentification habituelle ; aucune écriture anonyme.
- Les URL d'aperçu sont signées, à expiration courte, et ne doivent pas être publiées.
- Les données SVG des diagrammes proviennent d'une géométrie calculée et de couleurs validées ; les textes des nœuds restent échappés.
- Les droits d'auteur et les contraintes de hotlinking doivent être examinés sur chaque page fournisseur.
- Aucun pipeline génératif multimodal autonome n'est prétendu ; les directions fournies en interne sont des compositions déterministes, et ChatGPT peut toujours écrire des créations originales en HTML/CSS.
- Les exports PowerPoint éditables peuvent rasteriser des éléments SVG et des effets CSS ; vérifier l'export dans les deux modes.
