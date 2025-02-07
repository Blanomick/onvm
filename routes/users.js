const express = require('express'); // Import d'Express

const db = require('../db'); // Connexion à la base de données SQLite
const multer = require('multer'); // Import de Multer pour la gestion des fichiers
const path = require('path');
const router = express.Router();
const app = express();




// Configuration de Multer pour stocker les fichiers dans le répertoire 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Le répertoire où les fichiers seront stockés
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}${ext}`; // Renommer le fichier avec un timestamp pour éviter les conflits
    cb(null, filename);
  },
});

const upload = multer({ storage: storage }); // Initialisation de Multer avec la configuration de stockage

// Route GET pour rechercher les utilisateurs par nom de profil (recherche)
router.get('/search', (req, res) => {
  const query = req.query.q ? req.query.q.trim() : '';
  if (!query) {
    return res.status(400).json({ message: 'Le champ de recherche est requis.' });
  }

  const searchQuery = `
    SELECT id, username, email, profilePicture 
    FROM users 
    WHERE LOWER(username) LIKE LOWER(?)
  `;
  const searchValue = `%${query}%`;

  db.all(searchQuery, [searchValue], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la recherche des utilisateurs.' });
    }
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Aucun utilisateur trouvé.' });
    }
    res.status(200).json(rows);
  });
});

// Route GET pour récupérer les données supplémentaires de l'utilisateur
router.get('/:id/extra-data', async (req, res) => {
  const userId = req.params.id;
  try {
      const extraData = await getUserExtraData(userId); // Appel de la fonction pour récupérer les données
      res.json(extraData);
  } catch (error) {
      console.error(`[ERREUR] Problème lors de la récupération des données supplémentaires de l'utilisateur ${userId}:`, error);
      res.status(500).json({ message: 'Erreur lors de la récupération des données supplémentaires' });
  }
});



// Fonction pour récupérer les données supplémentaires de l'utilisateur depuis la base de données
async function getUserExtraData(userId) {
  return new Promise((resolve, reject) => {
      const query = `SELECT additionalField1, additionalField2 FROM userExtraData WHERE userId = ?`; // Remplacez par vos colonnes et table exactes
      db.get(query, [userId], (err, row) => {
          if (err) {
              console.error("[ERREUR] Impossible de récupérer les données supplémentaires:", err);
              reject(err);
          } else {
              resolve(row || {}); // Retourne un objet vide si aucune donnée n'est trouvée
          }
      });
  });
}


// Route pour récupérer la liste des abonnés (followers) d'un utilisateur
router.get('/:id/followers-list', (req, res) => {
  const userId = req.params.id;

  const query = `SELECT users.id, users.username FROM follows JOIN users ON follows.followerId = users.id WHERE followingId = ?`;
  db.all(query, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération des abonnés.' });
    }
    res.status(200).json(rows);
  });
});

// Route pour récupérer la liste des personnes suivies (following)
router.get('/:id/following-list', (req, res) => {
  const userId = req.params.id;

  const query = `SELECT users.id, users.username FROM follows JOIN users ON follows.followingId = users.id WHERE followerId = ?`;
  db.all(query, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération des suivis.' });
    }
    res.status(200).json(rows);
  });
});

// Route pour récupérer le nombre de followers
router.get('/:id/followers', (req, res) => {
  const userId = req.params.id;

  const query = `SELECT COUNT(*) AS totalFollowers FROM follows WHERE followingId = ?`;

  db.get(query, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération des abonnés.' });
    }
    res.status(200).json({ totalFollowers: row.totalFollowers });
  });
});

// Route pour mettre à jour la biographie de l'utilisateur
router.put('/:id/bio', (req, res) => {
  const userId = req.params.id;
  const newBio = req.body.bio;

  if (!newBio || newBio.trim() === '') {
    return res.status(400).json({ message: 'La biographie ne peut pas être vide.' });
  }

  const updateBioQuery = `UPDATE users SET bio = ? WHERE id = ?`;
  db.run(updateBioQuery, [newBio, userId], function(err) {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la mise à jour de la biographie.' });
    }
    res.status(200).json({ message: 'Biographie mise à jour avec succès!' });
  });
});

// Route POST pour suivre un utilisateur
router.post('/follow', (req, res) => {
  const { followerId, followingId } = req.body;

  if (!followerId || !followingId) {
    return res.status(400).json({ message: 'Les champs followerId et followingId sont requis.' });
  }

  const checkQuery = 'SELECT * FROM follows WHERE followerId = ? AND followingId = ?';
  db.get(checkQuery, [followerId, followingId], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la vérification du suivi.' });
    }
    if (row) {
      return res.status(400).json({ message: 'Vous suivez déjà cet utilisateur.' });
    }

    const insertQuery = 'INSERT INTO follows (followerId, followingId) VALUES (?, ?)';
    db.run(insertQuery, [followerId, followingId], (err) => {
      if (err) {
        return res.status(500).json({ message: 'Erreur lors du suivi de l\'utilisateur.' });
      }
      res.status(200).json({ message: 'Suivi réussi.' });
    });
  });
});

// Route GET pour récupérer les informations d'un utilisateur par son ID
router.get('/:id', (req, res) => {
  const userId = req.params.id;

  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération de l\'utilisateur.' });
    }
    if (!row) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    res.json(row);
  });
});


// Exemple dans users.js
router.get('/:id/extra-data', async (req, res) => {
  const userId = req.params.id;
  try {
      // Remplacez ceci par votre logique pour récupérer les données supplémentaires de l'utilisateur
      const extraData = await getUserExtraData(userId); // Fonction à définir selon votre logique
      res.json(extraData);
  } catch (error) {
      console.error(`[ERREUR] Problème lors de la récupération des données supplémentaires de l'utilisateur ${userId}:`, error);
      res.status(500).json({ message: 'Erreur lors de la récupération des données supplémentaires' });
  }
});

// Route GET pour récupérer le solde du portefeuille d'un utilisateur
router.get('/:userId/wallet/balance', (req, res) => {
  const userId = req.params.userId;

  db.get('SELECT balance FROM wallet WHERE userId = ?', [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération du solde du portefeuille.' });
    }
    if (!row) {
      return res.status(404).json({ message: 'Portefeuille non trouvé.' });
    }
    res.status(200).json({ balance: row.balance });
  });
});

// Route GET pour récupérer l'historique des transactions du portefeuille d'un utilisateur
router.get('/:userId/wallet/history', (req, res) => {
  const userId = req.params.userId;

  const query = `SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC`;
  db.all(query, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique des transactions.' });
    }
    res.status(200).json({ transactions: rows });
  });
});


// Route PUT pour mettre à jour la photo de profil
router.put('/:id/profile-picture', upload.single('profilePicture'), (req, res) => {
  const userId = req.params.id;
  const profilePicturePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!profilePicturePath) {
    return res.status(400).json({ message: 'La photo de profil est requise.' });
  }

  const updateQuery = 'UPDATE users SET profilePicture = ? WHERE id = ?';
  db.run(updateQuery, [profilePicturePath, userId], (err) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la mise à jour de la photo de profil.' });
    }
    res.status(200).json({ message: 'Photo de profil mise à jour avec succès.', profilePicture: profilePicturePath });
  });
});

// Route GET pour récupérer les publications d'un utilisateur
router.get('/:id/publications', (req, res) => {
  const userId = req.params.id;

  const query = `
    SELECT * FROM publications 
    WHERE userId = ? 
    ORDER BY created_at DESC
  `;
  db.all(query, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération des publications.' });
    }
    res.status(200).json(rows);
  });
});

// Route GET pour récupérer les retweets d'un utilisateur
router.get('/:id/retweets', (req, res) => {
  const userId = req.params.id;

  const query = `
    SELECT publications.*, users.username 
    FROM retweets 
    JOIN publications ON retweets.publicationId = publications.id
    JOIN users ON publications.userId = users.id
    WHERE retweets.userId = ?
    ORDER BY retweets.created_at DESC
  `;
  db.all(query, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération des retweets.' });
    }
    res.status(200).json(rows);
  });
});

// Route DELETE pour supprimer un retweet par publicationId et userId
router.delete('/retweets/:publicationId/:userId', (req, res) => {
  const { publicationId, userId } = req.params;

  const deleteQuery = 'DELETE FROM retweets WHERE publicationId = ? AND userId = ?';
  db.run(deleteQuery, [publicationId, userId], function (err) {
    if (err) {
      console.error('Erreur lors de la suppression du retweet:', err);
      return res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Retweet introuvable.' });
    }
    res.status(200).json({ message: 'Retweet supprimé avec succès.' });
  });
});


router.get('/:id/is-following', (req, res) => {
  const { followerId } = req.query;
  const followingId = req.params.id;

  if (!followerId || !followingId) {
    return res.status(400).json({ message: 'Les IDs du follower et du following sont requis.' });
  }

  const query = 'SELECT COUNT(*) AS isFollowing FROM follows WHERE followerId = ? AND followingId = ?';
  db.get(query, [followerId, followingId], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la vérification du suivi.' });
    }
    res.status(200).json({ isFollowing: row.isFollowing > 0 });
  });
});




// Route POST pour ne plus suivre un utilisateur
router.post('/unfollow', (req, res) => {
  const { followerId, followingId } = req.body;

  if (!followerId || !followingId) {
    return res.status(400).json({ message: 'Les champs followerId et followingId sont requis.' });
  }

  const deleteQuery = 'DELETE FROM follows WHERE followerId = ? AND followingId = ?';
  db.run(deleteQuery, [followerId, followingId], (err) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la suppression du suivi.' });
    }
    res.status(200).json({ message: 'Suivi supprimé avec succès.' });
  });
});

// Route GET pour récupérer la liste de tous les utilisateurs
router.get('/all', async (req, res) => {
  try {
    const query = 'SELECT id, username, profilePicture FROM users';
    const users = await new Promise((resolve, reject) => {
      db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs.' });
  }
});


// Route pour vérifier si un utilisateur est membre d'une communauté
router.get('/:userId/community/:communityId', (req, res) => {
  const { userId, communityId } = req.params;
  const query = `
    SELECT * FROM community_members 
    WHERE user_id = ? AND community_id = ?
  `;
  db.get(query, [userId, communityId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la vérification de l\'adhésion à la communauté.' });
    }
    if (row) {
      res.status(200).json({ isMember: true });
    } else {
      res.status(404).json({ isMember: false });
    }
  });
});


// Route pour récupérer les communautés créées et rejointes par un utilisateur
router.get('/:userId/communities', (req, res) => {
  const userId = req.params.userId;

  const query = `
    SELECT c.*, 
      CASE 
        WHEN c.created_by = ? THEN 'owner' 
        ELSE 'member' 
      END AS role
    FROM communities c
    LEFT JOIN community_members cm ON c.id = cm.community_id AND cm.user_id = ?
    WHERE c.created_by = ? OR cm.user_id = ?
  `;

  db.all(query, [userId, userId, userId, userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des communautés de l\'utilisateur.' });
    }
    res.status(200).json(rows);
  });
});



// Route pour récupérer les messages d'un utilisateur dans une communauté spécifique
router.get('/:userId/communities/:communityId/messages', (req, res) => {
  const { userId, communityId } = req.params;

  const query = `
    SELECT * FROM messages
    WHERE user_id = ? AND community_id = ?
  `;

  db.all(query, [userId, communityId], (err, rows) => {
    if (err) {
      console.error('Erreur lors de la récupération des messages:', err);
      return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
    res.status(200).json(rows);
  });
});



module.exports = router;
