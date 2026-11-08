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

Pour Google Slides, l'éditeur dispose d'un bouton « Exporter vers Google Slides » qui utilise un client OAuth Google et l'API Drive. Un identifiant client public doit être configuré avant le premier usage ; le MCP ne publie pas encore directement.

Le MCP distant propose plus de vingt outils, OAuth PKCE et opérations groupées atomiques. L'authentification finale dans ChatGPT nécessite une connexion approuvée par l'utilisateur. L'éditeur visuel (étape 5) offre le déplacement, le redimensionnement, les calques, le clavier et la synchronisation par révisions. L'étape 6 ajoute la galerie d'images Openverse et Wikimedia, les réglages photo et les variantes comparables. Google Images est accessible par lien externe, ou via SerpApi avec une clé. Pexels et Unsplash nécessitent également leurs clés. L'étape 7 ajoute une chronologie sans code, les apparitions progressives au clic, les séquences automatiques, les animations CSS ciblées et une console de projection avec notes et fenêtre publique synchronisée. La conversion des animations en PowerPoint natif et le mode entièrement hors ligne restent à développer ; l'export Google Slides via l'éditeur nécessite un identifiant OAuth Google.

Consulter `docs/ARCHITECTURE.md`, `docs/EXPORT.md` et `docs/MCP.md` pour le détail des deux méthodes et de leurs limites.

## Images et propositions graphiques

Depuis l'éditeur, **+ Image** ouvre une galerie multi-sources (jusqu'à 20 résultats par source et par page). **Variantes** présente plusieurs directions visuelles et conserve les propositions dans Neon, accessibles via MCP. Les réglages du cadrage, des filtres et de la rotation restent stockés dans le document JSON de la diapositive. Consulter `docs/IMAGES_VARIANTS.md` pour le fonctionnement, les clés API facultatives et les limites de licence.

## Animations et mode présentateur

Depuis chaque diapositive, le panneau **Animations** permet d'ajouter et d'ordonner les apparitions au clic, effets automatiques, fondus, mouvements, masquages et effets personnalisés. Le bouton **▶ Présenter** ouvre la console avec notes, chronomètre, écran public séparé et raccourcis clavier. Les séquences sont compatibles avec le serveur MCP. Voir `docs/ANIMATIONS.md`.

## Étape 8 : import, amélioration et contrôle qualité

- **⇧ Importer** : import PowerPoint (`.pptx`), fichiers Google Slides téléchargés en PPTX, JSON natif ou HTML ; aperçu des diapositives, sélection et création d'une copie indépendante dans Neon.
- **✦ Améliorer** : comparaison de trois directions graphiques, création d'une copie avec textes et notes préservés ; consigne à transmettre à ChatGPT lorsqu'il est connecté au MCP.
- **✓ Vérifier** : audit des documents, images, animations, tailles et limites d'export ; accès à la même analyse via `audit_presentation`.
- **MCP** : `get_improvement_brief`, `make_visual_copy` et `audit_presentation` facilitent les travaux de l'IA sur l'intégralité d'une présentation sans recopier les documents à chaque appel.
- **Robustesse** : contrôle des tailles ZIP avant extraction, conservation de l'ordre des objets et des notes, tests aller-retour PPTX et tests de régression automatiques.

Les effets avancés PowerPoint, les masters, les diagrammes complexes et la synchronisation native Google Slides restent partiels ou non disponibles ; la capture Web fidèle et les objets natifs ne constituent pas une conversion complète de tous les styles.

**Documentation : [docs/INTEGRATION_IMPORT.md](docs/INTEGRATION_IMPORT.md)**.

## Étape 9 : autonomie de ChatGPT

Le serveur MCP publie 32 outils, dont `compose_slides` pour produire jusqu'à 40 mises en page éditables dans un appel, `review_slides` pour obtenir un diagnostic et des aperçus navigateur signés, et `repair_slides` pour corriger en lot les défauts géométriques simples avec contrôle de révision. Le catalogue réel est exposé dans `workspace_status` pour diagnostiquer les caches d'outils ChatGPT. Les prévisualisations HTML/CSS sont isolées ; elles servent à l'inspection visuelle par navigateur, sans prétendre produire une capture raster dans le MCP. Voir [docs/AI_STEP9.md](docs/AI_STEP9.md).

## Étape 10 : créativité visuelle

Moteur de diagrammes et cartes mentales (`compose_diagrams`), six directions graphiques, comparaison et modification ciblée des variantes (`compare_variants`, `revise_variant`), recherche photographique multisource condensée (`curate_images`) et application de traitements d'images en lot (`apply_images`). L'ensemble demeure compatible avec les documents HTML/CSS libres et le modèle de révision Neon. Catalogue serveur : 37 outils en version 0.10.0 ; actualiser les outils dans ChatGPT si le client voit un ancien catalogue. Pexels, Unsplash et Google Images intégré requièrent les clés API indiquées dans [la documentation étape 10](docs/CREATIVITY_STEP10.md).

## Étape 11 : finalisation et restauration

L'éditeur et le serveur MCP conservent désormais des points de restauration des diapositives dans Neon ; le bouton **Historique** permet de les parcourir, les prévisualiser et restaurer une version, avec contrôle des révisions. L'éditeur HTML/CSS peut s'agrandir ; les changements distants sont détectés régulièrement et un brouillon en conflit peut être exporté sous forme de JSON directement réimportable. L'export PowerPoint vérifie l'état distant et présente une analyse de compatibilité des modes visuel et éditable ; la projection dispose d'un écran noir synchronisé (B), d'un saut de diapositive (G) et d'un chronomètre contrôlable. La photothèque accepte le collage direct des images Google Images sans prétendre en extraire les résultats sans API. Le serveur publie **39 outils MCP** en version 0.11.0. Voir [l'audit final et les limites](docs/FINALISATION_STEP11.md).

## Exportation des apparitions au clic

Le réglage **« Étapes au clic »**, activé par défaut, crée une vue par étape de révélation. Ainsi, les cartes mentales et chaînes causales restent progressives lors d'une présentation PowerPoint ou Google Slides. Chaque clic fait avancer à une diapositive successive, qui contient les éléments dévoilés jusqu'à cette étape ; les effets de mouvement ou fondu ne sont pas reconstruits sous forme d'animations natives. Décocher le réglage pour obtenir une seule diapositive statique par écran original. Les pages progressives sont des captures visuelles, pas des objets entièrement éditables.

## Publication Google Slides depuis l'éditeur

Après avoir enregistré le diaporama, choisir « Visuel fidèle » ou « Objets modifiables », puis cliquer sur « Exporter vers Google Slides ». Le bouton génère un PPTX validé **sans le télécharger**, propose de choisir un compte Google, le transmet à l'API Drive et convertit directement le fichier en présentation Google Slides. Un lien « Ouvrir la présentation Google Slides » apparaît en cas de succès.

**Connexion Google sans configuration utilisateur.** Le client OAuth public de Diaporama de singe a été enregistré par l'administrateur dans le projet Google Cloud « Atelier Slides ChatGPT » et son origine officielle est autorisée. L'API Google Drive est activée. Le bouton ouvre directement Google Identity Services pour que l'utilisateur choisisse son compte et accorde l'autorisation d'ajouter un fichier dans Drive.

Les clients OAuth sont des identifiants **publics** ; le code gère l'identifiant de l'application sans demander à l'utilisateur d'ouvrir Google Cloud Console. Une variable `VITE_GOOGLE_OAUTH_CLIENT_ID` peut le remplacer lors du build pour une autre installation. Ne jamais intégrer de **secret client** dans le navigateur.

Le droit OAuth demandé est seulement `https://www.googleapis.com/auth/drive.file`. Une nouvelle présentation est créée à chaque export ; aucune présentation existante n'est écrasée. L'authentification Google se produit dans le navigateur de l'utilisateur. Le résultat utilise les limites du moteur PPTX : HTML/CSS rasterisé en mode fidèle, animations Web non transposées. Cette fonctionnalité **ne remplace pas** une publication MCP sans navigateur.
