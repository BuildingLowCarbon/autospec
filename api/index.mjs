import appModule from '../server/app.js';

const { createApp } = appModule;

// Vercel invokes the Express application as a Node.js Function. Do not call
// listen() here: Vercel owns the HTTP server and may reuse this instance.
export default createApp();
