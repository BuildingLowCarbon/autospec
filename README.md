# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Authentification locale et MongoDB

L'API locale charge `MONGODB_URI` depuis `atlas-credentials.env` ou `.env.local`. Ces fichiers restent locaux et ne doivent jamais être suivis par Git. Si le nom de la base n'est pas inclus dans l'URI, l'API utilise `MONGODB_DB`, puis `autospec` par défaut.

Lancer l'application et l'API avec :

```bash
npm start
```

La connexion est disponible sous `/login`. La gestion des comptes et des accès se trouve sous `/dashboard/utilisateurs` pour les administrateurs. Pour créer le tout premier administrateur d'une base vide :

```bash
npm run auth:create-admin -- admin "Administrateur Autospec"
```

Le mot de passe temporaire généré n'est affiché qu'une fois. Les mots de passe sont hachés côté serveur et les sessions sont conservées dans MongoDB avec expiration automatique.

Les profils sont disponibles sous `/profile` et la gestion des organisations sous `/organizations`. Les nouveaux composants dupliqués dans Custom et les matériaux créés depuis le profil sont enregistrés dans MongoDB avec une visibilité `private`, `organization` ou `public`. La base système `components_custom.json` reste séparée et globale.

## Dashboard des bases de données

Le Dashboard est disponible sous `/dashboard`. Il permet d’unifier les trois sources Lignum, de sélectionner les composants publiés, de contrôler les références, de gérer les correspondances Lignum → TBZ et de créer ou modifier les matériaux, produits et composants.

Les écritures passent par `src/setupProxy.js`; il faut donc utiliser `npm start` (ou reprendre ces routes API dans le serveur de production). Chaque enregistrement met à jour le JSON actif sous `public/db` et crée une copie horodatée sous `public/db/versions/<base>/`. Les correspondances sont conservées dans `public/db/mappings/lignum_product_tbz.json`.

Le test de fidélité de la conversion et du versionnage se lance avec `npm run test:db`.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
