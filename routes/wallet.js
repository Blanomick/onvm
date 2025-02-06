const express = require('express');
const router = express.Router();
const db = require('../db');

// Vérifie si un utilisateur a un portefeuille, sinon en crée un
const ensureWalletExists = (userId, callback) => {
    const checkQuery = `SELECT balance FROM wallet WHERE userId = ?`;

    db.get(checkQuery, [userId], (err, row) => {
        if (err) {
            console.error('[ERREUR] Erreur lors de la vérification du portefeuille:', err.message);
            return callback(err);
        }

        if (!row) {
            console.log(`[INFO] Aucun portefeuille trouvé pour l'utilisateur ID ${userId}, création en cours...`);

            const createQuery = `INSERT INTO wallet (userId, balance) VALUES (?, 0)`;
            db.run(createQuery, [userId], function (err) {
                if (err) {
                    console.error('[ERREUR] Erreur lors de la création du portefeuille:', err.message);
                    return callback(err);
                }
                console.log(`[INFO] Portefeuille créé avec succès pour l'utilisateur ID ${userId}`);
                callback(null);
            });
        } else {
            callback(null);
        }
    });
};

// Route **GET** : Obtenir le solde actuel du portefeuille d'un utilisateur
router.get('/:userId/balance', (req, res) => {
    const { userId } = req.params;

    ensureWalletExists(userId, (err) => {
        if (err) return res.status(500).json({ error: 'Erreur interne du serveur.' });

        const query = `SELECT balance FROM wallet WHERE userId = ?`;
        db.get(query, [userId], (err, row) => {
            if (err) {
                console.error('[ERREUR] Problème de récupération du solde:', err.message);
                return res.status(500).json({ error: 'Erreur lors de la récupération du solde' });
            }

            console.log(`[LOG] Solde récupéré pour utilisateur ID ${userId} : ${row ? row.balance : 0}`);
            res.status(200).json({ balance: row ? row.balance : 0 });
        });
    });
});

// Route **POST** : Ajouter de l'argent au portefeuille d'un utilisateur (earn)
router.post('/earn', (req, res) => {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'User ID et montant valide requis.' });
    }

    ensureWalletExists(userId, (err) => {
        if (err) return res.status(500).json({ error: 'Erreur interne du serveur.' });

        const updateBalanceQuery = `
            UPDATE wallet SET balance = balance + ?, lastUpdated = CURRENT_TIMESTAMP WHERE userId = ?
        `;

        db.run(updateBalanceQuery, [amount, userId], function (err) {
            if (err) {
                console.error('[ERREUR] Erreur lors de l\'ajout de monnaie:', err.message);
                return res.status(500).json({ error: 'Erreur lors de la mise à jour du solde' });
            }

            const insertTransactionQuery = `
                INSERT INTO transactions (userId, type, amount, date) VALUES (?, 'earn', ?, CURRENT_TIMESTAMP)
            `;

            db.run(insertTransactionQuery, [userId, amount], function (err) {
                if (err) {
                    console.error('[ERREUR] Erreur lors de l\'enregistrement de la transaction:', err.message);
                    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la transaction' });
                }

                console.log(`[LOG] Monnaie ajoutée avec succès pour utilisateur ID ${userId} : +${amount}`);
                res.status(200).json({ message: 'Monnaie ajoutée avec succès' });
            });
        });
    });
});

// Route **POST** : Dépenser de la monnaie (spend)
router.post('/spend', (req, res) => {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ error: 'User ID et montant valide requis.' });
    }

    ensureWalletExists(userId, (err) => {
        if (err) return res.status(500).json({ error: 'Erreur interne du serveur.' });

        const checkBalanceQuery = `SELECT balance FROM wallet WHERE userId = ?`;

        db.get(checkBalanceQuery, [userId], (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors de la vérification du solde' });
            }

            if (!row || row.balance < amount) {
                return res.status(400).json({ error: 'Solde insuffisant' });
            }

            const updateBalanceQuery = `
                UPDATE wallet SET balance = balance - ?, lastUpdated = CURRENT_TIMESTAMP WHERE userId = ?
            `;

            db.run(updateBalanceQuery, [amount, userId], function (err) {
                if (err) {
                    return res.status(500).json({ error: 'Erreur lors de la mise à jour du solde' });
                }

                const insertTransactionQuery = `
                    INSERT INTO transactions (userId, type, amount, date) VALUES (?, 'spend', ?, CURRENT_TIMESTAMP)
                `;

                db.run(insertTransactionQuery, [userId, amount], function (err) {
                    if (err) {
                        return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la transaction' });
                    }

                    console.log(`[LOG] Monnaie dépensée pour utilisateur ID ${userId} : -${amount}`);
                    res.status(200).json({ message: 'Monnaie dépensée avec succès' });
                });
            });
        });
    });
});

// Route **GET** : Récupérer l'historique des transactions
router.get('/:userId/history', (req, res) => {
    const { userId } = req.params;

    ensureWalletExists(userId, (err) => {
        if (err) return res.status(500).json({ error: 'Erreur interne du serveur.' });

        const query = `SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC`;

        db.all(query, [userId], (err, rows) => {
            if (err) {
                console.error('[ERREUR] Problème lors de la récupération de l\'historique:', err.message);
                return res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
            }

            console.log(`[LOG] Historique des transactions récupéré pour utilisateur ID ${userId}`);
            res.status(200).json({ transactions: rows });
        });
    });
});

module.exports = router;
