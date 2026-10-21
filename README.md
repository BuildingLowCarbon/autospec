# AutoSpec

Application React construite avec Vite. En développement, Vite sert le frontend sur le port 3000 et un serveur Express local expose l’API sur le port 3001. Le proxy Vite conserve des URL identiques à la production sous `/api`.

## Installation

```bash
npm install
```

L’API charge `MONGODB_URI` depuis `atlas-credentials.env` ou `.env.local`. Ces fichiers restent locaux et ne doivent jamais être suivis par Git. Si le nom de la base n’est pas inclus dans l’URI, l’API utilise `MONGODB_DB`, puis `autospec` par défaut.

## Développement local

```bash
npm start
```

Cette commande lance simultanément :

- le frontend Vite sur `http://localhost:3000` ;
- l’API Express locale sur `http://127.0.0.1:3001` ;
- le proxy `/api` de Vite vers l’API.

Les commandes séparées sont également disponibles :

```bash
npm run dev:web
npm run dev:api
```

La connexion est disponible sous `/login`. La gestion des comptes et des accès se trouve sous `/dashboard/utilisateurs` pour les administrateurs. Pour créer le premier administrateur d’une base vide :

```bash
npm run auth:create-admin -- admin "Administrateur AutoSpec"
```

Les mots de passe sont hachés côté serveur et les sessions sont conservées dans MongoDB avec expiration automatique. Les profils sont disponibles sous `/profile` et les organisations sous `/organizations`.

La page protégée `/my-buildings` enregistre les bâtiments de chaque utilisateur dans la collection MongoDB `userBuildings` : critères, filtres, composants sélectionnés et surfaces utilisées pour le bilan carbone.

## Production

```bash
npm run build
```

Le frontend de production est généré dans `dist/`. La commande suivante permet de contrôler localement ce frontend compilé :

```bash
npm run preview
```

Le serveur Vite de développement et `server/devServer.js` ne sont pas utilisés en production. Sur Vercel, `api/index.mjs` expose la même application Express sous `/api` sous la forme d’une fonction Node.js. Les routes restent définies une seule fois dans `server/apiRoutes.js`.

Configurer les variables suivantes dans **Vercel > Project Settings > Environment Variables** pour les environnements Production et Preview :

- `MONGODB_URI` : URI complète du cluster Atlas, avec l’utilisateur et le mot de passe ;
- `MONGODB_DB` : `autospec` (facultatif si ce nom figure déjà dans l’URI).

Ne jamais ajouter `atlas-credentials.env` au dépôt Git. Les composants et matériaux personnels, d’organisation et publics sont lus et écrits dans MongoDB. Les bases système JSON sont en lecture seule sur Vercel : elles doivent être modifiées localement, puis publiées par un commit et un push Git. Les routes de maintenance correspondantes du dashboard sont donc disponibles uniquement en local ; la gestion MongoDB des utilisateurs, organisations et contenus partagés reste disponible sur Vercel.

Les sources Lignum, anciennes bases et versions de sauvegarde (`public/db/source_database`, `public/db/old` et `public/db/versions`) sont volontairement exclues du déploiement par `.vercelignore`. Elles servent uniquement à la maintenance locale et représentent plusieurs centaines de mégaoctets. Les JSON système actifs référencés par `public/db/db_files.json` restent déployés.

Le routage Vercel traite `/api/*` avant le repli SPA vers `index.html`. Le point de contrôle public suivant permet de confirmer que la fonction est en ligne :

```text
https://<domaine>/api/health
```

## Tests

```bash
npm test
npm run test:db
```

`npm test` exécute les tests React avec Vitest. `npm run test:db` exécute séparément les contrôles Node des bases Lignum.

## Dashboard des bases de données

Le Dashboard est disponible sous `/dashboard`. Il permet notamment d’unifier les sources Lignum, contrôler les références, gérer les correspondances et corriger les composants, matériaux et produits.

En local, les écritures système passent par les routes enregistrées dans `server/apiRoutes.js` et exécutées par `server/devServer.js`. Elles mettent à jour les JSON actifs sous `public/db` et créent leurs versions sous `public/db/versions`.

Dans **Structures → Générer des variantes → Historique des générations**, chaque lot reprend les trois colonnes de la nouvelle génération : structure et couches intégrées, couches au-dessus, couches au-dessous. On peut modifier un groupe avec les mêmes champs que dans Custom, puis prévisualiser les composants concernés. Les identifiants sont conservés ; les propriétés sont recalculées et les révisions sont enregistrées dans `public/db/structure_generation_history.json`, avec des versions sous `public/db/versions`. La suppression d’un lot demande confirmation ; elle supprime ses composants propres et conserve les composants réutilisés ou partagés avec d’autres lots. Les lots manquants sont récupérés depuis les composants générés, y compris lorsqu’un ancien serveur n’avait pas enregistré leur historique.

Les matériaux se recherchent par nom, densité ou KBOB. Une couche en parallèle est classée avec son hôte : une isolation entre lattes de façade reste dans le groupe de façade, tandis qu’une isolation entre montants porteurs fait partie des variantes de structure.

Les références Lignum sont converties avec `public/db/mappings/lignum_product_tbz.json` avant les calculs et l’enregistrement. Une référence inconnue bloque la génération au lieu de produire silencieusement un poids nul. Pour auditer les anciens composants générés : `npm run repair:generated`. Pour appliquer la réparation et importer leurs lots historiques : `npm run repair:generated -- --write` (sauvegarde préalable automatique). Les regroupements historiques déduits des dates sont signalés comme reconstitués dans l’interface.

`npm run test:generated` vérifie la réparation des références et les mises à jour des générations sans modifier les bases actives.
