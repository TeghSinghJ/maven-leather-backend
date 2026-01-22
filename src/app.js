const express = require("express");
const cors = require("cors");
const productRoutes = require("./routes/product.routes");
const piRoutes = require("./routes/pi.routes");
const app = express();

app.use(cors());
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

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

module.exports = app;
