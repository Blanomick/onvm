const express = require('express');
const db = require('../db'); // 🔄 Assure-toi que le chemin est correct selon ta structure

module.exports = (io) => {
  const router = express.Router();

  // Liste des utilisateurs en direct
  let activeLiveUsers = [];

  /**
   * 📌 Démarrer un direct
   */
  router.post('/start', async (req, res) => {
    try {
      const { userId, username, profilePicture } = req.body;

      if (!userId || !username) {
        return res.status(400).json({ message: 'Paramètres userId et username requis.' });
      }

      const isAlreadyLive = activeLiveUsers.some(user => user.userId === userId);
      if (!isAlreadyLive) {
        activeLiveUsers.push({ userId, username, profilePicture });
        io.emit('notify-live', { userId, username, profilePicture });
      }

      res.status(200).json({ message: 'Direct démarré.', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] start-live :', error.message);
      res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  /**
   * 📌 Arrêter un direct
   */
  router.post('/stop', (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) return res.status(400).json({ message: 'userId requis.' });

      activeLiveUsers = activeLiveUsers.filter(user => user.userId !== userId);
      io.emit('end-live', { userId });

      res.status(200).json({ message: 'Direct arrêté.', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] stop-live :', error.message);
      res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  /**
   * 📌 Obtenir les lives actifs
   */
  router.get('/active', (req, res) => {
    try {
      res.status(200).json({ activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] get-active-lives :', error.message);
      res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  /**
   * 📌 Rejoindre un live
   */
  router.post('/join', (req, res) => {
    try {
      const { liveId, username, profilePicture } = req.body;

      if (!liveId || !username) return res.status(400).json({ message: 'liveId et username requis.' });

      const live = activeLiveUsers.find(user => user.userId === liveId);
      if (!live) return res.status(404).json({ message: 'Live introuvable.' });

      io.emit('user-joined', { liveId, username, profilePicture });
      res.status(200).json({ message: 'Live rejoint.' });
    } catch (error) {
      console.error('[ERREUR] join-live :', error.message);
      res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  /**
   * 📌 Quitter un live
   */
  router.post('/leave', (req, res) => {
    try {
      const { liveId, username } = req.body;

      if (!liveId || !username) return res.status(400).json({ message: 'liveId et username requis.' });

      const live = activeLiveUsers.find(user => user.userId === liveId);
      if (!live) return res.status(404).json({ message: 'Live introuvable.' });

      io.emit('user-left', { liveId, username });
      res.status(200).json({ message: 'Live quitté.' });
    } catch (error) {
      console.error('[ERREUR] leave-live :', error.message);
      res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  return router;
};
