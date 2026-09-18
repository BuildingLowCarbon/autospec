const crypto = require('crypto');
const { AuthError } = require('./authService');
const { ensureAuthIndexes } = require('./mongoDatabase');
const { canManageOrganization, getMembership, listOrganizations, publicContentDocument } = require('./organizationService');

const collectionFor = (kind) => {
  if (kind === 'components') return 'userComponents';
  if (kind === 'materials') return 'userMaterials';
  throw new AuthError('Type de contenu inconnu.', 404);
};

const validateVisibility = async (db, visibility, organizationId, actor) => {
  const normalized = ['private', 'organization', 'public'].includes(visibility) ? visibility : 'private';
  if (normalized !== 'organization') return { visibility: normalized, organizationId: null };
  const id = String(organizationId || '');
  if (!id || (actor.role !== 'admin' && !(await getMembership(db, id, actor.id)))) {
    throw new AuthError('Vous devez appartenir à l’organisation sélectionnée.', 403);
  }
  return { visibility: normalized, organizationId: id };
};

const accessibleQuery = async (db, actor) => {
  if (actor.role === 'admin') return {};
  const memberships = await db.collection('memberships').find({ userId: actor.id }).project({ organizationId: 1 }).toArray();
  return {
    $or: [
      { ownerId: actor.id },
      { visibility: 'public' },
      { visibility: 'organization', organizationId: { $in: memberships.map((item) => item.organizationId) } },
    ],
  };
};

const decorateContent = (document, organizationsById = new Map()) => {
  const item = publicContentDocument(document);
  const organization = organizationsById.get(document.organizationId);
  const sourceName = document.visibility === 'organization'
    ? organization?.name || 'Organisation'
    : document.visibility === 'public' ? 'Communauté' : 'Mes données';
  return {
    ...item,
    source: {
      name: sourceName,
      databaseId: item.__sourceFile,
      original: document.data?.source || null,
    },
  };
};

const listVisibleContent = async (kind, actor) => {
  const db = await ensureAuthIndexes();
  const documents = await db.collection(collectionFor(kind)).find(await accessibleQuery(db, actor)).sort({ updatedAt: -1 }).toArray();
  const organizationIds = Array.from(new Set(documents.map((item) => item.organizationId).filter(Boolean)));
  const organizations = organizationIds.length
    ? await db.collection('organizations').find({ id: { $in: organizationIds } }).toArray()
    : [];
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
  const items = documents.map((document) => decorateContent(document, organizationsById));
  const sources = [];
  if (documents.some((item) => item.visibility === 'private' && item.ownerId === actor.id)) {
    sources.push({ file: 'user:private', label: 'Mes composants' });
  }
  if (documents.some((item) => item.visibility === 'public')) {
    sources.push({ file: 'community:public', label: 'Communauté' });
  }
  organizations.forEach((organization) => {
    if (documents.some((item) => item.organizationId === organization.id)) {
      sources.push({ file: `organization:${organization.id}`, label: organization.name });
    }
  });
  return { items, sources };
};

const getVisibleContentByItemId = async (kind, itemId, actor) => {
  const db = await ensureAuthIndexes();
  const access = await accessibleQuery(db, actor);
  const accessClauses = Object.keys(access).length ? [access] : [];
  const document = await db.collection(collectionFor(kind)).findOne({
    $and: [{ itemId: String(itemId) }, ...accessClauses],
  });
  if (!document) throw new AuthError('Contenu introuvable ou non accessible.', 404);
  const organization = document.organizationId
    ? await db.collection('organizations').findOne({ id: document.organizationId })
    : null;
  return decorateContent(document, new Map(organization ? [[organization.id, organization]] : []));
};

const listPublicContent = async (kind) => {
  const db = await ensureAuthIndexes();
  const documents = await db.collection(collectionFor(kind)).find({ visibility: 'public' }).sort({ updatedAt: -1 }).toArray();
  const items = documents.map((document) => {
    const item = decorateContent(document);
    delete item.__ownerId;
    return item;
  });
  return {
    items,
    sources: documents.length && kind === 'components'
      ? [{ file: 'community:public', label: 'Communauté' }]
      : [],
  };
};

const cleanData = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AuthError('Contenu invalide.');
  const data = { ...input };
  Object.keys(data).filter((key) => key.startsWith('__')).forEach((key) => delete data[key]);
  delete data.createdAt;
  delete data.updatedAt;
  if (data.source?.original) data.source = data.source.original;
  if (!data.id) data.id = crypto.randomUUID();
  return data;
};

const createContent = async (kind, input, actor) => {
  const db = await ensureAuthIndexes();
  const data = cleanData(input?.item);
  const access = await validateVisibility(db, input?.visibility, input?.organizationId, actor);
  const now = new Date();
  const document = {
    id: crypto.randomUUID(), itemId: String(data.id), ownerId: actor.id,
    ...access, data, createdAt: now, updatedAt: now,
  };
  try {
    await db.collection(collectionFor(kind)).insertOne(document);
  } catch (error) {
    if (error?.code === 11000) throw new AuthError('Un contenu utilisateur utilise déjà cet identifiant.', 409);
    throw error;
  }
  let organization = null;
  if (document.organizationId) organization = await db.collection('organizations').findOne({ id: document.organizationId });
  return decorateContent(document, new Map(organization ? [[organization.id, organization]] : []));
};

const canEditContent = async (db, document, actor) => actor.role === 'admin'
  || document.ownerId === actor.id
  || (document.organizationId && await canManageOrganization(db, document.organizationId, actor));

const updateContent = async (kind, contentId, input, actor) => {
  const db = await ensureAuthIndexes();
  const collection = db.collection(collectionFor(kind));
  const current = await collection.findOne({ id: String(contentId) });
  if (!current) throw new AuthError('Contenu introuvable.', 404);
  if (!(await canEditContent(db, current, actor))) throw new AuthError('Modification non autorisée.', 403);
  if (actor.role !== 'admin' && current.ownerId !== actor.id && (
    input?.visibility !== undefined || input?.organizationId !== undefined
  )) throw new AuthError('Seul le propriétaire peut modifier la visibilité de ce contenu.', 403);
  const data = input?.item ? cleanData(input.item) : current.data;
  if (String(data.id) !== String(current.itemId)) throw new AuthError('L’identifiant du contenu ne peut pas être modifié.', 409);
  const access = await validateVisibility(
    db,
    input?.visibility === undefined ? current.visibility : input.visibility,
    input?.visibility === undefined && input?.organizationId === undefined ? current.organizationId : input.organizationId,
    actor,
  );
  const updatedAt = new Date();
  await collection.updateOne({ id: current.id }, { $set: { data, ...access, updatedAt } });
  const next = { ...current, data, ...access, updatedAt };
  let organization = null;
  if (next.organizationId) organization = await db.collection('organizations').findOne({ id: next.organizationId });
  return decorateContent(next, new Map(organization ? [[organization.id, organization]] : []));
};

const deleteContent = async (kind, contentId, actor) => {
  const db = await ensureAuthIndexes();
  const collection = db.collection(collectionFor(kind));
  const current = await collection.findOne({ id: String(contentId) });
  if (!current) throw new AuthError('Contenu introuvable.', 404);
  if (!(await canEditContent(db, current, actor))) throw new AuthError('Suppression non autorisée.', 403);
  await collection.deleteOne({ id: current.id });
};

const getProfile = async (actor) => {
  const db = await ensureAuthIndexes();
  const organizations = await listOrganizations(actor);
  const [components, materials] = await Promise.all([
    db.collection('userComponents').find({ ownerId: actor.id }).sort({ updatedAt: -1 }).toArray(),
    db.collection('userMaterials').find({ ownerId: actor.id }).sort({ updatedAt: -1 }).toArray(),
  ]);
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));
  return {
    organizations,
    components: components.map((item) => decorateContent(item, byId)),
    materials: materials.map((item) => decorateContent(item, byId)),
  };
};

module.exports = { createContent, deleteContent, getProfile, getVisibleContentByItemId, listPublicContent, listVisibleContent, updateContent };
