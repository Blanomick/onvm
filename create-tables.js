const knex = require('knex');

// Configuration de la base de données
const DATABASE_URL = "postgresql://postgres:rowuBcAhbSTVoPXFehlDZBQkjzWlYCrl@roundhouse.proxy.rlwy.net:37990/railway";

const db = knex({
  client: 'pg',
  connection: {
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  },
});

// Liste des tables à créer
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
      table.increments('id').primary();
      table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.enu('type', ['earn', 'spend']).notNullable();
      table.decimal('amount', 10, 2).notNullable();
      table.timestamp('date').defaultTo(db.fn.now());
    },
  },
];

// Création des tables
const initializeDatabase = async () => {
  try {
    for (const { name, schema } of tables) {
      const exists = await db.schema.hasTable(name);
      if (!exists) {
        console.log(`[INFO] Création de la table "${name}"...`);
        await db.schema.createTable(name, schema);
        console.log(`[INFO] Table "${name}" créée avec succès.`);
      } else {
        console.log(`[INFO] La table "${name}" existe déjà.`);
      }
    }
    console.log('[INFO] Toutes les tables ont été vérifiées ou créées avec succès.');
    process.exit(0);
  } catch (error) {
    console.error('[ERREUR] Échec lors de la création des tables :', error.message);
    process.exit(1);
  }
};

// Exécuter la fonction
initializeDatabase();
