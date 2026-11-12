# Animations et projection : étape 7

Ce document décrit l'implémentation du projet **Diaporama de singe ChatGPT** uniquement. Le dépôt Codex et ses ressources ne sont pas concernés.

## Principe

Les animations sont définies dans `SlideDocument.animations`, conservées avec les éléments et le HTML/CSS dans le même document JSON versionné de Neon. L'éditeur manuel et le serveur MCP modifient exactement ces données. La projection se fait depuis un navigateur ; aucun serveur de rendu ni Google OAuth n'est requis.

Le HTML/CSS de l'utilisateur reste libre, y compris ses `@keyframes`. Pour des effets déclenchés depuis l'interface, le parent React agit sur le DOM de la diapositive avec la **Web Animations API** ; les scripts éventuels contenus dans cette dernière restent interdits par le sandbox et la CSP. Le moteur ne convertit pas la composition Web en un modèle de diapositives rigide.

## Chronologie manuelle

Sous l'aperçu de la diapositive, ouvrir **Animations**.

1. Choisir un élément structuré ; pour une composition HTML libre, saisir un sélecteur CSS tel que `#titre` ou `.question`. Les identifiants HTML courants sont proposés dans le menu.
2. Choisir un effet et son déclencheur : **Au clic** ou **Après le précédent**.
3. Définir la durée, puis cliquer **Ajouter**.
4. Glisser les étapes pour les réordonner. Utiliser les paramètres avancés pour régler le délai, l'accélération et la direction du déplacement.
5. Cliquer sur **Prévisualiser** ou **Présenter**. Les modifications sont sauvegardées via le mécanisme existant de révision Neon.

Les étapes `after-previous` placées avant le premier clic forment une introduction automatique. Un clic lance la prochaine étape `click`, puis toutes les étapes `after-previous` suivantes, dans l'ordre. Le bouton Précédent revient à l'état du dernier clic ; le retour arrière reconstruit cet état sans relancer toute la diapositive.

### Effets disponibles

| Effet | Rendu |
| --- | --- |
| `appear` | Apparition immédiate |
| `fade` | Fondu progressif |
| `move` | Déplacement avec apparition ; réglages `offsetX` et `offsetY` |
| `scale` | Zoom progressif |
| `wipe` | Dévoilement horizontal |
| `highlight` | Halo pédagogique persistant autour d'un élément |
| `dim` | Atténuation de l'élément |
| `hide` | Masquage |
| `custom` | Images clés Web Animations personnalisées, sans exécution JavaScript provenant de la diapositive |

Les animations sont compatibles avec les objets structurés grâce à `targetElementId`, et avec le HTML/CSS libre grâce à `targetSelector`. La cible doit exister dans le DOM au moment de la projection. Un sélecteur invalide ou un élément absent ne déclenche aucune action ; les autres étapes continuent.

Le champ `keyframes` accepte un tableau de 2 à 16 images clés avec des propriétés CSS telles que `opacity`, `transform`, `filter`, `clipPath`, `color` ou `boxShadow`. Les keyframes `custom` s'exécutent depuis l'application par la Web Animations API ; le CSS personnalisé reste utilisable dans le document.

## Mode présentateur

Cliquer **▶ Présenter** depuis l'éditeur.

- Affichage du diaporama au format et aux proportions de ses propres diapositives.
- Avancer au clic, avec Espace / flèche droite. Revenir avec la flèche gauche. Home / End pour naviguer.
- **▶ Présenter** ouvre directement la projection publique, uniquement les diapositives ; le plein écran est demandé dans le geste utilisateur. Si le navigateur refuse, le bouton Plein écran reste disponible.
- La flèche ▾ du bouton Présenter permet de choisir **Mode Présentateur avec notes**. La page principale affiche uniquement les diapositives ; une nouvelle fenêtre privée présente le chronomètre, les notes redimensionnables, les miniatures et la navigation.
- Les deux fenêtres se synchronisent par `BroadcastChannel` de même origine, avec un identifiant de session aléatoire. Les messages de notes ne sont envoyés qu'à la fenêtre privée ; la projection ne les rend jamais. La page principale ne communique aucun jeton d'authentification au présentateur.
- Le navigateur peut bloquer l'ouverture d'une fenêtre ou refuser le passage au plein écran combiné à un pop-up. Un bouton explicite permet alors d'ouvrir les notes ou de passer en plein écran séparément.
- En visioconférence, partager **l'onglet ou la fenêtre de projection** ; ne jamais choisir le partage de l'écran entier lorsque les notes privées sont visibles sur le même moniteur.
- Les flèches, Espace, Home, End, G (aller à), B (écran noir), F (plein écran sur l'écran public) sont conservés. Quitter met fin à la session et ferme la console privée si le navigateur l'autorise.

La projection ne fait pas appel à Neon à chaque clic. Un instantané déjà chargé continue à fonctionner tant que les médias nécessaires sont disponibles ; **le mode totalement hors ligne n'est pas garanti** pour les photos, polices et autres ressources HTML externes.

## Serveur MCP

Les nouveaux outils offrent une façon plus efficace de piloter les présentations :

- `get_animation_plan` retourne un sommaire compact, clic par clic, avec les étapes automatiques.
- `add_reveal_sequence` crée toute une séquence en une seule opération : liste d'ID d'éléments, ou sélecteurs préfixés par `css:` ; mode `each`, `together` ou `automatic` ; effet et durée optionnels. Les étapes existantes sont préservées par défaut.
- `edit_slides` garde les opérations granulaires `set_animations`, `append_animation` et `remove_animation` pour les compositions sur mesure.

Le tout utilise la validation Zod et des écritures atomiques avec contrôle des révisions.

## Compatibilité des exports

Les deux modes d'export PowerPoint existants préservent les compositions dans les limites documentées dans `docs/EXPORT.md`. **Les animations de projection Web ne sont pas traduites en animations PowerPoint natives.** La voie Google Slides reste l'import manuel du PPTX ; aucun contrôle d'animation Google Slides n'est revendiqué.

## Vérifications

Un jeu d'essai de trois diapositives a permis de vérifier dans un navigateur réel :
- apparition initiale, deux clics successifs et apparition automatique en chaîne ;
- retour arrière sans faire réapparaître les éléments suivants ;
- ciblage de `#free-heading` et `.lesson` dans une diapositive HTML/CSS libre ;
- animation CSS `@keyframes` active dans la projection ;
- ouverture d'une fenêtre publique, synchronisation des changements et absence des notes privées ;
- ajout d'un effet depuis le panneau visuel, sauvegardé avec une nouvelle révision Neon ;
- lecture de la chronologie et création de deux animations en une seule opération MCP.

Les vérifications de compilation TypeScript, tests unitaires et build Vite sont automatisées dans GitHub Actions. Les médias externes dépendent de leurs politiques réseau et CORS.
