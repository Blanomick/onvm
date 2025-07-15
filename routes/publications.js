const express = require('express');
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();


const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


// Vérification et création du répertoire 'uploads' si nécessaire
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`[LOG] Dossier "uploads" créé à ${uploadDir}`);
}

// Configuration de multer pour l'upload des fichiers (photos/vidéos/vocales)
const storage = multer.memoryStorage();



const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',      // Ajouter .gif
    'image/svg+xml',  // Ajouter .svg
    'image/bmp',      // Ajouter .bmp
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg'
  ];
  

  if (!allowedTypes.includes(file.mimetype)) {
    console.error('[ERREUR] Type de fichier refusé :', file.mimetype);
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

// Création de publication
router.post('/', upload.single('media'), async (req, res) => {
  
const userId = parseInt(req.body.userId, 10);
const content = req.body.content;

const file = req.file;
let mediaType = null;

if (!userId || (!content && !file)) {
  return res.status(400).json({ message: 'Veuillez ajouter un texte ou un fichier média.' });
}


let mediaUrl = null;

try {
  if (file) {const mime = file.mimetype;

if (mime.startsWith('image/')) mediaType = 'image';
else if (mime.startsWith('video/')) mediaType = 'video';
else if (mime.startsWith('audio/')) mediaType = 'audio';
else {
  console.error('[ERREUR] Type MIME non reconnu:', mime);
  return res.status(400).json({ message: 'Type de fichier non pris en charge.' });
}

    await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto', folder: 'onvm_publications' },
        (error, result) => {
          if (error) {
            console.error('[ERREUR] Erreur upload Cloudinary :', error);
            return reject(error);
          }
          mediaUrl = result.secure_url;
          resolve();
        }
      );
      uploadStream.end(file.buffer);
    });
  }






    const [newPublication] = await db('publications')
      .insert({ userId: userId, content, media: mediaUrl, mediatype: mediaType })

      .returning(['id']);

    res.status(201).json({ message: 'Publication ajoutée avec succès!', id: newPublication.id });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la création de la publication:', err);
    res.status(500).json({ message: 'Erreur lors de la création de la publication.', error: err.message });
  }
});






// Récupération de toutes les publications avec utilisateur, photo de profil et leurs commentaires et réponses

router.get('/', async (req, res) => {
  const userId = req.query.userId; // ← pour savoir si l'utilisateur a liké

  try {
    const publications = await db('publications')
      .select(
        'publications.id',
        'publications.userId',
        'publications.content',
        'publications.media',
        'publications.mediatype',
        'publications.created_at',
        'users.username',
        'users.profilePicture'
      )
      .leftJoin('users', 'publications.userId', 'users.id')
      .orderBy('publications.created_at', 'desc');

    for (const publication of publications) {
      // 1. Ajouter les commentaires
      publication.comments = await getCommentsForPublication(publication.id);

      // 2. Ajouter les réponses
      for (let comment of publication.comments) {
        comment.replies = await getRepliesForComment(comment.id);
      }

      // 3. Ajouter le nombre de likes
      const totalLikes = await db('likes')
        .where({ publicationId: publication.id })
        .count()
        .first();
      publication.likeCount = parseInt(totalLikes.count);

      // 4. Vérifier si l'utilisateur a liké
      if (userId) {
        const userLike = await db('likes')
          .where({ publicationId: publication.id, userId })
          .first();
        publication.userHasLiked = !!userLike;
      } else {
        publication.userHasLiked = false;
      }
    }

    res.status(200).json(publications);
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la récupération des publications', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des publications.' });
  }
});




// Fonction pour récupérer les commentaires d'une publication


async function getCommentsForPublication(publicationId) {
  try {
    const comments = await db('commentaires')
      .select('commentaires.*', 'users.username', 'users.profilePicture')
      .join('users', 'commentaires.userId', 'users.id')
      .where('commentaires.publicationId', publicationId)
      .orderBy('commentaires.created_at', 'asc');

    for (let comment of comments) {
      comment.replies = await getRepliesForComment(comment.id);
    }

    return comments;
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la récupération des commentaires:', err);
    throw err;
  }
}



// Fonction pour récupérer les réponses d'un commentaire

async function getRepliesForComment(commentId) {
  try {
    return await db('replies')
      .select('replies.*', 'users.username', 'users.profilePicture')
      .join('users', 'replies.userId', 'users.id')
      .where('replies.commentId', commentId)
      .orderBy('replies.created_at', 'asc');
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la récupération des réponses :', err);
    throw err;
  }
}


router.post('/:publicationId/retweet', async (req, res) => {
  const { publicationId } = req.params;
  const { userId } = req.body;

  console.log('[BACKEND] Données reçues pour retweet :', { publicationId, userId });

  if (!userId || !publicationId) {
    return res.status(400).json({ message: "Les champs userId et publicationId sont requis." });
  }

  try {
    const publication = await db('publications').where({ id: publicationId }).first();
    if (!publication) {
      return res.status(404).json({ message: 'Publication introuvable.' });
    }

    const existingRetweet = await db('retweets')
      .where({ userId: userId, publicationId })
      .first();

    if (existingRetweet) {
      return res.status(400).json({ message: 'Vous avez déjà retweeté cette publication.' });
    }

    const [newRetweet] = await db('retweets')
      .insert({ userId: userId, publicationId })
      .returning(['id']);

    // 🔎 Récupère l’auteur de la publication
    const publicationOwnerId = publication.userId;
    const sender = await db('users').where({ id: userId }).first();

    // 🔔 Crée une notification si ce n’est pas toi-même
    if (publicationOwnerId !== userId) {
      await db('notifications').insert({
        user_id: publicationOwnerId,
        sender_id: userId,
        type: 'retweet',
        content: `${sender.username} a retweeté votre publication`,
        created_at: new Date(),
      });
    }

    res.status(200).json({ message: 'Retweet et notification enregistrés.', id: newRetweet.id });
  } catch (err) {
    console.error('[ERREUR] Erreur lors du retweet :', err);
    res.status(500).json({ message: 'Erreur lors du retweet.', error: err.message });
  }
});



  

// Ajout de commentaire pour une publication avec support de différents types de médias (audio, image, vidéo)

// Ajouter une réponse à un commentaire
// Ajouter une réponse à un commentaire
router.post('/comments/:commentId/reply', async (req, res) => {
  const { commentId } = req.params;
  const { userId, reply } = req.body;

  if (!userId || !reply) {
    return res.status(400).json({ message: 'Les champs userId et reply sont obligatoires.' });
  }

  try {
    // Insérer la réponse dans la base de données
    const [newReply] = await db('replies')
      .insert({ userId, commentId, reply })
      .returning(['id']);

    res.status(200).json({ message: 'Réponse ajoutée avec succès.', id: newReply.id });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de l\'ajout de la réponse :', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout de la réponse.', error: err.message });
  }
});

  

// Liker une publication

router.post('/:publicationId/like', async (req, res) => {
  const { publicationId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
  }

  try {
    // Vérifier si l'utilisateur a déjà liké la publication
  
    const existingLike = await db('likes')
    .where({ userId: userId, publicationId })
    .first();

  if (existingLike) {
    return res.status(400).json({ message: 'Vous avez déjà liké cette publication.' });
  }
  
  
const [newLike] = await db('likes')
.insert({ userId: userId, publicationId })
.returning('id');

    res.status(200).json({ message: 'Like ajouté avec succès.', id: newLike.id });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de l\'ajout du like :', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du like.', error: err.message });
  }
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


router.delete('/:publicationId', async (req, res) => {
  const { publicationId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
  }

  try {
   

    const deletedPublication = await db('publications')
  .where({ id: publicationId, userId: userId })
  .del();

  
  if (deletedPublication === 0) {
    return res.status(403).json({ message: "Vous n'êtes pas autorisé à supprimer cette publication." });
  }
  
    res.status(200).json({ message: 'Publication supprimée avec succès.' });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la suppression de la publication :', err);
    res.status(500).json({ message: 'Erreur lors de la suppression de la publication.', error: err.message });
  }
});


// Ajouter un commentaire à une publication


router.post('/:publicationId/comment', upload.single('media'), async (req, res) => {
  const { publicationId } = req.params;
  const { userId, comment } = req.body;
  let media = null;

  // Upload sur Cloudinary
  if (req.file) {
    try {
      await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto', folder: 'onvm_comments' },
          (error, result) => {
            if (error) {
              console.error('[ERREUR] Erreur upload commentaire Cloudinary :', error);
              return reject(error);
            }
            media = result.secure_url;
            resolve();
          }
        );
        uploadStream.end(req.file.buffer);
      });
    } catch (error) {
      return res.status(500).json({ message: "Erreur lors de l'upload sur Cloudinary.", error: error.message });
    }
  }

  if (!userId || !comment) {
    return res.status(400).json({ message: 'Les champs userId et comment sont obligatoires.' });
  }

  try {
    // Ajout du commentaire
    const [newComment] = await db('commentaires')
      .insert({ publicationId, userId, comment, media })
      .returning('id');

    // 🔎 Récupère l’auteur de la publication
    const publication = await db('publications').where({ id: publicationId }).first();
    const publicationOwnerId = publication.userId;

    // 🔎 Récupère le nom de celui qui commente
    const sender = await db('users').where({ id: userId }).first();

    // 🔔 Crée une notification
    if (publicationOwnerId !== userId) {
      await db('notifications').insert({
        user_id: publicationOwnerId,
        sender_id: userId,
        type: 'commentaire',
        content: `${sender.username} a commenté votre publication`,
        created_at: new Date(),
      });
    }

    res.status(201).json({ message: 'Commentaire ajouté + notification envoyée!', id: newComment.id });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de l\'ajout du commentaire:', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du commentaire.', error: err.message });
  }
});




module.exports = router;