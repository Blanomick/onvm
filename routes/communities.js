const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');

// Configurer multer pour le stockage des images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`[LOG] Dossier de destination pour le téléchargement : uploads/`);
    cb(null, 'uploads/'); // Dossier où les images seront stockées
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    console.log(`[LOG] Nom de fichier généré pour le téléchargement : ${uniqueName}`);
    cb(null, uniqueName); // Nom unique pour chaque fichier
  }
});
const upload = multer({ storage });

// Route pour créer une nouvelle communauté
router.post('/', (req, res) => {
  const { name, description, created_by } = req.body;
  console.log('[LOG] Requête reçue pour créer une communauté avec les données :', req.body);

  if (!name || !description || !created_by) {
    console.error('[ERREUR] Champs manquants dans la requête de création de communauté.');
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  const query = `
    INSERT INTO communities (name, description, created_by)
    VALUES (?, ?, ?)
  `;
  db.run(query, [name, description, created_by], function (err) {
    if (err) {
      console.error('[ERREUR] Problème lors de la création de la communauté:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`[LOG] Communauté créée avec succès, ID : ${this.lastID}`);
    res.status(201).json({ id: this.lastID, name, description, created_by });
  });
});

// Route pour obtenir les informations d'une communauté spécifique
router.get('/:id', (req, res) => {
  const { id } = req.params;
  console.log(`[LOG] Requête pour obtenir les détails de la communauté ID : ${id}`);

  const query = `SELECT * FROM communities WHERE id = ?`;
  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération de la communauté:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      console.warn(`[AVERTISSEMENT] Communauté avec ID ${id} non trouvée.`);
      return res.status(404).json({ error: 'Communauté non trouvée' });
    }
    console.log(`[LOG] Détails de la communauté récupérés pour l'ID ${id}`);
    res.status(200).json(row);
  });
});

// Route pour récupérer les communautés créées par un utilisateur spécifique
router.get('/users/:id', (req, res) => {
  const userId = req.params.id;
  console.log(`[LOG] Requête pour obtenir les communautés de l'utilisateur ID : ${userId}`);

  const query = `
    SELECT * FROM communities
    WHERE created_by = ?
  `;
  db.all(query, [userId], (err, rows) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération des communautés:', err);
      return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
    console.log(`[LOG] Communautés récupérées pour l'utilisateur ID ${userId} : ${rows.length} communautés trouvées`);
    res.status(200).json(rows || []);
  });
});

// Route pour récupérer les messages d'une communauté spécifique
router.get('/:id/messages', (req, res) => {
  const communityId = req.params.id;
  console.log(`[LOG] Requête pour obtenir les messages de la communauté ID : ${communityId}`);

  const query = `SELECT * FROM messages WHERE community_id = ?`;
  db.all(query, [communityId], (err, rows) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération des messages:', err);
      return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
    console.log(`[LOG] Messages récupérés pour la communauté ID ${communityId} : ${rows.length} messages trouvés`);
    res.status(200).json(rows || []);
  });
});

// Route pour récupérer les membres d'une communauté spécifique
router.get('/:id/members', (req, res) => {
  const communityId = req.params.id;
  console.log(`[LOG] Requête pour obtenir les membres de la communauté ID : ${communityId}`);

  const query = `
    SELECT users.* FROM users
    JOIN community_members ON users.id = community_members.user_id
    WHERE community_members.community_id = ?
  `;
  db.all(query, [communityId], (err, rows) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération des membres:', err);
      return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
    console.log(`[LOG] Membres récupérés pour la communauté ID ${communityId} : ${rows.length} membres trouvés`);
    res.status(200).json(rows || []);
  });
});

// Route pour ajouter ou mettre à jour la photo de profil d'une communauté
router.post('/:id/upload', upload.single('profilePhoto'), (req, res) => {
  const communityId = req.params.id;
  console.log(`[LOG] Requête pour upload de photo de profil pour la communauté ID : ${communityId}`);

  if (!req.file) {
    console.error('[ERREUR] Aucun fichier fourni pour la photo de profil.');
    return res.status(400).json({ error: 'Aucune photo téléchargée' });
  }

  const photoPath = `/uploads/${req.file.filename}`;
  console.log(`[LOG] Chemin de la photo de profil : ${photoPath}`);

  const query = `UPDATE communities SET profile_photo = ? WHERE id = ?`;
  db.run(query, [photoPath, communityId], function (err) {
    if (err) {
      console.error('[ERREUR] Problème lors de la mise à jour de la photo de profil:', err);
      return res.status(500).json({ error: 'Erreur interne du serveur' });
    }
    console.log(`[LOG] Photo de profil de la communauté ID ${communityId} mise à jour avec succès`);
    res.status(200).json({ message: 'Photo de profil mise à jour avec succès', profilePhoto: photoPath });
  });
});

module.exports = router;
