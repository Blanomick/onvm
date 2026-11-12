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

// Récupérer les discussions privées ET les groupes de l’utilisateur.
router.get('/:userId', async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({
      error: 'ID utilisateur invalide',
    });
  }

  function messagePreview(message) {
    if (!message) return null;

    if (message.type === 'voice' || message.voice_url) {
      return 'Message vocal';
    }

    if (message.content) {
      return message.content;
    }

    if (message.media) {
      return 'Média partagé';
    }

    return null;
  }

  try {
    // 1. Discussions privées.
    const rawConversations = await db('conversations')
      .where(function () {
        this.where('sender_id', userId)
          .orWhere('receiver_id', userId);
      })
      .orderBy('created_at', 'desc');

    const conversations = [];

    for (const conversation of rawConversations) {
      const otherUserId =
        Number(conversation.sender_id) === userId
          ? conversation.receiver_id
          : conversation.sender_id;

      const otherUser = await db('users')
        .where({ id: otherUserId })
        .select('id', 'username', 'profilePicture')
        .first();

      const lastMessage = await db('messages')
        .where('conversation_id', conversation.id)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .first();

      conversations.push({
        id: conversation.id,
        is_group: false,
        is_request: Boolean(conversation.is_request),
        user_id: otherUser?.id || null,
        username: otherUser?.username || 'Compte indisponible',
        profilePicture: otherUser?.profilePicture || null,
        last_message: messagePreview(lastMessage),
        last_message_time:
          lastMessage?.created_at || conversation.created_at || null,
      });
    }

    // 2. Groupes dont l’utilisateur est membre.
    // Inclut également ses groupes créés, pour retrouver un groupe
    // dont l’insertion du créateur dans group_members aurait échoué.
    const groups = await db('groups as g')
      .where(function () {
        this.where('g.created_by', userId)
          .orWhereExists(function () {
            this.select(db.raw('1'))
              .from('group_members as gm')
              .whereRaw('gm.group_id = g.id')
              .andWhere('gm.user_id', userId);
          });
      })
      .select('g.*');

    for (const group of groups) {
      const lastMessage = await db('messages')
        .where('group_id', group.id)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .first();

      conversations.push({
        id: group.id,
        is_group: true,
        is_request: false,
        groupName: group.name || 'Groupe',
        groupPicture: group.profile_photo || null,
        description: group.description || '',
        created_by: group.created_by,
        last_message: messagePreview(lastMessage),
        last_message_time:
          lastMessage?.created_at || group.created_at || null,
      });
    }

    // Les discussions ayant une activité récente apparaissent en premier.
    conversations.sort((a, b) => {
      const timeA = Date.parse(a.last_message_time) || 0;
      const timeB = Date.parse(b.last_message_time) || 0;

      return timeB - timeA;
    });

    return res.json(conversations);
  } catch (error) {
    console.error(
      '[ERREUR] Chargement des conversations et groupes :',
      error
    );

    return res.status(500).json({
      error: 'Impossible de charger les conversations et les groupes.',
    });
  }
});
                      
module.exports = router;
