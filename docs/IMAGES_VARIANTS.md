# Étape 6 : Images et variantes graphiques

Ce module appartient uniquement au projet **Diaporama de singe ChatGPT**. Il s'ajoute à l'éditeur manuel et au serveur MCP, sans toucher au dépôt Codex.

## Recherche et sélection

La photothèque est ouverte via **+ Image** depuis une diapositive. Elle affiche des résultats par grille, leur origine et les mentions relatives aux droits ; l'utilisateur peut choisir une image pour l'insérer ou remplacer la photographie sélectionnée. Les coordonnées et les réglages existants sont conservés lors d'un remplacement depuis l'éditeur.

| Source | Disponibilité et configuration |
| --- | --- |
| Openverse | Recherche intégrée sans clé ; API officielle, quotas et délais réseau. |
| Wikimedia Commons | Recherche intégrée sans clé ; métadonnées d'auteur et de licence. |
| Pexels | Activable avec `PEXELS_API_KEY`, secret Netlify réservé aux fonctions. |
| Unsplash | Activable avec `UNSPLASH_ACCESS_KEY`, secret Netlify réservé aux fonctions ; photos hotlinkées, suivi de sélection API. |
| Google Images | Lien externe toujours accessible. Recherche intégrée facultative via `SERPAPI_API_KEY`, service tiers pouvant être facturé. |

La **Custom Search JSON API** historique de Google est fermée aux nouveaux clients depuis 2026 ; elle ne constitue pas une nouvelle option viable pour ce projet. Il est donc inutile de prétendre utiliser un moteur Google natif sans fournisseur tiers ou abonnement préexistant.

La recherche interroge les fournisseurs activés en parallèle. Chaque fournisseur bénéficie de sa propre gestion d'erreurs ; un problème Openverse n'empêche pas Wikimedia de fournir des résultats. Par défaut, la recherche récupère jusqu'à 20 images *par source*, avec pagination. Le choix d'une photo enregistre son URL, son origine et ses informations de droits dans le catalogue d'actifs Neon.

Les résultats externes ne garantissent pas le droit de reproduction. L'utilisateur doit vérifier les conditions sur la page source, notamment l'attribution, les restrictions non commerciales et les droits de la personnalité.

## Réglages photo

Dans le panneau Design, sélectionner une image permet d'ajuster :
- recadrage `cover`, `contain` ou `fill` ;
- point focal horizontal et vertical (`object-position`) ;
- luminosité, contraste, saturation, noir et blanc, flou et opacité ;
- rotation ; position et dimensions.

Les propriétés restent dans `SlideDocument.elements[].styles`, identiques pour l'éditeur, la sauvegarde Neon et le MCP. La capture fidèle HTML/CSS reflète les ajustements pris en charge par le navigateur. La conversion en objets PowerPoint natifs peut simplifier ou rasteriser les filtres complexes ; ne pas promettre une compatibilité totale.

## Variantes

Le bouton **Variantes** affiche la composition active et les propositions graphiques côte à côte.

- Générer trois propositions facultatives : « Photographie immersive », « Éditorial clair », « Typographie manifeste ».
- Conserver ces trois variantes dans Neon ; elles sont alors disponibles depuis l'interface et depuis MCP.
- Visualiser les compositions et les sélectionner sans écrire de HTML/CSS.
- Appliquer une version dans l'éditeur. La modification suit le processus de sauvegarde normal et le contrôle de révision ; annuler reste disponible.
- Les variantes issues du MCP sont chargées dans la même galerie, et un rafraîchissement périodique permet de les retrouver.

Le générateur intégré est un **moteur déterministe de directions graphiques**, pas un modèle génératif multimodal. Il conserve les textes, images et le HTML libre. Pour produire des propositions créatives plus complexes, ChatGPT peut envoyer des documents HTML/CSS complets avec l'outil MCP `create_variants`. L'éditeur de diapositives demeure libre de tout modèle obligatoire.

## Outils MCP

- `image_sources` : état de disponibilité des cinq sources.
- `search_images` : requêtes simultanées, informations de droits, réponse compacte pour limiter les tokens.
- `place_image` : création ou remplacement ciblé d'une image en un appel ; conserve par défaut les dimensions, positions et filtres.
- `generate_variants` : crée et enregistre trois alternatives pour une diapositive en un seul appel.
- `create_variants`, `list_variants`, `activate_variant`, `save_assets`, `list_assets` : outils précédents réutilisés.

Le serveur principal reste `https://diaporama-de-singe-chatgpt.netlify.app/mcp`. L'accès se fait par OAuth avec scopes de lecture et d'écriture. L'API `/.netlify/functions/image-search` est privée, tout comme l'API de travail `workspace`. Les clés des fournisseurs ne doivent jamais se retrouver dans le navigateur ni dans GitHub.

## Tests

Des tests unitaires vérifient la normalisation des sources, le filtrage des URL, les réglages, la conservation du HTML d'origine et le maintien des calques éditables. Des essais de bout en bout ont confirmé la recherche de 40 images sur Openverse/Wikimedia, le choix avec attribution, les changements de luminosité/cadrage, l'enregistrement Neon, la génération et l'application de trois variantes via l'interface, ainsi que la génération de variantes par MCP.

Les requêtes vers les fournisseurs peuvent échouer ou être limitées ; ne jamais traiter l'absence de résultats comme une absence universelle d'images. Les sources Pexels, Unsplash et SerpApi ne sont pas testables tant que leurs clés ne sont pas configurées.

## Suites possibles

- Téléversement des photos directement vers R2, si requis, en respectant les conditions des fournisseurs.
- Visualiseur comparatif plein écran avec mesure de fidélité.
- Génération d'images directement à partir d'un fournisseur IA autorisé.
- Retrait de fond, détourage et retouche locale avancée.
- Tests d'accessibilité, quotas d'API et cache réseau contrôlé.
