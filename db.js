const knex = require('knex');

// Détection de l'environnement et URL de connexion à la base de données
 
const connectionString = "postgresql://onvmdb_user:s8BEoy1je9KdtAG4eAuliUkyw3UCdhuU@dpg-cu3qdkhu0jms73dnpo10-a.oregon-postgres.render.com/onvmdb";

if (!connectionString) {
  console.error('[ERREUR] Aucune URL de base de données définie.');
  process.exit(1);
}

// Configuration de Knex pour PostgreSQL
const db = knex({
  client: 'pg',
  connection: {
    connectionString,
    ssl: { rejectUnauthorized: false }, // Active SSL pour Render
  },
  pool: {
    min: 5, // Minimum de connexions dans le pool
    max: 20, // Maximum de connexions dans le pool
  },
});

// Vérification de la connexion à la base de données
console.log('[INFO] Tentative de connexion à la base de données PostgreSQL...');
db.raw('SELECT 1')
  .then(() => {
    console.log('[INFO] Connexion réussie à la base de données PostgreSQL.');
  })
  .catch((err) => {
    console.error('[ERREUR] Échec de connexion à la base de données PostgreSQL.');
    console.error(`[DÉTAILS] ${err.message}`);
    console.error('[ACTIONS] Vérifiez que l\'URL de connexion est correcte et que la base de données est accessible.');
    process.exit(1); // Arrête le programme en cas d'échec critique
  });

  
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
