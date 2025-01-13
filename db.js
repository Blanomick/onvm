const sqlite3 = require('sqlite3').verbose();

// Connexion à la base de données
const db = new sqlite3.Database('./db.sqlite', (err) => {
  if (err) {
    console.error('Erreur lors de l\'ouverture de la base de données :', err);
  } else {
    console.log('Connexion réussie à la base de données SQLite.');
  }
});

// Vérification et ajout des colonnes manquantes
db.serialize(() => {
  console.log('Vérification et ajout des colonnes si nécessaire...');

  // Vérification des colonnes dans la table commentaires
  db.all(`PRAGMA table_info(commentaires)`, (err, columns) => {
    if (err) {
      console.error('Erreur lors de la vérification de la table commentaires :', err);
    } else {
      const hasMediaColumn = columns.some(column => column.name === 'media');
      const hasAudioColumn = columns.some(column => column.name === 'audio');

      if (!hasMediaColumn) {
        db.run(`ALTER TABLE commentaires ADD COLUMN media TEXT`, (err) => {
          if (err) {
            console.error('Erreur lors de l\'ajout de la colonne media à la table commentaires :', err);
          } else {
            console.log('Colonne "media" ajoutée à la table "commentaires".');
          }
        });
      }

      if (!hasAudioColumn) {
        db.run(`ALTER TABLE commentaires ADD COLUMN audio TEXT`, (err) => {
          if (err) {
            console.error('Erreur lors de l\'ajout de la colonne audio à la table commentaires :', err);
          } else {
            console.log('Colonne "audio" ajoutée à la table "commentaires".');
          }
        });
      }
    }
  });

  // Vérification et ajout des colonnes bio et profilePicture dans la table users
  db.all(`PRAGMA table_info(users)`, (err, columns) => {
    if (err) {
      console.error('Erreur lors de la vérification de la table users :', err);
    } else {
      const hasBioColumn = columns.some(column => column.name === 'bio');
      const hasProfilePictureColumn = columns.some(column => column.name === 'profilePicture');

      if (!hasBioColumn) {
        db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, (err) => {
          if (err) {
            console.error('Erreur lors de l\'ajout de la colonne bio à la table users :', err);
          } else {
            console.log('Colonne "bio" ajoutée à la table "users".');
          }
        });
      }

      if (!hasProfilePictureColumn) {
        db.run(`ALTER TABLE users ADD COLUMN profilePicture TEXT DEFAULT '/uploads/default-profile.png'`, (err) => {
          if (err) {
            console.error('Erreur lors de l\'ajout de la colonne profilePicture à la table users :', err);
          } else {
            console.log('Colonne "profilePicture" ajoutée à la table "users".');
          }
        });
      }
    }
  });

  // Vérification et ajout de la colonne conversationId dans la table messages
  db.all(`PRAGMA table_info(messages)`, (err, columns) => {
    if (err) {
      console.error('Erreur lors de la vérification de la table messages :', err);
    } else {
      const hasConversationIdColumn = columns.some(column => column.name === 'conversationId');
      if (!hasConversationIdColumn) {
        db.run(`ALTER TABLE messages ADD COLUMN conversationId INTEGER`, (err) => {
          if (err) {
            console.error('Erreur lors de l\'ajout de la colonne conversationId à la table messages :', err);
          } else {
            console.log('Colonne "conversationId" ajoutée à la table "messages".');
          }
        });
      }
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS publication_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    publicationId INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (publicationId) REFERENCES publications(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table publication_likes :', err);
    } else {
      console.log('Table "publication_likes" vérifiée ou créée avec succès.');
    }
  });
  

  // Vérification de la table retweets et ajout de created_at si nécessaire
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='retweets'", (err, row) => {
    if (err) {
      console.error('Erreur lors de la vérification de la table retweets :', err);
    } else if (!row) {
      db.run(`
        CREATE TABLE IF NOT EXISTS retweets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          publicationId INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (publicationId) REFERENCES publications(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('Erreur lors de la création de la table retweets :', err);
        } else {
          console.log('Table "retweets" vérifiée ou créée avec succès.');
        }
      });
    } else {
      db.all(`PRAGMA table_info(retweets)`, (err, columns) => {
        if (err) {
          console.error('Erreur lors de la vérification de la table retweets :', err);
        } else {
          const hasCreatedAtColumn = columns.some(column => column.name === 'created_at');
          if (!hasCreatedAtColumn) {
            db.run(`ALTER TABLE retweets ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
              if (err) {
                console.error('Erreur lors de l\'ajout de la colonne created_at à la table retweets :', err);
              }
            });
          }
        }
      });
    }
  });

  // Création de la table replies pour gérer les réponses aux commentaires
  db.run(`CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    commentId INTEGER,
    reply TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (commentId) REFERENCES commentaires(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table replies :', err);
    } else {
      console.log('Table "replies" vérifiée ou créée avec succès.');
    }
  });
});

// Création des tables principales si elles n'existent pas encore
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password TEXT,
  profilePicture TEXT DEFAULT 'https://onvm.org/uploads/default-profile.png',
  bio TEXT,
  isAdmin INTEGER DEFAULT 0
)`, (err) => {
  if (err) {
      console.error('Erreur lors de la création de la table users :', err);
  } else {
      console.log('Table "users" vérifiée ou créée avec succès.');
  }
});





  db.run(`CREATE TABLE IF NOT EXISTS publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    content TEXT,
    media TEXT,
    retweetsCount INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table publications :', err);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS commentaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicationId INTEGER,
    userId INTEGER,
    comment TEXT,
    media TEXT,
    audio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (publicationId) REFERENCES publications(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table commentaires :', err);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commentId INTEGER,
    userId INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (commentId) REFERENCES commentaires(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table comment_likes :', err);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commentId INTEGER,
    userId INTEGER,
    reply TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (commentId) REFERENCES commentaires(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Erreur lors de la création de la table replies :', err);
    }
  });



// Création de la table communities pour gérer les communautés
db.run(`CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
)`, (err) => {
  if (err) {
    console.error('Erreur lors de la création de la table communities :', err);
  } else {
    console.log('Table "communities" vérifiée ou créée avec succès.');
  }
});

// Création de la table community_members pour gérer les membres des communautés
db.run(`CREATE TABLE IF NOT EXISTS community_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`, (err) => {
  if (err) {
    console.error('Erreur lors de la création de la table community_members :', err);
  } else {
    console.log('Table "community_members" vérifiée ou créée avec succès.');
  }
});

// Création de la table messages pour gérer les messages des communautés
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`, (err) => {
  if (err) {
    console.error('Erreur lors de la création de la table messages :', err);
  } else {
    console.log('Table "messages" vérifiée ou créée avec succès.');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS wallet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    balance INTEGER DEFAULT 0,
    lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    transactionId INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    type TEXT CHECK(type IN ('earn', 'spend')) NOT NULL,
    amount INTEGER NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Création de la table userExtraData pour les données supplémentaires des utilisateurs
db.run(`CREATE TABLE IF NOT EXISTS userExtraData (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  additionalField1 TEXT,
  additionalField2 TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
)`, (err) => {
  if (err) {
    console.error('Erreur lors de la création de la table userExtraData :', err);
  } else {
    console.log('Table "userExtraData" vérifiée ou créée avec succès.');
  }
});

module.exports = db;
