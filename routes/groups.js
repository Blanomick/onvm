const express = require('express');
const router = express.Router();
const db = require('../db');

// 🔥 TEST ROUTE (IMPORTANT)
router.get('/test', (req, res) => {
  res.json({ message: 'groups route OK' });
});

// 🔥 CREER GROUPE
router.post('/', async (req, res) => {
  try {
    const { name, description, created_by } = req.body;

    if (!name || !created_by) {
      return res.status(400).json({ error: 'Nom et créateur requis' });
    }

    const [group] = await db('groups')
      .insert({
        name,
        description,
        created_by,
      })
      .returning('*');

    // 🔥 Ajouter créateur comme admin
    await db('group_members').insert({
      group_id: group.id,
      user_id: created_by,
      role: 'admin',
    });

    res.status(201).json(group);

  } catch (err) {
    console.error('[ERREUR] Création groupe :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 🔥 AJOUT MEMBRE
router.post('/:groupId/add-member', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id requis' });
    }

    await db('group_members').insert({
      group_id: groupId,
      user_id,
      role: 'member',
    });

    res.json({ success: true });

  } catch (err) {
    console.error('[ERREUR] Ajout membre :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 🔥 GET MEMBRES
router.get('/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;

    const members = await db('group_members')
      .join('users', 'group_members.user_id', 'users.id')
      .where('group_members.group_id', groupId)
      .select('users.id', 'users.username', 'users.profilePicture');

    res.json(members);

  } catch (err) {
    console.error('[ERREUR] Membres groupe :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;