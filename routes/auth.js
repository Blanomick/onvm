const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); // Connexion à PostgreSQL
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "wgzfjViViKh1FxKH03Nx13qQO45Oenq89FZ8QB/WqTo";

// 🔹 Fonction pour créer un jeton JWT sécurisé
const createToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// 🔹 INSCRIPTION D'UN UTILISATEUR
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Tous les champs sont requis.' });
        }

        // Vérifier si l'utilisateur existe déjà
        const checkUser = await db('users')
            .where('email', email)
            .orWhere('username', username)
            .first();
            
        if (checkUser) {
            return res.status(400).json({ message: 'Cet email ou nom d’utilisateur existe déjà.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Insérer l'utilisateur
        const [newUser] = await db('users')
        .insert({
          username,
          email,
          password: hashedPassword,
          profilePicture: 'https://onvm.org/uploads/default-profile.png',
          bio: '',
          isAdmin: false
        })
        .returning(['id', 'username', 'email', 'profilePicture']);
      
        const token = createToken(newUser);
        res.status(201).json({ message: 'Utilisateur inscrit avec succès.', user: newUser, token });

    } catch (error) {
        console.error('[ERREUR] Inscription échouée :', error.stack);
        res.status(500).json({ message: 'Erreur serveur.', error: error.stack });
    }
});

// 🔹 CONNEXION D'UN UTILISATEUR
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email et mot de passe requis.' });
        }

        // Récupérer l'utilisateur
        const user = await db('users').where({ email }).first();
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mot de passe incorrect.' });
        }

        const token = createToken(user);
        delete user.password; // Supprimer le mot de passe avant d'envoyer la réponse

        res.status(200).json({ message: 'Connexion réussie.', user, token });

    } catch (error) {
        console.error("[ERREUR] Connexion échouée :", error);
        res.status(500).json({ message: 'Erreur serveur.', error: error.stack });
    }
});

// 🔹 MIDDLEWARE DE VÉRIFICATION DU TOKEN
const verifyToken = (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(403).json({ message: 'Accès refusé, jeton manquant.' });
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ message: 'Jeton invalide.' });
            }
            req.user = decoded;
            next();
        });

    } catch (error) {
        console.error("[ERREUR] Vérification du token échouée :", error);
        res.status(500).json({ message: 'Erreur serveur.', error: error.message });
    }
};

// 🔹 RÉCUPÉRATION DES INFORMATIONS DE L'UTILISATEUR CONNECTÉ
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await db('users')
            .select('id', 'username', 'email', 'profilePicture')
            .where({ id: req.user.id })
            .first();

        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error("[ERREUR] Erreur lors de la récupération de l'utilisateur :", error);
        res.status(500).json({ message: 'Erreur serveur.', error: error.message });
    }
});

// 🔹 RÉINITIALISATION DU MOT DE PASSE
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ message: 'Email et nouveau mot de passe requis.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updated = await db('users')
            .where({ email })
            .update({ password: hashedPassword })
            .returning(['id']);

        if (!updated || updated.length === 0) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        res.status(200).json({ message: 'Mot de passe mis à jour avec succès.' });

    } catch (error) {
        console.error("[ERREUR] Erreur lors de la réinitialisation du mot de passe :", error);
        res.status(500).json({ message: 'Erreur serveur.', error: error.message });
    }
});

// 🔹 EXPORT DU ROUTEUR
module.exports = router;
