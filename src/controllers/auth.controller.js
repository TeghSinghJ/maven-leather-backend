const { User } = require("../../models");
const {
  comparePassword,
  generateToken,
} = require("../helpers/auth");

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({
      where: { email, is_active: true },
    });

    if (!user)
      return res.status(401).json({ error: "Invalid credentials" });

    const valid = await comparePassword(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "Invalid credentials" });
    
    res.json({
      token: generateToken(user),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
