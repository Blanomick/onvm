const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');

// 📌 Configuration de multer pour l'upload des images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('[LOG] Destination du fichier : uploads/');
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    console.log(`[LOG] Nom du fichier : ${uniqueName}`);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

/**
 * 📌 Route POST : Créer une communauté
 * NOTE : actuellement ton frontend "CreateGroup" appelle /api/communities.
 * Donc cette route crée encore une entrée dans communities pour ne pas casser l'app.
 */
router.post('/', async (req, res) => {
  const { name, description, created_by } = req.body;

  console.log('[LOG] Création avec les données :', req.body);

  if (!name || !created_by) {
    console.error('[ERREUR] Champs manquants.');
    return res.status(400).json({
      error: 'Le nom et l’utilisateur créateur sont requis',
    });
  }

  try {


    const userExists = await db('users').where({ id: created_by }).first();

if (!userExists) {
  return res.status(400).json({
    error: 'Session invalide. Veuillez vous reconnecter.',
  });
}
    const [community] = await db('communities')
      .insert({
        name: name.trim(),
        description: description || '',
        created_by,
      })
      .returning('*');

    console.log(`[LOG] Création réussie avec ID : ${community.id}`);

    return res.status(201).json(community);
  } catch (err) {
    console.error('[ERREUR] Impossible de créer :', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer les communautés créées par un utilisateur
 * IMPORTANT : cette route doit rester AVANT /:id
 */
router.get('/users/:id', async (req, res) => {
  const userId = req.params.id;

  console.log(
    `[LOG] Récupération des communautés de l'utilisateur ID : ${userId}`
  );

  try {
    const communities = await db('communities')
      .where({ created_by: userId })
      .orderBy('created_at', 'desc');

    console.log(`[LOG] ${communities.length} communauté(s) trouvée(s).`);

    return res.status(200).json(communities);
  } catch (err) {
    console.error(
      '[ERREUR] Impossible de récupérer les communautés :',
      err.message
    );
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer une communauté spécifique
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  console.log(`[LOG] Récupération de la communauté ID : ${id}`);

  try {
    const community = await db('communities').where({ id }).first();

    if (!community) {
      console.warn('[AVERTISSEMENT] Aucune communauté trouvée.');
      return res.status(404).json({ error: 'Communauté non trouvée' });
    }

    console.log('[LOG] Détails de la communauté récupérés.');

    return res.status(200).json(community);
  } catch (err) {
    console.error(
      '[ERREUR] Impossible de récupérer la communauté :',
      err.message
    );
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer les membres d'une communauté
 */
router.get('/:id/members', async (req, res) => {
  const communityId = req.params.id;

  console.log(
    `[LOG] Récupération des membres de la communauté ID : ${communityId}`
  );

  try {
    const members = await db('users')
      .join('community_members', 'users.id', 'community_members.user_id')
      .where('community_members.community_id', communityId)
      .select(
        'users.id',
        'users.username',
        'users.email',
        'users.profilePicture',
        'community_members.role',
        'community_members.joined_at'
      );

    console.log(`[LOG] ${members.length} membre(s) trouvé(s).`);

    return res.status(200).json(members);
  } catch (err) {
    console.error(
      '[ERREUR] Impossible de récupérer les membres :',
      err.message
    );
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route GET : Récupérer les messages d'une communauté
 */
router.get('/:id/messages', async (req, res) => {
  const communityId = req.params.id;

  console.log(
    `[LOG] Récupération des messages pour la communauté ID : ${communityId}`
  );

  try {
    const messages = await db('messages')
      .where({ community_id: communityId })
      .orderBy('created_at', 'asc');

    console.log(`[LOG] ${messages.length} message(s) trouvé(s).`);

    return res.status(200).json(messages);
  } catch (err) {
    console.error(
      '[ERREUR] Impossible de récupérer les messages :',
      err.message
    );
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * 📌 Route POST : Upload de photo pour une communauté
 */
router.post('/:id/upload', upload.single('profilePhoto'), async (req, res) => {
  const communityId = req.params.id;

  console.log(
    `[LOG] Upload de photo pour la communauté ID : ${communityId}`
  );

  if (!req.file) {
    console.error('[ERREUR] Aucun fichier fourni.');
    return res.status(400).json({ error: 'Aucune photo téléchargée' });
  }

  const photoPath = `/uploads/${req.file.filename}`;

  console.log(`[LOG] Chemin de la photo : ${photoPath}`);

  try {
    const hasProfilePhotoColumn = await db.schema.hasColumn(
      'communities',
      'profile_photo'
    );

    if (!hasProfilePhotoColumn) {
      await db.schema.alterTable('communities', (table) => {
        table.text('profile_photo');
      });

      console.log('[INFO] Colonne profile_photo ajoutée à communities.');
    }

    const [updatedCommunity] = await db('communities')
      .where({ id: communityId })
      .update({ profile_photo: photoPath })
      .returning('*');

    if (!updatedCommunity) {
      console.warn('[AVERTISSEMENT] Communauté non trouvée.');
      return res.status(404).json({ error: 'Communauté non trouvée' });
    }

    console.log('[LOG] Photo mise à jour.');

    return res.status(200).json({
      message: 'Photo mise à jour',
      profilePhoto: photoPath,
      community: updatedCommunity,
    });
  } catch (err) {
    console.error(
      '[ERREUR] Impossible de mettre à jour la photo :',
      err.message
    );
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;