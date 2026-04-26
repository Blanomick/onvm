// backend/routes/voiceNotes.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const streamifier = require("streamifier");

// DB (Knex) — optionnel
let db = null;
try {
  db = require("../db");
} catch { /* ok si absent */ }

// Cloudinary v2 (préféré)
let cloudinary = null;
if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary = require("cloudinary").v2;
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
}



// Multer en mémoire (nécessaire pour upload_stream Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

module.exports = function voiceNotesRouter(io) {
  const router = express.Router();

  router.use((req, res, next) => upload.any()(req, res, next));

  // Dossier uploads local (fallback)
  const uploadsDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // Sous-dossier dédié aux vocaux — à exclure de tout "cleanup" automatique
  const voiceDir = path.join(uploadsDir, "voice-notes");
  if (!fs.existsSync(voiceDir)) fs.mkdirSync(voiceDir, { recursive: true });
router.post("/", async (req, res) => {

try {
    console.log("[voice-notes] BODY:", req.body);
   console.log("[voice-notes] FILE FIELDS:", Array.isArray(req.files) ? req.files.map(f => ({ field: f.fieldname, size: f.size, type: f.mimetype })) : []);
   const rawChatId = req.body.chatId ?? req.body.chat_id;
   const rawConvId = req.body.conversation_id ?? req.body.conversationId;
    const userId = req.body.userId ?? req.body.user_id ?? req.body.sender_id ?? null;

    // 🔒 On choisit un seul identifiant numérique de conversation :
    const convId = Number.isFinite(Number(rawConvId))
      ? Number(rawConvId)
      : Number.isFinite(Number(rawChatId))
      ? Number(rawChatId)
      : null;

    if (!userId) {
      return res.status(400).json({ error: "userId/sender_id requis" });
    }
    if (convId == null) {
      return res.status(400).json({ error: "conversation_id ou chatId numérique requis" });
    }
    // ✅ Récupérer le fichier quel que soit le nom de champ envoyé
// ✅ Récupérer le fichier peu importe le nom de champ
// (ex: 'file', 'voice', 'audio', etc.)
const files = Array.isArray(req.files) ? req.files : [];
// Essaie d'abord file/voice, sinon prends le 1er
const file =
  files.find(f => f.fieldname === "file" || f.fieldname === "voice") ||
  files[0] ||
  null;

// Debug utile (à enlever ensuite)
console.log("[voice-notes] champs fichiers reçus:", files.map(f => f.fieldname));

if (!file || !file.buffer) {
  return res.status(400).json({ error: "Fichier audio manquant (multipart/form-data)" });
}


      
         // Helper: upload Cloudinary via stream
    const uploadToCloudinary = () =>
      new Promise((resolve, reject) => {
        if (!cloudinary) return reject(new Error("Cloudinary non configuré"));
        const folder = process.env.CLOUDINARY_FOLDER || "onvm/voice-notes";
        const cldStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "video", // pour mp3/m4a/webm
            folder,
            timeout: 30000,
          },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        // ⬇️ IMPORTANT : utiliser file.buffer et pas req.file.buffer
        streamifier.createReadStream(file.buffer).pipe(cldStream);
      });

let playUrl = null;
let storageType = null; // 'cloudinary' | 'local-fallback'
let duration = null;
let publicId = null;

      // 1) Tentative Cloudinary
      try {
        const result = await uploadToCloudinary();
        storageType = "cloudinary";
        publicId = result.public_id;
        duration = result.duration || null;

        // URL **lecture HQ** (WhatsApp-like) : MP3 128 kbps / 44.1 kHz
        // q_auto:good équilibre qualité/poids
        const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME ||
  (process.env.CLOUDINARY_URL ? process.env.CLOUDINARY_URL.split('@')[1] : "");

// Si on a le cloudName, on force une URL MP3 HQ ; sinon on tombe sur l’URL d’upload direct
playUrl = cloudName
  ? `https://res.cloudinary.com/${cloudName}/video/upload/f_mp3,br_128k,ar_44100,q_auto:good/${publicId}.mp3`
  : (result.secure_url || result.url);

          } catch (err) {
        // 2) Fallback local en cas d'erreur réseau/DNS Cloudinary
        console.error("[voice-notes] Cloudinary indisponible:", err.code || err.message || err);
        storageType = "local-fallback";
       const ext = (path.extname(file.originalname || "").toLowerCase()) || ".m4a";
        const filename = `voice_${Date.now()}${ext}`;
        const full = path.join(voiceDir, filename);
        fs.writeFileSync(full, file.buffer);
        // URL stable vers le sous-dossier : /uploads/voice-notes/...
        playUrl = `/uploads/voice-notes/${filename}`;
}


    // Si le front a fourni une durée (en secondes), on la garde comme source de vérité
      if (req.body?.duration && !Number.isNaN(Number(req.body.duration))) {
        duration = Number(req.body.duration);
      }

     if (!db) {
   return res.status(500).json({ error: "DB non disponible" });
 }

 let inserted;
 try {
   inserted = await db("messages")
     .insert({
    conversation_id: convId,
       user_id: Number(userId),
       type: "voice",
       content: null,
       media: null,
       voice_url: playUrl,
       duration: duration,
       created_at: new Date(),
     })
     .returning(["id", "conversation_id", "user_id", "type", "voice_url", "duration", "created_at"]);
 } catch (e) {
   console.error("[voice-notes] INSERT messages a échoué:", e.message);
   return res.status(500).json({ error: "Échec de l'enregistrement du message vocal" });
}

      // 4) Temps réel (socket)
      const payload = {

         id: inserted[0].id,
  type: "voice",
 voice_url: inserted[0].voice_url,
 duration: inserted[0].duration ?? null,
 sender_id: Number(userId),
  created_at: inserted[0].created_at,
        content: "",
        media: null,
      };

      // Room chat:* (compat avec ton code) + room conversation si fournie
      try {

        io?.to(`chat:${convId}`).emit("chat:message", payload);
      } catch (e) {
        console.warn("[socket] emit chat:message:", e.message);
      }

      // 5) Réponse API
      return res.status(201).json({
        ok: true,
        storage: storageType,
        playUrl,        // ⚠️ à utiliser côté front
        public_id: publicId || null,
        duration: duration ?? null,
       id: inserted[0].id,
       conversation_id: inserted[0].conversation_id,
        user_id: inserted[0].user_id,
        type: "voice",
        created_at: inserted[0].created_at,
      });
    } catch (e) {
      console.error("voice note error:", e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  return router;
};
