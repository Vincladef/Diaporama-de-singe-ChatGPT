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

Le serveur ne recherche pas lui-même des images sur Google Images, Unsplash ou Pexels ; ChatGPT peut chercher des médias via ses autres outils et enregistrer leurs URLs avec save_assets.
La lecture d’animations au clic, l’édition avancée par glisser-déposer, la publication Google Slides directe et la synchronisation instantanée restent à développer.
Le protocole, la découverte OAuth, le DCR et l’émission du code d’autorisation ont été testés ; le cycle complet d’autorisation dans un plugin installé devra être validé par l’utilisateur après connexion.

## Tests

Les migrations 003 et 004 ont été appliquées uniquement dans Neon ChatGPT.
Un jeu temporaire de deux diapositives a confirmé : création groupée, mise à jour atomique, rejet d’un lot périmé sans modifications partielles et réorganisation ; les données de test ont ensuite été supprimées.
Tests GitHub Actions : TypeScript, documents, géométrie PowerPoint et vérification de build.

Voir aussi README.md, docs/ARCHITECTURE.md et docs/EXPORT.md.
