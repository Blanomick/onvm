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
          table.string('mediatype');
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
           table.unique(['userId', 'publicationId']);

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
  name: 'conversations',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('sender_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('receiver_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(db.fn.now());
  },
},



     {
  name: 'messages',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('conversation_id').unsigned().references('id').inTable('conversations').onDelete('CASCADE');
    table.integer('community_id').unsigned().references('id').inTable('communities').onDelete('CASCADE').nullable();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.text('content').notNullable();
    table.timestamp('created_at').defaultTo(db.fn.now());

    table.boolean('is_read').defaultTo(false); // si tu veux gérer les messages lus
  },
},



{
  name: 'notifications',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('sender_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('type'); // exemple : "commentaire", "retweet", "abonnement"
    table.text('content'); // contenu ou id cible
    table.boolean('read').defaultTo(false);
    table.timestamp('created_at').defaultTo(db.fn.now());
  },
},


    ];


    for (const table of tables) {
      const exists = await db.schema.hasTable(table.name);
      if (!exists) {
        await db.schema.createTable(table.name, table.schema);
        console.log(`[INFO] Table "${table.name}" créée.`);
      } else {
        console.log(`[INFO] Table "${table.name}" déjà existante.`);
      }
    }
    

    const hasMediaType = await db.schema.hasColumn('publications', 'mediatype');
if (!hasMediaType) {
  await db.schema.alterTable('publications', (table) => {
    table.string('mediatype');
  });
  console.log('[INFO] Colonne "mediatype" ajoutée à la table "publications".');
}


// 🔄 Renommer "timestamp" → "created_at" si nécessaire
const hasOldTimestamp = await db.schema.hasColumn('messages', 'timestamp');
if (hasOldTimestamp) {
  await db.schema.alterTable('messages', (table) => {
    table.renameColumn('timestamp', 'created_at');
  });
  console.log('[INFO] Colonne "timestamp" renommée en "created_at" dans la table "messages".');
}


        // 🔧 Ajout automatique des colonnes si elles n'existent pas
        const hasIsAdmin = await db.schema.hasColumn('users', 'isAdmin');
        if (!hasIsAdmin) {
          await db.schema.alterTable('users', (table) => {
            table.boolean('isAdmin').defaultTo(false);
          });
          console.log('[INFO] Colonne "isAdmin" ajoutée à la table "users".');
        }
    
        const hasBio = await db.schema.hasColumn('users', 'bio');


       const hasConversationId = await db.schema.hasColumn('messages', 'conversation_id');

const hasCreatedAt = await db.schema.hasColumn('messages', 'created_at');
if (!hasCreatedAt) {
  await db.schema.alterTable('messages', (table) => {
    table.timestamp('created_at').defaultTo(db.fn.now());
  });
  console.log('[INFO] Colonne "created_at" ajoutée à la table "messages".');
}


if (!hasConversationId) {
  await db.schema.alterTable('messages', (table) => {
    table.integer('conversation_id').unsigned().references('id').inTable('conversations').onDelete('CASCADE');
  });
  console.log('[INFO] Colonne "conversation_id" ajoutée à la table "messages".');
}

// ✅ Si l'ancienne colonne "profile_picture" existe encore, on la renomme proprement
const hasOldProfilePicture = await db.schema.hasColumn('users', 'profile_picture');
if (hasOldProfilePicture) {
  await db.schema.alterTable('users', (table) => {
    table.renameColumn('profile_picture', 'profilePicture');
  });
  console.log('[INFO] Colonne "profile_picture" renommée en "profilePicture".');
}


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


(async () => {
  try {
    const updated = await db('users')
      .whereNull('profilePicture')
      .update({ profilePicture: '/uploads/default-profile.png' });

    if (updated > 0) {
      console.log(`[INFO] ${updated} utilisateur(s) mis à jour avec une photo de profil par défaut.`);
    } else {
      console.log('[INFO] Tous les utilisateurs ont déjà une photo de profil.');
    }
  } catch (error) {
    console.error('[ERREUR] Mise à jour automatique des photos de profil :', error.message);
  }
})();




module.exports = db;