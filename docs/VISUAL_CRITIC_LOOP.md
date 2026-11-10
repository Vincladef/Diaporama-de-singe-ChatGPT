# Boucle de contrôle visuel Chromium et ChatGPT (phase 4)

## Portée

**Uniquement** `Vincladef/Diaporama-de-singe-ChatGPT` ; ne pas toucher à la version Codex. Neon : `soft-lake-83106970 / diaporama_singe_chatgpt`. L'éditeur, les variantes et leurs notes restent les sources de vérité.

## Rendu réel

La nouvelle fonction `netlify/functions/visual-capture.mts` démarre Chromium headless avec Playwright et `@sparticuz/chromium`. Elle n'est accessible que par POST signé HMAC depuis le serveur MCP ; elle ne reçoit jamais un URL arbitraire ni un HTML fourni directement par l'appelant. Le contenu chargé vient de la diapositive versionnée dans Neon, via `renderSlideHtml` déjà utilisé par l'éditeur.

La fonction :

1. refuse une capture si la source a changé depuis la demande ;
2. bloque les scripts et les sous-frames ; autorise seulement des ressources HTTPS publiques pour images, polices et feuilles de styles ;
3. attend le document, les images et les polices, dans des bornes de temps ;
4. capture le **vrai rendu Chromium**, à la résolution native de la diapositive, maximum 2560 px de côté et 3,7 mégapixels ;
5. collecte les images non chargées, échecs réseau, éléments textuels débordants et écarts au 16:9 ;
6. retourne un PNG et un diagnostic DOM. Elle **ne prétend pas** évaluer l'esthétique.

La fonction reste séparée du MCP pour ne pas charger Chromium dans chaque demande de l'application. Le module Chromium est déployé seulement avec la fonction `visual-capture` via `external_node_modules` ciblé. Aucune nouvelle plateforme de rendu n'est nécessaire.

## Critique multimodale réelle

Trois nouveaux outils sont exposés à ChatGPT :

- `inspect_visual_render(slideId,variantId?,sessionId?,includeReference?)` démarre une session si besoin, demande une capture à Chromium, stocke l'image et renvoie à ChatGPT **une image PNG réellement affichable**, ainsi que les diagnostics et une éventuelle image de référence. C'est à ce moment que le modèle multimodal voit et apprécie effectivement la composition.
- `apply_visual_correction(sessionId,expectedFingerprint,correction)` effectue une retouche CSS ciblée ou modifie des propriétés graphiques d'objets natifs, en respectant le contrôle concurrent de révision. Il interdit les changements de texte, les notes et les animations, ainsi que des styles susceptibles de masquer directement des informations.
- `read_visual_capture(sessionId,pass?)` permet de revoir une capture précédente, sans redémarrer Chromium.

Une session conserve au maximum **trois PNG et deux corrections**, pendant 24 heures. Les lignes expirées sont supprimées au prochain démarrage de session. Les retouches n'affectent jamais la diapositive active tant qu'une variante n'est pas sélectionnée.

## Protocole IA

Après avoir généré trois variantes, ChatGPT doit, pour chaque composition retenue :

1. appeler `inspect_visual_render` et **regarder le PNG** ;
2. comparer le visuel au contenu pédagogique, aux préférences enregistrées et aux références sélectionnées ;
3. vérifier les problèmes techniques remontés par Chromium ;
4. s'il existe un défaut concret, appeler `apply_visual_correction` en indiquant l'élément concerné et la raison, puis demander une nouvelle capture ;
5. arrêter dès que le résultat est acceptable, au plus tard après trois captures.

L'analyse esthétique demeure un jugement du modèle, guidé par l'utilisateur, **sans score universel de beauté**. Aucune API OpenAI payante n'est appelée depuis Netlify. Des coûts d'exécution Netlify éventuels restent ceux du service existant.

## Sécurité

- URL de capture **interne, signée**, expiration sous 40 secondes ;
- pas de navigation Web arbitraire, de proxy externe ni de lecture de secrets client ;
- sorties réservées à ChatGPT MCP avec autorisation ;
- protections SSRF basiques sur les URL d'images, polices et CSS ;
- données en table privée `slide_visual_review_sessions` et `slide_visual_review_captures`, dans la base ChatGPT seulement ;
- pas de modèle IA caché ou de jugement imaginaire.

## Tests

`npm run check`, `npm run test`, `npm run build`, `npm audit --audit-level=moderate`.

**Test d'intégration réel :** le workflow GitHub installe Chromium avec Playwright, rend deux diapositives HTML/CSS 16:9, vérifie la signature PNG, les dimensions, les ressources et la différence entre les captures. Les fichiers `visual-cognitive-loop.png`, `visual-two-column.png` et les diagnostics JSON sont conservés trois jours en artefact GitHub Actions pour examen visuel.

## Limites

- Le lancement à froid de Chromium dépend des limites de 60 secondes et 1 Go de RAM par défaut des fonctions Netlify. Vérifier un **appel de production réel** avant de prétendre le moteur entièrement opérationnel en ligne.
- Les fonds CSS distants peuvent manquer sans signal précis, même si les requêtes échouées sont signalées.
- Le contrôle du cadrage reste multimodal ; l'outil DOM ne détecte pas à lui seul le mauvais goût graphique.
- Pour la capture initiale d'une slide source, `variantId` est facultatif ; l'autocorrection ciblée ne fonctionne que sur une variante sauvegardée.
- Les outils ajoutés au serveur peuvent nécessiter un rafraîchissement du catalogue ChatGPT.
