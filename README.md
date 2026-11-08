# Diaporama de singe, version ChatGPT

Projet indépendant de la version Codex.

| Infrastructure | Ressource |
|---|---|
| GitHub | Vincladef/Diaporama-de-singe-ChatGPT |
| Netlify | diaporama-de-singe-chatgpt.netlify.app |
| Neon | soft-lake-83106970 / diaporama_singe_chatgpt |

Ne jamais modifier le dépôt Codex, son site Netlify ni sa base Neon.

## Étape 2 : moteur de présentation

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

Les exports PowerPoint/Google Slides, le MCP distant, la manipulation visuelle avancée, les galeries d'images et les animations au clic sont encore à développer. Le modèle conserve les animations mais leur exécution n'est pas implémentée.

Consulter `docs/ARCHITECTURE.md`.
