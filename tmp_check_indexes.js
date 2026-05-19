const { sequelize } = require('./models');

(async () => {
  try {
    const [results] = await sequelize.query('SHOW INDEX FROM leather_stocks');
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
