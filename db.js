const knex = require('knex');



// URL de connexion PostgreSQL
const connectionString = process.env.DATABASE_URL || 
  "postgresql://onvmapp_user:Q06C7coVftWxOkO6TL9hbHIBjY5A1do9@dpg-cv3fpql2ng1s73800avg-a.oregon-postgres.render.com/onvmapp";

// Vérification si l'URL de connexion est définie
if (!connectionString) {
  console.error('[ERREUR CRITIQUE] L\'URL de connexion à la base de données n\'est pas définie.');
  process.exit(1); // Arrête l'application si l'URL est manquante
}

console.log('[INFO] Tentative de connexion à la base de données PostgreSQL...');

// Configuration de Knex avec PostgreSQL
const db = knex({
  client: 'pg',
  connection: {
    connectionString: connectionString, // URL de connexion correcte
    ssl: { rejectUnauthorized: false }, // Active SSL pour Render
  },
  pool: {
    min: 2, // Minimum de connexions dans le pool
    max: 10, // Maximum de connexions simultanées
    acquireTimeoutMillis: 30000, // Timeout pour acquérir une connexion
    idleTimeoutMillis: 30000, // Ferme les connexions inactives après 30s
    reapIntervalMillis: 1000, // Vérifie les connexions inactives toutes les secondes
  },
});

// Vérifier si la colonne publicationId existe bien dans la table retweets
// ✅ Maintenant, on peut vérifier les colonnes (car `db` est initialisé)
(async () => {
  try {
    const result = await db.raw("SELECT column_name FROM information_schema.columns WHERE table_name = 'retweets'");
    console.log("[INFO] Colonnes de la table retweets :", result.rows);
  } catch (error) {
    console.error("[ERREUR] Impossible de récupérer les colonnes :", error.message);
  }
})();

// Vérification unique de la connexion à PostgreSQL
(async () => {
  try {
    await db.raw('SELECT 1');
    console.log('[INFO] Connexion réussie à la base de données PostgreSQL.');
  } catch (error) {
    console.error('[ERREUR CRITIQUE] Échec de connexion à PostgreSQL.', error.message);
    process.exit(1);
  }
})();


// Vérifier la structure des colonnes dans la table follows
(async () => {
  try {
    const columns = await db.raw(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'follows'
    `);
    console.log("[INFO] Colonnes actuelles de la table follows :", columns.rows);
  } catch (error) {
    console.error("[ERREUR] Impossible de récupérer les colonnes de follows :", error.message);
  }
})();



// Fonction de création et de vérification des tables
(async () => {
  try {
    console.log('[INFO] Vérification et création des tables si nécessaire...');

    const tables = [
      {
        name: 'users',
        schema: (table) => {
          table.increments('id').primary();
          table.string('username').unique().notNullable();
          table.string('email').unique().notNullable();
          table.string('password').notNullable();
          table.string('profilePicture').defaultTo('/uploads/default-profile.png');
          table.text('bio');
          table.boolean('isAdmin').defaultTo(false);
        },
      },
      {
        name: 'publications',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.text('content');
          table.string('media');
          table.integer('retweetsCount').defaultTo(0);
          table.timestamp('created_at').defaultTo(db.fn.now());
        },
      },
      {
        name: 'stories',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.string('media');
          table.text('content');
          table.timestamp('created_at').defaultTo(db.fn.now());
        },
      },
      {
        name: 'follows',
        schema: (table) => {
          table.integer('followerId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.integer('followingId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.primary(['followerId', 'followingId']);
        },
      },
      {
        name: 'wallet',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.decimal('balance', 10, 2).defaultTo(0);
          table.timestamp('lastUpdated').defaultTo(db.fn.now());
        },
      },
      {
        name: 'transactions',
        schema: (table) => {
          table.increments('transactionId').primary();
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.enu('type', ['earn', 'spend']).notNullable();
          table.decimal('amount', 10, 2).notNullable();
          table.timestamp('date').defaultTo(db.fn.now());
        },
      },
      {
        name: 'likes',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.integer('publicationId').unsigned().references('id').inTable('publications').onDelete('CASCADE');
        },
      },
      {
        name: 'commentaires',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('publicationId').unsigned().references('id').inTable('publications').onDelete('CASCADE');
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.text('comment');
          table.string('media');
          table.string('audio');
          table.timestamp('created_at').defaultTo(db.fn.now());
        },
      },
      {
        name: 'retweets',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.integer('publicationId').unsigned().references('id').inTable('publications').onDelete('CASCADE');
          table.timestamp('created_at').defaultTo(db.fn.now());
        },
      },
      {
        name: 'replies',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('commentId').unsigned().references('id').inTable('commentaires').onDelete('CASCADE');
          table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.text('reply');
          table.timestamp('created_at').defaultTo(db.fn.now());
        },
      },
      {
        name: 'communities',
        schema: (table) => {
          table.increments('id').primary();
          table.string('name').notNullable();
          table.text('description');
          table.integer('created_by').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.timestamp('created_at').defaultTo(db.fn.now());
        },
      },
      {
        name: 'community_members',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('community_id').unsigned().references('id').inTable('communities').onDelete('CASCADE');
          table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.string('role').defaultTo('member');
          table.timestamp('joined_at').defaultTo(db.fn.now());
        },
      },
      {
        name: 'messages',
        schema: (table) => {
          table.increments('id').primary();
          table.integer('community_id').unsigned().references('id').inTable('communities').onDelete('CASCADE');
          table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
          table.text('content').notNullable();
          table.timestamp('timestamp').defaultTo(db.fn.now());
        },
      },
    ];

    // Vérification et création des tables
    for (const { name, schema } of tables) {
      const exists = await db.schema.hasTable(name);
      if (!exists) {
        await db.schema.createTable(name, schema);
        console.log(`[INFO] Table "${name}" créée avec succès.`);
      } else {
        console.log(`[INFO] Table "${name}" existe déjà.`);
      }
    }

    console.log('[INFO] Toutes les tables ont été vérifiées ou créées avec succès.');
  } catch (err) {
    console.error('[ERREUR] Création des tables échouée :', err.message);
    process.exit(1);
  }
})();

module.exports = db;