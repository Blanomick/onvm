const express = require('express'); // Import d'Express


const multer = require('multer'); // Import de Multer pour la gestion des fichiers
const path = require('path');
const router = express.Router();
const app = express();



const db = require('../db'); // Importer la connexion à la base de données



router.get('/', async (req, res) => {
  try {
    const users = await db.select('id', 'username', 'profilePicture').from('users');
    res.status(200).json(users);
  } catch (err) {
    console.error("[ERREUR] Impossible de récupérer les utilisateurs :", err);
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs.' });
  }
});


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


// 🔹 Route GET pour rechercher les utilisateurs par nom de profil (recherche)
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.trim().toLowerCase() : '';

    if (!query) {
      return res.status(400).json({ message: 'Le champ de recherche est requis.' });
    }

    
const searchResults = await db('users')
  .select('id', 'username', 'email', 'profilePicture')
  .where('username', 'ILIKE', `%${query}%`);




    if (searchResults.length === 0) {
      return res.status(404).json({ message: 'Aucun utilisateur trouvé.' });
    }

    res.status(200).json(searchResults);
  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur lors de la recherche des utilisateurs :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

router.get('/:id/extra-data', async (req, res) => {
  const userId = req.params.id;
  try {
    const extraData = await db('users')
      .select('bio', 'profilePicture')
      .where({ id: userId })
      .first();

    if (!extraData) {
      return res.status(404).json({ message: "Données supplémentaires introuvables." });
    }

    res.status(200).json(extraData);
  } catch (err) {
    console.error(`[ERREUR] Erreur lors de la récupération des données supplémentaires pour l'utilisateur ${userId}:`, err);
    res.status(500).json({ message: 'Erreur lors de la récupération des données supplémentaires.' });
  }
});



// 🔹 Route pour récupérer la liste des abonnés (followers) d'un utilisateur
router.get('/:id/followers-list', async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
    }

    const query = `
      SELECT users.id, users.username, users.profilePicture 
      FROM follows 
      JOIN users ON follows.followerId = users.id 
      WHERE follows.followingId = ?
    `;

    const followers = await db
      .raw(query, [userId])
      .then((result) => result.rows)
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des abonnés :', err);
        throw err;
      });

    res.status(200).json(followers);
  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur lors de la récupération des abonnés :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// 🔹 Route pour récupérer la liste des personnes suivies (following)
router.get('/:id/following-list', async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
    }

    const query = `
      SELECT users.id, users.username, users.profilePicture 
      FROM follows 
      JOIN users ON follows.followingId = users.id 
      WHERE follows.followerId = ?
    `;

    const following = await db
      .raw(query, [userId])
      .then((result) => result.rows)
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des abonnements :', err);
        throw err;
      });

    res.status(200).json(following);
  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur lors de la récupération des abonnements :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});





router.get('/:id/publications', async (req, res) => {
  try {
    const userId = req.params.id;

    const query = `
      SELECT p.id, p.content, p.media, p.created_at, u.username, u.profilePicture,
             CASE 
               WHEN r."userId" IS NOT NULL THEN true 
               ELSE false 
             END AS isRetweeted,
             ru.username AS retweeterUsername
      FROM publications p
      JOIN users u ON p."userId" = u.id
      LEFT JOIN retweets r ON r."publicationId" = p.id AND r."userId" = ?
      LEFT JOIN users ru ON r."userId" = ru.id
      WHERE p."userId" = ? OR r."userId" = ?
      ORDER BY p.created_at DESC;
    `;

    const publications = await db.raw(query, [userId, userId, userId]);

    res.status(200).json(publications.rows);
  } catch (error) {
    console.error('[ERREUR] Impossible de récupérer les publications et retweets:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});



// 🔹 Route pour vérifier si un utilisateur suit un autre utilisateur

router.get('/:id/is-following', async (req, res) => {
  try {
    const { followerId } = req.query;
    const { id: followingId } = req.params;

    console.log(`[DEBUG] Vérification de suivi : followerId=${followerId}, followingId=${followingId}`);

    if (!followerId || !followingId) {
      console.error('[ERREUR] Paramètres manquants : followerId ou followingId');
      return res.status(400).json({ error: 'IDs invalides' });
    }

    const result = await db('follows')
      .count('* as count')
      .whereRaw('"followerid" = ? AND "followingid" = ?', [followerId, followingId])
      .first();

    console.log(`[DEBUG] Résultat de la requête :`, result);

    res.json({ isFollowing: result.count > 0 });
  } catch (error) {
    console.error('[ERREUR] Impossible de vérifier le suivi:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});





// Route pour mettre à jour la biographie de l'utilisateur

router.put('/:id/bio', async (req, res) => {
  const userId = req.params.id;
  const newBio = req.body.bio;

  if (!newBio || newBio.trim() === '') {
    return res.status(400).json({ message: 'La biographie ne peut pas être vide.' });
  }

  try {
    await db('users').where({ id: userId }).update({ bio: newBio });
    res.status(200).json({ message: 'Biographie mise à jour avec succès!' });
  } catch (err) {
    console.error("[ERREUR] Erreur lors de la mise à jour de la biographie :", err);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la biographie.' });
  }
});



// ✅ Route POST corrigée pour suivre un utilisateur
router.post('/follow', async (req, res) => {
  const { followerId, followingId } = req.body;

  console.log(`[SUIVI] Requête reçue : followerId=${followerId}, followingId=${followingId}`);

  if (!followerId || !followingId) {
    console.warn('[AVERTISSEMENT] Données manquantes pour suivre un utilisateur.');
    return res.status(400).json({ message: 'Les champs followerId et followingId sont requis.' });
  }

  try {
    const existingFollow = await db('follows')
      .where({ followerid: followerId, followingid: followingId })
      .first();

    if (existingFollow) {
      console.info(`[INFO] L'utilisateur ${followerId} suit déjà ${followingId}`);
      return res.status(400).json({ message: 'Vous suivez déjà cet utilisateur.' });
    }

    await db('follows').insert({
      followerid: followerId,
      followingid: followingId
    });

    console.log(`[SUCCÈS] L'utilisateur ${followerId} suit maintenant ${followingId}`);
    res.status(200).json({ message: 'Suivi réussi.' });
  } catch (err) {
    console.error('[ERREUR] Échec de la requête de suivi :', err);
    res.status(500).json({ message: 'Erreur interne du serveur', details: err.message });
  }
});










// Route GET pour récupérer les informations d'un utilisateur par son ID

router.get('/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await db('users').where({ id: userId }).first();

    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("[ERREUR] Erreur lors de la récupération de l'utilisateur :", err);
    res.status(500).json({ message: "Erreur lors de la récupération des données utilisateur." });
  }
});

router.get('/:id/extra-data', async (req, res) => {
  const userId = req.params.id;
  try {
    const extraData = await db('users')
      .select('bio', 'profilePicture')
      .where({ id: userId })
      .first();

    if (!extraData) {
      return res.status(404).json({ message: "Données supplémentaires introuvables." });
    }

    res.status(200).json(extraData);
  } catch (err) {
    console.error(`[ERREUR] Erreur lors de la récupération des données supplémentaires pour l'utilisateur ${userId}:`, err);
    res.status(500).json({ message: 'Erreur lors de la récupération des données supplémentaires.' });
  }
});



// Route GET pour récupérer le solde du portefeuille d'un utilisateur

router.get('/:userId/wallet/balance', async (req, res) => {
  const userId = req.params.userId;

  try {
    const wallet = await db('wallet').select('balance').where({ userId }).first();

    if (!wallet) {
      return res.status(404).json({ message: "Portefeuille introuvable." });
    }

    res.status(200).json({ balance: wallet.balance });
  } catch (err) {
    console.error("[ERREUR] Erreur lors de la récupération du solde du portefeuille :", err);
    res.status(500).json({ message: "Erreur 500 lors de la récupération du solde." });
  }
});




// 🔹 Route GET pour récupérer l'historique des transactions du portefeuille d'un utilisateur
router.get('/:userId/wallet/history', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
    }

    const query = `
      SELECT id, type, amount, date 
      FROM transactions 
      WHERE userId = ? 
      ORDER BY date DESC
    `;

    const transactions = await db
      .raw(query, [userId])
      .then((result) => result.rows)
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération de l\'historique des transactions :', err);
        throw err;
      });

    res.status(200).json({ transactions });
  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur lors de la récupération des transactions :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});


// Route PUT pour mettre à jour la photo de profil


router.put('/:id/profile-picture', upload.single('profilePicture'), async (req, res) => {
  const userId = req.params.id;
  const profilePicturePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!profilePicturePath) {
    return res.status(400).json({ message: 'La photo de profil est requise.' });
  }

  try {
    await db('users').where({ id: userId }).update({ profilePicture: profilePicturePath });
    res.status(200).json({ message: 'Photo de profil mise à jour avec succès.', profilePicture: profilePicturePath });
  } catch (err) {
    console.error("[ERREUR] Erreur lors de la mise à jour de la photo de profil :", err);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la photo de profil.' });
  }
});




// 🔹 Route GET pour récupérer les publications d'un utilisateur
router.get('/:id/publications', async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
    }

    const query = `
     SELECT p.id, p.content, p.media, p.created_at, u.username, u.profilePicture
FROM publications p
JOIN users u ON p."userId" = u.id
WHERE p.userId = ?
ORDER BY p.created_at DESC

    `;

    const publications = await db
      .raw(query, [userId])
      .then((result) => result.rows)
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des publications :', err);
        throw err;
      });

    res.status(200).json({ publications });
  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur lors de la récupération des publications :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
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

router.get('/:id/followers', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await db('follows')
      .count('* as totalFollowers')
      .where({ followingid: userId }) // ⚠️ Utilisation du bon nom de colonne
      .first();

    const total = parseInt(result.totalFollowers, 10) || 0;

    console.log(`[INFO] Nombre d'abonnés pour l'utilisateur ${userId} : ${total}`);

    res.status(200).json({ totalFollowers: total });
  } catch (err) {
    console.error("[ERREUR] Erreur lors de la récupération des abonnés :", err);
    res.status(500).json({ message: 'Erreur lors de la récupération des abonnés.' });
  }
});



// ✅ Route corrigée pour se désabonner
router.post('/unfollow', async (req, res) => {
  const { followerId, followingId } = req.body;

  if (!followerId || !followingId) {
    return res.status(400).json({ message: 'Les champs followerId et followingId sont requis.' });
  }

  try {
    await db('follows').where({ followerid: followerId, followingid: followingId }).del();
    console.log(`[INFO] L'utilisateur ${followerId} s'est désabonné de ${followingId}`);
    res.status(200).json({ message: 'Suivi supprimé avec succès.' });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la suppression du suivi :', err);
    res.status(500).json({ message: 'Erreur lors de la suppression du suivi.' });
  }
});




// 🔹 Route GET pour récupérer la liste de tous les utilisateurs
router.get('/all', async (req, res) => {
  try {
    console.log('[LOG] Récupération de la liste de tous les utilisateurs...');

    const query = `
      SELECT id, username, profilePicture
      FROM users
      ORDER BY username ASC
    `;

    const users = await db
      .raw(query)
      .then((result) => result.rows)
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des utilisateurs :', err);
        throw err;
      });

    console.log(`[LOG] ${users.length} utilisateurs récupérés.`);
    res.status(200).json(users);
  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur lors de la récupération des utilisateurs :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
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


// 🔹 Route pour récupérer les communautés créées et rejointes par un utilisateur
router.get('/:userId/communities', async (req, res) => {
  const userId = req.params.userId;

  try {
    console.log(`[LOG] Récupération des communautés pour l'utilisateur ID: ${userId}`);

    const query = `
      SELECT c.*, 
        CASE 
          WHEN c.created_by = ? THEN 'owner' 
          ELSE 'member' 
        END AS role
      FROM communities c
       LEFT JOIN community_members cm ON c.id = cm.community_id
      WHERE c.created_by = ? OR cm.user_id = ?
      ORDER BY c.created_at DESC
    `;

    const communities = await db
      .raw(query, [userId, userId, userId])
      .then((result) => result.rows)
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des communautés :', err);
        throw err;
      });

    console.log(`[LOG] ${communities.length} communautés récupérées.`);
    res.status(200).json(communities);
  } catch (error) {
    console.error('[ERREUR] Erreur interne lors de la récupération des communautés :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});



// 🔹 Route pour récupérer les messages d'un utilisateur dans une communauté spécifique
router.get('/:userId/communities/:communityId/messages', async (req, res) => {
  const { userId, communityId } = req.params;

  try {
    console.log(`[LOG] Récupération des messages pour l'utilisateur ${userId} dans la communauté ${communityId}`);

    const query = `
      SELECT m.*, u.username, u.profilePicture
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.user_id = ? AND m.community_id = ?
      ORDER BY m.created_at ASC
    `;

    const messages = await db
      .raw(query, [userId, communityId])
      .then((result) => result.rows)
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des messages :', err);
        throw err;
      });

    console.log(`[LOG] ${messages.length} messages récupérés pour la communauté ${communityId}.`);
    res.status(200).json(messages);
  } catch (error) {
    console.error('[ERREUR] Erreur interne lors de la récupération des messages :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});



// Route pour récupérer les retweets d’un utilisateur
router.get('/:id/retweets', async (req, res) => {
  const { id } = req.params;

  try {
    const retweets = await db('retweets')
      .join('publications', 'retweets.publicationId', 'publications.id')
      .join('users', 'publications.userId', 'users.id')
      .select(
        'publications.id',
        'publications.content',
        'publications.media',
        'publications.created_at',
        'users.username',
        'users.profilePicture'
      )
      .where('retweets.userId', id)
      .orderBy('retweets.created_at', 'desc');

    res.status(200).json(retweets);
  } catch (error) {
    console.error('[ERREUR] Impossible de récupérer les retweets :', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des retweets.' });
  }
});


module.exports = router;
