const { app, ensureAppReady } = require("../app");

module.exports = async (req, res) => {
  await ensureAppReady();
  return app(req, res);
};
