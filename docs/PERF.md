# Performance — audit du bundle web

Audit du bundle web de l'export Expo (Metro, `output: static`). Objectif : réduire
le poids du **chunk d'entrée** (parsé à chaque chargement) par des gains **sans
risque** uniquement — aucun refactor produit.

## Méthode

```sh
npx expo export --platform web --dump-sourcemap
```

`source-map-explorer` refuse la source map Metro (colonne générée `Infinity` sur la
ligne 2 du bundle minifié). L'attribution des tailles a donc été faite via un petit
script maison qui agrège les `sourcesContent` de la source map par paquet
(`node_modules/<pkg>`) — chiffres en octets **originaux (non minifiés)**, utiles
pour **classer** les contributeurs, pas pour lire la taille transférée finale.

Le chunk d'entrée fait **~2,9 Mo brut (~730 Ko gzip)**. C'est un bundle
single-page classique d'app Expo/RN Web : l'essentiel est du socle framework.

## Top 5 des contributeurs (part des ~5,46 Mo de sources originales)

| # | Paquet | Poids source | Part | Nature |
|---|--------|-------------:|-----:|--------|
| 1 | `expo-router` | ~1 165 Ko | 20,8 % | routeur + navigation (socle) |
| 2 | `react-native-reanimated` | ~741 Ko | 13,2 % | animations (springs, sheets) |
| 3 | `react-native-web` | ~734 Ko | 13,1 % | couche RN→DOM (socle) |
| 4 | `react-dom` | ~533 Ko | 9,5 % | React DOM (socle) |
| 5 | `react-native-gesture-handler` | ~365 Ko | 6,5 % | gestes (sheets, swipe) |

Suivent `drizzle-orm` (~235 Ko), `react-native-svg` (~114 Ko, courbes maison +
Bristol), `expo-image`, puis le code applicatif (`src/*`, `app/*`). **Aucun de ces
top contributeurs n'est retirable** sans démonter des fondations (routeur,
animations, couche web) : hors périmètre « quick win sans risque ».

## Quick win appliqué — seed d'aliments en chunk paresseux

`src/data/foods.seed.json` (~110 Ko, ~380 aliments FR) était importé **statiquement**
dans `src/db/seedFoods.ts` → embarqué et parsé dans le chunk d'entrée à **chaque**
démarrage. Or il n'est nécessaire qu'au **tout premier lancement** (insertion
idempotente versionnée) : une fois seedé, `seedFoods()` sort avant même d'en avoir
besoin. Passé en **import dynamique** à l'intérieur de la fonction, après le
court-circuit de version → Metro le sépare en chunk `foods-*.js` chargé seulement
quand le seed s'exécute réellement.

| | Entrée brut | Entrée gzip | Chunk foods (gzip) |
|---|---:|---:|---:|
| Avant | 3 071 726 B | 731 298 B | — (dans l'entrée) |
| Après | 3 004 336 B | 724 957 B | 5 357 B (différé) |
| Δ | **−67 390 B** | **−6 341 B** | déféré au 1ᵉʳ lancement |

Gain modeste mais **strictement sûr** (comportement de seed identique, idempotent,
tests inchangés) et surtout : sur tous les démarrages **déjà seedés** (le cas
courant), ces ~5,4 Ko gzip ne sont **plus jamais** chargés.

## Pistes futures (non appliquées — hors « sans risque »)

- **Code-splitting expo-router** : activer les *async routes* pour ne pas charger
  toutes les routes (onboarding 16 écrans, urgence, premium…) dans l'entrée. Gain
  potentiel important, mais change le comportement de chargement → à valider avec
  l'E2E de persistance et le SSR statique.
- **Tree-shaking i18n** : les 4 namespaces FR/EN (~57 Ko src) sont bundlés en dur.
  Un découpage par langue / chargement paresseux du bundle EN réduirait l'entrée
  pour la majorité francophone.
- **reanimated / gesture-handler** : audités comme incompressibles ici ; un passage
  ultérieur pourrait vérifier qu'aucun helper lourd inutilisé n'est tiré.
