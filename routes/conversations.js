const express = require('express');
const router = express.Router();
const db = require('../db');

// 🟢 Créer une nouvelle conversation privée entre deux utilisateurs
router.post('/create', async (req, res) => {
  let { sender_id, receiver_id } = req.body;

  // Vérification des champs
  if (!sender_id || !receiver_id) {
    return res.status(400).json({ error: "Champs manquants : sender_id ou receiver_id" });
  }

  // S'assurer que ce sont des entiers
  sender_id = parseInt(sender_id);
  receiver_id = parseInt(receiver_id);

  try {
    // Vérifie si une conversation existe déjà dans les deux sens
    const existing = await db('conversations')
      .where(function () {
        this.where('sender_id', sender_id).andWhere('receiver_id', receiver_id);
      })
      .orWhere(function () {
        this.where('sender_id', receiver_id).andWhere('receiver_id', sender_id);
      })
      .first();

    if (existing) {
      return res.json(existing);
    }

    // Crée une nouvelle conversation
    const [newConvo] = await db('conversations')
      .insert({ sender_id, receiver_id })
      .returning('*');

    res.json(newConvo);
  } catch (err) {
    console.error('[ERREUR] Création conversation :', err.message);
    res.status(500).json({ error: 'Erreur lors de la création de la conversation' });
  }
});


// 🔵 Récupérer toutes les conversations de l’utilisateur
router.get('/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

  if (!userId) {
    return res.status(400).json({ error: 'ID utilisateur invalide' });
  }

  try {
 const rawConversations = await db('conversations')
  .select('*')
  .where('sender_id', userId)
  .orWhere('receiver_id', userId)
  .orderBy('created_at', 'desc');

const conversations = [];

for (const conv of rawConversations) {
  const otherUserId = conv.sender_id === userId ? conv.receiver_id : conv.sender_id;
  const user = await db('users').where({ id: otherUserId }).first();

  const lastMsg = await db('messages')
    .where('conversation_id', conv.id)
    .orderBy('created_at', 'desc')
    .first();

  conversations.push({
    id: conv.id,
    username: user?.username || null,
    profilePicture: user?.profilePicture || null,
    last_message: lastMsg ? lastMsg.content : null,
    last_message_time: lastMsg ? lastMsg.timestamp : null
  });
}

res.json(conversations);

  for (const conv of conversations) {
 const lastMsg = await db('messages')
  .where('conversation_id', conv.id)
  .orderBy('created_at', 'desc') // ✅ nouveau nom correct
  .first();



  conv.last_message = lastMsg ? lastMsg.content : null;
  conv.last_message_time = lastMsg ? lastMsg.timestamp : null;

}


  res.json(conversations);
  } catch (err) {
    console.error('[ERREUR] Récupération conversations :', err.message);
    res.status(500).json({ error: 'Erreur lors de la récupération des conversations' });
  }
});

// 🔴 Récupérer le nombre de messages non lus pour un utilisateur
router.get('/unread/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);

  if (!userId) {
    return res.status(400).json({ error: "ID utilisateur manquant ou invalide." });
  }

  try {
    const result = await db('messages')
      .where('receiver_id', userId)
      .andWhere('is_read', false)
      .count('id as count');

    res.json({ unreadCount: parseInt(result[0].count, 10) });
  } catch (err) {
    console.error('[ERREUR] Récupération des messages non lus :', err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});


module.exports = router;
