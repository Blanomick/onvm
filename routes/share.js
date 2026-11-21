// Liens de partage uniques ONVM
//   Publication : https://onv.netlify.app/p/<code>
//   Profil      : https://onv.netlify.app/u/<code>
// Le code contient l'identifiant + une signature : impossible à deviner
// ou à fabriquer, et chaque publication / profil a toujours le même lien.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://onv.netlify.app').replace(/\/+$/, '');
const SECRET = process.env.SHARE_SECRET || process.env.JWT_SECRET || 'onvm-share';
const TYPES = { p: 'publication', u: 'user' };

function signature(type, id) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${type}:${id}`)
    .digest('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6);
}

function encode(type, id) {
  return `${Number(id).toString(36)}${signature(type, id)}`;
}

function decode(type, code) {
  const value = String(code || '').trim();
  if (!/^[a-z0-9]+[a-zA-Z0-9]{6}$/.test(value) || value.length < 7) return null;
  const id = parseInt(value.slice(0, -6), 36);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const expected = signature(type, id);
  const given = value.slice(-6);
  if (
    expected.length !== given.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))
  ) {
    return null;
  }
  return id;
}

function linkFor(type, id) {
  const code = encode(type, id);
  return { code, url: `${FRONTEND_URL}/${type}/${code}` };
}

function absolute(req, url) {
  if (!url || /default-profile\.(png|svg)/i.test(url)) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function normalizeMedia(req, publication) {
  let media = publication.media;
  try {
    if (media == null) media = [];
    else if (typeof media === 'string') {
      const text = media.trim();
      if (text.startsWith('[') || text.startsWith('{')) {
        const parsed = JSON.parse(text);
        media = Array.isArray(parsed) ? parsed : parsed?.url ? [parsed] : [];
      } else {
        media = text ? [{ url: text, kind: publication.mediatype || null }] : [];
      }
    } else if (!Array.isArray(media)) {
      media = media?.url ? [media] : [];
    }
  } catch {
    media = publication.media ? [{ url: String(publication.media), kind: publication.mediatype || null }] : [];
  }

  return media
    .filter((item) => item && item.url)
    .map((item) => {
      const url = absolute(req, item.url);
      const isVideo =
        /video/i.test(item.kind || item.type || '') ||
        /\/video\/upload\//.test(url) ||
        /\.(mp4|mov|webm|m4v|3gp)(\?|$)/i.test(url);
      return { ...item, url, kind: isVideo ? 'video' : item.kind || 'image' };
    });
}

// Image d'aperçu : la photo, ou une image tirée de la vidéo (Cloudinary)
function previewImage(media) {
  const image = media.find((item) => item.kind !== 'video');
  if (image) return image.url;
  const video = media.find((item) => item.kind === 'video');
  if (video?.poster) return video.poster;
  if (video && /\/video\/upload\//.test(video.url)) {
    return video.url
      .replace('/video/upload/', '/video/upload/so_0,w_1200,c_limit/')
      .replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg');
  }
  return null;
}

async function loadPublication(req, id) {
  const publication = await db('publications')
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
    .where('publications.id', id)
    .first();
  if (!publication) return null;

  const media = normalizeMedia(req, publication);
  const [likes, comments] = await Promise.all([
    db('likes').where({ publicationId: id }).count('* as n').first().catch(() => null),
    db('commentaires').where({ publicationId: id }).count('* as n').first().catch(() => null),
  ]);

  return {
    id: publication.id,
    userId: publication.userId,
    content: publication.content || '',
    media,
    created_at: publication.created_at,
    likes: Number(likes?.n || 0),
    commentCount: Number(comments?.n || 0),
    author: {
      id: publication.userId,
      username: publication.username || 'Utilisateur ONVM',
      profilePicture: absolute(req, publication.profilePicture),
      link: linkFor('u', publication.userId).url,
    },
    image: previewImage(media),
    link: linkFor('p', publication.id).url,
  };
}

async function loadUser(req, id) {
  const user = await db('users')
    .select('id', 'username', 'profilePicture', 'bio')
    .where({ id })
    .first();
  if (!user) return null;

  const [posts, followers] = await Promise.all([
    db('publications').where({ userId: id }).count('* as n').first().catch(() => null),
    db('follows').where({ followingId: id }).count('* as n').first().catch(() => null),
  ]);

  return {
    id: user.id,
    username: user.username || 'Utilisateur ONVM',
    profilePicture: absolute(req, user.profilePicture),
    bio: user.bio || '',
    posts: Number(posts?.n || 0),
    followers: Number(followers?.n || 0),
    link: linkFor('u', user.id).url,
  };
}

// Lien unique d'une publication ou d'un profil
router.get('/link/:type/:id', (req, res) => {
  const { type } = req.params;
  const id = Number(req.params.id);
  if (!TYPES[type] || !Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Lien invalide' });
  }
  res.json(linkFor(type, id));
});

// Plusieurs liens d'un coup : ?p=1,2,3&u=4
router.get('/links', (req, res) => {
  const result = { p: {}, u: {} };
  for (const type of ['p', 'u']) {
    String(req.query[type] || '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .slice(0, 200)
      .forEach((id) => {
        result[type][id] = linkFor(type, id).url;
      });
  }
  res.json(result);
});

// Contenu public d'un lien (visible même sans compte)
router.get('/p/:code', async (req, res) => {
  const id = decode('p', req.params.code);
  if (!id) return res.status(404).json({ error: 'Lien introuvable' });
  try {
    const publication = await loadPublication(req, id);
    if (!publication) return res.status(404).json({ error: 'Cette publication a été supprimée' });
    res.json(publication);
  } catch (error) {
    console.error('[SHARE] Publication :', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/u/:code', async (req, res) => {
  const id = decode('u', req.params.code);
  if (!id) return res.status(404).json({ error: 'Lien introuvable' });
  try {
    const user = await loadUser(req, id);
    if (!user) return res.status(404).json({ error: 'Ce compte n’existe plus' });
    res.json(user);
  } catch (error) {
    console.error('[SHARE] Profil :', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Page d'aperçu pour WhatsApp, Facebook, X, Telegram… (balises Open Graph)
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function ogPage({ title, description, image, url, type = 'website', video }) {
  const tags = [
    ['og:site_name', 'ONVM'],
    ['og:type', type],
    ['og:title', title],
    ['og:description', description],
    ['og:url', url],
    image && ['og:image', image],
    video && ['og:video', video],
    ['twitter:card', image ? 'summary_large_image' : 'summary'],
    ['twitter:title', title],
    ['twitter:description', description],
    image && ['twitter:image', image],
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${tags.map(([key, value]) => `<meta property="${key}" content="${escapeHtml(value)}">`).join('\n')}
<link rel="canonical" href="${escapeHtml(url)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
</head><body><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></body></html>`;
}

function shorten(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

router.get('/og/:type/:code', async (req, res) => {
  const { type, code } = req.params;
  const fallback = {
    title: 'ONVM',
    description: 'Rejoins-moi sur ONVM, le réseau social.',
    image: `${FRONTEND_URL}/icons/icon-512.png`,
    url: `${FRONTEND_URL}/${type}/${code}`,
  };
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=600');

  try {
    const id = TYPES[type] ? decode(type, code) : null;
    if (!id) return res.status(404).send(ogPage(fallback));

    if (type === 'p') {
      const pub = await loadPublication(req, id);
      if (!pub) return res.status(404).send(ogPage(fallback));
      const video = pub.media.find((item) => item.kind === 'video');
      return res.send(ogPage({
        title: `${pub.author.username} sur ONVM`,
        description: shorten(pub.content, 180) || (video ? 'Regarde cette vidéo sur ONVM' : 'Regarde cette publication sur ONVM'),
        image: pub.image || pub.author.profilePicture || fallback.image,
        url: pub.link,
        type: video ? 'video.other' : 'article',
        video: video?.url,
      }));
    }

    const user = await loadUser(req, id);
    if (!user) return res.status(404).send(ogPage(fallback));
    return res.send(ogPage({
      title: `${user.username} (@${user.username}) · ONVM`,
      description: shorten(user.bio, 180) || `Suis ${user.username} sur ONVM`,
      image: user.profilePicture || fallback.image,
      url: user.link,
      type: 'profile',
    }));
  } catch (error) {
    console.error('[SHARE] Aperçu :', error.message);
    return res.send(ogPage(fallback));
  }
});

module.exports = router;
module.exports.linkFor = linkFor;
module.exports.decode = decode;
