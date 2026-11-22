// Découverte : tendances (#), recherche de personnes (@)
const express = require('express');
const db = require('../db');
const { trends } = require('../utils/discover');

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

module.exports = router;
