# Étape 20 : import PPTX natif et refonte assistée par MCP

Périmètre : uniquement `Vincladef/Diaporama-de-singe-ChatGPT`.
Version MCP attendue après déploiement : `0.20.0` ; 69 outils.

## Nouveaux outils

| Outil | Usage |
| --- | --- |
| `import_pptx` | Joint un PPTX depuis ChatGPT via `openai/fileParams`. Reprend le parseur OOXML de `src/import/parse.ts`, conserve textes, images et notes compatibles. Crée **une nouvelle présentation**, avec verrouillage du contenu activé par défaut. |
| `inspect_imported_deck` | Inventaire détaillé des objets natifs et de leur géométrie, sans reconstruire le document. |
| `get_source_assets` | Liste les sources originales réutilisables directement avec `place_source_image`. |
| `lock_source_content` | Stocke l'empreinte cryptographique de chaque texte, image, SVG et note, sans enregistrer leur contenu en double. Déverrouillage explicitement confirmé. |
| `restyle_imported_slides` | Modification atomique jusqu'à 40 slides : styles natifs, CSS de fond, animations, révisions vérifiées. |
| `render_deck_batch` | Vraies captures Chromium par lots de **3** maximum, avec planche-contact et avertissements. Pour 40 slides, itérer `offset` et `nextOffset`. |
| `compare_with_source` | Compare l'état courant au verrou ou à une présentation source distincte. |
| `export_pptx_server` | URL signée de téléchargement d'un PPTX à objets natifs, construit côté serveur. |

## Flux recommandé

1. `import_pptx` avec le vrai fichier joint, `lockContent=true`.
2. `inspect_imported_deck` et `get_source_assets`.
3. `restyle_imported_slides` avec `dryRun=true` et des révisions observées.
4. `restyle_imported_slides` avec `dryRun=false`, puis `compare_with_source`.
5. `render_deck_batch` jusqu'au dernier offset, examiner les images effectivement retournées.
6. `export_pptx_server` pour le PPTX natif ; contrôler le résultat dans PowerPoint.

Le verrou porte sur les appels d'édition du serveur MCP. Les opérations structurelles MCP (ajout, suppression, duplication et réordonnancement) sont bloquées sur les présentations verrouillées. La modification depuis l'éditeur Web n'est pas interceptée par ce verrou ; `compare_with_source` doit être exécuté après toute modification externe.

## Limites déclarées

- Le parseur PowerPoint existant conserve les objets pris en charge, mais ne sait pas reconstituer fidèlement tous les masters, groupes complexes, SmartArt, graphiques OOXML et effets natifs. Les avertissements d'import sont restitués.
- Les images intégrées dépassant le budget d'import sont optimisées ; cette transformation est signalée.
- `render_deck_batch` capture au plus trois slides par appel pour respecter la durée et la mémoire des fonctions serveur. L'image retournée est une capture réelle, pas un aperçu simulé.
- `export_pptx_server` préserve les textes, formes et images pris en charge comme objets PowerPoint. Un SVG peut devenir une image, les animations Web ne sont pas converties en animations natives, et le HTML libre doit passer par l'éditeur ou un autre moteur. Le serveur ne prétend pas convertir tous les effets.
- Une comparaison automatique d'empreintes vérifie la fidélité des contenus ; elle ne garantit pas, seule, leur lisibilité. La capture réelle demeure indispensable.

## Sécurité

- OAuth `presentations.read` et `presentations.write` comme les outils MCP existants.
- Fichiers joints téléchargés uniquement depuis des URL HTTPS publiques vérifiées, limite 45 Mo, contrôle des redirections, des temps et de la taille.
- Extraction ZIP par le parseur existant avec limites anti-décompression.
- L'original ne peut jamais être remplacé lors de l'import.
- URL de téléchargement PPTX signée, valable dix minutes.
- Les signatures du contenu sont stockées dans `public.mcp_deck_content_locks` (migration `sql/014_mcp_content_locks.sql`).

## Validation

`npm run check`, `npm run test`, `npm run build` et tests export existants.
Les tests `src/mcp/importWorkflow.test.ts` et `src/export/serverNative.test.ts` vérifient le verrouillage et l'export natif. Le fonctionnement réel doit également être testé après déploiement, avec un PPTX source comportant plusieurs images, des notes et une longue diapositive.
