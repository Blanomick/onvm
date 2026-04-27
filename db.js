const knex = require('knex');

require('dotenv').config();


// URL de connexion PostgreSQL



// Sélection de la bonne base de données

const NODE_ENV = process.env.NODE_ENV || 'development';

const connectionString = process.env.DATABASE_URL;
const connectionConfig = {
  connectionString,
  ssl: { rejectUnauthorized: false }
};
const db = knex({
  client: 'pg',
  connection: connectionConfig,
  pool: { min: 2, max: 10 },
});

// Vérification si l'URL de connexion est définie
if (!connectionString) {
  console.error('[ERREUR CRITIQUE] L\'URL de connexion à la base de données n\'est pas définie.');
  process.exit(1); // Arrête l'application si l'URL est manquante
}

console.log('[INFO] Tentative de connexion à la base de données PostgreSQL...');




// 🔎 DEBUG: afficher où on est connectés (base & user) et quelle URL est utilisée
(async () => {
  try {
    const info = await db.raw(`
      SELECT
        current_database()    AS db,
        current_user          AS usr,
        inet_server_addr()    AS host,
        inet_server_port()    AS port
    `);
    console.log('[DB] NODE_ENV =', NODE_ENV);
    console.log('[DB] connectionString =', connectionString);
    console.log('[DB] Connected to => db:', info.rows[0].db, ' user:', info.rows[0].usr, ' host:', info.rows[0].host, ' port:', info.rows[0].port);

    const hasMessages = await db.raw(`
      SELECT COUNT(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema='public' AND table_name='messages'
    `);
    console.log('[DB] Table "messages" existe ? =>', hasMessages.rows[0].n === 1 ? 'OUI' : 'NON');
  } catch (e) {
    console.error('[DB DEBUG ERROR]', e.message);
  }
})();


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

    // ✅ Champs pour système de parrainage
    table.string('referral_code').unique();           // code d’invitation de l’utilisateur
    table.integer('referred_by_user_id')              // ID du parrain (nullable)
      .unsigned()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  },
},

{
  name: 'publications',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.text('content');
    table.text('media');          // ← ÉTAIT table.string('media')
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
    table.text('media');           // ← ÉTAIT string
    table.string('type');          // "image" | "video" | "text" | ...
    table.text('text');            // texte optionnel
    table.text('backgroundColor'); // optionnel pour stories "text"
    table.jsonb('tags');           // optionnel (tableau JSON)
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
  name: 'story_likes',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('storyId').unsigned().references('id').inTable('stories').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.unique(['userId','storyId']);
  },
},

       
{
  name: 'commentaires',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('publicationId').unsigned().references('id').inTable('publications').onDelete('CASCADE');
    table.integer('userId').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.text('comment');
    table.text('media');   // ← ÉTAIT string
    table.text('audio');   // ← ÉTAIT string
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

    // relations
    table.integer('conversation_id').unsigned().references('id').inTable('conversations').onDelete('CASCADE');
    table.integer('community_id').unsigned().references('id').inTable('communities').onDelete('CASCADE').nullable();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');

    // 🔧 NOUVEAU : support type/voice + media
    table.text('type').defaultTo('text');   // 'text' | 'voice'
    table.text('content').nullable();       // ← devient NULLABLE (avant: notNullable)
    table.text('media').nullable();         // images/vidéos éventuelles
    table.text('voice_url').nullable();     // URL Cloudinary MP3 ou /media/xxx (fallback local)
    table.decimal('duration', 10, 2).nullable(); // durée en secondes (optionnel)

    // statut/horodatage
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(db.fn.now());
  },
},


{
  name: 'chat_messages',
  schema: (table) => {
    table.increments('id').primary();
    table.string('chat_id').notNullable();                    // id de conversation (string pour rester souple)
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('type', 16).notNullable().defaultTo('audio'); // 'audio' | 'text' | 'image' ... pour évoluer
    table.text('content');                                     // utile si un jour tu veux des "text" ici
    table.text('url');                                         // URL du vocal (ex: /uploads/voice_...webm ou Cloudinary)
    table.text('media');                                       // réservé pour d'autres médias
    table.timestamp('created_at').defaultTo(db.fn.now());
  },
},


{
  name: 'notifications',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();   // destinataire
    table.integer('actor_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable();  // auteur de l'action (ex: celui qui like)
    table.text('type').notNullable();          // 'like_publication' | 'like_story' | 'message' | ...
    table.text('entity_type');                 // 'publication' | 'story' | 'message'
    table.integer('entity_id');                // id cible (publicationId, storyId, messageId)
    table.jsonb('metadata').notNullable().defaultTo(db.raw("'{}'::jsonb")); // infos libres
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(db.fn.now());
    table.unique(['type','user_id','actor_id','entity_type','entity_id'], 'notifications_unq'); // évite les doublons (ex: même like)
  },
},



{
  name: 'story_comments',
  schema: (table) => {
    table.increments('id').primary();
    table.integer('story_id').unsigned().references('id').inTable('stories').onDelete('CASCADE');
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.text('comment').notNullable();
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




    // ➜ Migration idempotente : s'assurer que messages.is_read existe
try {
  const hasIsRead = await db.schema.hasColumn('messages', 'is_read');
  if (!hasIsRead) {
    await db.schema.alterTable('messages', (t) => {
      t.boolean('is_read').notNullable().defaultTo(false);
    });
    console.log('[INFO] Colonne "is_read" ajoutée à "messages".');
  } else {
    console.log('[INFO] Colonne "is_read" déjà présente dans "messages".');
  }
} catch (e) {
  console.warn('[WARN] Migration "messages.is_read" :', e.message);
}



// === MIGRATION notifications: renommer / ajouter colonnes + indexes ===
// --- Migrations idempotentes pour "messages" (support media + content nullable) ---
try {
  // 1) Ajouter "media" si absent
  const msgHasMedia = await db.schema.hasColumn('messages', 'media');
  if (!msgHasMedia) {
    await db.schema.alterTable('messages', (t) => {
      t.text('media').nullable();
    });
    console.log('[INFO] Colonne "media" ajoutée à la table "messages".');
  }

  // 2) Rendre "content" nullable (si pas déjà)
  const contentNullableCheck = await db.raw(`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'content'
  `);
  const isContentNullable = contentNullableCheck.rows?.[0]?.is_nullable === 'YES';
  if (!isContentNullable) {
    await db.schema.alterTable('messages', (t) => {
      t.text('content').nullable().alter();
    });
    console.log('[INFO] "messages.content" est maintenant NULLABLE.');
  }
} catch (e) {
  console.warn('[WARN] Migration messages (media/nullable) partielle:', e.message);
}





// --- Ajout idempotent des colonnes vocales (type, voice_url, duration) ---
try {
  const hasType = await db.schema.hasColumn('messages', 'type');
  if (!hasType) {
    await db.schema.alterTable('messages', (t) => {
      t.text('type').defaultTo('text');
    });
    console.log('[INFO] Colonne "type" ajoutée à "messages".');
  }

  const hasVoice = await db.schema.hasColumn('messages', 'voice_url');
  if (!hasVoice) {
    await db.schema.alterTable('messages', (t) => {
      t.text('voice_url').nullable();
    });
    console.log('[INFO] Colonne "voice_url" ajoutée à "messages".');
  }

  const hasDuration = await db.schema.hasColumn('messages', 'duration');
  if (!hasDuration) {
    await db.schema.alterTable('messages', (t) => {
      t.decimal('duration', 10, 2).nullable();
    });
    console.log('[INFO] Colonne "duration" ajoutée à "messages".');
  }
} catch (e) {
  console.warn('[WARN] Migration messages (type/voice_url/duration) partielle:', e.message);
}


// Index pour "chat_messages" (recherche par chat + ordre récent)
try {
  await db.schema.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_chat_messages_chat_created'
      ) THEN
        CREATE INDEX idx_chat_messages_chat_created
          ON chat_messages (chat_id, created_at DESC);
      END IF;
    END $$;
  `);
  console.log('[INFO] Index "idx_chat_messages_chat_created" ok.');
} catch (e) {
  console.warn('[WARN] Index chat_messages non créé:', e.message);
}

// Index pour "messages" (conversation + ordre récent)
try {
  await db.schema.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'idx_messages_conv_created'
      ) THEN
        CREATE INDEX idx_messages_conv_created
          ON messages (conversation_id, created_at DESC);
      END IF;
    END $$;
  `);
  console.log('[INFO] Index "idx_messages_conv_created" ok.');
} catch (e) {
  console.warn('[WARN] Index messages non créé:', e.message);
}



try {
  const hasNotifications = await db.schema.hasTable('notifications');
  if (hasNotifications) {
    const hasSender = await db.schema.hasColumn('notifications', 'sender_id');
    const hasActor  = await db.schema.hasColumn('notifications', 'actor_id');
    if (hasSender && !hasActor) {
      await db.schema.alterTable('notifications', (t) => {
        t.renameColumn('sender_id', 'actor_id');
      });
      console.log('[INFO] notifications.sender_id → actor_id');
    }

    const hasRead   = await db.schema.hasColumn('notifications', 'read');
    const hasIsRead = await db.schema.hasColumn('notifications', 'is_read');
    if (hasRead && !hasIsRead) {
      await db.schema.alterTable('notifications', (t) => {
        t.renameColumn('read', 'is_read');
      });
      console.log('[INFO] notifications.read → is_read');
    }

    const needEntityType = !(await db.schema.hasColumn('notifications', 'entity_type'));
    const needEntityId   = !(await db.schema.hasColumn('notifications', 'entity_id'));
    const needMetadata   = !(await db.schema.hasColumn('notifications', 'metadata'));
    if (needEntityType || needEntityId || needMetadata) {
      await db.schema.alterTable('notifications', (t) => {
        if (needEntityType) t.text('entity_type');
        if (needEntityId)   t.integer('entity_id');
        if (needMetadata)   t.jsonb('metadata').notNullable().defaultTo(db.raw("'{}'::jsonb"));
      });
      console.log('[INFO] notifications: colonnes entity_type/entity_id/metadata ajoutées');
    }

    // Indexes (idempotents)
    await db.schema.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'notifications_unq'
        ) THEN
          CREATE UNIQUE INDEX notifications_unq
            ON notifications (type, user_id, actor_id, entity_type, entity_id);
        END IF;
      END $$;
    `);

    await db.schema.raw(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'idx_notifications_user_unread'
        ) THEN
          CREATE INDEX idx_notifications_user_unread
            ON notifications (user_id, is_read, created_at DESC);
        END IF;
      END $$;
    `);
  }
} catch (e) {
  console.warn('[WARN] Migration notifications partielle:', e.message);
}




    

    const hasMediaType = await db.schema.hasColumn('publications', 'mediatype');
if (!hasMediaType) {
  await db.schema.alterTable('publications', (table) => {
    table.string('mediatype');
  });
  console.log('[INFO] Colonne "mediatype" ajoutée à la table "publications".');
}

// 🔧 Forcer les colonnes susceptibles d'être trop courtes à passer en TEXT
try {
  await db.schema.alterTable('publications', (t) => {
    t.text('media').alter();
    t.text('content').alter(); // déjà en text chez toi, mais safe
  });
  await db.schema.alterTable('commentaires', (t) => {
    t.text('media').alter();
    t.text('audio').alter();
  });
  await db.schema.alterTable('stories', (t) => {
    t.text('media').alter();
  });
  console.log('[INFO] Colonnes converties en TEXT (publications.media/content, commentaires.media/audio, stories.media).');
} catch (e) {
  console.warn('[WARN] Impossible d\'altérer certaines colonnes en TEXT (probablement déjà TEXT) :', e.message);
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
       // ✅ Ajout referral_code
const hasReferralCode = await db.schema.hasColumn('users', 'referral_code');
if (!hasReferralCode) {
  await db.schema.alterTable('users', (table) => {
    table.string('referral_code').unique();
  });
  console.log('[INFO] Colonne "referral_code" ajoutée à la table "users".');
}

// ✅ Ajout referred_by_user_id
const hasReferredBy = await db.schema.hasColumn('users', 'referred_by_user_id');
if (!hasReferredBy) {
  await db.schema.alterTable('users', (table) => {
    table.integer('referred_by_user_id')
      .unsigned()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });
  console.log('[INFO] Colonne "referred_by_user_id" ajoutée à la table "users".');
}

       
       
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

// 🔧 Stories : ajout conditionnel des colonnes manquantes
const hasStoriesType = await db.schema.hasColumn('stories', 'type');
if (!hasStoriesType) {
  await db.schema.alterTable('stories', (table) => {
    table.string('type');
  });
  console.log('[INFO] Colonne "type" ajoutée à la table "stories".');
}

const hasStoriesText = await db.schema.hasColumn('stories', 'text');
if (!hasStoriesText) {
  await db.schema.alterTable('stories', (table) => {
    table.text('text');
  });
  console.log('[INFO] Colonne "text" ajoutée à la table "stories".');
}

const hasStoriesBg = await db.schema.hasColumn('stories', 'backgroundColor');
if (!hasStoriesBg) {
  await db.schema.alterTable('stories', (table) => {
    table.text('backgroundColor');
  });
  console.log('[INFO] Colonne "backgroundColor" ajoutée à la table "stories".');
}

const hasStoriesTags = await db.schema.hasColumn('stories', 'tags');
if (!hasStoriesTags) {
  await db.schema.alterTable('stories', (table) => {
    table.jsonb('tags');
  });
  console.log('[INFO] Colonne "tags" ajoutée à la table "stories".');
}

// (Optionnel) Suppression de "content"
// const hasStoriesContent = await db.schema.hasColumn('stories', 'content');
// if (hasStoriesContent) {
//   await db.schema.alterTable('stories', (table) => {
//     table.dropColumn('content');
//   });
//   console.log('[INFO] Colonne "content" supprimée de la table "stories".');
// }

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



// 🔧 Insertion conditionnelle d'un utilisateur et d'une conversation de test (uniquement en dev)
(async () => {
  if (NODE_ENV === 'development') {
    try {
      console.log('[INFO] Initialisation des données de test...');

      // 🔹 Vérifie si l'utilisateur de test existe
      let testUser = await db('users').where('email', 'voicetest@example.com').first();
      if (!testUser) {
        const [createdUser] = await db('users')
          .insert({
            username: 'voicetest',
            email: 'voicetest@example.com',
            password: 'dummyhash', // ⚠️ mot de passe bidon, ne pas utiliser en prod
            isAdmin: false,
          })
          .returning('*');
        testUser = createdUser;
        console.log(`[INFO] Utilisateur de test créé (id=${testUser.id})`);
      } else {
        console.log(`[INFO] Utilisateur de test déjà existant (id=${testUser.id})`);
      }

      // 🔹 Vérifie si une conversation de test existe
      const existingConv = await db('conversations')
        .where('sender_id', testUser.id)
        .first();

      if (!existingConv) {
        const [createdConv] = await db('conversations')
          .insert({
            sender_id: testUser.id,
            receiver_id: testUser.id,
            created_at: new Date(),
          })
          .returning('*');

        console.log(`[INFO] Conversation de test créée (id=${createdConv.id})`);
      } else {
        console.log(`[INFO] Conversation de test déjà existante (id=${existingConv.id})`);
      }
    } catch (err) {
      console.error('[ERREUR] Insertion données test :', err.message);
    }
  }
})();


module.exports = db;