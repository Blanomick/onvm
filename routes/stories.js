const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');





const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });


// ✅ GET toutes les stories avec URL formatée
router.get('/', async (req, res) => {
  try {
    const stories = await db('stories')
      .select('stories.*', 'users.username', 'users.profilePicture')
      .leftJoin('users', 'stories.userId', 'users.id')
      .orderBy('stories.created_at', 'desc');

      
const formattedStories = stories.map(story => ({
  ...story,
  media: story.media?.startsWith('http') ? story.media : `${process.env.BASE_URL}/uploads/${story.media}`,
profilePicture: story.profilePicture?.startsWith('http') ? story.profilePicture : `${process.env.BASE_URL}/uploads/${story.profilePicture}`

}));


    res.json(formattedStories);
  } catch (err) {
    console.error('Erreur lors de la récupération des stories :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});





// ✅ POST une nouvelle story
router.post('/', upload.single('media'), async (req, res) => {
  const { userId, type } = req.body;
  let mediaUrl = null;

  if (!userId || !req.file || !type) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    // Upload du média sur Cloudinary
    await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
  { resource_type: 'auto', folder: 'onvm_stories', quality: 'auto:best' },
  (error, result) => {
    if (error) {
      console.error('[CLOUDINARY] Erreur upload :', error);
      return reject(error);
    }
    mediaUrl = result.secure_url;
    resolve();
  }
);

      stream.end(req.file.buffer);
    });

    const [newStory] = await db('stories')
      .insert({
        userId,
        media: mediaUrl,
        type,
        created_at: new Date(),
      })
      .returning('*');

    res.status(201).json(newStory);
  } catch (err) {
    console.error('Erreur lors de la création de la story :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:storyId/comments', async (req, res) => {
  const { storyId } = req.params;
  const { userId, comment } = req.body;

  if (!userId || !comment) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    // 🔹 Récupère les infos de la story commentée
    const story = await db('stories').where({ id: storyId }).first();

    if (!story) {
      return res.status(404).json({ error: 'Story introuvable' });
    }

    // 🔹 Enregistre le commentaire
    const [newComment] = await db('story_comments')
      .insert({
        story_id: storyId,
        user_id: userId,
        comment,
        created_at: new Date()
      })
      .returning('*');

    // 🔹 Formatte le média de la story pour l’affichage
    const storyMediaUrl = story.media?.startsWith('http')
      ? story.media
      : `${process.env.BASE_URL}/uploads/${story.media}`;

    res.status(201).json({
      ...newComment,
      storyMedia: storyMediaUrl,
      storyType: story.type,
      storyCreatedAt: story.created_at
    });

  } catch (err) {
    console.error('Erreur ajout commentaire :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// ✅ Récupérer les commentaires d'une story
router.get('/:storyId/comments', async (req, res) => {
  const { storyId } = req.params;

  try {
    const comments = await db('story_comments')
      .select('story_comments.*', 'users.username', 'users.profilePicture')
      .leftJoin('users', 'story_comments.user_id', 'users.id')
      .where({ story_id: storyId })
      .orderBy('story_comments.created_at', 'asc');

    res.json(comments);
  } catch (err) {
    console.error('Erreur récupération commentaires :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});




// Pour les vues d’une story
router.get('/:storyId/views', async (req, res) => {
  const views = await db('story_views')
    .leftJoin('users', 'story_views.user_id', 'users.id')
    .where({ story_id: req.params.storyId })
    .select('users.id', 'users.username', 'users.profilePicture');
  res.json(views);
});

// Pour les likes d’une story
router.get('/:storyId/likes', async (req, res) => {
  const likes = await db('story_likes')
    .leftJoin('users', 'story_likes.user_id', 'users.id')
    .where({ story_id: req.params.storyId })
    .select('users.id', 'users.username', 'users.profilePicture');
  res.json(likes);
});


module.exports = router;
