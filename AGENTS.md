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

Étape 6 : éditeur graphique, recherche d'images Openverse/Wikimedia, sources optionnelles Pexels/Unsplash/SerpApi, retouches photo et variantes graphiques partagées via MCP. Serveur OAuth et exports PPTX toujours actifs. Ne pas promettre une recherche Google intégrée sans clé SerpApi, ni des animations exécutables ou un export Google Slides natif. Vérifier les droits d'utilisation des médias. La connexion MCP au compte ChatGPT attend toujours une action de l’utilisateur.
