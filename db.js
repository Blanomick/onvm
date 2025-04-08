const knex = require('knex');

require('dotenv').config();


// URL de connexion PostgreSQL

// Détection de l'environnement
const isProduction = process.env.NODE_ENV === 'production';

// Sélection de la bonne base de données

const NODE_ENV = process.env.NODE_ENV || 'development';

const connectionString = NODE_ENV === 'production'
  ? process.env.DATABASE_URL_PROD
  : process.env.DATABASE_URL_LOCAL;

const connectionConfig = NODE_ENV === 'production'
  ? { connectionString, ssl: { rejectUnauthorized: false } }
  : { connectionString };



// Vérification si l'URL de connexion est définie
if (!connectionString) {
  console.error('[ERREUR CRITIQUE] L\'URL de connexion à la base de données n\'est pas définie.');
  process.exit(1); // Arrête l'application si l'URL est manquante
}

console.log('[INFO] Tentative de connexion à la base de données PostgreSQL...');

// Configuration de Knex avec PostgreSQL


const db = knex({
  client: 'pg',
  connection: connectionConfig,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
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


        // 🔧 Ajout automatique des colonnes si elles n'existent pas
        const hasIsAdmin = await db.schema.hasColumn('users', 'isAdmin');
        if (!hasIsAdmin) {
          await db.schema.alterTable('users', (table) => {
            table.boolean('isAdmin').defaultTo(false);
          });
          console.log('[INFO] Colonne "isAdmin" ajoutée à la table "users".');
        }
    
        const hasBio = await db.schema.hasColumn('users', 'bio');

        const hasProfilePicture = await db.schema.hasColumn('users', 'profilePicture');
        if (!hasProfilePicture) {
          await db.schema.alterTable('users', (table) => {
            table.string('profilePicture').defaultTo('/uploads/default-profile.png');
          });
          console.log('[INFO] Colonne "profilePicture" ajoutée à la table "users".');
        }
        


        if (!hasBio) {
          await db.schema.alterTable('users', (table) => {
            table.text('bio');
          });
          console.log('[INFO] Colonne "bio" ajoutée à la table "users".');
        }
    

    console.log('[INFO] Toutes les tables ont été vérifiées ou créées avec succès.');


  } catch (err) {
    console.error('[ERREUR] Création des tables échouée :', err.message);
    process.exit(1);
  }
})();






module.exports = db;