const knex = require('knex');

const DATABASE_URL = "postgresql://onvm_postgres_user:L5VFq21f0JvSbhTQ6Z6JUdXnn08JiXjk@dpg-cuc1jqjv2p9s73d0jua0-a.oregon-postgres.render.com/onvm_postgres";

const db = knex({
  client: 'pg',
  connection: {
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Assurez-vous que l'option SSL est bien activée
  },
});

(async () => {
  try {
    console.log('[INFO] Tentative de connexion à la base de données PostgreSQL...');
    await db.raw('SELECT 1');
    console.log('[INFO] Connexion réussie !');
  } catch (err) {
    console.error('[ERREUR] Connexion échouée :', err.message);
  } finally {
    process.exit();
  }
})();
