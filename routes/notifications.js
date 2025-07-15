const express = require("express");
const router = express.Router();
const db = require("../db");


// GET: Récupérer les notifications d’un utilisateur
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
  const notifications = await db('notifications')
  .where({ user_id: userId })
  .orderBy('created_at', 'desc');

    res.json(notifications);
  } catch (error) {
    console.error("Erreur récupération notifications :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


// POST: Créer une notification
router.post("/", async (req, res) => {
  try {
    const { userId, type, senderId, content } = req.body;
    await db.none(
      "INSERT INTO notifications (user_id, sender_id, type, content, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [userId, senderId, type, content]
    );
    res.status(201).json({ message: "Notification créée" });
  } catch (error) {
    console.error("Erreur création notification :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


// ✅ PUT: Marquer une notification comme lue
router.put("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await db('notifications')
      .where({ id })
     .update({ read: true });


    if (updated === 0) {
      return res.status(404).json({ message: "Notification non trouvée" });
    }

    res.status(200).json({ message: "Notification marquée comme lue" });
  } catch (error) {
    console.error("Erreur mise à jour notification :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});




module.exports = router;
