const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// Liste des emails d'administrateurs autorisés
const adminEmails = ['mamboisrael3@gmail.com', 'kingxmambo@gmail.com'];

// Simuler des administrateurs enregistrés avec des mots de passe hachés
const admins = [
    {
        email: 'admin1@example.com',
        password: bcrypt.hashSync('passwordAdmin1', 10),
    },
    {
        email: 'admin2@example.com',
        password: bcrypt.hashSync('passwordAdmin2', 10),
    },
];

// Route POST pour l'authentification administrateur
router.post('/admin-auth', async (req, res) => {
    const { email, password } = req.body;

    console.log(`[LOG] Tentative de connexion pour : ${email}`);

    // Vérification si l'email est dans la liste des emails autorisés
    if (!adminEmails.includes(email)) {
        console.error(`[ERREUR] L'email ${email} n'est pas autorisé.`);
        return res.status(403).json({ message: "Vous n'êtes pas autorisé à accéder à l'administration." });
    }

    // Recherche de l'administrateur dans la liste
    const admin = admins.find(a => a.email === email);

    if (!admin) {
        console.error(`[ERREUR] Administrateur non trouvé pour l'email : ${email}`);
        return res.status(400).json({ message: "Administrateur non trouvé." });
    }

    // Comparer le mot de passe
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
        console.error(`[ERREUR] Mot de passe incorrect pour l'email : ${email}`);
        return res.status(400).json({ message: "Mot de passe incorrect." });
    }

    console.log(`[LOG] Connexion réussie pour admin : ${email}`);
    res.json({ message: "Connexion réussie", isAdmin: true });
});

module.exports = router;
