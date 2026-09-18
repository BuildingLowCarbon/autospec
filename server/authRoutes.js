const {
  AuthError,
  authenticate,
  changePassword,
  createUser,
  deleteUser,
  getSession,
  hasPermission,
  listUsers,
  revokeSession,
  updateUser,
} = require('./authService');

const COOKIE_NAME = 'autospec_session';

const sendJson = (res, payload, statusCode = 200) => {
  res.status(statusCode);
  res.set('Cache-Control', 'no-store');
  res.json(payload);
};

const asyncRoute = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    if (status === 500) console.error('Authentication API error:', error);
    sendJson(res, { ok: false, error: status === 500 ? 'Erreur interne du serveur.' : error.message }, status);
  }
};

const jsonBody = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.body !== undefined) return next();
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 64 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      req.body = raw ? JSON.parse(raw) : {};
      next();
    } catch (error) {
      sendJson(res, { ok: false, error: 'Corps JSON invalide.' }, 400);
    }
  });
  req.on('error', next);
};

const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
  const separator = part.indexOf('=');
  if (separator < 0) return ['', ''];
  return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
}).filter(([key]) => key));

const sessionToken = (req) => parseCookies(req)[COOKIE_NAME] || '';

const cookieOptions = (req) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https',
  sameSite: 'lax',
  path: '/',
});

const requireAuth = (permission = null) => asyncRoute(async (req, res, next) => {
  const auth = await getSession(sessionToken(req));
  if (!auth) return sendJson(res, { ok: false, error: 'Authentification requise.' }, 401);
  if (permission && !hasPermission(auth.rawUser, permission)) {
    return sendJson(res, { ok: false, error: 'Accès non autorisé.' }, 403);
  }
  req.auth = auth;
  next();
});

const requireCsrf = (req) => {
  const supplied = String(req.headers['x-csrf-token'] || '');
  if (!supplied || supplied !== req.auth?.session?.csrfToken) {
    throw new AuthError('Jeton de sécurité invalide. Rechargez la page.', 403);
  }
};

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

const registerAuthRoutes = (app) => {
  app.use(['/api/auth', '/api/admin'], jsonBody);

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const result = await authenticate(req.body?.username, req.body?.password, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.cookie(COOKIE_NAME, result.token, { ...cookieOptions(req), expires: result.expiresAt });
    sendJson(res, { ok: true, user: result.user, csrfToken: result.csrfToken });
  }));

  app.get('/api/auth/me', asyncRoute(async (req, res) => {
    const auth = await getSession(sessionToken(req));
    if (!auth) return sendJson(res, { ok: false, error: 'Authentification requise.' }, 401);
    sendJson(res, { ok: true, user: auth.user, csrfToken: auth.session.csrfToken });
  }));

  app.post('/api/auth/logout', requireAuth(), asyncRoute(async (req, res) => {
    requireCsrf(req);
    await revokeSession(sessionToken(req));
    res.clearCookie(COOKIE_NAME, cookieOptions(req));
    sendJson(res, { ok: true });
  }));

  app.post('/api/auth/change-password', requireAuth(), asyncRoute(async (req, res) => {
    requireCsrf(req);
    await changePassword(req.auth.user.id, req.body?.currentPassword, req.body?.newPassword, req.auth.session.id);
    sendJson(res, { ok: true });
  }));

  app.get('/api/admin/users', requireAuth('manageUsers'), asyncRoute(async (req, res) => {
    sendJson(res, { ok: true, users: await listUsers() });
  }));

  app.post('/api/admin/users', requireAuth('manageUsers'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    const user = await createUser(req.body, req.auth.user.id);
    sendJson(res, { ok: true, user }, 201);
  }));

  app.patch('/api/admin/users/:id', requireAuth('manageUsers'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    const user = await updateUser(req.params.id, req.body, req.auth.user.id);
    sendJson(res, { ok: true, user });
  }));

  app.delete('/api/admin/users/:id', requireAuth('manageUsers'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    await deleteUser(req.params.id, req.auth.user.id);
    sendJson(res, { ok: true });
  }));
};

module.exports = { registerAuthRoutes, requireAuth, requireCsrf, sendJson, asyncRoute, jsonBody };
