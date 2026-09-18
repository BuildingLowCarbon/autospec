const crypto = require('crypto');
const { AuthError } = require('./authService');
const { ensureAuthIndexes } = require('./mongoDatabase');

const slugify = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const publicOrganization = (organization, membership = null) => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  description: organization.description || '',
  active: organization.active !== false,
  membershipRole: membership?.role || null,
  createdAt: organization.createdAt,
  updatedAt: organization.updatedAt,
});

const getMembership = async (db, organizationId, userId) => db.collection('memberships').findOne({ organizationId, userId });

const canViewOrganization = async (db, organizationId, actor) => actor.role === 'admin'
  || Boolean(await getMembership(db, organizationId, actor.id));

const canManageOrganization = async (db, organizationId, actor) => actor.role === 'admin'
  || (await getMembership(db, organizationId, actor.id))?.role === 'organization_admin';

const assertOrganizationAccess = async (db, organizationId, actor, manage = false) => {
  const allowed = manage
    ? await canManageOrganization(db, organizationId, actor)
    : await canViewOrganization(db, organizationId, actor);
  if (!allowed) throw new AuthError('Accès à cette organisation non autorisé.', 403);
  const organization = await db.collection('organizations').findOne({ id: organizationId, active: { $ne: false } });
  if (!organization) throw new AuthError('Organisation introuvable.', 404);
  return organization;
};

const listOrganizations = async (actor) => {
  const db = await ensureAuthIndexes();
  if (actor.role === 'admin') {
    const organizations = await db.collection('organizations').find({}).sort({ name: 1 }).toArray();
    return organizations.map((organization) => publicOrganization(organization));
  }
  const memberships = await db.collection('memberships').find({ userId: actor.id }).toArray();
  const organizations = await db.collection('organizations').find({ id: { $in: memberships.map((item) => item.organizationId) } }).sort({ name: 1 }).toArray();
  const byOrganization = new Map(memberships.map((item) => [item.organizationId, item]));
  return organizations.map((organization) => publicOrganization(organization, byOrganization.get(organization.id)));
};

const createOrganization = async (input, actor) => {
  if (actor.role !== 'admin') throw new AuthError('Seul un administrateur global peut créer une organisation.', 403);
  const db = await ensureAuthIndexes();
  const name = String(input?.name ?? '').trim().slice(0, 140);
  if (name.length < 2) throw new AuthError('Le nom de l’organisation est obligatoire.');
  if (!input?.adminUserId) throw new AuthError('Un administrateur d’organisation doit être sélectionné.');
  const organizationAdmin = await db.collection('users').findOne({ id: String(input.adminUserId), active: { $ne: false } });
  if (!organizationAdmin) throw new AuthError('L’administrateur d’organisation sélectionné est introuvable.', 404);
  const baseSlug = slugify(input?.slug || name);
  if (!baseSlug) throw new AuthError('Identifiant d’organisation invalide.');
  const now = new Date();
  const organization = {
    id: crypto.randomUUID(), name, slug: baseSlug,
    description: String(input?.description ?? '').trim().slice(0, 500),
    active: true, createdAt: now, updatedAt: now, createdBy: actor.id,
  };
  try {
    await db.collection('organizations').insertOne(organization);
  } catch (error) {
    if (error?.code === 11000) throw new AuthError('Cet identifiant d’organisation existe déjà.', 409);
    throw error;
  }
  await upsertMember(organization.id, { userId: organizationAdmin.id, role: 'organization_admin' }, actor);
  return publicOrganization(organization);
};

const organizationDetails = async (organizationId, actor) => {
  const db = await ensureAuthIndexes();
  const organization = await assertOrganizationAccess(db, organizationId, actor);
  const memberships = await db.collection('memberships').find({ organizationId }).sort({ role: 1, createdAt: 1 }).toArray();
  const users = await db.collection('users').find({ id: { $in: memberships.map((item) => item.userId) } }, {
    projection: { _id: 0, id: 1, username: 1, displayName: 1, active: 1 },
  }).toArray();
  const usersById = new Map(users.map((user) => [user.id, user]));
  const [components, materials] = await Promise.all([
    db.collection('userComponents').find({ organizationId }).sort({ updatedAt: -1 }).toArray(),
    db.collection('userMaterials').find({ organizationId }).sort({ updatedAt: -1 }).toArray(),
  ]);
  return {
    organization: publicOrganization(organization, await getMembership(db, organizationId, actor.id)),
    canManage: await canManageOrganization(db, organizationId, actor),
    memberships: memberships.map((membership) => ({
      id: membership.id, userId: membership.userId, role: membership.role,
      user: usersById.get(membership.userId) || null, createdAt: membership.createdAt,
    })),
    components: components.map(publicContentDocument),
    materials: materials.map(publicContentDocument),
  };
};

async function upsertMember(organizationId, input, actor) {
  const db = await ensureAuthIndexes();
  await assertOrganizationAccess(db, organizationId, actor, true);
  let user = null;
  if (input?.userId) user = await db.collection('users').findOne({ id: String(input.userId), active: { $ne: false } });
  if (!user && input?.username) user = await db.collection('users').findOne({ usernameNormalized: String(input.username).trim().toLowerCase(), active: { $ne: false } });
  if (!user) throw new AuthError('Utilisateur actif introuvable.', 404);
  const role = input?.role === 'organization_admin' ? 'organization_admin' : 'member';
  const now = new Date();
  await db.collection('memberships').updateOne(
    { organizationId, userId: user.id },
    { $set: { role, updatedAt: now }, $setOnInsert: { id: crypto.randomUUID(), createdAt: now } },
    { upsert: true },
  );
  return { userId: user.id, role, user: { id: user.id, username: user.username, displayName: user.displayName || '' } };
}

const removeMember = async (organizationId, userId, actor) => {
  const db = await ensureAuthIndexes();
  await assertOrganizationAccess(db, organizationId, actor, true);
  const membership = await getMembership(db, organizationId, userId);
  if (!membership) throw new AuthError('Membre introuvable.', 404);
  if (membership.role === 'organization_admin') {
    const admins = await db.collection('memberships').countDocuments({ organizationId, role: 'organization_admin' });
    if (admins <= 1) throw new AuthError('L’organisation doit conserver au moins un administrateur.', 409);
  }
  await db.collection('memberships').deleteOne({ organizationId, userId });
};

const deleteOrganization = async (organizationId, actor) => {
  if (actor.role !== 'admin') throw new AuthError('Seul un administrateur global peut supprimer une organisation.', 403);
  const db = await ensureAuthIndexes();
  await assertOrganizationAccess(db, organizationId, actor, true);
  const sharedContent = await Promise.all([
    db.collection('userComponents').countDocuments({ organizationId }),
    db.collection('userMaterials').countDocuments({ organizationId }),
  ]);
  if (sharedContent.some(Boolean)) throw new AuthError('Déplacez ou supprimez les contenus partagés avant de supprimer l’organisation.', 409);
  await Promise.all([
    db.collection('memberships').deleteMany({ organizationId }),
    db.collection('organizations').deleteOne({ id: organizationId }),
  ]);
};

function publicContentDocument(document) {
  return {
    ...document.data,
    __contentId: document.id,
    __ownerId: document.ownerId,
    __visibility: document.visibility,
    __organizationId: document.organizationId || null,
    __sourceFile: document.visibility === 'organization'
      ? `organization:${document.organizationId}`
      : document.visibility === 'public' ? 'community:public' : 'user:private',
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

module.exports = {
  assertOrganizationAccess,
  canManageOrganization,
  createOrganization,
  deleteOrganization,
  getMembership,
  listOrganizations,
  organizationDetails,
  publicContentDocument,
  removeMember,
  upsertMember,
};
