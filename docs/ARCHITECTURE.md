# Architecture initiale, version ChatGPT

## Objectif

Créer un moteur de diapositives Web qui soit plus facile à piloter par ChatGPT qu'un logiciel de présentation coordonné pixel par pixel, avec un export fidèle et un éditeur manuel. Ce dépôt est strictement indépendant de la version Codex.

## Choix à l'étape 1

- Interface : React, TypeScript et Vite. Application Web hébergée sur Netlify.
- Fonctions serveur : Netlify Functions, modules `.mts`.
- Stockage relationnel : Neon PostgreSQL, base `diaporama_singe_chatgpt`, projet `soft-lake-83106970`.
- Schéma minimal : `presentations` et `slides`. Ne pas introduire d'autres tables tant qu'elles n'apportent pas une fonction réelle.
- Contrats applicatifs : Zod et types TypeScript, documents de diapositives versionnés.
- Tests : exécution native Node.js et vérification TypeScript dans GitHub Actions.
- API publique actuelle : `GET /.netlify/functions/health` uniquement. Aucune route publique de lecture/écriture des présentations.

## Représentation des diapositives

Une diapositive possède un `document` JSON versionné. Il peut combiner :
- des objets structurés (textes, images, formes, SVG, groupes) ;
- du HTML/CSS libre lorsqu'une composition sort des modèles ;
- des animations, avec séquence et déclenchement au clic.

Ce modèle évite de forcer l'IA à tout dessiner avec des coordonnées, tout en ouvrant la voie à une édition manuelle. **La présence de ces contrats ne signifie pas que le moteur graphique est déjà implémenté.**

## Flux cible

```text
ChatGPT -- (MCP HTTPS, futur) --> Adaptateur MCP
                                          |
Éditeur Web ---> API sécurisée ---> Services métier ---> Neon
       |                                  |
       +--> Rendu HTML/CSS isolé <--------+
                       |
                Captures et exports (futurs)
```

Le serveur MCP doit appeler les mêmes services métier que l'API ; ne pas dupliquer les opérations dans deux moteurs distincts. Les actions doivent porter sur un objet, une diapositive ou un lot entier selon le besoin. Les retours doivent être compacts pour économiser les tokens.

## Sécurité

- Ne jamais exposer `DATABASE_URL` au navigateur, dans une variable `VITE_*` ou dans le dépôt.
- Aucun CRUD public n'est livré tant qu'un accès authentifié n'est pas mis en place.
- Les futurs aperçus HTML/CSS arbitraires doivent être isolés dans des iframes `sandbox` et protégés par une politique adaptée.
- Les futurs outils MCP devront vérifier l'identité et l'autorisation ; un simple endpoint public d'écriture est exclu.
- Les secrets Netlify restent dans les paramètres de l'hébergeur.

## Décisions différées

Les choix exacts du moteur d'animation, du rendu navigateur, du transport MCP distant et de la conversion PowerPoint/Google Slides seront validés par des prototypes dans les étapes suivantes. Le HTML/CSS très libre ne garantit pas une exportation PPTX parfaite et éditable ; traiter la fidélité et la modifiabilité comme deux modes distincts si nécessaire.

## Limites de cette étape

Pas encore de création de présentations dans l'interface, de moteur graphique complet, d'outil MCP, de recherche d'images, d'animations réelles ni d'export PPTX. L'étape 1 livre une application déployée, des contrats de domaine, une base prête et les contrôles techniques.

## Étape 2 : moteur HTML/CSS et stockage

- `src/engine/render.ts` produit le document HTML à partir du JSON versionné. Les modes structured, freeform et hybrid sont autorisés.
- La prévisualisation est isolée dans une iframe `sandbox=""` avec une CSP interdisant les scripts, formulaires et connexions.
- Les documents sont persistés dans `slides.document` ; la colonne `revision` assure le contrôle de concurrence (HTTP 409).
- Toutes les opérations privées passent par `netlify/functions/workspace.mts` et vérifient le secret EDITOR_ACCESS_TOKEN.
- Aucun utilisateur anonyme n'a accès à la lecture ou à l'écriture. Les images externes et polices Web nécessitent une connexion réseau.
- L'éditeur manuel complet, les animations exécutables, le MCP et les exports restent des étapes ultérieures.
