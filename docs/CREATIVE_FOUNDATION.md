# Fondations du moteur créatif (phase 1)

**Périmètre :** uniquement `Vincladef/Diaporama-de-singe-ChatGPT`, site Netlify `diaporama-de-singe-chatgpt`, projet Neon `soft-lake-83106970`, base `diaporama_singe_chatgpt`. Le projet Codex reste totalement indépendant.

## Constat vérifié

- **Références** : `CreationInstructionsStudio` accepte au maximum huit pièces jointes de 4 Mo, conservées dans `slide_creation_references` (avec les données originales). L'analyse historique indiquait surtout la palette, les polices et des extraits textuels. Les PDF ne sont pas convertis en pages image par le serveur.
- **Moteur graphique** : `SlideDocument` accepte des objets natifs, du HTML/CSS libre et un mode hybride. Les animations sont persistantes.
- **Variantes** : les versions générées localement par `proposeGraphicVariants` sont des **transformations déterministes**, pas des compositions créées par IA. `create_variants` accepte, lui, des documents complets rédigés indépendamment par ChatGPT.
- **Prévisualisations** : `review_slides` fournit des diagnostics heuristiques et une URL de page de prévisualisation signée. Il ne fournit pas une capture de pixels ni une évaluation esthétique multimodale.
- **Photos** : `curate_images` et `apply_images` existent. Les images distantes et les fonds CSS ne font pas l'objet d'une vérification réelle de chargement dans tous les chemins.
- **Exports** : PPTX par rendu image ou hybride via `pptxgenjs` et `html-to-image` ; Google Slides via conversion de PPTX dans le navigateur OAuth. Un rendu fidèle peut être partiellement non modifiable.
- **Persistance** : Neon possède déjà `presentations`, `slides`, `slide_variants` et `slide_creation_references`. Pas besoin de créer une nouvelle base.

## Travail implémenté dans cette phase

### Géométrie des PowerPoint de référence

Le module `src/creative/referenceGeometry.ts` lit le DrawingML des PPTX et extrait, pour les huit premières pages consultées :

- le format de page et son ratio ;
- le nombre d'images, blocs de texte et diagrammes ;
- les positions et dimensions normalisées des objets ;
- un court texte initial par page, lorsque disponible.

Les données sont exposées par l'outil **existant** `inspect_creation_reference`, y compris pour les fichiers déjà enregistrés. Elles sont aussi incluses dans le résumé des références lors de **nouveaux imports**, sans migration SQL.

**Limite essentielle :** c'est une analyse géométrique du XML, pas une capture fidèle des diapositives. Les groupes, masques, masters et objets complexes ne sont pas reconstitués. Aucune inspection esthétique n'est prétendue.

La description MCP précise désormais la différence entre les variantes déterministes et les trois créations originales par `create_variants`.

## Architecture cible, sans créer de dépendances prématurées

```text
Instructions + sources + références (Neon)
                      |
         creative/referenceGeometry    [implémenté]
                      |
       creative/referencePreviews      [à développer]
             | images réelles de référence
                      |
       creative/generationAdapter      [à développer]
             | 3 compositions IA indépendantes
                      |
        create_variants (existant)
                      |
      creative/renderCapture           [à développer]
             | captures effectives
                      |
     creative/visualReviewer           [à développer]
             | corrections délimitées
                      |
     Historique + préférence (Neon)    [à développer]
```

Contrats à respecter lors des prochaines phases :

1. Toute référence est annotée par une **provenance** : `drawingml-geometry` ou `rendered-screenshot`. Ne jamais présenter le premier comme le second.
2. Chaque variante possède sa propre composition ; le moteur déterministe ne remplace pas la génération IA.
3. Une critique visuelle exige une **capture d'écran réelle**, une entrée image pour le modèle et un résultat contrôlable. Les audits statiques ne suffisent pas.
4. Les corrections s'appliquent aux documents versionnés avec contrôle de révision et préservation du contenu et des notes.
5. Les goûts de l'utilisateur sont enregistrés comme préférences contextualisées ; une variante non sélectionnée n'est pas un rejet explicite.
6. Pas d'appel API de modèle autonome depuis le site sans accès serveur réellement configuré. Ne pas exposer de secret au navigateur.

## Étude des bibliothèques

| Bibliothèque | Décision phase 1 | Motivation |
| --- | --- | --- |
| PPTAgent | **Étudier, ne pas importer** | Son runtime utilise Python, Chromium/Playwright, LibreOffice ; son installation complète alourdirait le serveur actuel. Réutiliser l'idée d'analyse de références et tester un worker distinct à la phase 2. |
| Playwright | **Prévoir pour phase 2** | Nécessaire seulement lorsqu'un service réellement capable de capturer des pages sera disponible. Les aperçus HTML actuels ne sont pas des captures. |
| Sharp | **Différer** | Utile pour le recadrage et l'optimisation des images ; le traitement actuel doit d'abord faire l'objet d'un examen des lacunes concrètes. |
| ELKjs | **Optionnel en phase diagrammes** | Calcul de disposition des graphes complexes ; le moteur de diagrammes actuel existe déjà. |
| React Flow | **Ne pas installer maintenant** | Dépendance d'interface importante ; ne pas doubler l'éditeur de nœuds tant que ce besoin n'est pas établi. |

Aucune nouvelle dépendance npm et aucune migration SQL lors de cette phase. Cela minimise les risques pour Netlify et pour les exports.

## Suites concrètes

1. Produire des vignettes de référence réellement rendues, avec un service de capture isolé si nécessaire.
2. Associer ces vignettes à des analyses multimodales et à un index de compositions.
3. Générer trois documents complets indépendamment, via l'outil `create_variants` déjà disponible.
4. Capturer les rendus et appliquer des corrections visuelles contrôlées.
5. Ajouter des choix de préférence facultatifs et contextualisés, sans formulaire ni benchmark.

## Vérifications

- `npm run check`
- `npm run test` (incluant `src/creative/referenceGeometry.test.ts`)
- `npm run build`
- GitHub Actions sur la pull request
- Vérification des réponses de `inspect_creation_reference` après livraison et actualisation éventuelle du catalogue d'outils MCP.

L'absence d'une capture réelle, d'un modèle autonome, de clés API ou d'un worker dédié doit rester clairement indiquée. Ne pas déclarer les phases 2 à 5 opérationnelles avant de les implémenter.
