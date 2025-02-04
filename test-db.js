const knex = require('knex');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://onvmdb_user:s8BEoy1je9KdtAG4eAuliUkyw3UCdhuU@dpg-cu3qdkhu0jms73dnpo10-a.oregon-postgres.render.com/onvmdb';

const db = knex({
  client: 'pg',
  connection: {
    connectionString: DATABASE_URL,
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

const testDatabaseConnection = async () => {
  try {
    console.log('[INFO] Test de connexion...');
    await db.raw('SELECT 1');
    console.log('[INFO] Connexion réussie à la base de données PostgreSQL.');
  } catch (error) {
    console.error('[ERREUR] Échec de connexion à la base de données :', error.message);
  } finally {
    process.exit();
  }
};

testDatabaseConnection();
