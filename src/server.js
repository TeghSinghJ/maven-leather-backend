require("dotenv").config();
const app = require("./app");
const { initCache } = require("./services/cache.service");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await initCache();
  } catch (err) {
    console.warn("Redis cache initialization failed. Continuing without cache.", err.message || err);
  }

  app.listen(PORT, () => {
    console.log(`Running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
  });
}

startServer();
