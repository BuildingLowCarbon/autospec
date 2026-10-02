const crypto = require('crypto');
const { createUser, listUsers } = require('./authService');
const { getMongoClient, getMongoConfig } = require('./mongoDatabase');

const run = async () => {
  const username = process.argv[2] || 'admin';
  const displayName = process.argv[3] || 'Administrateur Autospec';
  const existing = (await listUsers()).find((user) => user.username.toLocaleLowerCase('fr-CH') === username.toLocaleLowerCase('fr-CH'));
  if (existing) {
    console.log(`Le compte ${existing.username} existe déjà dans ${getMongoConfig().databaseName}.`);
    return;
  }
  const password = process.env.AUTOSPEC_INITIAL_ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  const user = await createUser({ username, displayName, password, role: 'admin', active: true });
  console.log(`Administrateur créé dans ${getMongoConfig().databaseName}.`);
  console.log(`Nom d’utilisateur : ${user.username}`);
  console.log(`Mot de passe temporaire : ${password}`);
  console.log('Conservez ce mot de passe uniquement le temps de la première connexion.');
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  try {
    const client = await getMongoClient();
    await client.close();
  } catch (error) {
    // Nothing to close when connection creation failed.
  }
});
