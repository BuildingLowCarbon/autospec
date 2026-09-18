const { AuthError } = require('./authService');
const { asyncRoute, jsonBody, requireAuth, requireCsrf, sendJson } = require('./authRoutes');
const {
  createOrganization, deleteOrganization, listOrganizations, organizationDetails, removeMember, upsertMember,
} = require('./organizationService');
const { createContent, deleteContent, getProfile, getVisibleContentByItemId, listPublicContent, listVisibleContent, updateContent } = require('./userContentService');

const registerCollaborationRoutes = (app) => {
  app.use(['/api/profile', '/api/organizations', '/api/content'], jsonBody);

  app.get('/api/public/content/:kind', asyncRoute(async (req, res) => {
    if (!['components', 'materials'].includes(req.params.kind)) throw new AuthError('Type de contenu inconnu.', 404);
    sendJson(res, { ok: true, ...(await listPublicContent(req.params.kind)) });
  }));

  app.get('/api/profile', requireAuth('app'), asyncRoute(async (req, res) => {
    sendJson(res, { ok: true, profile: await getProfile(req.auth.rawUser) });
  }));

  app.get('/api/organizations', requireAuth('app'), asyncRoute(async (req, res) => {
    sendJson(res, { ok: true, organizations: await listOrganizations(req.auth.rawUser) });
  }));

  app.post('/api/organizations', requireAuth('manageUsers'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    sendJson(res, { ok: true, organization: await createOrganization(req.body, req.auth.rawUser) }, 201);
  }));

  app.get('/api/organizations/:id', requireAuth('app'), asyncRoute(async (req, res) => {
    sendJson(res, { ok: true, ...(await organizationDetails(req.params.id, req.auth.rawUser)) });
  }));

  app.post('/api/organizations/:id/members', requireAuth('app'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    sendJson(res, { ok: true, membership: await upsertMember(req.params.id, req.body, req.auth.rawUser) });
  }));

  app.patch('/api/organizations/:id/members/:userId', requireAuth('app'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    sendJson(res, { ok: true, membership: await upsertMember(req.params.id, { ...req.body, userId: req.params.userId }, req.auth.rawUser) });
  }));

  app.delete('/api/organizations/:id/members/:userId', requireAuth('app'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    await removeMember(req.params.id, req.params.userId, req.auth.rawUser);
    sendJson(res, { ok: true });
  }));

  app.delete('/api/organizations/:id', requireAuth('manageUsers'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    await deleteOrganization(req.params.id, req.auth.rawUser);
    sendJson(res, { ok: true });
  }));

  app.get('/api/content/:kind/item/:itemId', requireAuth('app'), asyncRoute(async (req, res) => {
    if (!['components', 'materials'].includes(req.params.kind)) throw new AuthError('Type de contenu inconnu.', 404);
    sendJson(res, { ok: true, item: await getVisibleContentByItemId(req.params.kind, req.params.itemId, req.auth.rawUser) });
  }));

  app.get('/api/content/:kind', requireAuth('app'), asyncRoute(async (req, res) => {
    if (!['components', 'materials'].includes(req.params.kind)) throw new AuthError('Type de contenu inconnu.', 404);
    sendJson(res, { ok: true, ...(await listVisibleContent(req.params.kind, req.auth.rawUser)) });
  }));

  app.post('/api/content/:kind', requireAuth('app'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    sendJson(res, { ok: true, item: await createContent(req.params.kind, req.body, req.auth.rawUser) }, 201);
  }));

  app.patch('/api/content/:kind/:id', requireAuth('app'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    sendJson(res, { ok: true, item: await updateContent(req.params.kind, req.params.id, req.body, req.auth.rawUser) });
  }));

  app.delete('/api/content/:kind/:id', requireAuth('app'), asyncRoute(async (req, res) => {
    requireCsrf(req);
    await deleteContent(req.params.kind, req.params.id, req.auth.rawUser);
    sendJson(res, { ok: true });
  }));
};

module.exports = { registerCollaborationRoutes };
