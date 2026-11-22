// Découverte : tendances (#), recherche de personnes (@)
const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken');
const { trends } = require('../utils/discover');

// Communes et villes proposées pour « Près de moi »
const COMMUNES = [
  // Abidjan
  'Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody', 'Koumassi',
  'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville', 'Yopougon',
  // Villes de Côte d'Ivoire
  'Abengourou', 'Aboisso', 'Agboville', 'Bondoukou', 'Bouaflé', 'Bouaké', 'Dabou',
  'Daloa', 'Divo', 'Duékoué', 'Ferkessédougou', 'Gagnoa', 'Grand-Bassam', 'Guiglo',
  'Issia', 'Jacqueville', 'Katiola', 'Korhogo', 'Lakota', 'Man', 'Odienné', 'Oumé',
  'San-Pédro', 'Sassandra', 'Séguéla', 'Sinfra', 'Soubré', 'Tiassalé', 'Toumodi',
  'Yamoussoukro',
  // Ailleurs
  'Diaspora',
];

function userIdFromToken(req) {
  const token = String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id ? Number(decoded.id) : null;
  } catch {
    return null;
  }
}

let communeReady = null;
function ensureCommuneColumn() {
  if (!communeReady) {
    communeReady = (async () => {
      if (!(await db.schema.hasColumn('users', 'commune'))) {
        await db.schema.alterTable('users', (table) => {
          table.string('commune', 60).nullable().index();
        });
      }
    })().catch((error) => {
      communeReady = null;
      throw error;
    });
  }
  return communeReady;
}
ensureCommuneColumn().catch((error) => console.warn('[DISCOVER] Colonne commune :', error.message));

const router = express.Router();

// Hashtags tendance
router.get('/trends', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    res.json(await trends(limit));
  } catch (error) {
    console.error('[DISCOVER] Tendances :', error.message);
    res.status(500).json({ error: 'Tendances indisponibles' });
  }
});

// Suggestions pour @mention : ?q=ki
router.get('/people', async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '').toLowerCase();
  try {
    const query = db('users')
      .select('id', 'username', 'profilePicture')
      .whereNotNull('username')
      .orderBy('username', 'asc')
      .limit(8);
    if (q) {
      const like = `${q.replace(/[%_]/g, '')}%`;
      query.whereRaw("(LOWER(username) LIKE ? OR LOWER(REPLACE(username, ' ', '')) LIKE ?)", [like, like]);
    }
    res.json(await query);
  } catch (error) {
    console.error('[DISCOVER] Personnes :', error.message);
    res.status(500).json({ error: 'Recherche indisponible' });
  }
});

// Ouvre un profil à partir d'un @pseudo
router.get('/user/:username', async (req, res) => {
  const name = String(req.params.username || '').replace(/^@/, '').toLowerCase();
  try {
    const user = await db('users')
      .select('id', 'username', 'profilePicture')
      .whereRaw("LOWER(username) = ? OR LOWER(REPLACE(username, ' ', '')) = ?", [name, name])
      .orderByRaw('CASE WHEN LOWER(username) = ? THEN 0 ELSE 1 END', [name])
      .first();
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des communes
router.get('/communes', (req, res) => res.json(COMMUNES));

// Choisir sa commune (utilisateur connecté)
router.put('/commune', async (req, res) => {
  const userId = userIdFromToken(req);
  if (!userId) return res.status(401).json({ error: 'Connecte-toi pour choisir ta commune.' });
  const commune = COMMUNES.find((item) => item === String(req.body?.commune || ''));
  if (!commune && req.body?.commune) return res.status(400).json({ error: 'Commune inconnue' });
  try {
    await ensureCommuneColumn();
    await db('users').where({ id: userId }).update({ commune: commune || null });
    res.json({ ok: true, commune: commune || null });
  } catch (error) {
    console.error('[DISCOVER] Commune :', error.message);
    res.status(500).json({ error: 'Enregistrement impossible' });
  }
});

// Membres d'une commune (les plus actifs d'abord)
router.get('/nearby/people', async (req, res) => {
  const commune = String(req.query.commune || '');
  if (!COMMUNES.includes(commune)) return res.json([]);
  try {
    await ensureCommuneColumn();
    const people = await db('users')
      .select('users.id', 'users.username', 'users.profilePicture', 'users.bio')
      .count('publications.id as posts')
      .leftJoin('publications', 'publications.userId', 'users.id')
      .where('users.commune', commune)
      .groupBy('users.id')
      .orderBy('posts', 'desc')
      .limit(60);
    res.json(people.map((person) => ({ ...person, posts: Number(person.posts) })));
  } catch (error) {
    console.error('[DISCOVER] Membres proches :', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Combien de membres par commune (pour le choix)
router.get('/nearby/stats', async (req, res) => {
  try {
    await ensureCommuneColumn();
    const rows = await db('users')
      .select('commune')
      .count('* as n')
      .whereNotNull('commune')
      .groupBy('commune');
    res.json(Object.fromEntries(rows.map((row) => [row.commune, Number(row.n)])));
  } catch (error) {
    res.json({});
  }
});

module.exports = router;
module.exports.COMMUNES = COMMUNES;
