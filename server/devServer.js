const { createApp } = require('./app');
const { loadLocalEnvironment } = require('./localEnvironment');

loadLocalEnvironment();

const app = createApp();
const port = Number(process.env.AUTOSPEC_API_PORT || 3001);

app.listen(port, '127.0.0.1', () => {
  console.log(`API AutoSpec disponible sur http://127.0.0.1:${port}`);
});
