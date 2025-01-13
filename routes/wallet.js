const express = require('express');
const router = express.Router();
const db = require('../db');

// Route pour obtenir le solde actuel du portefeuille d'un utilisateur
router.get('/:userId/balance', (req, res) => {
    const { userId } = req.params;

    const query = `SELECT balance FROM wallet WHERE userId = ?`;
    db.get(query, [userId], (err, row) => {
        if (err) {
            console.error('[ERREUR] Problème de récupération du solde:', err.message);
            return res.status(500).json({ error: 'Erreur lors de la récupération du solde' });
        }

        // Retourne un solde de zéro si aucun portefeuille n'est trouvé pour l'utilisateur
        if (!row) {
            console.warn(`[ALERTE] Aucun portefeuille trouvé pour l'utilisateur avec ID: ${userId}`);
            return res.status(200).json({ balance: 0 });
        }

        console.log(`[LOG] Solde récupéré pour l'utilisateur avec ID: ${userId} - Solde: ${row.balance}`);
        res.json({ balance: row.balance });
    });
});


// Route pour gagner de la monnaie
router.post('/earn', (req, res) => {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
        return res.status(400).json({ error: 'User ID et montant requis' });
    }

    const updateBalanceQuery = `
        UPDATE wallet
        SET balance = balance + ?, lastUpdated = CURRENT_TIMESTAMP
        WHERE userId = ?
    `;

    db.run(updateBalanceQuery, [amount, userId], function (err) {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la mise à jour du solde' });
        }

        const insertTransactionQuery = `
            INSERT INTO transactions (userId, type, amount)
            VALUES (?, 'earn', ?)
        `;

        db.run(insertTransactionQuery, [userId, amount], function (err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la transaction' });
            }

            res.json({ message: 'Monnaie ajoutée avec succès', newBalance: amount });
        });
    });
});

// Route pour dépenser de la monnaie
router.post('/spend', (req, res) => {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
        return res.status(400).json({ error: 'User ID et montant requis' });
    }

    const checkBalanceQuery = `SELECT balance FROM wallet WHERE userId = ?`;

    db.get(checkBalanceQuery, [userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la vérification du solde' });
        }

        if (row.balance < amount) {
            return res.status(400).json({ error: 'Solde insuffisant' });
        }

        const updateBalanceQuery = `
            UPDATE wallet
            SET balance = balance - ?, lastUpdated = CURRENT_TIMESTAMP
            WHERE userId = ?
        `;

        db.run(updateBalanceQuery, [amount, userId], function (err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors de la mise à jour du solde' });
            }

            const insertTransactionQuery = `
                INSERT INTO transactions (userId, type, amount)
                VALUES (?, 'spend', ?)
            `;

            db.run(insertTransactionQuery, [userId, amount], function (err) {
                if (err) {
                    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la transaction' });
                }

                res.json({ message: 'Monnaie dépensée avec succès', newBalance: row.balance - amount });
            });
        });
    });
});

// Route pour afficher l'historique des transactions
router.get('/:userId/history', (req, res) => {
    const { userId } = req.params;

    const query = `SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC`;

    db.all(query, [userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
        }

        res.json({ transactions: rows });
    });
});

module.exports = router;
