const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

// Générer un code unique
const generateReferralCode = () => crypto.randomBytes(4).toString('hex');

// Route pour générer le lien d’invitation de l’utilisateur
router.get('/generate-link/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Vérifie si un code existe déjà
    const user = await db('users').where({ id: userId }).first();

    if (user.referral_code) {
      return res.json({ referralLink: `https://onvm.org/invite/${user.referral_code}` });
    }

    // Sinon, on en crée un
    const code = generateReferralCode();

    await db('users').where({ id: userId }).update({ referral_code: code });

    res.json({ referralLink: `https://onvm.org/invite/${code}` });
  } catch (err) {
    console.error('[ERREUR] Génération de lien :', err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Route pour retrouver un utilisateur via le code
router.get('/who-invited/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const user = await db('users').where({ referral_code: code }).first();
    if (!user) return res.status(404).json({ message: "Code invalide" });

    res.json({ invitedBy: { id: user.id, username: user.username, profilePicture: user.profilePicture } });
  } catch (err) {
    console.error('[ERREUR] Recherche parrain :', err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
