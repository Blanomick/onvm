const express = require('express');
const db = require('../db');

const router = express.Router();

// Route pour rechercher des utilisateurs et afficher les abonnements
router.get('/', (req, res) => {
  const searchTerm = req.query.q;
  const userId = req.query.userId;

  // Ajout de logs pour suivre les paramètres reçus
  console.log(`[LOG] Recherche : ${searchTerm}, UserID : ${userId}`);

  if (!searchTerm || !userId) {
    console.error('[ERREUR] Termes de recherche ou ID utilisateur manquants.');
    return res.status(400).json({ message: 'Le terme de recherche et l\'identifiant de l\'utilisateur sont requis.' });
  }

  // Requête pour trouver les utilisateurs qui correspondent au terme de recherche
  const searchQuery = `
    SELECT id, username, profilePicture 
    FROM users 
    WHERE username LIKE ? 
    AND id != ?`;

  // Requête pour trouver les utilisateurs auxquels l'utilisateur est abonné
  const followQuery = `
    SELECT u.id, u.username, u.profilePicture 
    FROM users u 
    JOIN follows f ON f.followingId = u.id 
    WHERE f.followerId = ?`;

  // Exécution de la recherche des utilisateurs
  db.all(searchQuery, [`%${searchTerm}%`, userId], (err, searchResults) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la recherche des utilisateurs :', err);
      return res.status(500).json({ message: 'Erreur lors de la recherche des utilisateurs.' });
    }

    console.log('[LOG] Résultats de la recherche des utilisateurs :', searchResults);

    // Exécution de la recherche des abonnements
    db.all(followQuery, [userId], (err, followResults) => {
      if (err) {
        console.error('[ERREUR] Erreur lors de la récupération des abonnements :', err);
        return res.status(500).json({ message: 'Erreur lors de la récupération des abonnements.' });
      }

      console.log('[LOG] Résultats des abonnements :', followResults);

      // Fusionner les résultats tout en évitant les doublons
      const combinedResults = [...searchResults];

      followResults.forEach((followedUser) => {
        if (!combinedResults.some(user => user.id === followedUser.id)) {
          combinedResults.push(followedUser);
        }
      });

      console.log('[LOG] Résultats combinés :', combinedResults);
      res.status(200).json(combinedResults);
    });
  });
});

module.exports = router;
