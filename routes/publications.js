const express = require('express');
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Vérification et création du répertoire 'uploads' si nécessaire
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`[LOG] Dossier "uploads" créé à ${uploadDir}`);
}

// Configuration de multer pour l'upload des fichiers (photos/vidéos/vocales)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeFileName = file.originalname.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
    cb(null, `${Date.now()}_${safeFileName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'audio/mpeg'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Type de fichier non autorisé'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 300 * 1024 * 1024 }
});




// Création de publication
router.post('/', upload.single('media'), (req, res) => {
  const { userId, content } = req.body;
  const media = req.file ? `/uploads/${req.file.filename}` : null;

  if (!userId || !content) {
    return res.status(400).json({ message: 'Les champs utilisateur et contenu sont obligatoires.' });
  }

  const query = 'INSERT INTO publications (userId, content, media) VALUES (?, ?, ?)';
  db.run(query, [userId, content, media], function (err) {
    if (err) {
      console.error('[ERREUR] Erreur lors de la création de la publication', err);
      return res.status(500).json({ message: 'Erreur lors de la création de la publication.' });
    }
    res.status(201).json({ message: 'Publication ajoutée avec succès!', id: this.lastID });
  });
});

// Récupération de toutes les publications avec utilisateur, photo de profil et leurs commentaires et réponses
router.get('/', (req, res) => {
  const query = `
    SELECT publications.*, users.username, users.profilePicture,
           COUNT(publication_likes.id) AS likes,
           COUNT(retweets.id) AS retweetsCount
    FROM publications
    JOIN users ON publications.userId = users.id
    LEFT JOIN publication_likes ON publications.id = publication_likes.publicationId
    LEFT JOIN retweets ON publications.id = retweets.publicationId
    GROUP BY publications.id
    ORDER BY publications.created_at DESC
LIMIT ? OFFSET ?

  `;

  db.all(query, [], async (err, publications) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération des publications', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des publications.' });
    }

    // Ajout des commentaires et réponses pour chaque publication
    for (let publication of publications) {
      publication.comments = await getCommentsForPublication(publication.id);
      for (let comment of publication.comments) {
        comment.replies = await getRepliesForComment(comment.id);
      }
    }
    res.status(200).json(publications);
  });
});

// Fonction pour récupérer les commentaires d'une publication
function getCommentsForPublication(publicationId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT commentaires.*, users.username, users.profilePicture
      FROM commentaires
      JOIN users ON commentaires.userId = users.id
      WHERE commentaires.publicationId = ?
      ORDER BY commentaires.created_at ASC
    `;
    db.all(query, [publicationId], (err, rows) => {
      if (err) {
        console.error('[ERREUR] Erreur lors de la récupération des commentaires:', err);
        reject(err);
      } else {
        
        Promise.all(rows.map(async (comment) => {
          comment.replies = await getRepliesForComment(comment.id);
        }));
        
        resolve(rows);
      }
    });
  });
}

// Fonction pour récupérer les réponses d'un commentaire
function getRepliesForComment(commentId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT replies.*, users.username, users.profilePicture
      FROM replies
      JOIN users ON replies.userId = users.id
      WHERE replies.commentId = ?
      ORDER BY replies.created_at ASC
    `;
    db.all(query, [commentId], (err, rows) => {
      if (err) {
        console.error('[ERREUR] Erreur lors de la récupération des réponses :', err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Route pour gérer le retweet d'une publication
router.post('/:publicationId/retweet', (req, res) => {
  const { publicationId } = req.params;
  const { userId } = req.body;

  console.log('[BACKEND] Données reçues pour retweet :', { publicationId, userId });

  // Validation des données entrantes
  if (!userId || !publicationId) {
    console.error('[ERREUR] Données manquantes :', { publicationId, userId });
    return res.status(400).json({ message: "Les champs userId et publicationId sont requis." });
  }

  // Vérification si la publication existe
  const checkPublicationQuery = `SELECT id FROM publications WHERE id = ?`;
  db.get(checkPublicationQuery, [publicationId], (err, row) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la vérification de la publication :', err);
      return res.status(500).json({ message: 'Erreur lors de la vérification de la publication.' });
    }

    if (!row) {
      console.error('[ERREUR] La publication avec id', publicationId, 'n\'existe pas.');
      return res.status(404).json({ message: 'Publication introuvable.' });
    }

    // Ajout du retweet
    const insertRetweetQuery = `
      INSERT INTO retweets (userId, publicationId, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    `;
    db.run(insertRetweetQuery, [userId, publicationId], function (err) {
      if (err) {
        console.error('[ERREUR] Erreur lors de l\'ajout du retweet :', err);

        // Gestion de l'erreur pour éviter les conflits (comme les contraintes uniques)
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ message: 'Vous avez déjà retweeté cette publication.' });
        }
        return res.status(500).json({ message: 'Erreur lors de l\'ajout du retweet.' });
      }

      console.log(
        '[SUCCÈS] Retweet ajouté avec succès pour userId :',
        userId,
        'et publicationId :',
        publicationId
      );
      res.status(200).json({ message: 'Retweet ajouté avec succès.', id: this.lastID });
    });
  });
});


  

// Ajout de commentaire pour une publication avec support de différents types de médias (audio, image, vidéo)
router.post('/:publicationId/comment', upload.fields([{ name: 'media' }, { name: 'audio' }]), (req, res) => {
  const { publicationId } = req.params;
  const { userId, comment } = req.body;
  const mediaPath = req.files['media'] ? `/uploads/${req.files['media'][0].filename}` : null;
  const audioPath = req.files['audio'] ? `/uploads/${req.files['audio'][0].filename}` : null;

  if (!userId || (!comment && !mediaPath && !audioPath)) {
    return res.status(400).json({ message: 'Les champs userId et au moins un des champs comment, media, ou audio sont obligatoires.' });
  }

  const query = 'INSERT INTO commentaires (userId, publicationId, comment, media, audio) VALUES (?, ?, ?, ?, ?)';
  db.run(query, [userId, publicationId, comment, mediaPath, audioPath], function (err) {
    if (err) {
      console.error('[ERREUR] Erreur lors de l\'ajout du commentaire:', err);
      return res.status(500).json({ message: 'Erreur lors de l\'ajout du commentaire.' });
    }
    res.status(200).json({ message: 'Commentaire ajouté avec succès.', id: this.lastID });
  });
});

// Ajouter une réponse à un commentaire
router.post('/comments/:commentId/reply', (req, res) => {
  const { commentId } = req.params;
  const { userId, reply } = req.body;

  if (!userId || !reply) {
    return res.status(400).json({ message: 'Les champs userId et reply sont obligatoires.' });
  }

  const query = 'INSERT INTO replies (userId, commentId, reply) VALUES (?, ?, ?)';
  db.run(query, [userId, commentId, reply], function (err) {
    if (err) {
      console.error('[ERREUR] Erreur lors de l\'ajout de la réponse :', err);
      return res.status(500).json({ message: 'Erreur lors de l\'ajout de la réponse.' });
    }
    res.status(200).json({ message: 'Réponse ajoutée avec succès.', id: this.lastID });
  });
});

// Liker une publication
router.post('/:publicationId/like', (req, res) => {
  const { publicationId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'L\'ID de l\'utilisateur est requis.' });
  }

  const query = 'INSERT INTO publication_likes (userId, publicationId) VALUES (?, ?)';
  db.run(query, [userId, publicationId], function (err) {
    if (err) {
      console.error('[ERREUR] Erreur lors de l\'ajout du like :', err);
      return res.status(500).json({ message: 'Erreur lors de l\'ajout du like.' });
    }
    res.status(200).json({ message: 'Like ajouté avec succès.', id: this.lastID });
  });
});

// Route GET pour récupérer les commentaires d'une publication spécifique
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await getCommentsForPublication(req.params.id);
    res.json(comments);
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la récupération des commentaires:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des commentaires' });
  }
});

// Suppression d'une publication
router.delete('/:publicationId', (req, res) => {
  const { publicationId } = req.params;

  console.log('[BACKEND] Requête de suppression reçue pour publicationId :', publicationId);

  const { userId } = req.body; // Récupère l'ID de l'utilisateur qui tente la suppression

if (!userId) {
  return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
}

const deleteQuery = 'DELETE FROM publications WHERE id = ? AND userId = ?';
db.run(deleteQuery, [publicationId, userId], function (err) {
  if (err) {
    console.error('[ERREUR] Erreur lors de la suppression de la publication :', err);
    return res.status(500).json({ message: 'Erreur lors de la suppression de la publication.' });
  }

  if (this.changes === 0) {
    console.warn('[INFO] Suppression refusée, l\'utilisateur n\'est pas l\'auteur.');
    return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à supprimer cette publication.' });
  }

  console.log('[SUCCÈS] Publication supprimée avec succès, id :', publicationId);
  res.status(200).json({ message: 'Publication supprimée avec succès.' });
});



  db.run(deleteQuery, [publicationId], function (err) {
    if (err) {
      console.error('[ERREUR] Erreur lors de la suppression de la publication :', err);
      return res.status(500).json({ message: 'Erreur lors de la suppression de la publication.' });
    }

    if (this.changes === 0) {
      console.warn('[INFO] Publication non trouvée pour suppression, id :', publicationId);
      return res.status(404).json({ message: 'Publication non trouvée.' });
    }

    console.log('[SUCCÈS] Publication supprimée avec succès, id :', publicationId);
    res.status(200).json({ message: 'Publication supprimée avec succès.' });
  });
});


module.exports = router;
