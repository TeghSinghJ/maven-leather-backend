require("dotenv").config();
require("./src/jobs/expire.pi.job");
const app = require("./app");

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  const localUrl = `http://localhost:${PORT}`;
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let networkIp = 'YOUR_NETWORK_IP';
  
  // Get first non-internal IPv4 address
  for (const name of Object.keys(networkInterfaces)) {
    for (const iface of networkInterfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        networkIp = iface.address;
        break;
      }
    }
  }
  
  const networkUrl = `http://${networkIp}:${PORT}`;
  
  console.log(`\n✅ Server running in ${NODE_ENV} mode`);
  console.log(`📍 Local access:       ${localUrl}`);
  console.log(`📍 Network access:     ${networkUrl}`);
  console.log(`\n🌐 Frontend (local):   http://localhost:3000`);
  console.log(`🌐 Frontend (network): http://${networkIp}:3000\n`);
});
