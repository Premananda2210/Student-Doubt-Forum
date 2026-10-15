// Vercel serverless entry: all /api/* routes (see vercel.json).
const { route, initDb, json } = require('../lib.js');

module.exports = async (req, res) => {
  try {
    await initDb();
    if (!(await route(req, res))) json(res, 404, { error: 'not found' });
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  }
};
