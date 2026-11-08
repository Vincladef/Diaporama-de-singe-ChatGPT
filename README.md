# Diaporama de singe : version ChatGPT

Éditeur de diapositives HTML/CSS pensé pour être piloté par une IA via MCP, avec export PowerPoint et Google Slides à développer.

## État actuel : socle technique v0.1

- Application React + TypeScript + Vite.
- Site hébergé sur Netlify, déploiements liés à GitHub.
- Neon PostgreSQL, projet indépendant `diaporama-de-singe-chatgpt`, base `diaporama_singe_chatgpt`.
- Schéma initial : `presentations`, `slides`, `assets`, `slide_variants`.
- Fonction serveur `/.netlify/functions/health` qui vérifie réellement la connexion Neon.
- Atelier de démonstration de trois diapositives HTML/CSS avec navigation et révélations au clic.

**La version 0.1 est un socle et une démonstration, pas encore un éditeur persistant ni un serveur MCP actif.**

## Développement local

```bash
npm install
npm run dev
```

Pour tester les fonctions et Neon en local, ajouter `DATABASE_URL` dans un `.env` privé, puis utiliser `netlify dev`.

## Déploiement

Netlify : `https://diaporama-de-singe-chatgpt.netlify.app`

Déploiement automatique depuis `main` du dépôt `Vincladef/Diaporama-de-singe-ChatGPT` ; configuration dans `netlify.toml`.

Environnement entièrement indépendant de `Vincladef/Diaporama-de-singe` (version Codex). Les modifications effectuées ici ne doivent jamais toucher au projet d'origine.

Définir `DATABASE_URL` de cette **nouvelle base Neon** comme variable **secrète Netlify** avec accès **Functions**. Ne jamais mettre le mot de passe PostgreSQL dans le code ou dans les variables préfixées `VITE_`.

## Structure

```text
src/                Interface de démonstration et canevas 16:9
netlify/functions/  Fonctions serveur sécurisées, accès Neon
sql/                Migrations SQL versionnées
public/             Favicon et ressources statiques
netlify.toml        Paramètres build, fonctions et routage
```

## Étapes suivantes

1. Modèle hybride d'une diapositive : éléments structurés + composition HTML/CSS libre.
2. API CRUD avec authentification avant toute exposition des présentations personnelles.
3. Serveur MCP distant avec outils de création, modification et rendu.
4. Export PDF/PPTX fidèle, puis export éditable.
5. Galerie d'images, variantes graphiques et timeline d'animations.
6. Éditeur manuel, import Google Slides et synchronisation.

## Sécurité

Le site de démo n'affiche aucune présentation privée et n'expose aucune route d'écriture. Toute route de création/modification devra exiger une authentification avant d'être déployée. Ne jamais injecter du HTML/JS de provenance inconnue dans le contexte principal de l'éditeur : isoler les prévisualisations.
