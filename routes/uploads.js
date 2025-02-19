const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../db'); // Connexion à la base de données
const { google } = require('googleapis');
const stream = require('stream');

// Configuration OAuth2 pour Google Drive
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,  // Client ID sécurisé
  process.env.GOOGLE_CLIENT_SECRET,  // Client Secret sécurisé
  process.env.GOOGLE_REDIRECT_URI  // URI de redirection
);

// Rafraîchir le token d'accès
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// API Google Drive
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// ID du dossier Google Drive pour le stockage
const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

// Fonction pour uploader vers Google Drive
const uploadToDrive = async (file, folderId) => {
  const fileMetadata = {
    name: file.originalname,
    parents: [folderId],
  };

  const media = {
    mimeType: file.mimetype,
    body: stream.Readable.from(file.buffer),
  };

  try {
    const response = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
    });
    console.log(`[LOG] Fichier téléchargé sur Google Drive avec succès. ID: ${response.data.id}`);
    return `https://drive.google.com/uc?id=${response.data.id}`;
  } catch (error) {
    console.error('[ERREUR] Erreur lors de l\'upload vers Google Drive :', error);
    throw new Error('Échec de l\'upload vers Google Drive.');
  }
};

// Vérification et création du répertoire 'uploads' si nécessaire
const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`[LOG] Dossier "uploads" créé à ${uploadDir}`);
} else {
  console.log(`[LOG] Dossier "uploads" existe déjà à ${uploadDir}`);
}

// Configuration de Multer pour le stockage des fichiers (local ou Google Drive)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`[LOG] Destination de stockage : ${uploadDir}`);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeFileName = file.originalname.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
    const uniqueFileName = `${Date.now()}_${safeFileName}`;
    console.log(`[LOG] Nom de fichier généré : ${uniqueFileName}`);
    cb(null, uniqueFileName);
  },
});

// Vérification du type de fichier
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'audio/mpeg'];
  if (!allowedTypes.includes(file.mimetype)) {
    console.error('[ERREUR] Type de fichier non autorisé :', file.mimetype);
    return cb(new Error('Type de fichier non autorisé.'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 300 * 1024 * 1024 }, // Limite de taille à 300 Mo
});

// **🔹 Route POST pour l'upload général**
router.post('/', upload.single('media'), async (req, res) => {
  console.log(`[LOG] Requête reçue pour l'upload de fichier générique`);
  if (!req.file) {
    console.error('[ERREUR] Aucun fichier fourni.');
    return res.status(400).json({ message: 'Aucun fichier fourni.' });
  }

  try {
    const driveLink = await uploadToDrive(req.file, driveFolderId);
    res.status(200).json({ 
      message: 'Fichier téléchargé avec succès!', 
      filePath: driveLink
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de l\'upload vers Google Drive.' });
  }
});

// **🔹 Route PUT pour mettre à jour la photo de profil utilisateur**
router.put('/users/:id/profile-picture', upload.single('profilePicture'), async (req, res) => {
  console.log(`[LOG] Requête reçue pour mise à jour de photo de profil utilisateur, ID : ${req.params.id}`);
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier fourni.' });
  }

  const userId = req.params.id;
  try {
    const driveLink = await uploadToDrive(req.file, driveFolderId);
    const updateQuery = 'UPDATE users SET profilePicture = ? WHERE id = ?';
    db.run(updateQuery, [driveLink, userId], (err) => {
      if (err) {
        return res.status(500).json({ message: 'Erreur lors de la mise à jour.' });
      }
      res.status(200).json({ message: 'Photo de profil mise à jour avec succès!', profilePicture: driveLink });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de l\'upload vers Google Drive.' });
  }
});

// **🔹 Route POST pour l'upload de photo de communauté**
router.post('/communities/:id/upload', upload.single('profilePhoto'), async (req, res) => {
  const communityId = req.params.id;
  console.log(`[LOG] Upload pour la communauté ID : ${communityId}`);
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier fourni.' });
  }

  try {
    const driveLink = await uploadToDrive(req.file, driveFolderId);
    const updateQuery = 'UPDATE communities SET profile_photo = ? WHERE id = ?';
    db.run(updateQuery, [driveLink, communityId], (err) => {
      if (err) {
        return res.status(500).json({ message: 'Erreur lors de la mise à jour.' });
      }
      res.status(200).json({ message: 'Photo mise à jour avec succès!', profilePhoto: driveLink });
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de l\'upload vers Google Drive.' });
  }
});

// **🔹 Suppression automatique des fichiers locaux inutilisés**
setInterval(() => {
  console.log('[LOG] Nettoyage automatique des fichiers temporaires dans "uploads"...');
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error('[ERREUR] Impossible de lire le répertoire "uploads":', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('[ERREUR] Impossible de récupérer les informations du fichier:', err);
          return;
        }

        const now = new Date().getTime();
        const fileAge = now - stats.mtimeMs;

        if (fileAge > 24 * 60 * 60 * 1000) { // Supprimer les fichiers de plus de 24h
          fs.unlink(filePath, err => {
            if (!err) console.log(`[LOG] Fichier supprimé: ${filePath}`);
          });
        }
      });
    });
  });
}, 6 * 60 * 60 * 1000); // Nettoyage toutes les 6 heures

module.exports = router;
 