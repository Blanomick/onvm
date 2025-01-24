



const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const knex = require('knex'); // Import de Knex
const morgan = require('morgan'); // Ajout de morgan pour les logs HTTP
const multer = require('multer'); // Ajout de multer pour la gestion des fichiers
const authRoutes = require('./routes/auth'); // Routes d'authentification
const publicationsRoutes = require('./routes/publications'); // Routes des publications
const storiesRoutes = require('./routes/stories'); // Routes des stories
const uploadsRoutes = require('./routes/uploads'); // Routes pour l'upload de fichiers
const usersRoutes = require('./routes/users'); // Routes pour la gestion des utilisateurs
const adminAuthRoutes = require('./routes/AdminAuth'); // Routes d'authentification Admin
const communitiesRoutes = require('./routes/communities'); // Routes pour les communautés
const searchRoutes = require('./routes/search'); // Route de recherche
const walletRoutes = require('./routes/wallet');
const http = require('http');
const { Server } = require('socket.io');
const liveSessions = {};


const app = express();

// Définir directement les variables importantes dans le fichier
const DATABASE_URL = "postgresql://onvmdb_user:s8BEoy1je9KdtAG4eAuliUkyw3UCdhuU@dpg-cu3qdkhu0jms73dnpo10-a.oregon-postgres.render.com/onvmdb";
const JWT_SECRET = "wgzfjViViKh1FxKH03Nx13qQO45Oenq89FZ8QB/WqTo";
const PORT = 5000;

// Afficher les valeurs des variables pour vérifier leur chargement
console.log('DATABASE_URL:', DATABASE_URL);
console.log('JWT_SECRET:', JWT_SECRET);
console.log('PORT:', PORT);
// Suppression de la vérification de .env car l'URL est directement définie
console.log('[INFO] Utilisation de l\'URL de base de données codée en dur.');
if (!DATABASE_URL) {
  console.error('[ERREUR] L\'URL de la base de données n\'est pas définie.');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('[ERREUR] Le secret JWT n\'est pas défini.');
  process.exit(1);
}


const db = knex({
  client: 'pg',
  connection: {
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  },
  pool: {
    min: 0, // Garde 0 connexion active pour libérer des ressources inutilisées.
    max: 5, // Limite le nombre de connexions à 5 pour éviter une surcharge.
    acquireTimeoutMillis: 60000, // Temps maximum pour acquérir une connexion.
    idleTimeoutMillis: 30000, // Ferme les connexions inactives après 30 secondes.
    reapIntervalMillis: 1000, // Vérifie les connexions inactives toutes les secondes.
  },
});


  




// Fonction pour tester la connexion à la base de données
const testDatabaseConnection = async () => {
  try {
    console.log('[INFO] Test de connexion à la base de données PostgreSQL...');
    await db.raw('SELECT 1');
    console.log('[INFO] Connexion réussie à la base de données PostgreSQL.');
  } catch (err) {
    console.error('[ERREUR] Impossible de se connecter à la base de données PostgreSQL :', err.message);
    process.exit(1); // Arrête le processus en cas d'échec
  }
};

// Appelez cette fonction directement au démarrage
testDatabaseConnection();


// Configuration des options CORS
const corsOptions = {
  origin: ['https://onvm.org', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
// Middleware CORS
app.use(require('cors')(corsOptions));

// Configuration de multer pour la gestion des fichiers

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/'); // Dossier où les fichiers seront stockés
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}_${file.originalname}`); // Génère un nom unique pour chaque fichier
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // Limite de taille à 200 Mo
});

// Configuration Socket.IO


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://onvm.org', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Export `io` pour utilisation dans d'autres fichiers
module.exports.io = io;

// Ajout de Socket.IO au contexte des requêtes
app.use((req, res, next) => {
  req.io = io;
  next();
});


// Logs pour les requêtes entrant
app.use(morgan('dev'));

// Ajout de logs pour chaque requête
app.use((req, res, next) => {
  console.log(`[LOG] ${req.method} ${req.url} - Reçu à ${new Date().toISOString()}`);
  next();
});

// Gestion des fichiers statiques pour les uploads

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store'); // Désactive le cache
  },
}));

// Routes principales
app.use('/api/auth', require('./routes/auth'));
app.use('/api/publications', require('./routes/publications'));
app.use('/api/stories', require('./routes/stories'));
app.use('/api/upload', require('./routes/uploads'));
app.use('/api/users', require('./routes/users'));
app.use('/admin-auth', require('./routes/AdminAuth'));
app.use('/api/communities', require('./routes/communities'));
app.use('/api/search', require('./routes/search'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/live', require('./routes/live')(io));

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API connectée avec succès !' });
});

// Gestion des erreurs pour les routes non trouvées
app.use('*', (req, res) => {
  console.error(`[ERREUR] Route non trouvée : ${req.method} ${req.url}`);
  res.status(404).json({ message: 'Route non trouvée' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error(`[ERREUR] Erreur détectée : ${err.stack}`);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

server.listen(PORT, async () => {
  try {
    console.log(`[INFO] Serveur démarré sur le port ${PORT}.`);
    console.log('[INFO] Initialisation de la base de données...');
    await initializeDatabase();
    console.log('[INFO] Base de données initialisée avec succès.');
  } catch (err) {
    console.error(`[ERREUR] Problème lors de l'initialisation : ${err.message}`);
    process.exit(1); // Arrête le serveur si l'initialisation échoue
  }
});


// Gestion des erreurs pour les routes non trouvées (404)
app.use((req, res) => {
  console.error(`[ERREUR] Route non trouvée: ${req.method} ${req.url}`);
  res.status(404).json({ message: 'Ressource non trouvée' });
});

// Gestion des erreurs globales (500)
app.use((err, req, res, next) => {
  console.error(`[ERREUR] Erreur détectée: ${err.stack}`);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - Reçu à ${new Date().toISOString()}`);
  next();
});




io.on('connection', (socket) => {
  console.log(`[INFO] Nouvel utilisateur connecté : ${socket.id}`);

  // Écoute pour démarrer un direct
  socket.on('start-live', (data) => {
      try {
          console.log(`[INFO] Direct démarré par ${data.username}`);
          liveSessions[data.userId] = { viewers: [], host: data.username };

          io.emit('notify-live', { 
              username: data.username, 
              userId: data.userId, 
              profilePicture: data.profilePicture 
          });
      } catch (error) {
          console.error(`[ERREUR] Erreur lors du démarrage du live : ${error.message}`);
      }
  });

  // Rejoindre un live existant
  socket.on('join-live', (data) => {
      try {
          const { liveId, username, profilePicture } = data;

          // Vérifie si la session de live existe
          if (!liveSessions[liveId]) {
              liveSessions[liveId] = { viewers: [] };
          }

          // Ajoute l'utilisateur à la session
          liveSessions[liveId].viewers.push({ socketId: socket.id, username, profilePicture });
          socket.join(liveId);

          // Envoie une notification de jointure aux autres spectateurs
          io.to(liveId).emit('user-joined', { username, profilePicture });
          console.log(`[INFO] ${username} a rejoint le live ${liveId}`);
      } catch (error) {
          console.error(`[ERREUR] Erreur lors de la jonction au live : ${error.message}`);
      }
  });

  // Envoie un message dans le live
  socket.on('live-message', ({ liveId, message, username }) => {
      try {
          io.to(liveId).emit('new-message', { message, username });
          console.log(`[INFO] Message reçu de ${username} dans le live ${liveId} : ${message}`);
      } catch (error) {
          console.error(`[ERREUR] Erreur lors de l'envoi du message dans le live : ${error.message}`);
      }
  });

  // Quitter un live
  socket.on('leave-live', ({ liveId, username }) => {
      try {
          socket.leave(liveId);

          // Retire l'utilisateur de la session
          if (liveSessions[liveId]) {
              liveSessions[liveId].viewers = liveSessions[liveId].viewers.filter(user => user.socketId !== socket.id);
          }

          // Notifie les autres utilisateurs du live
          io.to(liveId).emit('user-left', { username });
          console.log(`[INFO] ${username} a quitté le live ${liveId}`);
      } catch (error) {
          console.error(`[ERREUR] Erreur lors du départ du live : ${error.message}`);
      }
  });

  // Écoute pour les réactions pendant le direct
  socket.on('reaction', (data) => {
      try {
          console.log(`[INFO] Réaction reçue de ${data.username} : ${data.reaction}`);
          io.emit('new-reaction', data); // Diffuse la réaction à tous les utilisateurs
      } catch (error) {
          console.error(`[ERREUR] Erreur lors de la gestion de la réaction : ${error.message}`);
      }
  });

  // Écoute pour arrêter un direct
  socket.on('stop-live', (data) => {
      try {
          console.log(`[INFO] Direct arrêté par ${data.username}`);
          io.emit('end-live', { username: data.username });

          // Supprime la session de live
          delete liveSessions[data.userId];
      } catch (error) {
          console.error(`[ERREUR] Erreur lors de l'arrêt du live : ${error.message}`);
      }
  });

  // Déconnexion de l'utilisateur
  socket.on('disconnect', () => {
      try {
          console.log(`[INFO] Utilisateur déconnecté : ${socket.id}`);

          // Parcourt les sessions et retire l'utilisateur
          for (const liveId in liveSessions) {
              liveSessions[liveId].viewers = liveSessions[liveId].viewers.filter(user => user.socketId !== socket.id);
              io.to(liveId).emit('user-left', { userId: socket.id });
          }
      } catch (error) {
          console.error(`[ERREUR] Erreur lors de la déconnexion de l'utilisateur : ${error.message}`);
      }
  });
});



 // Fonction pour vérifier et créer les tables dans la base de données
const initializeDatabase = async () => {
  try {
    const tables = [
      {
        name: 'users',
        schema: `
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            bio TEXT,
            profilePicture TEXT DEFAULT '/uploads/default-profile.png'
          );
        `,
      },
      {
        name: 'publications',
        schema: `
          CREATE TABLE IF NOT EXISTS publications (
            id SERIAL PRIMARY KEY,
            userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
            content TEXT,
            media TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
      {
        name: 'stories',
        schema: `
          CREATE TABLE IF NOT EXISTS stories (
            id SERIAL PRIMARY KEY,
            userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
            content TEXT,
            media TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
      {
        name: 'follows',
        schema: `
          CREATE TABLE IF NOT EXISTS follows (
            followerId INTEGER REFERENCES users(id),
            followingId INTEGER REFERENCES users(id),
            PRIMARY KEY (followerId, followingId)
          );
        `,
      },
      {
        name: 'wallet',
        schema: `
          CREATE TABLE IF NOT EXISTS wallet (
            id SERIAL PRIMARY KEY,
            userId INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            balance NUMERIC(10, 2) DEFAULT 0,
            lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
      {
        name: 'transactions',
        schema: `
          CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            amount NUMERIC(10, 2) NOT NULL,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
      {
        name: 'likes',
        schema: `
          CREATE TABLE IF NOT EXISTS likes (
            id SERIAL PRIMARY KEY,
            userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
            publicationId INTEGER REFERENCES publications(id) ON DELETE CASCADE
          );
        `,
      },
      {
        name: 'commentaires',
        schema: `
          CREATE TABLE IF NOT EXISTS commentaires (
            id SERIAL PRIMARY KEY,
            userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
            publicationId INTEGER REFERENCES publications(id) ON DELETE CASCADE,
            comment TEXT,
            media TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
      {
        name: 'retweets',
        schema: `
          CREATE TABLE IF NOT EXISTS retweets (
            id SERIAL PRIMARY KEY,
            userId INTEGER REFERENCES users(id) ON DELETE CASCADE,
            publicationId INTEGER REFERENCES publications(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
      {
        name: 'communities',
        schema: `
          CREATE TABLE IF NOT EXISTS communities (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
      {
        name: 'community_members',
        schema: `
          CREATE TABLE IF NOT EXISTS community_members (
            id SERIAL PRIMARY KEY,
            community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `,
      },
    ];

    // Parcourir et créer toutes les tables définies
    for (const table of tables) {
      console.log(`[INFO] Vérification de la table "${table.name}"...`);
      await db.raw(table.schema); // Exécute la commande SQL pour créer la table
      console.log(`[INFO] Table "${table.name}" vérifiée ou créée avec succès.`);
    }
  } catch (err) {
    console.error(`[ERREUR] Échec lors de la création des tables : ${err.message}`);
    throw err; // Relance l'erreur pour arrêter l'initialisation en cas d'échec critique
  }
};

// Test de connexion et initialisation des tables
(async () => {
  try {
    console.log('[INFO] Test de connexion à la base de données PostgreSQL...');
    await db.raw('SELECT 1'); // Vérifie la connexion
    console.log('[INFO] Connexion réussie à la base de données PostgreSQL.');

    console.log('[INFO] Initialisation de la base de données...');
    await initializeDatabase(); // Appelle la fonction pour créer les tables
    console.log('[INFO] Base de données initialisée avec succès.');
  } catch (error) {
    console.error(`[ERREUR] Problème lors de la connexion ou de l'initialisation de la base de données : ${error.message}`);
    process.exit(1); // Arrête le serveur si l'initialisation échoue
  }
})();

// Gestion des erreurs globales pour la base de données
db.on('error', (err) => {
  console.error(`[ERREUR] Connexion à la base de données : ${err.message}`);
});
