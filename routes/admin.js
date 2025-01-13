const express = require('express');
const db = require('../db');
const router = express.Router();

// Vérifier si l'utilisateur est un administrateur
const isAdmin = (req, res, next) => {
  const userId = req.user ? req.user.id : null;  // Vérification si l'utilisateur est connecté
  if (!userId) {
    console.error('[ERREUR] Accès refusé. Utilisateur non authentifié.');
    return res.status(403).json({ message: 'Accès refusé. Vous devez être authentifié.' });
  }
  
  db.get('SELECT isAdmin FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user || !user.isAdmin) {
      console.error('[ERREUR] Accès refusé. Vous n\'êtes pas administrateur.');
      return res.status(403).json({ message: 'Accès refusé. Vous n\'êtes pas administrateur.' });
    }
    next();
  });
};

// Route pour récupérer tous les utilisateurs
router.get('/users', isAdmin, (req, res) => {
  console.log('[LOG] Récupération des utilisateurs par un administrateur');
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération des utilisateurs :', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs.' });
    }
    res.json(rows);
  });
});

// Route pour supprimer un utilisateur
router.delete('/users/:id', isAdmin, (req, res) => {
  const userId = req.params.id;
  console.log('[LOG] Suppression de l\'utilisateur avec ID :', userId);
  db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la suppression de l\'utilisateur :', err);
      return res.status(500).json({ message: 'Erreur lors de la suppression de l\'utilisateur.' });
    }
    res.json({ message: 'Utilisateur supprimé avec succès.' });
  });
});

// Route pour récupérer toutes les publications
router.get('/publications', isAdmin, (req, res) => {
  console.log('[LOG] Récupération des publications par un administrateur');
  db.all('SELECT * FROM publications', [], (err, rows) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération des publications :', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des publications.' });
    }
    res.json(rows);
  });
});

// Route pour supprimer une publication
router.delete('/publications/:id', isAdmin, (req, res) => {
  const publicationId = req.params.id;
  console.log('[LOG] Suppression de la publication avec ID :', publicationId);
  db.run('DELETE FROM publications WHERE id = ?', [publicationId], (err) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la suppression de la publication :', err);
      return res.status(500).json({ message: 'Erreur lors de la suppression de la publication.' });
    }
    res.json({ message: 'Publication supprimée avec succès.' });
  });
});

// Route pour obtenir les statistiques
router.get('/stats', isAdmin, (req, res) => {
  console.log('[LOG] Récupération des statistiques par un administrateur');
  const stats = {};
  
  db.get('SELECT COUNT(*) as usersCount FROM users', (err, row) => {
    if (err) {
      console.error('[ERREUR] Erreur lors de la récupération des statistiques (utilisateurs) :', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
    }
    stats.usersCount = row.usersCount;

    db.get('SELECT COUNT(*) as publicationsCount FROM publications', (err, row) => {
      if (err) {
        console.error('[ERREUR] Erreur lors de la récupération des statistiques (publications) :', err);
        return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
      }
      stats.publicationsCount = row.publicationsCount;
      res.json(stats);
    });
  });
});

module.exports = router;
