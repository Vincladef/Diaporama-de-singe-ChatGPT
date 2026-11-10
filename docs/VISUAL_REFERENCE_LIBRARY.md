# Références visuelles PowerPoint (étape 2)

## Portée et sécurité

**Projet autorisé :** `Vincladef/Diaporama-de-singe-ChatGPT` exclusivement. Le projet Codex est hors périmètre.

Les références originales restent dans `slide_creation_references` ; aucune extraction ne modifie leur contenu. Les aperçus sont des PNG privés en base Neon (`slide_creation_reference_pages`, migration `sql/008_visual_reference_pages.sql`), transmis par le serveur d'édition authentifié ou par le serveur MCP sous OAuth. Aucune image de référence n'est exposée par URL publique.

## Génération des aperçus

- Rendu avec `pptx-glimpse@5.3.0` ; pas d'appel à un hébergement Python, LibreOffice, Google ni Microsoft.
- Un vrai moteur PPTX interprète le document et produit une **image PNG**, pas une reconstruction par rectangles basée sur l'extraction de textes.
- Une conversion ne garantit **pas** la fidélité pixel-perfect à Microsoft PowerPoint. Les polices particulières, l'animation et des effets non pris en charge peuvent différer ; les diagnostics du moteur sont conservés.
- Sortie 960 pixels de large ; PNG complet de la page. Conversion par lots de trois diapositives pour limiter les ressources d'une Netlify Function.
- Les limites actuelles sont huit fichiers de référence de 4 Mo chacun, cent diapositives par PowerPoint et un maximum de 4 Mo pour un PNG de page.
- Les PPTX déjà enregistrés, dont « Exemple de slides que je suis susceptible de faire.pptx », ne nécessitent aucun réimport. La galerie reconstruit automatiquement les pages manquantes lors de son ouverture.

## Expérience dans l'éditeur

Ouvrir **Instructions de création** puis **Exemples visuels**, déployer **Diapositives de référence** sous le fichier de référence. La bibliothèque affiche les miniatures, le type visuel estimé et le nombre de pages actives. Il est possible de sélectionner toutes les pages, d'en exclure certaines ou de corriger leur catégorie visuelle.

La sélection est persistée dans Neon. Aucun rejet esthétique n'est déduit automatiquement des pages désélectionnées.

## Usage par ChatGPT

Le serveur MCP fournit quatre fonctions nouvelles :

1. `list_reference_pages(id)` : description des pages disponibles, catégories et état de sélection.
2. `render_reference_pages(id,start,count)` : rendre les diapositives manquantes (par groupes de trois).
3. `search_reference_compositions(kind?,imageDominant?,geometrySignature?,limit?,referenceId?)` : retrouver des compositions actives par **fonction et géométrie**, sans dépendre des mots-clés de leur sujet.
4. `inspect_reference_page(id,slideNumber)` : retourner **l'image PNG réelle** au modèle multimodal.

Les instructions renvoyées par `get_creation_instructions` signalent également les pages visuelles sélectionnées. Avant une génération artistique, l'IA doit examiner au moins une image de référence pertinente ; la fonction de recherche ne juge pas les pixels. Elle doit reproduire le *principe de composition*, jamais le contenu scientifique, les textes ou les photographies de la référence sans autorisation.

Les fonctions du serveur sont exposées dans le catalogue MCP version `0.13.0`. Si ChatGPT ne voit pas les nouvelles fonctions, actualiser les outils de l'application connectée.

## Classification

Les catégories `photographique`, `documentaire`, `graphique`, `schématique`, `comparatif`, `typographique`, `mixte` reposent **initialement sur des indices DrawingML** (nombre et surface des images, géométrie des textes, diagrammes et relations). Une catégorie peut être corrigée manuellement dans la galerie.

Le classement par proximité utilise une signature géométrique des compositions. Il ne prétend pas utiliser un embedding multimodal, un score de beauté ou une lecture sémantique des images. Le véritable jugement visuel est confié au modèle qui reçoit les PNG avec `inspect_reference_page`.

## Vérifications

Le script `npm run test` comporte des tests du classifieur, du classement géométrique et de la conversion **effective d'un PPTX créé par PptxGenJS en PNG**. Le serveur n'indique pas une page prête si le rendu n'a pas été enregistré en base.

Vérifications avant production : `npm run check`, `npm run test`, `npm run build`, audit npm, pipeline Netlify et inspection de la bibliothèque sur un PPTX réel de plusieurs pages.

## Limites connues

- Le traitement des PDF comme sources visuelles multi-pages ne fait pas partie de cette étape.
- Les miniatures sont des rendus tiers, pas des captures d'écran certifiées par PowerPoint.
- La recherche de similarité compare l'agencement des blocs, et pas les couleurs / textures des pixels. Un futur moteur d'embeddings peut se brancher sur la table de références existante.
- Un modèle d'IA intégré directement au site reste indépendant de ces fonctions. ChatGPT peut utiliser les images par MCP ; le site ne génère pas seul de nouvelles diapositives sans modèle configuré.
