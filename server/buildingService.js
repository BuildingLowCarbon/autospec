const crypto = require('crypto');
const { AuthError } = require('./authService');
const { ensureAuthIndexes } = require('./mongoDatabase');

const MAX_STATE_BYTES = 400 * 1024;

const cleanName = (value) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new AuthError('Le nom du bâtiment est requis.', 400);
  if (name.length > 120) throw new AuthError('Le nom du bâtiment est trop long.', 400);
  return name;
};

const cleanState = (value) => {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError('État du bâtiment invalide.', 400);
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new AuthError('État du bâtiment invalide.', 400);
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) throw new AuthError('Le bâtiment contient trop de données.', 413);
  const state = JSON.parse(serialized);
  delete state.ownerId;
  delete state.id;
  return state;
};

const publicBuilding = (document) => ({
  id: document.id,
  name: document.name,
  state: document.state || {},
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
});

const listBuildings = async (actor) => {
  const db = await ensureAuthIndexes();
  const buildings = await db.collection('userBuildings').find({ ownerId: actor.id }).sort({ updatedAt: -1 }).toArray();
  return buildings.map(publicBuilding);
};

const createBuilding = async (input, actor) => {
  const db = await ensureAuthIndexes();
  const now = new Date();
  const document = {
    id: crypto.randomUUID(),
    ownerId: actor.id,
    name: cleanName(input?.name || 'Nouveau bâtiment'),
    state: cleanState(input?.state),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection('userBuildings').insertOne(document);
  return publicBuilding(document);
};

const updateBuilding = async (id, input, actor) => {
  const db = await ensureAuthIndexes();
  const collection = db.collection('userBuildings');
  const current = await collection.findOne({ id: String(id), ownerId: actor.id });
  if (!current) throw new AuthError('Bâtiment introuvable.', 404);
  const update = { updatedAt: new Date() };
  if (input?.name !== undefined) update.name = cleanName(input.name);
  if (input?.state !== undefined) update.state = cleanState(input.state);
  await collection.updateOne({ id: current.id, ownerId: actor.id }, { $set: update });
  return publicBuilding({ ...current, ...update });
};

const deleteBuilding = async (id, actor) => {
  const db = await ensureAuthIndexes();
  const result = await db.collection('userBuildings').deleteOne({ id: String(id), ownerId: actor.id });
  if (!result.deletedCount) throw new AuthError('Bâtiment introuvable.', 404);
};

module.exports = { createBuilding, deleteBuilding, listBuildings, updateBuilding };
