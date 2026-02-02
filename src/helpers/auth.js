const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

exports.hashPassword = (password) => bcrypt.hash(password, 10);

exports.comparePassword = (password, hash) =>
  bcrypt.compare(password, hash);

exports.generateToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
