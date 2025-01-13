const express = require('express');
const db = require('../db');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configuration de multer pour l'upload des fichiers (images, vidéos)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/stories/'); // Dossier de stockage pour les stories
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});
const upload = multer({ storage });

// Route pour récupérer les stories d'un utilisateur
router.get('/stories/:username', (req, res) => {
  const { username } = req.params;

  db.all('SELECT * FROM stories WHERE username = ?', [username], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération des stories.' });
    }
    return res.status(200).json(rows);
  });
});

// Route pour ajouter une story (texte, image, vidéo ou mention)
router.post('/stories', upload.single('media'), (req, res) => {
  const { username, content } = req.body;
  const media = req.file ? `/uploads/stories/${req.file.filename}` : null;

  if (!content && !media) {
    return res.status(400).json({ message: 'Une story doit contenir du texte ou un média.' });
  }

  // Détecter les mentions "@" dans le contenu de la story
  const mentions = content ? content.match(/@\w+/g) : [];

  db.run(
    'INSERT INTO stories (username, content, media, mentions) VALUES (?, ?, ?, ?)',
    [username, content, media, mentions.join(', ')], // Stocker les mentions dans une colonne
    function (err) {
      if (err) {
        return res.status(500).json({ message: 'Erreur lors de la création de la story.' });
      }
      return res.status(201).json({ message: 'Story ajoutée avec succès!', id: this.lastID });
    }
  );
});

module.exports = router;
