const { MongoClient, ServerApiVersion } = require('mongodb');
const { loadLocalEnvironment } = require('./localEnvironment');

let clientPromise;
let indexesPromise;

const databaseNameFromUri = (uri) => {
  const match = String(uri).match(/\.mongodb\.net\/([^?/]*)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const getMongoConfig = () => {
  loadLocalEnvironment();
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!uri) throw new Error('MONGODB_URI est absente de la configuration serveur.');
  return {
    uri,
    databaseName: process.env.MONGODB_DB || databaseNameFromUri(uri) || 'autospec',
  };
};

const getMongoClient = () => {
  if (!clientPromise) {
    const { uri } = getMongoConfig();
    const client = new MongoClient(uri, {
      appName: 'Autospec',
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      serverSelectionTimeoutMS: 10000,
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
};

const getDatabase = async () => {
  const client = await getMongoClient();
  return client.db(getMongoConfig().databaseName);
};

const ensureAuthIndexes = async () => {
  if (!indexesPromise) {
    indexesPromise = getDatabase().then(async (db) => {
      await Promise.all([
        db.collection('users').createIndex({ usernameNormalized: 1 }, { unique: true, name: 'username_unique' }),
        db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true, name: 'session_token_unique' }),
        db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_expiry' }),
        db.collection('sessions').createIndex({ userId: 1 }, { name: 'sessions_by_user' }),
        db.collection('auditLogs').createIndex({ createdAt: -1 }, { name: 'audit_chronological' }),
        db.collection('organizations').createIndex({ slug: 1 }, { unique: true, name: 'organization_slug_unique' }),
        db.collection('memberships').createIndex({ organizationId: 1, userId: 1 }, { unique: true, name: 'membership_unique' }),
        db.collection('memberships').createIndex({ userId: 1 }, { name: 'memberships_by_user' }),
        db.collection('userComponents').createIndex({ itemId: 1 }, { unique: true, name: 'user_component_id_unique' }),
        db.collection('userComponents').createIndex({ ownerId: 1, organizationId: 1, visibility: 1 }, { name: 'user_components_access' }),
        db.collection('userMaterials').createIndex({ itemId: 1 }, { unique: true, name: 'user_material_id_unique' }),
        db.collection('userMaterials').createIndex({ ownerId: 1, organizationId: 1, visibility: 1 }, { name: 'user_materials_access' }),
      ]);
      return db;
    }).catch((error) => {
      indexesPromise = undefined;
      throw error;
    });
  }
  return indexesPromise;
};

module.exports = { ensureAuthIndexes, getDatabase, getMongoClient, getMongoConfig };
