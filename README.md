# Crohnicle (nom de travail)

**Le compagnon MICI de référence francophone.** Documenter sa maladie en quelques secondes par jour, comprendre ses déclencheurs, et arriver armé chez son gastro-entérologue.

Crohnicle est une application mobile (iOS / Android / Web) destinée aux personnes atteintes d'une maladie inflammatoire chronique de l'intestin (MICI — maladie de Crohn et rectocolite hémorragique). Elle transforme le suivi quotidien des symptômes, des repas et des traitements en un geste rapide et sans anxiété, puis restitue des tendances et un export lisible pour la consultation médicale.

## Les 4 lois du produit

Tout arbitrage produit, design ou technique se tranche dans cet ordre de priorité :

1. **Zéro friction** — toute action quotidienne tient en ≤ 10 secondes et ≤ 3 taps. Photo, voix et saisie manuelle convergent vers le même pipeline « brouillon pré-rempli → confirmation en 1 tap ». Aucun champ obligatoire, des défauts intelligents.
2. **Zéro perte de données** — SQLite en mode WAL transactionnel, brouillon auto-sauvegardé à chaque tap, suppressions douces (soft delete), sauvegarde en 1 tap.
3. **Jamais anxiogène** — pas de score de « santé » culpabilisant, série (streak) gelée automatiquement pendant une poussée, ton bienveillant, pas de rouge alarmiste.
4. **Privacy structurelle** — les données de santé restent à 100 % sur l'appareil, le proxy IA est sans état et ne stocke rien, pas d'analytics tiers, pas de compte obligatoire.

## Stack technique

- **Expo / React Native** (expo-router, TypeScript) — cibles iOS, Android et Web.
- **SQLite local-first** (expo-sqlite + drizzle-orm) — données de santé stockées et traitées localement.
- **Proxy IA** stateless (Cloudflare Worker) pour l'analyse photo des repas — aucune donnée de santé stockée côté serveur.

## Avertissement médical

**Cette application n'est pas un dispositif médical et ne remplace pas un avis médical.** Les scores et tendances (HBI, SCCAI, associations alimentaires) sont des auto-évaluations à visée informative et de préparation à la consultation. En cas de symptôme préoccupant, consultez un professionnel de santé.

## Licence

Distribué sous licence MIT (voir [`LICENSE`](./LICENSE)). Ce dépôt est une reconversion du fork open source `openscreen` ; le copyright original est conservé aux côtés de celui des contributeurs Crohnicle.

## English

**Crohnicle** is a French-first mobile companion for people living with inflammatory bowel disease (IBD — Crohn's disease and ulcerative colitis). It makes daily tracking of symptoms, meals and treatments a fast, calm, few-seconds-a-day habit, then surfaces trends and a clinician-ready export. Built with Expo / React Native, local-first SQLite storage, and a stateless AI proxy for meal photo analysis. **This app is not a medical device and does not replace professional medical advice.** MIT-licensed; repurposed from the open source `openscreen` fork.
