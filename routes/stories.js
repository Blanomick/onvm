const express = require('express');
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Vérification et création du dossier de stockage des stories si nécessaire
const storiesDir = path.join(__dirname, '../uploads/stories');
if (!fs.existsSync(storiesDir)) {
  fs.mkdirSync(storiesDir, { recursive: true });
  console.log(`[LOG] Dossier "uploads/stories" créé.`);
}

// Configuration de multer pour l'upload des fichiers (images, vidéos)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, storiesDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`);
  },
});
const upload = multer({ storage });




// 🔹 Route pour récupérer toutes les stories
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT stories.*, users.username, users.profilePicture 
      FROM stories
      JOIN users ON stories.userId = users.id
      ORDER BY stories.created_at DESC
    `;

    const stories = await db
      .raw(query)
      .then((result) => {
        console.log(`[LOG] ${result.rows.length} stories récupérées.`);
        return result.rows;
      })
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des stories :', err);
        throw err;
      });

    res.status(200).json(stories);
  } catch (error) {
    console.error('[ERREUR] Erreur serveur lors de la récupération des stories :', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des stories.' });
  }
});

// 🔹 Route pour récupérer les stories d'un utilisateur spécifique
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ message: 'ID utilisateur invalide.' });
    }

    const query = `
      SELECT stories.*, users.username, users.profilePicture 
      FROM stories
      JOIN users ON stories.userId = users.id
      WHERE stories.userId = ? 
      AND stories.created_at >= NOW() - INTERVAL '1 day'
      ORDER BY stories.created_at DESC
    `;

    const userStories = await db
      .raw(query, [userId])
      .then((result) => {
        console.log(`[LOG] ${result.rows.length} stories trouvées pour l'utilisateur ${userId}.`);
        return result.rows;
      })
      .catch((err) => {
        console.error(`[ERREUR] Impossible de récupérer les stories de l'utilisateur ${userId} :`, err);
        throw err;
      });

    res.status(200).json(userStories);
  } catch (error) {
    console.error(`[ERREUR] Erreur serveur lors de la récupération des stories de l'utilisateur ${req.params.userId} :`, error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});


  


// **🔹 Route pour ajouter une story (texte, image, vidéo ou mention)**
router.post('/', upload.single('media'), (req, res) => {
  const { userId, content } = req.body;
  const media = req.file ? `/uploads/stories/${req.file.filename}` : null;

  if (!userId || (!content && !media)) {
    return res.status(400).json({ message: 'Une story doit contenir un utilisateur et du texte ou un média.' });
  }

  // Détection des mentions "@" dans le contenu de la story
  const mentions = content ? (content.match(/@\w+/g) || []).join(', ') : '';

  const query = `
    INSERT INTO stories (userId, content, media, mentions, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;

  db.run(query, [userId, content, media, mentions], function (err) {
    if (err) {
      console.error('[ERREUR] Erreur lors de l\'ajout de la story:', err);
      return res.status(500).json({ message: 'Erreur serveur lors de l\'ajout de la story.' });
    }

    console.log(`[LOG] Nouvelle story ajoutée avec succès, ID: ${this.lastID}`);
    res.status(201).json({ message: 'Story ajoutée avec succès!', id: this.lastID });
  });
});

// **🔹 Route pour supprimer une story par ID**
router.delete('/:storyId', (req, res) => {
  const { storyId } = req.params;

  db.get('SELECT media FROM stories WHERE id = ?', [storyId], (err, row) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération de la story:', err);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }

    if (!row) {
      return res.status(404).json({ message: 'Story introuvable.' });
    }

    // Supprimer le fichier média associé
    if (row.media) {
      const filePath = path.join(__dirname, '..', row.media);
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.error('[ERREUR] Erreur lors de la suppression du fichier:', unlinkErr);
        } else {
          console.log(`[LOG] Fichier média supprimé: ${row.media}`);
        }
      });
    }

    db.run('DELETE FROM stories WHERE id = ?', [storyId], function (deleteErr) {
      if (deleteErr) {
        console.error('[ERREUR] Erreur lors de la suppression de la story:', deleteErr);
        return res.status(500).json({ message: 'Erreur serveur lors de la suppression.' });
      }

      console.log(`[LOG] Story supprimée avec succès, ID: ${storyId}`);
      res.status(200).json({ message: 'Story supprimée avec succès!' });
    });
  });
});

// **🔹 Suppression automatique des stories après 24h**
setInterval(() => {
  console.log('[LOG] Suppression automatique des stories expirées...');
  db.run('DELETE FROM stories WHERE created_at < datetime("now", "-1 day")', (err) => {
    if (err) {
      console.error('[ERREUR] Impossible de supprimer les stories expirées:', err);
    } else {
      console.log('[LOG] Suppression automatique des stories expirées réussie.');
    }
  });
}, 60 * 60 * 1000); // Exécute cette tâche toutes les heures

module.exports = router;
