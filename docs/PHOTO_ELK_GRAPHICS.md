# Iconographie Sharp et diagrammes scientifiques ELK (phase 5)

## Périmètre

Exclusivement le dépôt `Vincladef/Diaporama-de-singe-ChatGPT`, Netlify `diaporama-de-singe-chatgpt.netlify.app` et Neon `soft-lake-83106970`. Aucune modification du dépôt Codex.

## Photothèque

La photothèque existante continue d'utiliser les fournisseurs Openverse, Wikimedia, Pexels et Unsplash (et Google Images selon les accès), avec recherche multicritère, tri thématique et références de provenance. **Aucune image n'est retenue automatiquement simplement parce qu'elle occupe la première place**.

Lorsqu'une image est sélectionnée, la fonction authentifiée `image-inspect` peut :

- télécharger et décoder les vrais octets depuis un domaine HTTPS approuvé ;
- connaître ses dimensions réelles, son format et son orientation EXIF ;
- comparer ces dimensions à celles du cadre envisagé (adaptée / limitée / insuffisante) ;
- produire trois *cadrages réels* Sharp : **centré**, **point d'attention** et **zone de détails** ;
- transmettre les trois miniatures optimisées WebP et les positions focales calculées ;
- identifier les fichiers corrompus, les formats inconnus, les retours HTTP et les erreurs de chargement.

Dans l'éditeur, l'utilisateur compare les trois cadrages et insère seulement celui choisi. Le cadrage devient une propriété CSS `objectPosition` de l'objet image, modifiable ultérieurement. L'URL d'origine, la page source, l'auteur et la licence continuent à être enregistrés dans le catalogue de médias existant. L'image originale ne se transforme pas silencieusement en fichier WebP ; la conversion optimise les **aperçus**, pas la preuve ou la source.

Pour limiter les risques SSRF, l'inspection serveur accepte seulement les hôtes médias identifiés des fournisseurs connus (ex. Unsplash, Pexels, Wikimedia, Flickr). Les autres images peuvent toujours être trouvées et insérées par l'éditeur, mais l'inspection Sharp affiche une limite explicite. Cette restriction est intentionnelle ; aucun proxy d'URL arbitraire n'est mis en place.

## Fonction MCP

`inspect_photo_candidates` reçoit jusqu'à **trois candidates**, avec URL, auteur, crédit, licence et éventuellement la page d'origine. Il renvoie à ChatGPT les dimensions réellement vérifiées et jusqu'à **neuf images de cadrage**. L'IA multimodale peut les comparer, mais elle doit encore juger leur pertinence et leurs droits, avant d'utiliser l'outil `apply_images` existant.

**Attention : une photographie de banque d'images illustre un sujet ; elle n'atteste pas un résultat scientifique.** Pour les données expérimentales, conserver les véritables sources et les valeurs originales.

## Schémas ELK

Les graphes dirigés (`flow`, `causal`, `hierarchy`) utilisent maintenant ELKjs :

1. l'IA ou l'utilisateur fournit des nœuds identifiés, libellés et, si nécessaire, décrits ;
2. les liens décrivent les relations, sans inventer de causalité ;
3. ELK calcule la disposition, les espacements, les coudes et réduit les croisements par son algorithme de couches ;
4. le document JSON enregistre les positions des **formes et textes natifs** ;
5. chaque liaison devient un élément SVG indépendant, en format vectoriel ;
6. des animations **au clic** révèlent les parties de chaque nœud.

Les matrices, cycles et cartes heuristiques conservent le moteur spécialisé existant. Les mêmes choix graphiques restent possibles en HTML/CSS libre, photographie, typographie ou document authentique : **aucune règle n'oblige à utiliser un diagramme**.

L'éditeur comporte un outil **« + Schéma »** pour écrire les nœuds et relations, examiner une prévisualisation et insérer une **nouvelle diapositive** afin de ne pas écraser la précédente. Le serveur MCP `compose_diagrams` utilise ELK par défaut pour les graphes dirigés, avec option `layoutEngine: "legacy"` en cas de besoin. Aucun React Flow n'a été ajouté.

## Export PowerPoint

| Élément | Mode modifiable | Mode fidèle |
|---|---|---|
| Texte des nœuds | Objet texte natif, éditable | Pixels dans l'image de la page |
| Fond et panneaux | Formes natives | Pixels |
| Étiquettes des flèches | Texte natif | Pixels |
| Tracés SVG ELK | Images vectorielles distinctes ; les points ne sont pas modifiables | Pixels |
| Photographie structurée | Image native, recadrage parfois différent de CSS | Capture fidèle au cadrage Web |
| Notes et références | Notes conservées | Notes conservées selon le chemin d'export |
| Animations au clic | Compatibilité partielle selon l'effet PowerPoint | Étapes ou captures, selon le mode |

Le contrôle `inspectExport` avertit explicitement lorsque des liaisons ELK ou des positions focales personnalisées risquent de différer dans PowerPoint modifiable.

## Tests et limites

- Tests réels Sharp : production de trois WebP et vérification des pixels/résolutions sur un original synthétique décodé.
- Tests ELK : placement et routage du réseau cognitif Clark et Wells ; vérification des textes éditables, des flèches SVG, des labels, des animations et des contraintes géométriques.
- CI : audit npm, TypeScript, tests Node, compilation Vite, captures Playwright.
- Contrôle sur une présentation scientifique enregistrée : compléter après déploiement en utilisant l'outil MCP sur la démonstration Clark et Wells.
- Le classement esthétique et l'adéquation sémantique ne sont pas calculés par Sharp ou ELK. Le jugement d'images appartient au modèle multimodal et à l'utilisateur.
