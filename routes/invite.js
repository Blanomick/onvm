const express = require('express');
const router = express.Router();
const { User } = require('../models'); // adapte selon ton ORM
const { makeReferralCode } = require('../utils/referral');

const APP_WEB_URL = process.env.APP_WEB_URL || 'http://localhost:3000';

// GET /api/users/:id/invite
router.get('/users/:id/invite', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.referral_code) {
      user.referral_code = makeReferralCode();
      await user.save();
    }

    const link = `${APP_WEB_URL}/signup?ref=${encodeURIComponent(user.referral_code)}`;
    return res.json({ code: user.referral_code, link });
  } catch (e) {
    console.error('[invite] error', e);
    res.status(500).json({ error: 'Erreur interne serveur' });
  }
});

module.exports = router;
