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
- Notes privées, compte à rebours depuis l'ouverture (chronomètre) et aperçu de la diapositive suivante.
- Plein écran pour la console ou fenêtre séparée **Ouvrir l'écran public**.
- La fenêtre publique reçoit uniquement un instantané des diapositives et les commandes via un `BroadcastChannel` de même origine lié à une session aléatoire. Aucune clé du compte, aucune note et aucun accès direct à Neon ne sont transmis. La connexion est temporaire et s'arrête lorsque la console se ferme.

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
