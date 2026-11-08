# Diaporama de singe, version ChatGPT

Projet indépendant de la version Codex.

| Infrastructure | Ressource |
|---|---|
| GitHub | Vincladef/Diaporama-de-singe-ChatGPT |
| Netlify | diaporama-de-singe-chatgpt.netlify.app |
| Neon | soft-lake-83106970 / diaporama_singe_chatgpt |

Ne jamais modifier le dépôt Codex, son site Netlify ni sa base Neon.

## Étapes 1 à 4 : moteur HTML/CSS, export PowerPoint et serveur MCP

Fonctions disponibles : création, renommage et suppression de présentations ; ajout, duplication et suppression de diapositives ; édition HTML/CSS libre ; objets individuels texte, image et forme ; aperçu immédiat dans une iframe isolée ; notes ; sauvegarde et relecture dans Neon ; conflits de modification détectés par numéro de révision.

L'interface se trouve sur https://diaporama-de-singe-chatgpt.netlify.app/.

## Sécurité

Toutes les requêtes vers `/.netlify/functions/workspace` exigent `Authorization: Bearer <EDITOR_ACCESS_TOKEN>`.
Le secret `EDITOR_ACCESS_TOKEN`, d'au moins 20 caractères, appartient uniquement aux fonctions serveur Netlify. Ne pas le versionner ni l'exposer via une variable VITE_.
Le navigateur ne conserve le code d'accès que dans sessionStorage. Aucune présentation n'est accessible de manière anonyme.
Les documents HTML/CSS sont rendus dans une iframe sandboxée à origine opaque, avec CSP qui bloque les scripts et les connexions.

## API

- GET `/.netlify/functions/workspace?op=list` : présentations.
- GET `/.netlify/functions/workspace?op=presentation&id=<uuid>` : présentation et diapositives.
- POST `/.netlify/functions/workspace` : actions `createPresentation`, `renamePresentation`, `deletePresentation`, `addSlide`, `duplicateSlide`, `saveSlide`, `deleteSlide`.
- `saveSlide` exige une révision valide ; toute modification concurrente entraîne HTTP 409.

## Schéma et code

- `sql/001_foundation.sql` : les deux tables initiales.
- `sql/002_slide_engine.sql` : colonne revision.
- `src/domain/slide.ts` : contrat Zod du document.
- `src/engine/render.ts` : rendu libre et structuré.
- `netlify/functions/workspace.mts` : API de persistance privée.
- `src/App.tsx` : interface d'édition.

Tests automatiques : `npm run check`, `npm run test`, `npm run build` via GitHub Actions.

## Étapes suivantes

L'application exporte maintenant des fichiers PPTX en deux modes. Le mode « Visuel fidèle » insère une capture haute résolution de chaque diapositive ; le mode « Objets modifiables » préserve les éléments structurés natifs (textes, images et formes) et traite le HTML/CSS libre comme fond image. Les notes du présentateur sont conservées.

Pour Google Slides, téléchargez le PPTX puis importez-le dans Google Drive. La publication directe via OAuth n'est pas encore disponible.

Le MCP distant est développé avec vingt outils, OAuth PKCE et opérations groupées atomiques. L'authentification finale dans ChatGPT nécessite une connexion approuvée par l'utilisateur. L'éditeur visuel (étape 5) offre le déplacement, le redimensionnement, les calques, le clavier et la synchronisation par révisions. L'étape 6 ajoute la galerie d'images Openverse et Wikimedia, les réglages photo et les variantes comparables. Google Images est accessible par lien externe, ou via SerpApi avec une clé. Pexels et Unsplash nécessitent également leurs clés. Les animations exécutables et la création directe Google Slides restent à développer.

Consulter `docs/ARCHITECTURE.md`, `docs/EXPORT.md` et `docs/MCP.md` pour le détail des deux méthodes et de leurs limites.

## Images et propositions graphiques

Depuis l'éditeur, **+ Image** ouvre une galerie multi-sources (jusqu'à 20 résultats par source et par page). **Variantes** présente plusieurs directions visuelles et conserve les propositions dans Neon, accessibles via MCP. Les réglages du cadrage, des filtres et de la rotation restent stockés dans le document JSON de la diapositive. Consulter `docs/IMAGES_VARIANTS.md` pour le fonctionnement, les clés API facultatives et les limites de licence.
