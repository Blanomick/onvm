const express = require('express');
const bcrypt = require('bcrypt');

const jwt = require('jsonwebtoken');
const db = require('../db'); // Import de la connexion PostgreSQL

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'onvm_secret_key'; // Clé secrète pour JWT

// Liste des emails d'administrateurs autorisés
const adminEmails = ['mamboisrael3@gmail.com', 'kingxmambo@gmail.com'];

/**
 * Route POST pour l'authentification administrateur
 */
router.post('/admin-auth', async (req, res) => {
    const { email, password } = req.body;

    console.log(`[LOG] Tentative de connexion admin pour : ${email}`);

    try {
        // Vérifier si l'email fait partie des administrateurs autorisés
        if (!adminEmails.includes(email)) {
            console.error(`[ERREUR] Accès refusé pour : ${email}`);
            return res.status(403).json({ message: "Vous n'êtes pas autorisé à accéder à l'administration." });
        }

        // Vérifier si l'admin existe dans la base de données
        const admin = await db('users').where({ email }).first();

        if (!admin || !admin.isAdmin) {
            console.error(`[ERREUR] Administrateur non trouvé pour : ${email}`);
            return res.status(400).json({ message: "Administrateur non trouvé." });
        }

        // Vérifier si le mot de passe est correct
        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            console.error(`[ERREUR] Mot de passe incorrect pour : ${email}`);
            return res.status(400).json({ message: "Mot de passe incorrect." });
        }

        // Générer un token JWT
        const token = jwt.sign({ id: admin.id, email: admin.email, isAdmin: true }, JWT_SECRET, { expiresIn: '7d' });

        console.log(`[LOG] Connexion réussie pour l'admin : ${email}`);
        res.json({ message: "Connexion réussie", token, isAdmin: true });

    } catch (error) {
        console.error(`[ERREUR] Problème lors de la connexion admin : ${error.message}`);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

/**
 * Middleware pour vérifier le token d'un administrateur
 */
const verifyAdminToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(403).json({ message: "Accès refusé, token manquant." });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err || !decoded.isAdmin) {
            return res.status(401).json({ message: "Token invalide ou accès non autorisé." });
        }
        req.admin = decoded;
        next();
    });
};

/**
 * Route GET pour récupérer les informations de l'admin connecté
 */
router.get('/me', verifyAdminToken, async (req, res) => {
    try {
        const admin = await db('users')
            .where({ id: req.admin.id, isAdmin: true })
            .select('id', 'username', 'email')
            .first();

        if (!admin) {
            return res.status(404).json({ message: "Administrateur non trouvé." });
        }

        res.status(200).json(admin);
    } catch (error) {
        console.error(`[ERREUR] Impossible de récupérer les infos admin : ${error.message}`);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

module.exports = router;
