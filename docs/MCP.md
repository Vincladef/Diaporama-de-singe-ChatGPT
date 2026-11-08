# Diaporama de singe ChatGPT : serveur MCP

## Connexion

Endpoint distant : https://diaporama-de-singe-chatgpt.netlify.app/mcp
Transport : Streamable HTTP stateless, réponses JSON.
Découverte OAuth : https://diaporama-de-singe-chatgpt.netlify.app/.well-known/oauth-protected-resource
Serveur d’autorisation : https://diaporama-de-singe-chatgpt.netlify.app/.well-known/oauth-authorization-server

Dans ChatGPT, créer un plugin MCP personnalisé et fournir l’URL ci-dessus ; choisir OAuth avec enregistrement dynamique du client (DCR). Sur la page de consentement du projet, utiliser le code d’accès personnel conservé dans Netlify comme EDITOR_ACCESS_TOKEN. ChatGPT reçoit uniquement un jeton limité, jamais le code permanent. Ne pas sélectionner le mode No authentication.

Ce lien final doit être approuvé par l’utilisateur dans ChatGPT. Le serveur n’a pas été installé automatiquement.

## Architecture et sécurité

- Netlify Function dédiée au protocole MCP, stateless et sans SSE de longue durée.
- OAuth 2.1 avec autorisation par code, PKCE S256 et DCR limité aux callbacks de ChatGPT.
- Jetons aléatoires conservés sous forme d’empreintes SHA-256 dans Neon.
- Jetons d’accès : une heure ; renouvellement : trente jours ; scopes presentations.read et presentations.write ; audience limitée à /mcp.
- La même base Neon et le même modèle JSON sont utilisés par l’éditeur et le serveur MCP.
- Modifications groupées atomiques et annulation de l’ensemble du lot en cas de révision incompatible.
- Aucune configuration ni aucune modification de la version Codex.

## Outils disponibles (20)

Lecture : workspace_status, list_presentations, get_presentation, get_slide, list_folders, list_assets, list_variants.
Création et organisation : create_presentation, update_presentation, delete_presentation, add_slides, duplicate_slide, delete_slides, reorder_slides, manage_folder.
Édition et variantes : edit_slides, save_assets, create_variants, activate_variant.
Exportation : prepare_export.

## Optimisation des appels

create_presentation accepte jusqu’à 40 diapositives complètes en une requête ; add_slides permet d’en ajouter jusqu’à 40.
get_presentation renvoie un sommaire compact par défaut ; get_slide peut ne retourner que les objets, les notes ou HTML/CSS.
edit_slides permet de modifier jusqu’à 40 diapositives dans une requête, avec au plus 80 opérations chacune et un mode dryRun.
Les opérations sont : replace_document, set_html, append_html, set_css, append_css, set_canvas, set_mode, upsert_element, remove_element, edit_element, move_element, set_elements, set_animations, append_animation, remove_animation, set_notes.
Les diapositives peuvent contenir du HTML/CSS libre, des objets éditables, ou une combinaison des deux.
create_variants enregistre huit propositions graphiques au maximum ; activate_variant conserve une copie de la composition précédente.

## Exportations

prepare_export crée un lien vers l’éditeur privé pour PPTX, ou un lien signé valable dix minutes pour HTML/JSON. Le PPTX se fabrique actuellement dans le navigateur. Le serveur MCP ne prétend pas exécuter cet export à distance. Google Slides reste accessible par import manuel d’un fichier PowerPoint.
Les liens signés HTML/JSON donnent accès à la présentation pendant dix minutes ; ne pas les publier.

## Limites actuelles

Le serveur intègre maintenant `image_sources` et `search_images`. Openverse et Wikimedia fonctionnent sans clé ; Pexels et Unsplash demandent leurs secrets Netlify ; Google Images est accessible par URL externe ou par SerpApi lorsque `SERPAPI_API_KEY` est configurée. `place_image` remplace ou insère une image avec ses réglages sans recopier tout le document ; `generate_variants` enregistre trois directions graphiques. Pour des propositions originales issues du raisonnement de ChatGPT, continuer à utiliser `create_variants` avec des compositions HTML/CSS libres.
La lecture d'animations au clic est développée et vérifiée en projection. Deux outils supplémentaires accélèrent les scénarios pédagogiques : `get_animation_plan` lit les clics et les étapes successives en réponse compacte ; `add_reveal_sequence` ajoute une série complète en un seul appel, en ciblant les objets par identifiant ou les éléments HTML libres par le préfixe `css:`. Le mode présentateur synchronise une fenêtre publique sans exposer les notes. La publication Google Slides directe et la conversion des animations en PPTX natif restent à développer. Voir `docs/ANIMATIONS.md`.
Le protocole, la découverte OAuth, le DCR et l’émission du code d’autorisation ont été testés ; le cycle complet d’autorisation dans un plugin installé devra être validé par l’utilisateur après connexion.

## Tests

Les migrations 003 et 004 ont été appliquées uniquement dans Neon ChatGPT.
Un jeu temporaire de deux diapositives a confirmé : création groupée, mise à jour atomique, rejet d’un lot périmé sans modifications partielles et réorganisation ; les données de test ont ensuite été supprimées.
Tests GitHub Actions : TypeScript, documents, géométrie PowerPoint et vérification de build.

Voir aussi README.md, docs/ARCHITECTURE.md et docs/EXPORT.md.

## Étape 8 : améliorer une présentation existante

Nouveaux outils qui complètent les commandes de création et de modification :

- `get_improvement_brief` : sommaire compact des textes, notes, médias, modes de document et révisions ; ne transfère pas le HTML/CSS complet ni les images encodées.
- `make_visual_copy` : crée en un appel une nouvelle présentation avec l'une de trois directions graphiques déterministes ; l'original reste inchangé.
- `audit_presentation` : vérifie les cibles d'animation, les images, les dimensions, la taille des documents et les avertissements d'export ; même moteur de diagnostic que le bouton **Vérifier** de l'éditeur.

La lecture des fichiers PPTX/HTML/JSON s'effectue dans le navigateur via **Importer**, puis la copie validée se retrouve dans Neon et devient pilotable depuis ChatGPT à travers le MCP. La connexion OAuth du MCP nécessite toujours une autorisation explicite ; ce chantier n'installe aucun plugin à la place de l'utilisateur.

Détails : `docs/INTEGRATION_IMPORT.md`.

## Actualisation des outils dans ChatGPT

Le serveur MCP publié expose **29 outils** dans son catalogue à l'étape 8. Si une conversation ChatGPT ne montre encore que les 20 outils du premier catalogue, **actualiser les outils du plugin Diaporama de singe** dans les paramètres des plugins, puis rouvrir une conversation si nécessaire. Ce rafraîchissement ne modifie pas le projet GitHub ou la base Neon et ne reconnecte pas un compte Google.

## Contrôles de dépendances

Le workflow GitHub Actions exécute désormais `npm audit --audit-level=moderate` après l'installation ; les mises à jour de l'outillage Netlify et de la bibliothèque indirecte `image-size` éliminent les alertes modérées et élevées signalées lors de l'étape 8. Une alerte de faible gravité subsiste dans les dépendances de développement ; elle ne bloque pas le build.

## Étape 9 : efficacité visuelle et réconciliation du catalogue

Le serveur 0.9.0 publie **32 outils**. `workspace_status` retourne le nombre et les noms exacts des outils enregistrés ; les nouvelles commandes `compose_slides`, `review_slides` et `repair_slides` permettent la composition de 40 diapositives par appel, les liens de prévisualisation éphémères et les corrections atomiques avec révisions. Le client ChatGPT peut conserver son ancien catalogue en cache ; **actualiser les outils** du plugin si seulement 29 commandes apparaissent. Une actualisation du serveur ne suffit pas à imposer une réindexation côté client. Les captures d'écran réelles supposent un navigateur ; le diagnostic MCP reste heuristique. Voir [AI_STEP9.md](AI_STEP9.md).

## Étape 10 : composition graphique

Le serveur 0.10.0 publie **37 outils**, dont `compose_diagrams`, `curate_images`, `apply_images`, `compare_variants`, `revise_variant`. `generate_variants` accepte maintenant `count` (3 à 6 ; défaut 6). Les diagrammes génèrent des textes éditables et des liaisons SVG ; les variantes peuvent être comparées par métriques et aperçus signés, puis modifiées sans activer la nouvelle version. Les trois sources commerciales demandent toujours leurs clés Netlify ; Openverse et Wikimedia restent accessibles sans clé. Référence complète : [CREATIVITY_STEP10.md](CREATIVITY_STEP10.md).
