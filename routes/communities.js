const express = require('express');
const router = express.Router();
const db = require('../db'); // Connexion à PostgreSQL
const multer = require('multer');
const path = require('path');

// 📌 Configuration de multer pour l'upload des images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`[LOG] Destination du fichier : uploads/`);
    cb(null, 'uploads/'); // 📌 Stockage dans "uploads/"
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    console.log(`[LOG] Nom du fichier : ${uniqueName}`);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

/**
 * 📌 Route POST : Créer une nouvelle communauté
 */
router.post('/', async (req, res) => {
  const { name, description, created_by } = req.body;
  console.log('[LOG] Création de communauté avec les données :', req.body);

  if (!name || !description || !created_by) {
    console.error('[ERREUR] Champs manquants.');
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  try {
    const query = `INSERT INTO communities (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`;
    const result = await db.query(query, [name, description, created_by]);
    console.log(`[LOG] Communauté créée avec ID : ${result.rows[0].id}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[ERREUR] Impossible de créer la communauté:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer une communauté spécifique
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[LOG] Récupération de la communauté ID : ${id}`);

  try {
    const query = `SELECT * FROM communities WHERE id = $1`;
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      console.warn(`[AVERTISSEMENT] Aucune communauté trouvée.`);
      return res.status(404).json({ error: 'Communauté non trouvée' });
    }

    console.log(`[LOG] Détails de la communauté récupérés.`);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('[ERREUR] Impossible de récupérer la communauté:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer les communautés créées par un utilisateur
 */
router.get('/users/:id', async (req, res) => {
  const userId = req.params.id;
  console.log(`[LOG] Récupération des communautés de l'utilisateur ID : ${userId}`);

  try {
    const query = `SELECT * FROM communities WHERE created_by = $1`;
    const result = await db.query(query, [userId]);

    console.log(`[LOG] ${result.rows.length} communautés trouvées.`);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('[ERREUR] Impossible de récupérer les communautés:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer les membres d'une communauté
 */
router.get('/:id/members', async (req, res) => {
  const communityId = req.params.id;
  console.log(`[LOG] Récupération des membres de la communauté ID : ${communityId}`);

  try {
    const query = `
      SELECT users.id, users.username, users.email, users.profilePicture
      FROM users
      JOIN community_members ON users.id = community_members.user_id
      WHERE community_members.community_id = $1
    `;
    const result = await db.query(query, [communityId]);

    console.log(`[LOG] ${result.rows.length} membres trouvés.`);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('[ERREUR] Impossible de récupérer les membres:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer les messages d'une communauté
 */
router.get('/:id/messages', async (req, res) => {
  const communityId = req.params.id;
  console.log(`[LOG] Récupération des messages pour la communauté ID : ${communityId}`);

  try {
    const query = `SELECT * FROM messages WHERE community_id = $1`;
    const result = await db.query(query, [communityId]);

    console.log(`[LOG] ${result.rows.length} messages trouvés.`);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('[ERREUR] Impossible de récupérer les messages:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route POST : Upload de photo de profil pour une communauté
 */
router.post('/:id/upload', upload.single('profilePhoto'), async (req, res) => {
  const communityId = req.params.id;
  console.log(`[LOG] Upload de photo de profil pour la communauté ID : ${communityId}`);

  if (!req.file) {
    console.error('[ERREUR] Aucun fichier fourni.');
    return res.status(400).json({ error: 'Aucune photo téléchargée' });
  }

  const photoPath = `/uploads/${req.file.filename}`;
  console.log(`[LOG] Chemin de la photo : ${photoPath}`);

  try {
    const query = `UPDATE communities SET profile_photo = $1 WHERE id = $2 RETURNING *`;
    const result = await db.query(query, [photoPath, communityId]);

    if (result.rowCount === 0) {
      console.warn(`[AVERTISSEMENT] Communauté non trouvée.`);
      return res.status(404).json({ error: 'Communauté non trouvée' });
    }

    console.log(`[LOG] Photo mise à jour.`);
    res.status(200).json({ message: 'Photo mise à jour', profilePhoto: photoPath });
  } catch (err) {
    console.error('[ERREUR] Impossible de mettre à jour la photo :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
