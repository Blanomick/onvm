const express = require('express');
const db = require('../db'); // 🔄 Assure-toi que ce chemin est correct

module.exports = (io) => {
  const router = express.Router();

  let activeLiveUsers = [];

  // 🔴 Démarrer un live
  router.post('/start', async (req, res) => {
    const { userId, username, profilePicture } = req.body;

    if (!userId || !username) {
      return res.status(400).json({ message: 'Paramètres userId et username requis.' });
    }

    try {
      const exists = activeLiveUsers.some((user) => user.userId === userId);
      if (!exists) {
        activeLiveUsers.push({ userId, username, profilePicture });
        io.emit('notify-live', { userId, username, profilePicture });
        console.log(`[LIVE] ${username} (${userId}) a démarré un direct.`);
      }
      return res.status(200).json({ message: 'Live démarré.', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] /start :', error.message);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  // ⏹️ Arrêter un live
  router.post('/stop', (req, res) => {
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId requis.' });

    try {
      activeLiveUsers = activeLiveUsers.filter((user) => user.userId !== userId);
      io.emit('end-live', { userId });
      console.log(`[LIVE] Live de ${userId} arrêté.`);

      return res.status(200).json({ message: 'Live arrêté.', activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] /stop :', error.message);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  // 📡 Obtenir la liste des lives en cours
  router.get('/active', (req, res) => {
    try {
      return res.status(200).json({ activeLiveUsers });
    } catch (error) {
      console.error('[ERREUR] /active :', error.message);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  // 👤 Rejoindre un live
  router.post('/join', (req, res) => {
    const { liveId, username, profilePicture } = req.body;

    if (!liveId || !username) {
      return res.status(400).json({ message: 'liveId et username requis.' });
    }

    const live = activeLiveUsers.find((user) => user.userId === liveId);
    if (!live) return res.status(404).json({ message: 'Live introuvable.' });

    try {
      io.emit('user-joined', { liveId, username, profilePicture });
      console.log(`[LIVE] ${username} a rejoint le live de ${liveId}`);
      return res.status(200).json({ message: 'Live rejoint.' });
    } catch (error) {
      console.error('[ERREUR] /join :', error.message);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  // 🚪 Quitter un live
  router.post('/leave', (req, res) => {
    const { liveId, username } = req.body;

    if (!liveId || !username) {
      return res.status(400).json({ message: 'liveId et username requis.' });
    }

    const live = activeLiveUsers.find((user) => user.userId === liveId);
    if (!live) return res.status(404).json({ message: 'Live introuvable.' });

    try {
      io.emit('user-left', { liveId, username });
      console.log(`[LIVE] ${username} a quitté le live de ${liveId}`);
      return res.status(200).json({ message: 'Live quitté.' });
    } catch (error) {
      console.error('[ERREUR] /leave :', error.message);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }
  });

  return router;
};
