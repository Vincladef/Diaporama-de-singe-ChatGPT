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

## Étape 3 : export PowerPoint et Google Slides

La génération se déroule dans le navigateur, sans API publique d'export. PptxGenJS crée les objets natifs et le fichier OOXML ; html-to-image capture les mises en page HTML/CSS libres. Deux stratégies sont proposées : fidélité visuelle par image complète, ou conversion hybride avec fond HTML/CSS rasterisé et objets structurés natifs.

Le moteur capture chaque diapositive dans un iframe temporaire sans exécution JavaScript, vérifie le contenu ZIP avant de proposer le PPTX et autorise un téléchargement manuel de secours.

Google Slides est pris en charge par import du fichier PPTX, et non par synchronisation directe. Voir docs/EXPORT.md pour les contraintes, la matrice de compatibilité et les tests effectués.

## Étape 4 : serveur MCP

Le serveur Netlify sur /mcp utilise le transport MCP Streamable HTTP en mode JSON et stateless, avec OAuth 2.1 : découverte OAuth, enregistrement dynamique limité aux rappels ChatGPT, autorisation par code + PKCE S256, jetons d'accès et de renouvellement persistés sous empreintes SHA-256. Les scopes distinguent lecture et écriture.

Le domaine src/mcp/documents.ts applique des opérations ciblées sur les documents JSON ; src/mcp/store.ts orchestre les opérations Neon et les fonctions SQL de migrations 003/004 garantissent la mise à jour atomique et le tri des diapositives. Les outils privilégient la création en lot, des sommaires compacts et des réponses courtes pour limiter les appels et tokens.

Le serveur fournit un catalogue de médias (liens seulement), des dossiers et des variantes de composition. Les téléchargements HTML/JSON utilisent des liens signés temporaires. Le téléchargement PowerPoint reste initié depuis l'éditeur navigateur, faute de capture HTML/CSS fiable côté serveur.

Voir docs/MCP.md pour les outils, les limites et la procédure de connexion.
