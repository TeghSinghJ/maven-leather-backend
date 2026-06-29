const jwt = require('jsonwebtoken');
const { sequelize, User, ProformaInvoice, PIItem } = require('./models');
(async () => {
  try {
    const user = await User.findOne({ where: { role: 'ADMIN' }, raw: true });
    console.log('user', user?.id, user?.email, user?.role);
    const pi = await ProformaInvoice.findOne({ where: { status: 'ACTIVE' }, raw: true });
    console.log('pi', pi?.id, pi?.status);
    const items = await PIItem.findAll({ where: { pi_id: pi.id }, raw: true, limit: 5 });
    console.log('items', items);
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET);
    const axios = require('axios');
    const res = await axios.post(`http://localhost:5000/api/pi/${pi.id}/suggest-revisit`, {
      items: [{ product_id: items[0].product_id, qty: 5, leather_code: 'Test' }],
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('response', res.status, res.data);
  } catch (e) {
    console.error('ERR', e.response?.status, e.response?.data || e.message);
  } finally {
    await sequelize.close();
  }
})();
