const { customAlphabet } = require('nanoid');

// Génère un code de 10 caractères lisibles (sans i, l, o, 0, etc.)
const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);

function makeReferralCode() {
  return nanoid(); // Exemple : "B4Z7XWQ93N"
}

module.exports = { makeReferralCode };
