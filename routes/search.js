const express = require('express');
const db = require('../db');

const router = express.Router();

// Route pour rechercher des utilisateurs et afficher les abonnements
router.get('/', async (req, res) => {
  try {
    const searchTerm = req.query.q;
    const userId = parseInt(req.query.userId, 10); // Convertir l'ID utilisateur en entier
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    console.log(`[LOG] Recherche : ${searchTerm}, UserID : ${userId}, Page : ${page}`);

    if (!searchTerm || isNaN(userId)) {
      console.error('[ERREUR] Termes de recherche ou ID utilisateur invalide.');
      return res.status(400).json({ message: 'Le terme de recherche et un identifiant utilisateur valide sont requis.' });
    }

    // Requête pour rechercher des utilisateurs par nom d'utilisateur (insensible à la casse)
    const searchQuery = `
      SELECT id, username, profilePicture 
      FROM users 
      WHERE username ILIKE ? 
      AND id != ?
      LIMIT ? OFFSET ?
    `;

    // Requête pour récupérer les abonnements de l'utilisateur
    const followQuery = `
    SELECT u.id, u.username, u."profilePicture"
FROM users u 
JOIN follows f ON f."followingId" = u.id 
WHERE f."followerId" = ?

    `;

    // Exécution de la recherche des utilisateurs
    const searchResults = await db
      .raw(searchQuery, [`%${searchTerm}%`, userId, limit, offset])
      .then((result) => {
        console.log('[LOG] Résultats de la recherche des utilisateurs :', result.rows);
        return result.rows;
      })
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la recherche des utilisateurs :', err);
        return [];
      });

    // Exécution de la récupération des abonnements
    const followResults = await db
      .raw(followQuery, [userId])
      .then((result) => {
        console.log('[LOG] Résultats des abonnements :', result.rows);
        return result.rows;
      })
      .catch((err) => {
        console.error('[ERREUR] Erreur lors de la récupération des abonnements :', err);
        return [];
      });

    // Fusionner les résultats et supprimer les doublons
    const combinedResults = [...new Map([...searchResults, ...followResults].map(user => [user.id, user])).values()];

    console.log('[LOG] Résultats combinés :', combinedResults);
    res.status(200).json(combinedResults);

  } catch (error) {
    console.error('[ERREUR] Erreur interne du serveur :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router;
