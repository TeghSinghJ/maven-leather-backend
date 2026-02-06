require('dotenv').config(); 
const express = require("express");
const cors = require("cors");
const productRoutes = require("./routes/product.routes");
const piRoutes = require("./routes/pi.routes");
const app = express();

// Configure CORS based on environment
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:19006').split(',');
    
    // Allow requests with no origin (like mobile apps)
    if (!origin || allowedOrigins.some(allowed => allowed.trim() === origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/products", productRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api/pi", piRoutes);
app.use("/api/collections", require("./routes/collection.routes"));
app.use("/api/sub-collections", require("./routes/subCollection.routes"));
app.use("/api/series", require("./routes/series.routes"));
app.use("/api/leather-hide-stocks", require("./routes/leatherHideStock.routes"));
app.use("/api/collection-prices", require("./routes/collectionPrice.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/transports", require("./routes/transport.routes"));
app.use("/api/customers", require("./routes/customer.routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/users.routes"));
app.use("/api/batches", require("./routes/batch.routes"));

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

module.exports = app;
