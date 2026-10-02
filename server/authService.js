const crypto = require('crypto');
const { ensureAuthIndexes } = require('./mongoDatabase');
const { hashPassword, verifyPassword } = require('./passwordSecurity');

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const AVAILABLE_PERMISSIONS = ['app', 'dashboard', 'manageUsers'];

class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

const normalizeUsername = (username) => String(username ?? '').trim().toLocaleLowerCase('fr-CH');

const validateUsername = (username) => {
  const value = String(username ?? '').trim();
  if (!/^[\p{L}\p{N}._@+-]{3,80}$/u.test(value)) {
    throw new AuthError('Le nom d’utilisateur doit contenir entre 3 et 80 caractères valides.');
  }
  return value;
};

const cleanPermissions = (role, permissions) => {
  if (role === 'admin') return [...AVAILABLE_PERMISSIONS];
  const requested = Array.isArray(permissions) ? permissions : ['app'];
  const normalized = requested.includes('dashboard') ? [...requested, 'app'] : requested;
  return AVAILABLE_PERMISSIONS.filter((permission) => normalized.includes(permission) && permission !== 'manageUsers');
};

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName || '',
  role: user.role,
  permissions: cleanPermissions(user.role, user.permissions),
  active: user.active !== false,
  mustChangePassword: Boolean(user.mustChangePassword),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  lastLoginAt: user.lastLoginAt || null,
});

const hasPermission = (user, permission) => user?.active !== false
  && (user.role === 'admin' || (user.permissions || []).includes(permission));

const audit = async (db, action, actorId, targetUserId, details = {}) => {
  await db.collection('auditLogs').insertOne({
    action,
    actorId: actorId || null,
    targetUserId: targetUserId || null,
    details,
    createdAt: new Date(),
  });
};

const createUser = async (input, actorId = null) => {
  const db = await ensureAuthIndexes();
  const username = validateUsername(input?.username);
  const usernameNormalized = normalizeUsername(username);
  const role = input?.role === 'admin' ? 'admin' : 'user';
  const now = new Date();
  const user = {
    id: crypto.randomUUID(),
    username,
    usernameNormalized,
    displayName: String(input?.displayName ?? '').trim().slice(0, 120),
    passwordHash: await hashPassword(input?.password),
    role,
    permissions: cleanPermissions(role, input?.permissions),
    active: input?.active !== false,
    mustChangePassword: Boolean(input?.mustChangePassword),
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
  };
  try {
    await db.collection('users').insertOne(user);
  } catch (error) {
    if (error?.code === 11000) throw new AuthError('Ce nom d’utilisateur existe déjà.', 409);
    throw error;
  }
  await audit(db, 'user.created', actorId, user.id, { username: user.username, role: user.role });
  return publicUser(user);
};

const listUsers = async () => {
  const db = await ensureAuthIndexes();
  const users = await db.collection('users').find({}).sort({ usernameNormalized: 1 }).toArray();
  return users.map(publicUser);
};

const assertNotLastAdmin = async (db, current, nextRole, nextActive) => {
  if (current.role !== 'admin' || current.active === false) return;
  if (nextRole === 'admin' && nextActive !== false) return;
  const activeAdmins = await db.collection('users').countDocuments({ role: 'admin', active: { $ne: false } });
  if (activeAdmins <= 1) throw new AuthError('Le dernier administrateur actif ne peut pas être retiré.', 409);
};

const updateUser = async (id, input, actorId) => {
  const db = await ensureAuthIndexes();
  const current = await db.collection('users').findOne({ id: String(id) });
  if (!current) throw new AuthError('Utilisateur introuvable.', 404);
  const role = input?.role === undefined ? current.role : input.role === 'admin' ? 'admin' : 'user';
  const active = input?.active === undefined ? current.active !== false : Boolean(input.active);
  await assertNotLastAdmin(db, current, role, active);
  const update = {
    role,
    active,
    displayName: input?.displayName === undefined ? current.displayName : String(input.displayName).trim().slice(0, 120),
    permissions: cleanPermissions(role, input?.permissions === undefined ? current.permissions : input.permissions),
    updatedAt: new Date(),
  };
  if (input?.password) {
    update.passwordHash = await hashPassword(input.password);
    update.passwordChangedAt = new Date();
    update.failedLoginCount = 0;
    update.lockedUntil = null;
    update.mustChangePassword = Boolean(input.mustChangePassword);
  }
  await db.collection('users').updateOne({ id: current.id }, { $set: update });
  if (!active || input?.password) await db.collection('sessions').deleteMany({ userId: current.id });
  await audit(db, 'user.updated', actorId, current.id, {
    role: update.role,
    active: update.active,
    permissions: update.permissions,
    passwordReset: Boolean(input?.password),
  });
  return publicUser({ ...current, ...update });
};

const deleteUser = async (id, actorId) => {
  const db = await ensureAuthIndexes();
  const user = await db.collection('users').findOne({ id: String(id) });
  if (!user) throw new AuthError('Utilisateur introuvable.', 404);
  if (user.id === actorId) throw new AuthError('Vous ne pouvez pas supprimer votre propre compte.', 409);
  await assertNotLastAdmin(db, user, 'user', false);
  await Promise.all([
    db.collection('users').deleteOne({ id: user.id }),
    db.collection('sessions').deleteMany({ userId: user.id }),
  ]);
  await audit(db, 'user.deleted', actorId, user.id, { username: user.username });
};

const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('base64url');

const authenticate = async (username, password, metadata = {}) => {
  const db = await ensureAuthIndexes();
  const normalized = normalizeUsername(username);
  const user = await db.collection('users').findOne({ usernameNormalized: normalized });
  if (!user) {
    await hashPassword(typeof password === 'string' && password.length >= 10 ? password : 'invalid-password-placeholder');
    throw new AuthError('Nom d’utilisateur ou mot de passe incorrect.', 401);
  }
  if (user.active === false) throw new AuthError('Ce compte est désactivé.', 403);
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw new AuthError('Trop de tentatives. Réessayez dans quelques minutes.', 429);
  }
  const valid = await verifyPassword(String(password ?? ''), user.passwordHash);
  if (!valid) {
    const failures = Number(user.failedLoginCount || 0) + 1;
    const lockedUntil = failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_DURATION_MS) : null;
    await db.collection('users').updateOne({ id: user.id }, {
      $set: { failedLoginCount: lockedUntil ? 0 : failures, lockedUntil, updatedAt: new Date() },
    });
    throw new AuthError('Nom d’utilisateur ou mot de passe incorrect.', 401);
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  await Promise.all([
    db.collection('users').updateOne({ id: user.id }, {
      $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now },
    }),
    db.collection('sessions').insertOne({
      id: crypto.randomUUID(), tokenHash: tokenHash(token), csrfToken, userId: user.id,
      createdAt: now, lastSeenAt: now, expiresAt,
      ip: String(metadata.ip || '').slice(0, 100),
      userAgent: String(metadata.userAgent || '').slice(0, 300),
    }),
  ]);
  await audit(db, 'auth.login', user.id, user.id);
  return { token, csrfToken, expiresAt, user: publicUser({ ...user, lastLoginAt: now }) };
};

const getSession = async (token) => {
  if (!token) return null;
  const db = await ensureAuthIndexes();
  const session = await db.collection('sessions').findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await db.collection('users').findOne({ id: session.userId, active: { $ne: false } });
  if (!user) return null;
  return { session, user: publicUser(user), rawUser: user };
};

const revokeSession = async (token) => {
  if (!token) return;
  const db = await ensureAuthIndexes();
  await db.collection('sessions').deleteOne({ tokenHash: tokenHash(token) });
};

const changePassword = async (userId, currentPassword, newPassword, currentSessionId) => {
  const db = await ensureAuthIndexes();
  const user = await db.collection('users').findOne({ id: userId });
  if (!user || !(await verifyPassword(String(currentPassword ?? ''), user.passwordHash))) {
    throw new AuthError('Le mot de passe actuel est incorrect.', 401);
  }
  const passwordHash = await hashPassword(newPassword);
  await db.collection('users').updateOne({ id: user.id }, { $set: {
    passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, updatedAt: new Date(),
  } });
  await db.collection('sessions').deleteMany({ userId: user.id, id: { $ne: currentSessionId } });
  await audit(db, 'auth.password_changed', user.id, user.id);
};

module.exports = {
  AVAILABLE_PERMISSIONS,
  AuthError,
  authenticate,
  changePassword,
  createUser,
  deleteUser,
  getSession,
  hasPermission,
  listUsers,
  publicUser,
  revokeSession,
  updateUser,
};
