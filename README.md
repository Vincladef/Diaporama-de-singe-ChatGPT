# Diaporama de singe, version ChatGPT

Socle technique indépendant, développé exclusivement dans :
- GitHub : `Vincladef/Diaporama-de-singe-ChatGPT`
- Netlify : `diaporama-de-singe-chatgpt`
- Neon : projet `soft-lake-83106970`, base `diaporama_singe_chatgpt`

**Ne pas modifier `Vincladef/Diaporama-de-singe` ni les ressources Netlify/Neon de la version Codex.**

## Étape actuelle : 1, architecture et fondations

- React + TypeScript + Vite, interface volontairement vide ;
- types et validation Zod pour des documents de diapositives hybrides et versionnés ;
- Neon PostgreSQL et migration initiale minimale à deux tables ;
- fonction Netlify `GET /.netlify/functions/health` : vérifie réellement la connexion Neon et le schéma ;
- configuration Netlify pour le déploiement depuis `main` ;
- contrôles TypeScript et tests natifs Node.js, GitHub Actions CI.

Les créations, exports, outils MCP et animations seront implémentés aux étapes ultérieures. **Aucune fonctionnalité fictive n'est affichée.**

## Développement

```sh
npm install
npm run check
npm run test
npm run build
npm run dev
```

Le navigateur de développement Vite ne lance pas les fonctions Netlify. Pour les tester localement, utiliser `netlify dev` et le fichier `.env` non versionné.

## Environnement

Créer `DATABASE_URL` dans les variables secrètes Netlify (production / functions), avec la chaîne de connexion de **la base ChatGPT uniquement**. La variable existe déjà dans ce projet ; ne pas la remplacer par celle de Codex.

Migration versionnée : `sql/001_foundation.sql`. Le déploiement n'applique pas automatiquement de migrations. Dans cette installation, la migration est exécutée explicitement via Neon.

Consulter `docs/ARCHITECTURE.md` pour les choix, limites et décisions différées.

## Priorité produit

1. Un moteur HTML/CSS permettant des diapositives très libres.
2. Une API et un MCP facilitant le travail de ChatGPT avec peu d'appels et de tokens.
3. Un éditeur visuel simple.
4. Variantes et recherches d'images.
5. Animations au clic.
6. Exports PowerPoint et Google Slides les plus fidèles possibles.

Le projet est personnel et cloud-first ; l'authentification des futures routes sensibles est obligatoire.
