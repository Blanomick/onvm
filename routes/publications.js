const express = require('express');
const db = require('../db');
const { extractTags, normalizeTag, notifyMentions } = require('../utils/discover');
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
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/bmp',
    'image/heic',
    'image/heif',

    // Vidéos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/ogg',
    'video/3gpp',
    'video/x-matroska',
    'video/x-m4v',

    // Audios
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/opus',
    'audio/aac',
    'audio/x-m4a',
    'audio/m4a',
    'audio/webm',
    'audio/mp4',
  ];

  const mimeType = (file.mimetype || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!allowedTypes.includes(mimeType)) {
    console.error('[ERREUR] Type de fichier refusé :', mimeType);

    return cb(new Error('Type de fichier non autorisé'), false);
  }

  cb(null, true);
};



const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 300 * 1024 * 1024 }
});

const dns = require('dns').promises;

// Vérifie si le DNS Cloudinary est joignable
async function cloudinaryReachable() {
  try {
    await dns.lookup('api.cloudinary.com');
    return true;
  } catch {
    return false;
  }
}

// Upload Cloudinary (promesse)
function uploadToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto', folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(file.buffer);
  });
}

// Sauvegarde locale (fallback) et retourne une URL publique /uploads/...
async function saveLocal(file, subfolder = 'onvm_publications') {
  const folderPath = path.join(uploadDir, subfolder);
  await fs.promises.mkdir(folderPath, { recursive: true });

  const extFromMime = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/bmp': '.bmp',
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi', 'video/webm': '.webm', 'video/ogg': '.ogv',
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/ogg': '.ogg', 'audio/opus': '.opus', 'audio/aac': '.aac', 'audio/x-m4a': '.m4a', 'audio/m4a': '.m4a'
  };

  const ext = path.extname(file.originalname) || extFromMime[file.mimetype] || '';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
  const full = path.join(folderPath, name);
  await fs.promises.writeFile(full, file.buffer);
  return `/uploads/${subfolder}/${name}`;
}

// Essaie Cloudinary, sinon bascule en local
 async function storeWithFallback(file, folder) {
  const production =
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true";

  try {
    const reachable = await cloudinaryReachable();

    if (!reachable) {
      throw new Error("Cloudinary est temporairement inaccessible.");
    }

    return await uploadToCloudinary(file, folder);
  } catch (error) {
    console.error(
      "[MEDIA] Échec du stockage Cloudinary :",
      error.message
    );

    // En production, ne pas annoncer un succès avec un fichier
    // enregistré dans un stockage local potentiellement temporaire.
    if (production) {
      throw new Error(
        "Le stockage des médias est indisponible. Réessaie plus tard."
      );
    }

    // Conservation du mode local pour le développement.
    return saveLocal(file, folder);
  }
}



const jwt = require('jsonwebtoken');

// Identifie l'utilisateur à partir du jeton (si présent et valide)
function userIdFromToken(req) {
  const header = req.header('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id ? Number(decoded.id) : null;
  } catch {
    return null;
  }
}

// Transforme les erreurs multer en messages clairs (au lieu de "Erreur interne")
function withUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      console.error('[UPLOAD] Erreur multer :', err.code || '', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Fichier trop volumineux.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: 'Trop de fichiers (5 maximum).' });
      }
      return res.status(400).json({ message: err.message || 'Fichier refusé.' });
    });
  };
}

const cloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

const VIDEO_EAGER =
  'vc_h264,ac_aac,q_auto,c_limit,w_1080,h_1920/mp4|so_0,c_limit,w_720,h_1280,q_auto/jpg';

// Signature pour l'envoi direct navigateur -> Cloudinary
// (le fichier ne passe plus par la mémoire du serveur)
router.get('/upload-signature', (req, res) => {
  const tokenUserId = userIdFromToken(req);
  if (!tokenUserId) {
    return res.status(401).json({ message: 'Reconnecte-toi pour publier.' });
  }
  if (!cloudinaryConfigured()) {
    return res.status(503).json({ message: 'Cloudinary non configuré.' });
  }

  const folder = 'onvm_publications';
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder, timestamp };

  // Vidéos : conversion automatique en MP4 lisible partout (iPhone, Android,
  // navigateurs) + image d'aperçu, préparées en arrière-plan par Cloudinary.
  if (req.query.kind === 'video') {
    params.eager = VIDEO_EAGER;
    params.eager_async = 'true';
  }

  const signature = cloudinary.utils.api_sign_request(
    params,
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    ...params,
    signature,
  });
});

function isCloudinaryUrl(value) {
  try {
    const u = new URL(String(value));
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' &&
      (!cloud || u.pathname.startsWith(`/${cloud}/`));
  } catch {
    return false;
  }
}

// Médias déjà envoyés sur Cloudinary : on n'accepte que des URL Cloudinary
function cleanRemoteMedia(list) {
  if (!Array.isArray(list)) return [];
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  return list
    .filter((m) => m && typeof m.url === 'string')
    .filter((m) => {
      try {
        const u = new URL(m.url);
        return u.protocol === 'https:' &&
          u.hostname === 'res.cloudinary.com' &&
          (!cloud || u.pathname.startsWith(`/${cloud}/`));
      } catch {
        return false;
      }
    })
    .slice(0, 5)
    .map((m) => ({
      url: m.url,
      kind: ['image', 'video', 'audio'].includes(m.kind) ? m.kind : 'other',
      ...(m.thumbnail && isCloudinaryUrl(m.thumbnail) ? { thumbnail: String(m.thumbnail) } : {}),
      ...(m.mp4Url && isCloudinaryUrl(m.mp4Url) ? { mp4Url: String(m.mp4Url) } : {}),
      ...(m.width ? { width: Number(m.width) || null } : {}),
      ...(m.height ? { height: Number(m.height) || null } : {}),
      ...(m.duration ? { duration: Number(m.duration) || null } : {}),
    }));
}

function parseMedia(publication) {
  const raw = publication.media;
  try {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (s.startsWith('[') || s.startsWith('{')) {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : (parsed?.url ? [parsed] : []);
      }
      return [{ url: s, kind: publication.mediatype || null }];
    }
  } catch {
    return raw ? [{ url: String(raw), kind: publication.mediatype || null }] : [];
  }
  return [];
}

function isVideoMedia(m) {
  if (!m?.url) return false;
  if (m.kind === 'video') return true;
  return /\.(mp4|webm|mov|m4v|ogv|3gp)(\?|$)/i.test(m.url);
}

// Fil vidéo façon TikTok / Reels : publications contenant une vidéo
// GET /api/publications/videos?userId=..&before=<id>&limit=8
router.get('/videos', async (req, res) => {
  const userId = Number(req.query.userId) || null;
  const before = Number(req.query.before) || null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);

  try {
    const collected = [];
    let cursor = before;
    let scanned = 0;
    let exhausted = false;

    // On parcourt les publications par paquets jusqu'à avoir assez de vidéos
    while (collected.length < limit && scanned < 400) {
      const q = db('publications')
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
        .whereNotNull('publications.media')
        .orderBy('publications.id', 'desc')
        .limit(50);
      if (cursor) q.where('publications.id', '<', cursor);

      const rows = await q;
      if (!rows.length) { exhausted = true; break; }
      scanned += rows.length;
      cursor = rows[rows.length - 1].id;

      for (const row of rows) {
        const media = parseMedia(row);
        const video = media.find(isVideoMedia);
        if (!video) continue;
        collected.push({ ...row, media, video });
        if (collected.length >= limit) break;
      }
      if (rows.length < 50) { exhausted = collected.length < limit; if (exhausted) break; }
    }

    const ids = collected.map((p) => p.id);
    let likeCounts = {};
    let commentCounts = {};
    let liked = new Set();

    if (ids.length) {
      const likes = await db('likes')
        .select('publicationId')
        .count('* as n')
        .whereIn('publicationId', ids)
        .groupBy('publicationId');
      likes.forEach((r) => { likeCounts[r.publicationId] = Number(r.n); });

      const comments = await db('commentaires')
        .select('publicationId')
        .count('* as n')
        .whereIn('publicationId', ids)
        .groupBy('publicationId');
      comments.forEach((r) => { commentCounts[r.publicationId] = Number(r.n); });

      if (userId) {
        const mine = await db('likes')
          .select('publicationId')
          .where({ userId })
          .whereIn('publicationId', ids);
        liked = new Set(mine.map((r) => r.publicationId));
      }
    }

    const items = collected.map((p) => ({
      id: p.id,
      userId: p.userId,
      username: p.username,
      profilePicture: p.profilePicture,
      content: p.content,
      created_at: p.created_at,
      media: p.media,
      video: p.video,
      likeCount: likeCounts[p.id] || 0,
      commentCount: commentCounts[p.id] || 0,
      userHasLiked: liked.has(p.id),
    }));

    const last = collected[collected.length - 1];
    res.json({
      items,
      nextCursor: !exhausted && last ? last.id : null,
    });
  } catch (err) {
    console.error('[ERREUR] Fil vidéo :', err);
    res.status(500).json({ message: 'Impossible de charger les vidéos.' });
  }
});

// Retirer un like
router.delete('/:publicationId/like', async (req, res) => {
  const { publicationId } = req.params;
  const userId = req.body?.userId || req.query.userId;
  if (!userId) {
    return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
  }
  try {
    await db('likes').where({ userId, publicationId }).del();
    res.status(200).json({ message: 'Like retiré.' });
  } catch (err) {
    console.error('[ERREUR] Retrait du like :', err);
    res.status(500).json({ message: 'Erreur lors du retrait du like.' });
  }
});

// Création de publication (multi-fichiers)
// Création de publication (multi-fichiers, accepte media | media[] | file | files)
router.post(
  '/',
  withUpload(upload.fields([
    { name: 'media', maxCount: 5 },
    { name: 'media[]', maxCount: 5 },
    { name: 'file', maxCount: 5 },
    { name: 'files', maxCount: 5 },
  ])),
  async (req, res) => {
    const userId = userIdFromToken(req) || parseInt(req.body.userId, 10);
    const content = req.body.content || null;

    // Tolérant sur les noms de champs
    const mediaFiles =
      req.files?.media ||
      req.files?.['media[]'] ||
      req.files?.files ||
      req.files?.file ||
      [];

    console.log('[DEBUG] champs fichier reçus (create):', Object.keys(req.files || {}));

    // Médias déjà envoyés directement sur Cloudinary par le navigateur (JSON)
    let remoteMedia = req.body.remoteMedia;
    if (typeof remoteMedia === 'string') {
      try { remoteMedia = JSON.parse(remoteMedia); } catch { remoteMedia = []; }
    }
    remoteMedia = cleanRemoteMedia(remoteMedia);

    if (!userId || (!content && mediaFiles.length === 0 && remoteMedia.length === 0)) {
      return res.status(400).json({ message: 'Veuillez ajouter un texte ou un fichier média.' });
    }

    // Upload (Cloudinary si dispo, sinon local) pour chaque fichier
    const uploads = [...remoteMedia];
    try {
      for (const f of mediaFiles) {
        const url = await storeWithFallback(f, 'onvm_publications');

        let kind = null;
        if (!f.mimetype) kind = 'other';
        else if (f.mimetype.startsWith('image/')) kind = 'image';
        else if (f.mimetype.startsWith('video/')) kind = 'video';
        else if (f.mimetype.startsWith('audio/')) kind = 'audio';
        else kind = 'other';

        uploads.push({ url, kind });
      }



      // mediatype = type du 1er media (optionnel pour compat legacy)
      const mediaType = uploads[0]?.kind || null;

      const [newPublication] = await db('publications')
        .insert({
          userId,
          content,
          // on stocke le tableau [{url,kind}] en JSON dans la colonne "media" (type TEXT/JSON)
          media: uploads.length ? JSON.stringify(uploads) : null,
          mediatype: mediaType
        })
        .returning(['id']);

      notifyMentions({ text: content, actorId: userId, publicationId: newPublication.id });

      res.status(201).json({ message: 'Publication ajoutée avec succès!', id: newPublication.id });
    } catch (err) {
      console.error('[ERREUR] Erreur lors de la création de la publication:', err);
      res.status(500).json({
        message: cloudinaryConfigured()
          ? `Erreur lors de la création de la publication : ${err.message}`
          : 'Stockage des médias non configuré sur le serveur (CLOUDINARY_API_SECRET manquant sur Render).',
        error: err.message,
      });
    }
  }
);







// Récupération de toutes les publications avec utilisateur, photo de profil et leurs commentaires et réponses

// Normalise media -> toujours un tableau [{url, kind}]
function normalizeFeedMedia(publication) {
  try {
    if (publication.media == null) return [];
    if (typeof publication.media === 'string') {
      const s = publication.media.trim();
      if (s.startsWith('[') || s.startsWith('{')) {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : parsed?.url ? [parsed] : [];
      }
      return s ? [{ url: s, kind: publication.mediatype || null }] : [];
    }
    return Array.isArray(publication.media)
      ? publication.media
      : publication.media?.url
      ? [publication.media]
      : [];
  } catch {
    return publication.media
      ? [{ url: String(publication.media), kind: publication.mediatype || null }]
      : [];
  }
}

// Ajoute commentaires, réponses, likes… en 4 requêtes pour TOUT le fil
// (avant : plusieurs requêtes par publication, très lent).
async function hydratePublications(publications, userId) {
  const ids = publications.map((p) => p.id);
  if (!ids.length) return publications;

  const [comments, likeRows, myLikes] = await Promise.all([
    db('commentaires')
      .select('commentaires.*', 'users.username', 'users.profilePicture')
      .join('users', 'commentaires.userId', 'users.id')
      .whereIn('commentaires.publicationId', ids)
      .orderBy('commentaires.created_at', 'asc'),
    db('likes')
      .select('publicationId')
      .count('* as n')
      .whereIn('publicationId', ids)
      .groupBy('publicationId'),
    userId
      ? db('likes').where({ userId }).whereIn('publicationId', ids).pluck('publicationId')
      : Promise.resolve([]),
  ]);

  const commentIds = comments.map((c) => c.id);
  const replies = commentIds.length
    ? await db('replies')
        .select('replies.*', 'users.username', 'users.profilePicture')
        .join('users', 'replies.userId', 'users.id')
        .whereIn('replies.commentId', commentIds)
        .orderBy('replies.created_at', 'asc')
    : [];

  const repliesByComment = new Map();
  for (const reply of replies) {
    const list = repliesByComment.get(reply.commentId) || [];
    list.push(reply);
    repliesByComment.set(reply.commentId, list);
  }
  const commentsByPub = new Map();
  for (const comment of comments) {
    comment.replies = repliesByComment.get(comment.id) || [];
    const list = commentsByPub.get(comment.publicationId) || [];
    list.push(comment);
    commentsByPub.set(comment.publicationId, list);
  }
  const likes = new Map(likeRows.map((row) => [Number(row.publicationId), Number(row.n)]));
  const liked = new Set(myLikes.map(Number));

  for (const publication of publications) {
    publication.media = normalizeFeedMedia(publication);
    publication.comments = commentsByPub.get(publication.id) || [];
    publication.likeCount = likes.get(Number(publication.id)) || 0;
    publication.userHasLiked = liked.has(Number(publication.id));
  }
  return publications;
}

// Score « Pour toi » : popularité récente + personnes suivies + fraîcheur
function rankForYou(publications, { followed, userId }) {
  const now = Date.now();
  const scored = publications.map((p) => {
    const ageHours = Math.max(0, (now - new Date(p.created_at).getTime()) / 3600000);
    const engagement = 1 + p.likeCount * 2 + p.comments.length * 3;
    let score = engagement / Math.pow(ageHours + 2, 1.35);
    if (followed.has(Number(p.userId))) score *= 3;
    if (String(p.userId) === String(userId)) score *= 0.6;
    if (p.media.some((m) => /video/i.test(m.kind || '') || /\.(mp4|mov|webm)/i.test(m.url || ''))) {
      score *= 1.25;
    }
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Variété : pas plus de 2 publications d'affilée du même auteur
  const result = [];
  const waiting = [];
  for (const item of scored) {
    const last = result.slice(-2);
    if (last.length === 2 && last.every((x) => x.userId === item.p.userId)) waiting.push(item.p);
    else result.push(item.p);
    if (waiting.length && result[result.length - 1].userId !== waiting[0].userId) {
      result.push(waiting.shift());
    }
  }
  return result.concat(waiting);
}

// Fil d'actualité
//   ?feed=recent (défaut) | foryou | following
//   ?tag=football          → publications avec #football
//   ?authorId=12           → publications d'une personne
//   ?limit=100
router.get('/', async (req, res) => {
  const userId = Number(req.query.userId) || userIdFromToken(req) || null;
  const feed = ['foryou', 'following'].includes(req.query.feed) ? req.query.feed : 'recent';
  const tag = req.query.tag ? normalizeTag(req.query.tag) : null;
  const authorId = Number(req.query.authorId) || null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 150, 1), 300);

  try {
    let followed = new Set();
    if (userId && feed !== 'recent') {
      const ids = await db('follows').where({ followerId: userId }).pluck('followingId');
      followed = new Set(ids.map(Number));
    }

    const query = db('publications')
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

    if (feed === 'following') {
      query.whereIn('publications.userId', [...followed, userId].filter(Boolean));
    }
    if (authorId) query.where('publications.userId', authorId);
    // « Près de moi » : publications des membres d'une commune
    if (req.query.commune) query.where('users.commune', String(req.query.commune));
    if (tag) query.where('publications.content', 'like', '%#%');

    // On regarde plus large pour pouvoir trier / filtrer
    query.limit(tag ? 3000 : feed === 'foryou' ? Math.max(limit * 3, 300) : limit);

    let publications = await query;
    if (tag) {
      publications = publications
        .filter((p) => extractTags(p.content).includes(tag))
        .slice(0, limit);
    }

    await hydratePublications(publications, userId);

    if (feed === 'foryou') {
      publications = rankForYou(publications, { followed, userId }).slice(0, limit);
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


    // 🔎 Récupère l’auteur de la publication
const ownerId = publication.userId;
const actor = await db('users').where({ id: userId }).first();

// 🔔 Notif (schéma V2) si ce n’est pas toi-même
if (ownerId && String(ownerId) !== String(userId)) {
  await db('notifications')
    .insert({
      user_id: ownerId,                  // destinataire
      actor_id: userId,                  // auteur de l’action
      type: 'retweet_publication',       // type explicite
      entity_type: 'publication',
      entity_id: Number(publicationId),
      metadata: { actor_username: actor?.username ?? null },
    })
    .onConflict(['type','user_id','actor_id','entity_type','entity_id'])
    .ignore(); // pas de doublons
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

// 🔔 Notif pour le propriétaire de la publication
try {
  const pub = await db('publications').select('userId').where({ id: publicationId }).first();
  const ownerId = pub?.userId;
  if (ownerId && String(ownerId) !== String(userId)) {
    await db('notifications')
      .insert({
        user_id: ownerId,
        actor_id: userId,
        type: 'like_publication',
        entity_type: 'publication',
        entity_id: Number(publicationId),
        metadata: {},
      })
      .onConflict(['type','user_id','actor_id','entity_type','entity_id'])
      .ignore();
  }
} catch (e) {
  console.warn('[notifications] like_publication non critique:', e.message);
}

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


// Commentaire: accepte texte OU media(image/vidéo) OU audio
router.post(
  '/:publicationId/comment',
  withUpload(upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ])),
  async (req, res) => {
    const { publicationId } = req.params;
    const { userId } = req.body;
    const comment = req.body.comment || null;

    const mediaFile = req.files?.media?.[0] || null;
    const audioFile = req.files?.audio?.[0] || null;

    if (!userId || (!comment && !mediaFile && !audioFile)) {
      return res.status(400).json({ message: 'Ajoutez un texte, un média ou un audio.' });
    }

   let media = null; // on stocke l’URL (image, vidéo ou audio) dans la colonne "media"

try {
  const toUpload = mediaFile || audioFile; // on ne garde qu’un seul fichier (compat DB)
  if (toUpload) {
    media = await storeWithFallback(toUpload, 'onvm_comments');
  }

  const [newComment] = await db('commentaires')
    .insert({ publicationId, userId, comment, media })
    .returning('id');

    // 🔔 Notif commentaire (schéma V2)
const publication = await db('publications').where({ id: publicationId }).first();
const ownerId = publication?.userId;

if (ownerId && String(ownerId) !== String(userId)) {
  await db('notifications')
    .insert({
      user_id: ownerId,
      actor_id: userId,
     type: "comment_publication",
entity_type: "comment",
entity_id: newComment.id,
metadata: {
  publication_id: Number(publicationId),
  snippet: (comment || "").slice(0, 120),
},
    })
    .onConflict(['type','user_id','actor_id','entity_type','entity_id'])
    .ignore();
}


      notifyMentions({
        text: comment,
        actorId: Number(userId),
        publicationId: Number(publicationId),
        commentId: newComment.id,
      });

      res.status(201).json({ message: 'Commentaire ajouté + notification envoyée!', id: newComment.id });
    } catch (err) {
      console.error('[ERREUR] Erreur lors de l\'ajout du commentaire:', err);
      res.status(500).json({ message: 'Erreur lors de l\'ajout du commentaire.', error: err.message });
    }
  }
);




module.exports = router;