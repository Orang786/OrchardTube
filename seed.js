// Загрузка демо-данных из js/data.js в MongoDB.
// Использование: MONGODB_URI=... node seed.js
require('dotenv').config();
const store = require('./db');

(async () => {
  try {
    await store.connect();
    if (!store.connected()) {
      console.error('Задайте MONGODB_URI (например, в .env) — сид некуда грузить.');
      process.exit(1);
    }
    const r = await store.seed();
    console.log('Сид завершён:', r);
    await store.close();
    process.exit(0);
  } catch (e) {
    console.error('Ошибка сида:', e.message);
    process.exit(1);
  }
})();
