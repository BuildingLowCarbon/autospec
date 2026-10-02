const express = require('express');
const registerApiRoutes = require('./apiRoutes');

const createApp = () => {
  const app = express();

  // Vercel forwards the original protocol through this proxy header. Express
  // can then make the right decisions for secure cookies and generated URLs.
  app.set('trust proxy', 1);

  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'autospec-api',
      environment: process.env.VERCEL ? 'vercel' : 'local',
    });
  });

  registerApiRoutes(app);

  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, error: 'Route API inconnue.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('API error:', error);
    return res.status(500).json({ ok: false, error: 'Erreur interne du serveur.' });
  });

  return app;
};

module.exports = { createApp };
