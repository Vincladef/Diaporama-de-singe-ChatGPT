# Étape 11 : finalisation et audit

**Périmètre exclusif :** Vincladef/Diaporama-de-singe-ChatGPT, Netlify diaporama-de-singe-chatgpt, base Neon diaporama_singe_chatgpt. Aucune modification Codex.

## Édition et synchronisation

- Panneau **Historique** : versions antérieures, dates, vignettes et restauration confirmée.
- L'historique des sauvegardes de l'éditeur et des modifications MCP réutilise la table existante public.slide_variants, avec conservation des 60 derniers checkpoints par diapositive. Les variantes artistiques et les points de restauration restent distingués.
- Contrôle des révisions à chaque écriture et restauration ; le MCP et l'éditeur refusent d'écraser une version plus récente.
- Les checkpoints sont enregistrés après l'écriture du document. Cette opération **n'est pas encore transactionnellement indissociable** de l'enregistrement ; un échec indépendant produit un avertissement.
- Synchronisation périodique toutes les neuf secondes lorsque l'éditeur est visible, ainsi qu'au focus. Si une modification distante apparaît pendant la rédaction locale, elle n'écrase pas le brouillon ; l'utilisateur peut exporter ce brouillon en JSON directement réimportable.
- Le lancement de l'export PPTX vérifie la révision distante.

## HTML/CSS et performance

- L'éditeur libre et la manipulation d'objets dans le canevas sont préservés ; le code HTML/CSS dispose d'une fenêtre agrandie, d'une application explicite, de l'indentation par Tab et de diagnostics simples.
- Les mises à jour répétées des iframes pendant la saisie du code sont regroupées sur environ 220 ms.
- Un cache de 20 images et un délai/volume maximaux encadrent la conversion PPTX d'images distantes.

## Import/export et projection

- Le prédiagnostic distingue objets natifs, fond raster avec calques éditables, et capture raster intégrale. Il signale les différences de format, les images HTTPS et la perte de l'animation Web dans PowerPoint.
- prepare_export fournit ces avertissements dans la réponse MCP ; l'éditeur conserve les modes PPTX « Visuel fidèle » et « Objets modifiables ».
- L'import PPTX existant conserve les formes simples, les photographies et notes quand elles sont accessibles. Les animations originales, thèmes, masters, SmartArt, masques, transitions et effets PowerPoint avancés restent partiels.
- Google Slides : export PPTX puis import manuel dans Google Drive. La publication directe nécessite une connexion OAuth Google propre à l'application.
- Projection : écran noir synchronisé via **B**, aller à une diapositive via **G**, pause et remise à zéro du chronomètre.

## Google Images sans clé

- La recherche Google externe n'a pas besoin de clé : elle ouvre les résultats. L'utilisateur peut ensuite coller l'URL directe de la photographie ou l'importer via le bouton du presse-papiers.
- Les liens de pages Google et les protocoles non HTTPS sont refusés ; certains liens Google imgres avec paramètre imgurl peuvent être résolus localement. Aucune prétention d'extraction automatique de vignettes Google sans fournisseur.
- Openverse et Wikimedia sans clé ; Unsplash activé lorsque la variable UNSPLASH_ACCESS_KEY est prise en charge dans Netlify. Pexels et SerpApi restent facultatifs.
- La disponibilité d'une image ne prouve pas ses droits de réutilisation ; consulter la page source.

## Cahier des charges initial : conformité

| Exigence | Situation |
| --- | --- |
| Moteur HTML/CSS libre, créations visuellement originales | Implémenté |
| Édition visuelle, calques, notes et édition du code | Implémenté ; les sous-objets SVG ne sont pas tous éditables individuellement |
| Import PPTX/HTML/JSON et amélioration de présentations existantes | Implémenté ; objets PowerPoint complexes imparfaits |
| MCP pilotant l'application par opérations groupées, avec variantes et révisions | Implémenté ; actualiser les outils côté ChatGPT |
| Recherche multisource de photographies (20 par source par page) | Implémenté ; Google sans clé via URL manuelle, fournisseurs tiers selon configuration |
| Animations Web au clic, timeline, fenêtre publique | Implémenté ; non converti en animations PowerPoint natives |
| PowerPoint fidèle et partiellement éditable | Implémenté avec limites de rasterisation et de CORS |
| Publication native Google Slides depuis l'application | Non implémentée ; OAuth Google requis |
| Mode complètement hors ligne | Non implémenté ; Neon et ressources HTTPS restent nécessaires |
| Synchronisation événementielle en temps réel | Partielle ; interrogation périodique et au focus |
| Historique des versions et restauration | Implémenté ; écriture des checkpoints non atomique avec chaque modification |

## Vérifications

Contrôles requis avant fusion : npm audit, TypeScript, tests Node, build Vite, déploiement Netlify, essai réel création/modification/restauration sur Neon ChatGPT. Un test d'export/présentation dans PowerPoint et Google Slides avec des fichiers complexes reste une validation externe à organiser et ne doit pas être simulé.

Les principales pistes encore ouvertes sont la conversion OOXML avancée, l'authentification native Google Slides, un stockage média durable autorisé, un historique transactionnel via migration ciblée, et un véritable cache hors ligne.

**Catalogue MCP : 39 outils** après les deux nouveaux outils d'historique, sous réserve de l'actualisation des outils par ChatGPT.
