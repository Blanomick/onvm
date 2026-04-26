   // backend/routes/messages.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 📁 dossier uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// 🎛️ stockage pour message media (images/vidéos/audio)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `message_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

/**
 * POST /api/messages/send
 * Accepte FormData:
 *  - conversation_id (number, required)
 *  - sender_id OU user_id (number, required)
 *  - content (string, optionnel)
 *  - media (file, optionnel)
 *
 * Renvoie le message inséré et émet en temps réel via socket.io :
 *   io.to(`chat:${conversation_id}`).emit("chat:message", message)
 */
// ---- Nouveau handler réutilisable + 2 routes (send et racine) ----
// ---- Nouveau handler réutilisable + 2 routes (send et racine) ----
async function handleSendMessage(req, res) {
  try {
    const { conversation_id } = req.body;
    const user_id = Number(req.body.user_id || req.body.sender_id);

    // 🔧 NOUVEAU : on gère type/voice_url/duration
    const type = (req.body.type || 'text').toLowerCase(); // 'text' | 'voice'
    const voice_url = (req.body.voice_url || '').trim();  // URL Cloudinary MP3 OU /media/xxx (fallback)
    const duration = req.body.duration ? Number(req.body.duration) : null;

    const content = (req.body.content || '').trim();
    // on garde le support fichier pour "media" (images/vidéos) si présent
    const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;

    if (!conversation_id || !user_id) {
      return res.status(400).json({ error: 'conversation_id et user_id/sender_id requis' });
    }

    // 🔧 VALIDATION selon le type
    if (type === 'text') {
      if (!content && !mediaPath) {
        return res.status(400).json({ error: 'Message texte vide : content ou media requis.' });
      }
    } else if (type === 'voice') {
      if (!voice_url) {
        return res.status(400).json({ error: 'voice_url requis pour un message vocal.' });
      }
    } else {
      return res.status(400).json({ error: "type invalide (attendu: 'text' ou 'voice')." });
    }

    // 🔧 INSERT avec nouvelles colonnes
    const [message] = await db('messages')
      .insert({
        conversation_id: Number(conversation_id),
        user_id,
        type,                          // <--- NOUVEAU
        content: type === 'text' ? content : null,
        media: type === 'text' ? mediaPath : null,
        voice_url: type === 'voice' ? voice_url : null,  // <--- NOUVEAU
        duration: type === 'voice' ? duration : null,    // <--- NOUVEAU
        created_at: new Date(),
      })
      .returning([
        'id',
        'conversation_id',
        'user_id',
        'type',
        'content',
        'media',
        'voice_url',
        'duration',
        'created_at',
      ]);

    // notif destinataire (idempotent)
    try {
      const convo = await db('conversations').where({ id: conversation_id }).first();
      if (convo) {
        const toUserId = (user_id === convo.sender_id) ? convo.receiver_id : convo.sender_id;
        if (toUserId && toUserId !== user_id) {
          // 🔧 snippet adapté (texte, média ou vocal)
          const snippetBase =
            type === 'voice' ? '[vocal]'
            : (content || (mediaPath ? '[media]' : ''));

          await db('notifications')
            .insert({
              user_id: toUserId,
              actor_id: user_id,
              type: 'message',
              entity_type: 'message',
              entity_id: message.id,
              metadata: { snippet: (snippetBase || '').slice(0, 120) },
            })
            .onConflict(['type','user_id','actor_id','entity_type','entity_id'])
            .ignore();
        }
      }
    } catch (e) {
      console.warn('[notifications] message non critique:', e.message);
    }

    // temps réel
    try {
      req.io?.to(`chat:${conversation_id}`).emit('chat:message', {
        id: message.id,
        conversation_id: message.conversation_id, // utile côté front
        sender_id: user_id,
        type: message.type,           // <--- NOUVEAU
        content: message.content,
        media: message.media,
        voice_url: message.voice_url, // <--- NOUVEAU
        duration: message.duration,   // <--- NOUVEAU
        created_at: message.created_at,
      });
    } catch (e) {
      console.warn('[socket] emit chat:message:', e.message);
    }

    return res.status(201).json(message);
  } catch (err) {
    console.error('[ERREUR] Envoi message :', err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du message" });
  }
}


// ➜ expose les deux chemins, ancien et nouveau
router.post('/send', upload.single('media'), handleSendMessage);  // POST /api/messages/send
router.post('/',     upload.single('media'), handleSendMessage);  // POST /api/messages


/**
 * GET /api/messages/:conversationId
 * ⚠️ Renvoie un **tableau** de messages (compat avec ton Chat.js actuel)
 * Si tu veux aussi renvoyer l’autre utilisateur, utilise ?withUser=1
 */
router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const withUser = String(req.query.withUser || '') === '1';

  try {
    const convo = await db('conversations').where('id', conversationId).first();
    if (!convo) {
      return res.status(404).json({ error: 'Conversation introuvable' });
    }

    const messages = await db('messages')
      .where('conversation_id', conversationId)
      .orderBy('created_at', 'asc')
       .select(
    'id',
    'conversation_id',
    'user_id as sender_id',
    'type',         // <--- NOUVEAU
    'content',
    'media',
    'voice_url',    // <--- NOUVEAU
    'duration',     // <--- NOUVEAU
    'created_at'
  );

    if (!withUser) {
      // 🔁 FRONT COMPAT: renvoie uniquement le tableau
      return res.json(messages);
    }

    // Optionnel: renvoyer aussi le profil de l'autre participant si demandé
    const { viewerId } = req.query;
    const vId = viewerId ? Number(viewerId) : null;
    const otherUserId = vId != null ? (vId === convo.sender_id ? convo.receiver_id : convo.sender_id)
                                    : (convo.sender_id ?? convo.receiver_id);
    const other = otherUserId ? await db('users').where('id', otherUserId).first() : null;

    return res.json({
      messages,
      user: other ? {
        id: other.id,
        username: other.username,
        profilePicture: other.profilePicture,
      } : null,
    });
  } catch (err) {
    console.error('[ERREUR] Récupération des messages :', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
