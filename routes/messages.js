// backend/routes/messages.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 📁 Stockage des fichiers media dans "uploads/"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `message_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// 🟢 Envoyer un message texte ou média
router.post('/send', upload.single('media'), async (req, res) => {
  const { conversation_id, sender_id, content } = req.body;
  const media = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const message = await db('direct_messages')
      .insert({
        conversation_id,
        sender_id,
        content,
        media,
      })
      .returning('*');

    res.json(message[0]);
  } catch (err) {
    console.error('[ERREUR] Envoi message :', err.message);
    res.status(500).json({ message: 'Erreur envoi message' });
  }
});

// 🔵 Récupérer tous les messages d’une conversation
router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  try {
    const messages = await db('direct_messages')
      .where('conversation_id', conversationId)
      .orderBy('created_at', 'asc');

    res.json(messages);
  } catch (err) {
    console.error('[ERREUR] Récupération messages :', err.message);
    res.status(500).json({ message: 'Erreur récupération messages' });
  }
});

// GET /api/messages/:conversationId
router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  try {
    // Récupérer les messages
    const messages = await db('messages')
      .where('conversation_id', conversationId)
      .orderBy('created_at', 'asc');

    // Trouver l'autre utilisateur lié à la conversation
    const convo = await db('conversations').where('id', conversationId).first();

    if (!convo) {
      return res.status(404).json({ error: 'Conversation introuvable' });
    }

    const otherUserId =
      req.user?.id === convo.sender_id ? convo.receiver_id : convo.sender_id;

    // Récupérer le profil de l'autre utilisateur
    const user = await db('users').where('id', otherUserId).first();

    res.json({
      messages,
      user: {
        username: user?.username || 'Utilisateur inconnu',
        profilePicture: user?.profilePicture || null
      }
    });
  } catch (err) {
    console.error('[ERREUR] Récupération des messages :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});




module.exports = router;
