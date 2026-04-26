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
const uploadStory = multer({ storage }).fields([
  { name: 'media', maxCount: 1 },
  { name: 'background', maxCount: 1 },
]);



// ✅ GET toutes les stories avec URL formatée
router.get('/', async (req, res) => {
  try {
    const stories = await db('stories')
      .select('stories.*', 'users.username', 'users.profilePicture')
      .leftJoin('users', 'stories.userId', 'users.id')
      .orderBy('stories.created_at', 'desc');

 const formattedStories = stories.map(story => ({
   ...story,
  media: story.media
    ? (story.media.startsWith('http') ? story.media : `${process.env.BASE_URL}/uploads/${story.media}`)
    : null,
   profilePicture: story.profilePicture
     ? (story.profilePicture.startsWith('http') ? story.profilePicture : `${process.env.BASE_URL}/uploads/${story.profilePicture}`)
     : null,
}));



    res.json(formattedStories);
  } catch (err) {
    console.error('Erreur lors de la récupération des stories :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});





// ✅ POST une nouvelle story
router.post('/', uploadStory, async (req, res) => {
  console.log('[STORIES POST] content-type=', req.headers['content-type']);
  console.log('[STORIES POST] body keys=', Object.keys(req.body));
  console.log('[STORIES POST] has files=', !!req.files);

  const { userId, type, text, backgroundColor, tags } = req.body;
  let mediaUrl = null;

if (!userId || !type) {
  const manquants = [];
  if (!userId) manquants.push('userId');
  if (!type) manquants.push('type');
  return res.status(400).json({ error: `Champs manquants: ${manquants.join(', ')}` });
}

  try {
    // 🖼️ Si un média est présent (image / vidéo / fond)
  if (req.files && req.files.media && req.files.media[0]) {
  await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: 'onvm_stories',
        quality: 'auto:best',
      },
      (error, result) => {
        if (error) {
          console.error('[CLOUDINARY] Erreur upload :', error);
          return reject(error);
        }
        mediaUrl = result.secure_url;
        resolve();
      }
    );

    stream.end(req.files.media[0].buffer);
  });
}


 // 📥 Préparation des données à insérer (compatibles avec le schéma actuel)
const insertData = {
  userId,
  type,
  media: mediaUrl,
  text: text || null,
  created_at: new Date(),
};

// ⚠️ Si ta BDD a vraiment ces colonnes, décommente prudemment.
// if (typeof backgroundColor === 'string') insertData.backgroundColor = backgroundColor;
// if (tagsValue != null) insertData.tags = tagsValue;


    const [newStory] = await db('stories').insert(insertData).returning('*');

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
// 🔔 Notification (commentaire de story) pour le propriétaire
const ownerId = story.userId;
if (ownerId && ownerId !== Number(userId)) {
  await db('notifications')
    .insert({
      user_id: ownerId,
      actor_id: Number(userId),
      type: 'comment_story',
      entity_type: 'story',
      entity_id: Number(storyId),
      metadata: { snippet: (comment || '').slice(0, 120) },
    })
    .onConflict(['type','user_id','actor_id','entity_type','entity_id'])
    .ignore();
}

// 🔹 Formatte le média de la story pour l’affichage
const storyMediaUrl = story.media
  ? (story.media.startsWith('http')
      ? story.media
      : `${process.env.BASE_URL}/uploads/${story.media}`)
  : null;

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
  try {
    const likes = await db('story_likes')
      .leftJoin('users', 'story_likes.userId', 'users.id')
      .where({ storyId: req.params.storyId })
      .select('users.id', 'users.username', 'users.profilePicture')
      .orderBy('story_likes.created_at', 'desc');

    res.json(likes);
  } catch (e) {
    console.error('[ERREUR] get story likes:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});





// ✅ Like d'une story + notification au propriétaire
router.post('/:storyId/like', async (req, res) => {
  const { storyId } = req.params;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId requis' });

  try {
    // Vérifie que la story existe
    const story = await db('stories').where({ id: storyId }).first();
    if (!story) return res.status(404).json({ error: 'Story introuvable' });

    // Évite les doublons (unique(userId, storyId))
    const exists = await db('story_likes').where({ userId, storyId }).first();
    if (exists) {
      return res.status(400).json({ error: 'Déjà likée' });
    }

    await db('story_likes').insert({ userId, storyId });

    // 🔔 Notification pour le propriétaire
    const ownerId = story.userId;
    if (ownerId && ownerId !== Number(userId)) {
      await db('notifications')
        .insert({
          user_id: ownerId,                 // destinataire
          actor_id: Number(userId),         // auteur de l’action
          type: 'like_story',
          entity_type: 'story',
          entity_id: Number(storyId),
          metadata: {},
        })
        .onConflict(['type','user_id','actor_id','entity_type','entity_id'])
        .ignore(); // pas de doublon
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[ERREUR] like story:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});




module.exports = router;
