const express = require('express');

module.exports = (io) => {
  const router = express.Router();

  // Liste des utilisateurs en direct
  let activeLiveUsers = [];

  /**
   * 📌 Démarrer un direct
   */
  router.post('/start', (req, res) => {
    try {
      const { userId, username, profilePicture } = req.body;

      if (!userId || !username) {
        console.error('[ERREUR] Paramètres `userId` et `username` requis.');
        return res.status(400).json({ message: 'Paramètres `userId` et `username` requis.' });
      }

      // Vérifier si l'utilisateur est déjà en live
      const isAlreadyLive = activeLiveUsers.some(user => user.userId === userId);
      if (!isAlreadyLive) {
        activeLiveUsers.push({ userId, username, profilePicture });
        console.log(`[INFO] ${username} a démarré un direct.`);

        // Notifier tous les utilisateurs connectés
        io.emit('notify-live', { userId, username, profilePicture });
      }

      res.status(200).json({ message: 'Direct démarré', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] Problème lors du démarrage du direct:', error.message);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * 📌 Arrêter un direct
   */
  router.post('/stop', (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        console.error('[ERREUR] Paramètre `userId` requis.');
        return res.status(400).json({ message: 'Paramètre `userId` requis.' });
      }

      // Retirer l'utilisateur de la liste des lives actifs
      activeLiveUsers = activeLiveUsers.filter(user => user.userId !== userId);
      console.log(`[INFO] Direct arrêté pour ${userId}.`);

      // Notifier la fin du live
      io.emit('end-live', { userId });

      res.status(200).json({ message: 'Direct arrêté', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] Problème lors de l\'arrêt du direct:', error.message);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * 📌 Obtenir la liste des directs actifs
   */
  router.get('/active', (req, res) => {
    try {
      console.log(`[INFO] Nombre de lives actifs : ${activeLiveUsers.length}`);
      res.status(200).json({ activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] Impossible de récupérer les utilisateurs actifs:', error.message);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * 📌 Rejoindre un live
   */
  router.post('/join', (req, res) => {
    try {
      const { liveId, username, profilePicture } = req.body;

      if (!liveId || !username) {
        console.error('[ERREUR] Paramètres `liveId` et `username` requis.');
        return res.status(400).json({ message: 'Paramètres `liveId` et `username` requis.' });
      }

      const live = activeLiveUsers.find(user => user.userId === liveId);
      if (!live) {
        console.warn(`[AVERTISSEMENT] Live ID ${liveId} introuvable.`);
        return res.status(404).json({ message: 'Live introuvable.' });
      }

      io.emit('user-joined', { liveId, username, profilePicture });
      console.log(`[INFO] ${username} a rejoint le live ID: ${liveId}`);

      res.status(200).json({ message: 'Live rejoint avec succès.' });
    } catch (error) {
      console.error('[ERREUR] Problème lors de la jointure du live:', error.message);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  /**
   * 📌 Quitter un live
   */
  router.post('/leave', (req, res) => {
    try {
      const { liveId, username } = req.body;

      if (!liveId || !username) {
        console.error('[ERREUR] Paramètres `liveId` et `username` requis.');
        return res.status(400).json({ message: 'Paramètres `liveId` et `username` requis.' });
      }

      const live = activeLiveUsers.find(user => user.userId === liveId);
      if (!live) {
        console.warn(`[AVERTISSEMENT] Live ID ${liveId} introuvable.`);
        return res.status(404).json({ message: 'Live introuvable.' });
      }

      io.emit('user-left', { liveId, username });
      console.log(`[INFO] ${username} a quitté le live ID: ${liveId}`);

      res.status(200).json({ message: 'Live quitté avec succès.' });
    } catch (error) {
      console.error('[ERREUR] Problème lors de la sortie du live:', error.message);
      res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  return router;
};
