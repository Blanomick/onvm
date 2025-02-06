const express = require('express');
const db = require('../db');

const router = express.Router();

// Route pour rechercher des utilisateurs et afficher les abonnements
router.get('/', async (req, res) => {
  try {
    const searchTerm = req.query.q;
    const userId = req.query.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // Ajout de logs pour suivre les paramètres reçus
    console.log(`[LOG] Recherche : ${searchTerm}, UserID : ${userId}, Page : ${page}`);

    if (!searchTerm || !userId) {
      console.error('[ERREUR] Termes de recherche ou ID utilisateur manquants.');
      return res.status(400).json({ message: 'Le terme de recherche et l\'identifiant de l\'utilisateur sont requis.' });
    }

    // Requête pour trouver les utilisateurs qui correspondent au terme de recherche (avec pagination)
    const searchQuery = `
      SELECT id, username, profilePicture 
      FROM users 
      WHERE username LIKE ? 
      AND id != ?
      LIMIT ? OFFSET ?`;

    // Requête pour trouver les utilisateurs auxquels l'utilisateur est abonné
    const followQuery = `
      SELECT u.id, u.username, u.profilePicture 
      FROM users u 
      JOIN follows f ON f.followingId = u.id 
      WHERE f.followerId = ?`;

    // Exécution de la recherche des utilisateurs
    const searchResults = await new Promise((resolve, reject) => {
      db.all(searchQuery, [`%${searchTerm}%`, userId, limit, offset], (err, rows) => {
        if (err) {
          console.error('[ERREUR] Erreur lors de la recherche des utilisateurs :', err);
          reject(err);
        } else {
          console.log('[LOG] Résultats de la recherche des utilisateurs :', rows);
          resolve(rows);
        }
      });
    });

    // Exécution de la recherche des abonnements
    const followResults = await new Promise((resolve, reject) => {
      db.all(followQuery, [userId], (err, rows) => {
        if (err) {
          console.error('[ERREUR] Erreur lors de la récupération des abonnements :', err);
          reject(err);
        } else {
          console.log('[LOG] Résultats des abonnements :', rows);
          resolve(rows);
        }
      });
    });

    // Fusionner les résultats tout en évitant les doublons
    const combinedResults = [...searchResults];

    followResults.forEach((followedUser) => {
      if (!combinedResults.some(user => user.id === followedUser.id)) {
        combinedResults.push(followedUser);
      }
    });

    console.log('[LOG] Résultats combinés :', combinedResults);
    res.status(200).json(combinedResults);

  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router;
