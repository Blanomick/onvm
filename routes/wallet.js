const express = require('express');
const router = express.Router();
const db = require('../db');

// Vérifie si un utilisateur a un portefeuille, sinon en crée un
const ensureWalletExists = async (userId) => {
    try {
        const wallet = await db('wallet').where({ userId }).first();

        if (!wallet) {
            console.log(`[INFO] Aucun portefeuille trouvé pour l'utilisateur ID ${userId}, création en cours...`);

            await db('wallet').insert({ userId, balance: 0, lastUpdated: db.fn.now() });

            console.log(`[INFO] Portefeuille créé avec succès pour l'utilisateur ID ${userId}`);
        }
    } catch (err) {
        console.error('[ERREUR] Erreur lors de la vérification/création du portefeuille:', err.message);
        throw err;
    }
};

// Route **GET** : Obtenir le solde actuel du portefeuille d'un utilisateur
router.get('/:userId/balance', async (req, res) => {
    try {
        const { userId } = req.params;

        await ensureWalletExists(userId);

        const wallet = await db('wallet').select('balance').where({ userId }).first();

        console.log(`[LOG] Solde récupéré pour utilisateur ID ${userId} : ${wallet ? wallet.balance : 0}`);

        res.status(200).json({ balance: wallet ? wallet.balance : 0 });
    } catch (err) {
        console.error('[ERREUR] Erreur lors de la récupération du solde:', err.message);
        res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
});

// Route **POST** : Ajouter de l'argent au portefeuille d'un utilisateur (earn)
router.post('/earn', async (req, res) => {
    try {
        const { userId, amount } = req.body;

        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'User ID et montant valide requis.' });
        }

        await ensureWalletExists(userId);

        await db('wallet')
            .where({ userId })
            .update({ 
                balance: db.raw('balance + ?', [amount]), 
                lastUpdated: db.fn.now() 
            });

        await db('transactions').insert({
            userId,
            type: 'earn',
            amount,
            date: db.fn.now()
        });

        console.log(`[LOG] Monnaie ajoutée avec succès pour utilisateur ID ${userId} : +${amount}`);
        res.status(200).json({ message: 'Monnaie ajoutée avec succès' });

    } catch (err) {
        console.error('[ERREUR] Erreur lors de l\'ajout de monnaie:', err.message);
        res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
});

// Route **POST** : Dépenser de la monnaie (spend)
router.post('/spend', async (req, res) => {
    try {
        const { userId, amount } = req.body;

        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'User ID et montant valide requis.' });
        }

        await ensureWalletExists(userId);

        const wallet = await db('wallet').select('balance').where({ userId }).first();

        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({ error: 'Solde insuffisant' });
        }

        await db('wallet')
            .where({ userId })
            .update({ 
                balance: db.raw('balance - ?', [amount]), 
                lastUpdated: db.fn.now() 
            });

        await db('transactions').insert({
            userId,
            type: 'spend',
            amount,
            date: db.fn.now()
        });

        console.log(`[LOG] Monnaie dépensée pour utilisateur ID ${userId} : -${amount}`);
        res.status(200).json({ message: 'Monnaie dépensée avec succès' });

    } catch (err) {
        console.error('[ERREUR] Erreur lors de la dépense de monnaie:', err.message);
        res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
});

// 🔹 Route GET : Récupérer l'historique des transactions
router.get('/:userId/history', async (req, res) => {
    try {
        const { userId } = req.params;

        await ensureWalletExists(userId);

        const transactions = await db('transactions')
            .where({ userId })
            .orderBy('date', 'desc');

        console.log(`[LOG] ${transactions.length} transactions récupérées pour l'utilisateur ID ${userId}`);
        res.status(200).json({ transactions });

    } catch (error) {
        console.error('[ERREUR] Erreur interne lors de la récupération des transactions :', error);
        res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
});

module.exports = router;
