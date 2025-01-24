

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db'); // Connexion à la base de données SQLite
const router = express.Router();






// Gestion des erreurs globales pour la base de données
db.on('error', (err) => {
  console.error(`[ERREUR] Connexion à la base de données : ${err.message}`);
});
SECRET = process.env.JWT_SECRET || 'onvm_secret_key';


// Créer un jeton JWT
const createToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '7d', // Le jeton expire en 7 jours
  });
};

// Inscription d'un nouvel utilisateur
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ message: 'Cet email ou nom existe déjà.' });
          }
          console.error('Erreur lors de l\'inscription :', err);
          return res.status(500).json({ message: 'Erreur serveur.' });
        }

        const newUser = {
          id: this.lastID,
          username,
          email,
          profilePicture: 'https://onvm.org/uploads/default-profile.png',
        };

        const token = createToken(newUser);
        res.status(201).json({ message: 'Utilisateur inscrit avec succès.', user: newUser, token });
      }
    );
  } catch (error) {
    console.error('Erreur lors de l\'inscription :', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Connexion d'un utilisateur
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      console.error('Erreur lors de la connexion :', err);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Mot de passe incorrect.' });
    }

    const token = createToken(user);
    delete user.password; // Ne pas renvoyer le mot de passe

    res.status(200).json({ message: 'Connexion réussie.', user, token });
  });
});

// Middleware de vérification du jeton
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(403).json({ message: 'Accès refusé, jeton manquant.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Jeton invalide.' });
    }
    req.user = decoded;
    next();
  });
};

// Route pour obtenir les infos de l'utilisateur connecté
router.get('/me', verifyToken, (req, res) => {
  db.get('SELECT id, username, email, profilePicture FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur serveur.' });
    }
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    res.status(200).json(user);
  });
});

// Export du routeur pour être utilisé dans server.js
module.exports = router;
