const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db'); // Connexion à la base de données SQLite
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





const corsOptions = {
  origin: ['https://onvm.org', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));

// Configuration de multer pour la gestion des fichiers
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}_${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // Limite de taille à 200 Mo
});


const PORT = process.env.PORT || 5000;



const allowedOrigins = [
  'https://dainty-lollipop-7614cd.netlify.app', // Votre domaine Netlify
  'http://localhost:3000', // Pour les tests locaux
];






const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ['https://onvm.org', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});
// Export `io` pour d'autres fichiers si nécessaire
module.exports.io = io;


app.use((req, res, next) => {
  req.io = io; // Ajoute io à req pour le rendre accessible dans les routes
  next();
});



// Importation de liveRoutes après la définition de `io`
const liveRoutes = require('./routes/live')(io);





app.use(bodyParser.json({ limit: '200mb' })); // Limite à 200 Mo pour les requêtes JSON
app.use(bodyParser.urlencoded({ extended: true, limit: '200mb' })); // Limite à 200 Mo pour les requêtes encodées en URL
app.use(morgan('dev')); // Ajout des logs pour chaque requête
app.use((req, res, next) => {
  console.log(`[LOG] ${req.method} ${req.url} - Reçu à ${new Date().toISOString()}`);
  next();
});



 

// Gestion des fichiers statiques (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Désactiver la mise en cache pour le dossier 'uploads'
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store'); // Désactiver le cache
  }
}));

// Gestion des fichiers statiques (images par défaut)
app.use('/images', express.static(path.join(__dirname, 'public/images')));



// Ajout de logs pour chaque requête
app.use((req, res, next) => {
  console.log(`[LOG] ${req.method} ${req.url} - Requête reçue à ${new Date().toISOString()}`);
  next();
});

// Configuration des routes principales
app.use('/api/auth', authRoutes); // Authentification
app.use('/api/publications', publicationsRoutes); // Gestion des publications
app.use('/api/stories', storiesRoutes); // Gestion des stories
app.use('/api/upload', uploadsRoutes); // Upload des fichiers
app.use('/api/users', usersRoutes); // Gestion des utilisateurs
app.use('/admin-auth', adminAuthRoutes); // Authentification Admin
app.use('/api/communities', communitiesRoutes); // Gestion des communautés
app.use('/api/search', searchRoutes); // Route de recherche
app.use('/api/wallet', walletRoutes);
app.use('/api/live', liveRoutes);

// Route pour obtenir les sessions de live actives
app.get('/api/live/active-sessions', (req, res) => {
  res.json({ liveSessions });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API connectée avec succès !' });
});


app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route non trouvée' });
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
    console.log('[INFO] Nouvel utilisateur connecté : ', socket.id);

    // Écoute pour démarrer un direct
    socket.on('start-live', (data) => {
        console.log(`[INFO] Direct démarré par ${data.username}`);
        liveSessions[data.userId] = { viewers: [], host: data.username };

        io.emit('notify-live', { 
            username: data.username, 
            userId: data.userId, 
            profilePicture: data.profilePicture 
        });
    });

    // Rejoindre un live existant
    socket.on('join-live', (data) => {
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
    });

    // Envoie un message dans le live
    socket.on('live-message', ({ liveId, message, username }) => {
        io.to(liveId).emit('new-message', { message, username });
        console.log(`[INFO] Message reçu de ${username} dans le live ${liveId}: ${message}`);
    });

    // Quitter un live
    socket.on('leave-live', ({ liveId, username }) => {
        socket.leave(liveId);
        
        // Retire l'utilisateur de la session
        liveSessions[liveId].viewers = liveSessions[liveId].viewers.filter(user => user.socketId !== socket.id);

        // Notifie les autres utilisateurs du live
        io.to(liveId).emit('user-left', { username });
        console.log(`[INFO] ${username} a quitté le live ${liveId}`);
    });

    // Écoute pour les réactions pendant le direct
    socket.on('reaction', (data) => {
        console.log(`[INFO] Réaction reçue de ${data.username} : ${data.reaction}`);
        io.emit('new-reaction', data); // Diffuse la réaction à tous les utilisateurs
    });

    // Écoute pour arrêter un direct
    socket.on('stop-live', (data) => {
        console.log(`[INFO] Direct arrêté par ${data.username}`);
        io.emit('end-live', { username: data.username });
        
        // Supprime la session de live
        delete liveSessions[data.userId];
    });

    // Déconnexion de l'utilisateur
    socket.on('disconnect', () => {
        console.log('[INFO] Utilisateur déconnecté : ', socket.id);
        
        // Parcourt les sessions et retire l'utilisateur
        for (const liveId in liveSessions) {
            liveSessions[liveId].viewers = liveSessions[liveId].viewers.filter(user => user.socketId !== socket.id);
            io.to(liveId).emit('user-left', { userId: socket.id });
        }
    });
});


 



// Fonction pour vérifier et créer les tables dans la base de données
const initializeDatabase = () => {
  const tables = [
    {
      name: 'users',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          email TEXT UNIQUE,
          password TEXT,
          bio TEXT,
          profilePicture TEXT DEFAULT '/uploads/default_profile.png'
        );
      `,
    },
    {
      name: 'publications',
      sql: `
        CREATE TABLE IF NOT EXISTS publications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          content TEXT,
          media TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
      `,
    },
    {
      name: 'stories',
      sql: `
        CREATE TABLE IF NOT EXISTS stories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          content TEXT,
          media TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
      `,
    },
    {
      name: 'follows',
      sql: `
        CREATE TABLE IF NOT EXISTS follows (
          followerId INTEGER,
          followingId INTEGER,
          PRIMARY KEY (followerId, followingId),
          FOREIGN KEY (followerId) REFERENCES users(id),
          FOREIGN KEY (followingId) REFERENCES users(id)
        );
      `,

    },

    {
      name: 'wallet',
      sql: `
         CREATE TABLE IF NOT EXISTS wallet (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER UNIQUE,
            balance REAL DEFAULT 0,
            lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
         );
      `,
   },
   
   {
    name: 'transactions',
    sql: `
       CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          type TEXT,
          amount REAL,
          date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
       );
    `,
 },
 

    {
      name: 'likes',
      sql: `
        CREATE TABLE IF NOT EXISTS likes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          publicationId INTEGER,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (publicationId) REFERENCES publications(id) ON DELETE CASCADE
        );
      `,
    },
    {
      name: 'commentaires',
      sql: `
        CREATE TABLE IF NOT EXISTS commentaires (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          publicationId INTEGER,
          comment TEXT,
          media TEXT, 
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (publicationId) REFERENCES publications(id) ON DELETE CASCADE
        );
      `,
    },
    {
      name: 'retweets',
      sql: `
        CREATE TABLE IF NOT EXISTS retweets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          publicationId INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (publicationId) REFERENCES publications(id) ON DELETE CASCADE
        );
      `,
    },

   
    {
      name: 'communities',
      sql: `
        CREATE TABLE IF NOT EXISTS communities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_by INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        );
      `,
    },
    {
      name: 'community_members',
      sql: `
        CREATE TABLE IF NOT EXISTS community_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          community_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          role TEXT DEFAULT 'member',
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `,
    }
  ];

  tables.forEach((table) => {
    db.run(table.sql, (err) => {
      if (err) {
        console.error(`Erreur lors de la création de la table ${table.name} :`, err);
      } else {
        console.log(`Table ${table.name} vérifiée ou créée avec succès.`);
      }
    });
  });
};

// Démarrage du serveur
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur en cours d'exécution sur le port ${PORT}`);

  // Initialisation de la base de données
  db.serialize(() => {
      console.log('Connexion réussie à la base de données SQLite.');
      initializeDatabase(); // Vérification et création des tables
  });
});

db.on('error', (err) => {
  console.error('Erreur de connexion à la base de données :', err.message);
});