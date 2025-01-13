const express = require('express');

module.exports = (io) => {
  const router = express.Router();

  // Liste des utilisateurs en direct
  let activeLiveUsers = [];

  /**
   * Démarrer un direct
   */
  router.post('/start', (req, res) => {
    try {
      const { userId, username, profilePicture } = req.body;

      // Vérifie les paramètres requis
      if (!userId || !username) {
        return res.status(400).json({ message: 'Paramètres manquants.' });
      }

      // Vérifie si l'utilisateur est déjà en direct
      if (!activeLiveUsers.find(user => user.userId === userId)) {
        activeLiveUsers.push({ userId, username, profilePicture });
        console.log(`[INFO] ${username} a démarré un direct.`);

        // Envoie une notification aux utilisateurs connectés
        io.emit('notify-live', { username, userId, profilePicture });
      }

      res.status(200).json({ message: 'Direct démarré', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] Erreur lors du démarrage du direct:', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * Arrêter un direct
   */
  router.post('/stop', (req, res) => {
    try {
      const { userId } = req.body;

      // Vérifie les paramètres requis
      if (!userId) {
        return res.status(400).json({ message: 'Paramètre `userId` manquant.' });
      }

      // Supprime l'utilisateur de la liste des directs actifs
      activeLiveUsers = activeLiveUsers.filter(user => user.userId !== userId);
      console.log(`[INFO] Direct arrêté pour l'utilisateur avec ID ${userId}.`);

      // Notifie les utilisateurs connectés
      io.emit('end-live', { userId });

      res.status(200).json({ message: 'Direct arrêté', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] Erreur lors de l\'arrêt du direct:', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * Obtenir la liste des directs actifs
   */
  router.get('/active', (req, res) => {
    try {
      res.status(200).json({ activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] Erreur lors de la récupération des utilisateurs actifs:', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * Rejoindre un live
   */
  router.post('/join', (req, res) => {
    try {
      const { liveId, username, profilePicture } = req.body;

      if (!liveId || !username) {
        return res.status(400).json({ message: 'Paramètres manquants.' });
      }

      const live = activeLiveUsers.find(user => user.userId === liveId);
      if (!live) {
        return res.status(404).json({ message: 'Live introuvable.' });
      }

      // Notifie les spectateurs que quelqu'un a rejoint
      io.emit('user-joined', { liveId, username, profilePicture });
      console.log(`[INFO] ${username} a rejoint le live ID: ${liveId}`);

      res.status(200).json({ message: 'Live rejoint avec succès.' });
    } catch (error) {
      console.error('[ERREUR] Erreur lors de la jointure du live:', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * Quitter un live
   */
  router.post('/leave', (req, res) => {
    try {
      const { liveId, username } = req.body;

      if (!liveId || !username) {
        return res.status(400).json({ message: 'Paramètres manquants.' });
      }

      const live = activeLiveUsers.find(user => user.userId === liveId);
      if (!live) {
        return res.status(404).json({ message: 'Live introuvable.' });
      }

      // Notifie les spectateurs que quelqu'un a quitté
      io.emit('user-left', { liveId, username });
      console.log(`[INFO] ${username} a quitté le live ID: ${liveId}`);

      res.status(200).json({ message: 'Live quitté avec succès.' });
    } catch (error) {
      console.error('[ERREUR] Erreur lors de la sortie du live:', error);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  return router;
};
