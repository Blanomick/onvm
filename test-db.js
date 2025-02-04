const knex = require('knex');

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://onvmdb_user:s8BEoy1je9KdtAG4eAuliUkyw3UCdhuU@dpg-cu3qdkhu0jms73dnpo10-a.oregon-postgres.render.com:5432/onvmdb?sslmode=require";

const db = knex({
  client: 'pg',
  connection: {
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }  // Ajout de SSL
  }
});

async function testConnection() {
  try {
    console.log("🔄 Tentative de connexion à PostgreSQL...");
    await db.raw("SELECT 1");
    console.log("✅ Connexion réussie !");
  } catch (error) {
    console.error("❌ Échec de connexion :", error.message);
  } finally {
    process.exit();
  }
}

testConnection();
