# Étape 8 : intégration, import et perfectionnement

Périmètre exclusif : **Diaporama de singe ChatGPT**. Ne pas modifier la version Codex, son dépôt, son site Netlify ni sa base Neon.

## Parcours utilisateur

### Importer un diaporama existant

1. Ouvrir https://diaporama-de-singe-chatgpt.netlify.app/ avec son code d'accès.
2. Cliquer sur **⇧ Importer**.
3. Déposer un fichier `.pptx`, `.json`, `.html` ou `.htm`.
4. Vérifier les vignettes, les limites de compatibilité et le nombre de pages ; désélectionner les diapositives inutiles.
5. Nommer la nouvelle présentation et confirmer l'import. Elle est créée dans Neon ; l'original n'est pas écrasé.
6. Les éléments récupérés peuvent ensuite être édités, animés, projetés et exportés depuis l'interface habituelle.

**Pour une présentation native Google Slides**, utiliser *Fichier → Télécharger → Microsoft PowerPoint (.pptx)*, puis importer ce fichier. La lecture directe dans un compte Google via OAuth n'est pas intégrée.

### Améliorer une présentation existante

Dans l'éditeur, cliquer sur **✦ Améliorer**. Trois directions graphiques sont proposées et comparées avec l'original. **Créer une copie** produit une autre présentation à partir des mêmes documents et notes ; cette proposition locale est déterministe, et non une génération de texte par LLM.

Pour un travail libre par ChatGPT, copier la consigne dans l'atelier et utiliser le MCP connecté. L'intelligence artificielle peut alors lire un sommaire, proposer des compositions, travailler en HTML/CSS, modifier un lot de diapositives et produire des variantes sans tout retransférer à chaque appel.

### Vérifier avant de projeter

Le bouton **✓ Vérifier** signale les erreurs d'image, les animations sans cible, les éléments hors cadre, les documents volumineux, les zones vides, les textes petits et les limites de conversion PPTX.

Le diagnostic est partagé par `src/quality/audit.ts`, l'éditeur Web et l'outil MCP `audit_presentation`. Il n'inspecte pas les pixels d'un véritable écran Office et ne remplace donc pas une projection de contrôle.

## Import PowerPoint : ce qui est récupéré

| Élément du fichier | Traitement |
| --- | --- |
| Ordre et dimensions des diapositives | Préservés dans un document JSON par diapositive |
| Textes et positions | Objets éditables, si représentés comme formes textuelles OOXML compatibles |
| Photographies PNG/JPEG/WebP/GIF | Décompression puis adaptation locale pour Neon ; réinsertion comme images |
| Transparence PNG | Détection complète des pixels alpha ; conservation en PNG |
| Notes du présentateur | Conservées lorsqu'elles figurent dans un `notesSlide` OOXML standard |
| Formes simples | Importées comme objets quand la géométrie et le remplissage sont disponibles |
| HTML/CSS déjà au format Diaporama de singe | Récupérable via l'export JSON et son réimport |
| Masters, SmartArt, graphiques complexes, groupes, transitions, animations PowerPoint | Compatibilité partielle ou absente ; contrôler l'aperçu et l'export |

L'import PowerPoint repose sur `jszip` et `fast-xml-parser`, sans serveur de conversion externe ; le texte et les médias ne sont envoyés à Neon qu'après validation.

Les styles PowerPoint ne sont pas tous équivalents au CSS. De même, une diapositive HTML/CSS libre peut être visuellement fidèle sous forme d'image PowerPoint, mais tous ses éléments ne seront pas forcément modifiables dans Office.

## Limites de sécurité et de taille

- PPTX : fichier d'entrée jusqu'à **45 Mo**, maximum **40 diapositives** par import.
- Archive PowerPoint : limite de **130 Mo** de contenus décompressés, d'environ **7 Mo** par XML et **16 Mo** par média intégré. Les archives ZIP suspectes sont rejetées avant l'extraction des membres.
- Les images sont redimensionnées en local vers 1600 px au maximum pour limiter le stockage et accélérer les transferts ; budget global d'environ **16 Mo** après adaptation. Les détails transparents sont conservés lorsque le navigateur sait les décoder.
- JSON : 18 millions de caractères au plus ; jusqu'à 40 diapositives.
- HTML : environ 900 000 caractères ; jusqu'à 40 sections `data-slide`, sinon une seule page.
- Les fichiers sont découpés en requêtes d'au plus 20 pages et environ 1,4 Mo chacune. Une importation interrompue tente de supprimer la copie incomplète.
- L'import crée **une nouvelle présentation** ; jamais de remplacement silencieux d'un original.
- Le HTML importé est dépouillé des scripts, formulaires et contenus embarqués ; son rendu est isolé dans un iframe dépourvu de permission d'exécution de JavaScript, avec une CSP restrictive.
- Les routes de la bibliothèque exigent une authentification ; le moteur MCP applique ses scopes OAuth, et les données résident exclusivement dans Neon ChatGPT.

## MCP : flux d'amélioration recommandé

Pour obtenir un résultat de qualité avec peu de tokens :

1. `get_improvement_brief` : inventaire compact des textes, notes, images, révisions et modes de diapositive.
2. `audit_presentation` : diagnostic de la cohérence graphique et technique, partagé avec l'éditeur.
3. `get_slide` ciblé, puis `create_variants` pour les pages nécessitant des propositions distinctes ; l'IA peut fournir du HTML/CSS original.
4. `make_visual_copy` si l'on souhaite créer instantanément une copie graphique déterministe ; sinon `create_presentation` et `add_slides` avec des documents reconstruits.
5. `edit_slides` pour les modifications finales en lot, en respectant les révisions et les notes.
6. `add_reveal_sequence` et `get_animation_plan` pour enrichir et vérifier les apparitions pédagogiques.
7. `audit_presentation` en conclusion, avant la vérification en plein écran et l'export.

Ne jamais prétendre avoir directement généré un fichier Google Slides natif ou converti toutes les animations Web en animations PowerPoint.

## Vérifications

- Tests GitHub Actions : TypeScript, Node et build Vite ; import XML, notes, ordre des diapositives, images entrelacées, JSON, réduction des risques d'archives ZIP, contrôles qualité et anciens tests des moteurs graphiques, MCP, images et animations.
- Tests réels en navigateur : importer un PPTX contenant deux pages, textes, photographie et notes ; enregistrer dans Neon ; produire une copie graphique ; exporter en PPTX modifiable ; réimporter le PPTX et vérifier que textes, images et notes sont toujours présents.
- Contrôle de cohérence : le même audit s'affiche dans l'éditeur et via `audit_presentation`.
- Non-régression : sources et fichiers restent dans le projet ChatGPT ; les documents de test sont supprimés à l'issue des vérifications.

## Limites résiduelles

- Conversion OOXML partielle des diagrammes, groupes, masques et effets avancés ; un contrôle visuel est nécessaire.
- Pas de synchronisation directe Google Slides ni de connexion Google OAuth.
- Pas d'export natif des animations Web dans PowerPoint ; elles fonctionnent dans le lecteur Web.
- Certaines ressources externes nécessitent une connexion Internet et l'accord CORS de leur hébergeur.
- L'amélioration graphique automatique dans l'interface est déterministe. La création artistique réellement ouverte suppose une session ChatGPT connectée au MCP.
- Une validation de rendu dans l'application PowerPoint / Google Slides n'a pas été automatisée.
