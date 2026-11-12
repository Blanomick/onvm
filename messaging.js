const jwt = require("jsonwebtoken");

module.exports = async function installMessaging(io, db) {
  // Une lecture par message et par utilisateur.
  await db.raw(`
    CREATE TABLE IF NOT EXISTS message_receipts (
      message_id INTEGER NOT NULL
        REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id, user_id)
    )
  `);

  const namespace = io.of("/messaging");

  namespace.use(async (socket, next) => {
    try {
      if (!process.env.JWT_SECRET) {
        throw new Error("Configuration absente.");
      }

      const payload = jwt.verify(
        socket.handshake.auth?.token,
        process.env.JWT_SECRET,
        { algorithms: ["HS256"] }
      );

      const userId = Number(payload.id);

      if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Identité invalide.");
      }

      const user = await db("users")
        .where({ id: userId })
        .select("id")
        .first();

      if (!user) {
        throw new Error("Compte introuvable.");
      }

      socket.data.userId = userId;
      socket.data.expiresAt = payload.exp
        ? payload.exp * 1000
        : null;

      next();
    } catch {
      next(new Error("Session expirée. Reconnecte-toi."));
    }
  });

  function parseTarget(data) {
    const id = Number(data?.id);
    const type = data?.type;

    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !["private", "group"].includes(type)
    ) {
      throw new Error("Discussion invalide.");
    }

    return {
      id,
      type,
      column: type === "group" ? "group_id" : "conversation_id",
    };
  }

  function parseMessageIds(values) {
    if (!Array.isArray(values) || values.length > 200) {
      throw new Error("Liste de messages invalide.");
    }

    const ids = [...new Set(values.map(Number))];

    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error("Identifiant de message invalide.");
    }

    return ids;
  }

  async function checkAccess(target, userId) {
    if (target.type === "private") {
      const conversation = await db("conversations")
        .where({ id: target.id })
        .first();

      if (
        !conversation ||
        ![
          Number(conversation.sender_id),
          Number(conversation.receiver_id),
        ].includes(userId)
      ) {
        throw new Error("Accès à cette conversation refusé.");
      }

      return [...new Set([
        Number(conversation.sender_id),
        Number(conversation.receiver_id),
      ])];
    }

    const group = await db("groups")
      .where({ id: target.id })
      .first();

    if (!group) {
      throw new Error("Groupe introuvable.");
    }

    const memberships = await db("group_members")
      .where({ group_id: target.id })
      .select("user_id");

    const memberIds = [...new Set([
      Number(group.created_by),
      ...memberships.map((member) => Number(member.user_id)),
    ])].filter((id) => Number.isSafeInteger(id) && id > 0);

    if (!memberIds.includes(userId)) {
      throw new Error("Tu ne fais pas partie de ce groupe.");
    }

    return memberIds;
  }

  function checkSession(socket) {
    if (
      socket.data.expiresAt &&
      Date.now() >= socket.data.expiresAt
    ) {
      throw new Error("Session expirée. Reconnecte-toi.");
    }
  }

  namespace.on("connection", (socket) => {
    const userId = socket.data.userId;

    // Une session expirée ne doit pas rester affichée en ligne.
    const expiryTimer = socket.data.expiresAt
      ? setTimeout(
          () => socket.disconnect(true),
          Math.max(0, socket.data.expiresAt - Date.now())
        )
      : null;

    socket.on("disconnect", () => {
      if (expiryTimer) clearTimeout(expiryTimer);
    });

    socket.on("chat:status", async (data, ack) => {
      if (typeof ack !== "function") return;

      try {
        checkSession(socket);

        const target = parseTarget(data);
        const messageIds = parseMessageIds(data.messageIds || []);
        const memberIds = await checkAccess(target, userId);

        const receipts = messageIds.length
          ? await db("message_receipts as r")
              .join("messages as m", "m.id", "r.message_id")
              .join("users as u", "u.id", "r.user_id")
              .where(`m.${target.column}`, target.id)
              .whereIn("m.id", messageIds)
              .select(
                "r.message_id",
                "r.user_id",
                "r.read_at",
                "u.username"
              )
          : [];

        // Plusieurs onglets/appareils peuvent appartenir au même utilisateur.
        const connectedSockets = await namespace.fetchSockets();

        const connectedIds = new Set(
          connectedSockets
            .filter(
              (item) =>
                !item.data.expiresAt ||
                item.data.expiresAt > Date.now()
            )
            .map((item) => Number(item.data.userId))
        );

        const readers = {};

        for (const receipt of receipts) {
          const key = String(receipt.message_id);

          if (!readers[key]) readers[key] = [];

          readers[key].push({
            id: receipt.user_id,
            username: receipt.username,
            read_at: receipt.read_at,
          });
        }

        ack({
          ok: true,
          readers,
          onlineUserIds: memberIds.filter((id) => connectedIds.has(id)),
        });
      } catch (error) {
        ack({
          ok: false,
          error: error.message || "Actualisation impossible.",
        });
      }
    });

    socket.on("chat:read", async (data, ack) => {
      if (typeof ack !== "function") return;

      try {
        checkSession(socket);

        const target = parseTarget(data);
        const requestedIds = parseMessageIds(data.messageIds || []);

        await checkAccess(target, userId);

        // On ne marque que les messages de cette discussion,
        // envoyés par quelqu’un d’autre.
        const messages = requestedIds.length
          ? await db("messages")
              .where(target.column, target.id)
              .whereIn("id", requestedIds)
              .whereNot("user_id", userId)
              .select("id")
          : [];

        const messageIds = messages.map((message) => message.id);

        if (messageIds.length) {
          await db.transaction(async (trx) => {
            await trx("message_receipts")
              .insert(
                messageIds.map((messageId) => ({
                  message_id: messageId,
                  user_id: userId,
                }))
              )
              .onConflict(["message_id", "user_id"])
              .ignore();

            // Compatibilité avec le champ existant, uniquement en privé.
            if (target.type === "private") {
              await trx("messages")
                .whereIn("id", messageIds)
                .update({ is_read: true });
            }
          });
        }

        ack({ ok: true, messageIds });
      } catch (error) {
        ack({
          ok: false,
          error: error.message || "Lecture non enregistrée.",
        });
      }
    });
  });
};