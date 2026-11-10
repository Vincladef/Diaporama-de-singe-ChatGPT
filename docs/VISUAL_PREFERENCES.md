# Mémoire visuelle discrète (phase 6)

## Portée

Projet **ChatGPT uniquement** : `Vincladef/Diaporama-de-singe-ChatGPT`, Netlify `diaporama-de-singe-chatgpt.netlify.app` ; base Neon `soft-lake-83106970 / diaporama_singe_chatgpt`. Ne pas modifier la version Codex.

## Interface

La galerie et le comparateur conservent **un clic = sélectionner la variante active** ; aucune note, boîte de dialogue, confirmation ou commentaire ne précède ce choix.

Sous les propositions enregistrées figurent trois retours facultatifs et discrets :

- **Je n'aime pas** : rejet explicite de la variante, par défaut limité à cette présentation. Cliquer de nouveau sur le bouton retire l'avis.
- **Enregistrer comme référence** : conserver le document graphique comme exemple apprécié, par défaut global. Cliquer de nouveau retire ce favori.
- **Commentaire facultatif** : court texte et sélecteur de portée « Cette présentation » ou « Toutes les présentations ». Le commentaire peut accompagner un avis ; sur une version réellement active, il peut accompagner son signal de sélection.

Les variantes simplement laissées de côté n'ont **aucun signal négatif**.

## Stockage

Migration idempotente `sql/010_visual_preferences.sql` :

- `slide_variants.design_context` : intention de composition et IDs/pages de références **effectivement utilisés** lors de la génération IA ;
- `slide_visual_preferences` : type d'action (`selected`, `disliked`, `saved`), portée, présentation/diapo/variante d'origine, commentaire éventuel, catégorie de diapo, références déclarées, **liste complète des options proposées au moment du choix**, profil graphique, instantané du document aimé et date.
- Une nouvelle sélection réelle augmente légèrement la fréquence de préférence ; une édition de commentaire ne la gonfle pas.
- Les sélections sont journalisées à partir de `switchVariant` (éditeur) et de `activate_variant` (MCP). Un échec de mémoire ne bloque **pas** la sélection.
- La source graphique est sauvegardée comme JSON, sans modifier les documents existants ni remplacer l'actif.

La migration ajoute une table et une colonne facultative (défaut `{}`) ; les anciens slides/variantes restent lisibles et leurs anciennes sélections ne sont pas rétroactivement interprétées comme des rejets.

## Réutilisation avant création

`get_creation_instructions` renvoie toujours les instructions globales/locales, plus un guide synthétisant les préférences explicites pertinentes, **sans écrire par-dessus les consignes**.

`prepare_independent_variants` connaît en plus la fonction pédagogique de la diapo et retourne `visualPreferenceMemory` avec les avis positifs, les rejets et jusqu'à deux favoris complets pouvant servir d'exemples. `get_visual_preferences` permet une recherche explicite par présentation, type graphique ou diapositive.

Signaux pondérés : un favori explicite compte plus qu'un clic isolé ; une préférence liée au même type de diapositive est privilégiée ; les rejets sont retenus **uniquement lorsqu'ils sont explicites** et pour leur motif ; aucune option ne crée une interdiction esthétique définitive.

Pour observer réellement les favoris conservés, utiliser `inspect_visual_render` sur leur source `sourceSlideId` et `sourceVariantId` tant qu'elle existe. La présence d'un instantané JSON seule ne prouve pas une inspection des pixels.

## Outils MCP

- `get_visual_preferences` : consulter la mémoire (global/présentation, fonction pédagogique).
- `set_visual_preference` : ajouter ou retirer un rejet/favori, ou commenter la variante actuellement sélectionnée.
- `create_independent_variants` accepte dorénavant `referencesUsed: [{referenceId,slideNumber}]` par variante. C'est une provenance **déclarée**, jamais devinée.

Aucun système de score, tableau de bord d'évaluation, benchmark, API payante, ni deuxième éditeur n'est ajouté.

## Tests

- Tests unitaires : scope, diversité, rejet explicite, un choix n'est pas une loi, classement par fonction visuelle, extraction prudente de styles ;
- `npm run check`, `npm run test`, `npm run build`, `npm audit --audit-level=moderate` et tests Chromium/PPTX déjà présents ;
- Test d'intégration après migration : enregistrer un retour volontaire sur la présentation de démonstration, lire son historique depuis Neon et vérifier sa présence dans le contexte de génération.
