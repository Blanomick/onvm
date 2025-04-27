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
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
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
  const { userId, content } = req.body;
  const file = req.file;

  if (!userId || (!content && !file)) {
    return res.status(400).json({ message: 'Les champs utilisateur et contenu sont obligatoires.' });
  }

  let mediaUrl = null;
  let mediaType = null;

  try {
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png'].includes(ext)) mediaType = 'image';
      else if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) mediaType = 'video';
      else if (['.mp3', '.wav', '.ogg'].includes(ext)) mediaType = 'audio';
      else return res.status(400).json({ message: 'Type de fichier non pris en charge.' });

      // 🌟 Toujours envoyer sur Cloudinary (même en local et production)
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: 'auto',
        folder: 'onvm_publications',
      });

      mediaUrl = result.secure_url;

      // Supprimer le fichier temporaire local
      fs.unlinkSync(file.path);
    }

    const [newPublication] = await db('publications')
      .insert({ userid: userId, content, media: mediaUrl, mediatype: mediaType })
      .returning(['id']);

    res.status(201).json({ message: 'Publication ajoutée avec succès!', id: newPublication.id });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de la création de la publication:', err);
    res.status(500).json({ message: 'Erreur lors de la création de la publication.', error: err.message });
  }
});






// Récupération de toutes les publications avec utilisateur, photo de profil et leurs commentaires et réponses

router.get('/', async (req, res) => {
  try {
    const publications = await db('publications')
   
   
   
   
    .select(
      'publications.id',
      'publications.userid',
      'publications.content',
      'publications.media',
      'publications.mediatype',
      'publications.created_at',
      'users.username',
      'users.profilePicture'
    )
    .leftJoin('users', 'publications.userid', 'users.id')
    
   
    .orderBy('publications.created_at', 'desc');

      await Promise.all(publications.map(async (publication) => {
        publication.comments = await getCommentsForPublication(publication.id);
        await Promise.all(publication.comments.map(async (comment) => {
          comment.replies = await getRepliesForComment(comment.id);
        }));
      }));
      

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



// Route pour gérer le retweet d'une publication
router.post('/:publicationId/retweet', async (req, res) => {
  const { publicationId } = req.params;
  const { userId } = req.body;

  console.log('[BACKEND] Données reçues pour retweet :', { publicationId, userId });

  // Validation des données entrantes
  if (!userId || !publicationId) {
    console.error('[ERREUR] Données manquantes :', { publicationId, userId });
    return res.status(400).json({ message: "Les champs userId et publicationId sont requis." });
  }

  try {
    // Vérification si la publication existe
    const publication = await db('publications').where({ id: publicationId }).first();
if (!publication) {
  console.error('[ERREUR] La publication avec id', publicationId, 'n\'existe pas.');
  return res.status(404).json({ message: 'Publication introuvable.' });
}


  

    // Vérification si l'utilisateur a déjà retweeté cette publication
    const existingRetweet = await db('retweets')
  .where({ userid: userId, publicationId })
  .first();

  if (existingRetweet) {
    return res.status(400).json({ message: 'Vous avez déjà retweeté cette publication.' });
  }
  
  const newRetweet = await db('retweets')
  .insert({ userid: userId, publicationId })
  .returning(['id']);


if (!newRetweet || newRetweet.length === 0) {
  console.error('[ERREUR] Impossible d\'ajouter le retweet.');
  return res.status(500).json({ message: 'Erreur lors de l\'ajout du retweet.' });
}

console.log('[SUCCÈS] Retweet ajouté avec succès pour userId :', userId, 'et publicationId :', publicationId);
res.status(200).json({ message: 'Retweet ajouté avec succès.', id: newRetweet[0].id });


  } catch (err) {
    console.error('[ERREUR] Erreur lors de l\'ajout du retweet :', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du retweet.' });
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
    .where({ userid: userId, publicationId })
    .first();

  if (existingLike) {
    return res.status(400).json({ message: 'Vous avez déjà liké cette publication.' });
  }
  
  
const [newLike] = await db('likes')
.insert({ userid: userId, publicationId })
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
  .where({ id: publicationId, userid: userId })
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

  if (req.file) {
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto',
      folder: 'onvm_comments',
    });
    media = result.secure_url;
    fs.unlinkSync(req.file.path);
  }
  

  if (!userId || !comment) {
    return res.status(400).json({ message: 'Les champs userId et comment sont obligatoires.' });
  }

  try {
    const [newComment] = await db('commentaires')
      .insert({ publicationId, userId, comment, media })
      .returning('id');

    res.status(201).json({ message: 'Commentaire ajouté avec succès!', id: newComment.id });
  } catch (err) {
    console.error('[ERREUR] Erreur lors de l\'ajout du commentaire:', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du commentaire.', error: err.message });
  }
});



module.exports = router;