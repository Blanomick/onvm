const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const db = require('../db');

// Configuration de multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + '-' + file.originalname;
    cb(null, filename);
  }
});
const upload = multer({ storage });

// ➕ POST /api/stories
router.post('/', upload.single('media'), async (req, res) => {
  const { userId, type } = req.body;
  const file = req.file;

  if (!userId || !file || !type) {
    return res.status(400).json({ message: 'Données manquantes.' });
  }

  try {
    await db('stories').insert({
      userId,
      media: `/uploads/${file.filename}`,
      type,
      created_at: new Date()
    });

    res.status(201).json({ message: 'Story publiée.' });
  } catch (err) {
    console.error('[ERREUR] POST /api/stories :', err.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// 🔍 GET /api/stories/following
router.get('/following', async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ message: 'ID utilisateur requis.' });
  }

  try {
    const followedUsers = await db('follows').where('followerId', userId).pluck('followingId');

    const stories = await db('stories')
      .whereIn('userId', followedUsers)
      .join('users', 'users.id', 'stories.userId')
      .select('stories.*', 'users.username', 'users.profilePicture')
      .orderBy('stories.created_at', 'desc');

    res.json(stories);
  } catch (err) {
    console.error('[ERREUR] /api/stories/following :', err.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});



// ✅ Obligatoire pour que le fichier fonctionne
module.exports = router;
