# Étape 9 : autonomie visuelle et efficacité MCP

Périmètre exclusif : GitHub `Vincladef/Diaporama-de-singe-ChatGPT`, Netlify `diaporama-de-singe-chatgpt`, Neon `diaporama_singe_chatgpt`. Aucun changement dans la version Codex.

## Catalogue et cache ChatGPT

Le catalogue MCP est enregistré au démarrage du serveur. `workspace_status` retourne désormais `toolCount`, `toolNames` et `toolCatalogVersion` : ce sont les outils *réellement déclarés par le serveur*, et non une liste maintenue séparément.

Comparer ce nombre avec les commandes exposées dans la session ChatGPT. Si les nombres divergent, demander à l'utilisateur d'**actualiser les outils du plugin** dans les paramètres de ChatGPT ; un serveur MCP ne peut pas forcer à distance la réindexation du cache du client. Ne pas créer de doublon de plugin. La version 0.9.0 publie 32 outils.

## Nouveau parcours visuel en 1 à 3 appels

1. `compose_slides` : envoyer jusqu'à 40 compositions sémantiques en une requête ; mises en page `hero`, `section`, `split`, `quote`, `cards`, `comparison` et `timeline`. L'IA fournit le contenu, une URL d'image HTTPS facultative, des éléments de liste et quelques couleurs hexadécimales. Les objets éditables et les coordonnées sont générés par le moteur. Les options `append` et `replace` permettent la création ou la refonte. Le remplacement exige une confirmation explicite et la révision de chaque diapositive ; la mise à jour est atomique. Les notes existantes ne sont modifiées que sur demande.
2. `review_slides` : analyser jusqu'à 40 diapositives en une requête ; recevoir, par diapositive, la révision, les métriques, les erreurs, les recouvrements probables, les dépassements de texte et une **URL de prévisualisation** avec ticket signé valable 10 minutes. Le service `/previews/slide` affiche le rendu Web fidèle dans une iframe sans scripts ; la page hôte ne connaît pas le code OAuth. Le lien peut être ouvert par un navigateur capable de faire des captures, sans exposer les données dans une route anonyme permanente. Ne pas publier ces URL.
3. `repair_slides` : appliquer une correction sur un lot de 40 diapositives au maximum. Le mode `safe` réintègre les objets simples dans le canevas et règle les images sans cadrage ; le mode `readability` peut aussi augmenter à 24 px les polices trop petites. L'aperçu `dryRun=true` est activé par défaut et ne modifie rien. La sauvegarde exige un appel explicite avec `dryRun=false` et la révision lue auparavant ; un conflit bloque tout le lot.

Les autres outils de l'étape 8 restent disponibles pour modifier un objet isolé ou créer du HTML/CSS original.

## Différence entre audit et analyse visuelle

L'analyse statique ne remplace **pas** un rendu pixel par pixel : elle détecte des risques à partir des dimensions, textes, objets et styles connus. Elle ne peut pas prouver qu'une photographie externe se charge, ni déterminer la qualité d'une typographie Web, l'intention d'une superposition, ou le contraste réel d'un calque semi-transparent. Le navigateur permet à ChatGPT, lorsqu'il dispose d'un outil de capture, d'examiner la diapositive affichée ; le MCP ne prétend pas renvoyer automatiquement une image rasterisée. Pour les compositions HTML/CSS libres, utiliser l'aperçu navigateur avant toute retouche majeure.

## Tests et sécurité

- Tests du moteur : 7 mises en page, détection des chevauchements et débordements, corrections prudentes, préservation des animations et du HTML, validation des URL.
- Même moteur JSON Zod, même contrôle de révision et mêmes transactions Neon que les anciennes commandes.
- Liens HMAC calculés avec le secret existant, expiration maximale 10 minutes, réponses sans cache, aucun nouvel accès public en écriture.
- L'URL d'aperçu vise uniquement une diapositive, non toute la base.
- Contrôles requis avant fusion : TypeScript, tests Node, build Vite, dépendances npm ; puis création, lecture, édition et suppression d'une présentation temporaire sur la pile ChatGPT.

## Exemple d'utilisation

Créer le plan par `compose_slides` en mode `append`, vérifier via `review_slides`, ouvrir les URL d'aperçu, puis éventuellement lancer `repair_slides` en simulation et appliquer les seules corrections validées. Pour les mises en page complexes, utiliser ensuite `edit_slides` pour ajouter librement du HTML/CSS.
