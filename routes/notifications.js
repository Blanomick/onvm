const express = require("express");
const router = express.Router();
const db = require("../db");


// GET: Récupérer les notifications d’un utilisateur
 router.get("/:userId", async (req, res) => {
  try {
    const notifications = await db("notifications as n")
      .leftJoin("users as actor", "actor.id", "n.actor_id")
      .select(
        "n.*",
        "actor.username as actor_username",
        "actor.profilePicture as actor_photo"
      )
      .where("n.user_id", req.params.userId)
      .orderBy("n.created_at", "desc")
      .orderBy("n.id", "desc")
      .limit(100);

    // Retrouver les conversations des anciens messages :
    // leurs notifications ne contiennent pas forcément conversation_id.
    const messageIds = notifications
      .filter((n) => n.type === "message" && n.entity_id)
      .map((n) => n.entity_id);

    const messages = messageIds.length
      ? await db("messages")
          .whereIn("id", messageIds)
          .select("id", "conversation_id", "group_id")
      : [];

    const messageById = new Map(
      messages.map((message) => [String(message.id), message])
    );

    const result = notifications.map((n) => {
      const metadata = n.metadata || {};
      let target = null;

      if (n.type === "message") {
        const message = messageById.get(String(n.entity_id));
        const groupId = message?.group_id;
        const conversationId =
          message?.conversation_id || metadata.conversation_id;

        target = groupId
          ? `/chat/group/${groupId}`
          : conversationId
            ? `/chat/${conversationId}`
            : "/conversations";
      } else if (
        [
          "like_publication",
          "comment_publication",
          "retweet_publication",
        ].includes(n.type)
      ) {
        const publicationId =
          metadata.publication_id ||
          (n.entity_type === "publication" ? n.entity_id : null);

        target = publicationId
          ? `/publication?post=${publicationId}`
          : "/publication";
      } else if (
        ["like_story", "comment_story"].includes(n.type)
      ) {
        target = n.entity_id ? `/story/${n.entity_id}` : "/publication";
      }

      return { ...n, target };
    });

    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    console.error("[NOTIFICATIONS] Chargement :", error);
    res.status(500).json({
      message: "Impossible de charger les notifications.",
    });
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
     .update({ is_read: true });


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
