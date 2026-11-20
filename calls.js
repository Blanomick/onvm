// backend/calls.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

module.exports = function installCalls(io, db, push) {
  const namespace = io.of("/calls");
  const calls = new Map();
  const busy = new Map();

  const room = (id) => `user:${id}`;

  function iceServers(userId) {
    const servers = [{ urls: "stun:stun.l.google.com:19302" }];

    // Configuration d’un serveur coturn avec identifiants temporaires.
    const urls = (process.env.TURN_URLS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (urls.length && process.env.TURN_SECRET) {
      const expires = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
      const username = `${expires}:${userId}`;
      const credential = crypto
        .createHmac("sha1", process.env.TURN_SECRET)
        .update(username)
        .digest("base64");

      servers.push({ urls, username, credential });
    }

    return servers;
  }

  function finish(call, reason) {
    if (!call || calls.get(call.id) !== call) return;

    clearTimeout(call.timer);
    calls.delete(call.id);

    if (busy.get(call.from) === call.id) busy.delete(call.from);
    if (busy.get(call.to) === call.id) busy.delete(call.to);

    namespace
      .to(room(call.from))
      .to(room(call.to))
      .emit("call:ended", { callId: call.id, reason });

    // Arrête la sonnerie sur le téléphone du destinataire
    if (push && call.state === "ringing") {
      push
        .sendToUser(call.to, {
          type: "call-end",
          callId: call.id,
          reason,
          title: call.peer?.username || "ONVM",
          body:
            reason === "no-answer" || reason === "disconnected"
              ? `Appel ${call.type === "video" ? "vidéo" : "vocal"} manqué`
              : "Appel terminé",
          url: call.conversationId ? `/chat/${call.conversationId}` : "/conversations",
          tag: `call-${call.id}`,
          ttl: 3600,
        })
        .catch(() => {});
    }
  }

  function participant(socket, call) {
    return (
      call &&
      (socket.data.user.id === call.from ||
        socket.data.user.id === call.to)
    );
  }

  namespace.use(async (socket, next) => {
    try {
      if (!process.env.JWT_SECRET) throw new Error("Secret JWT absent");

      const payload = jwt.verify(
        socket.handshake.auth?.token,
        process.env.JWT_SECRET
      );

      const user = await db("users")
        .select("id", "username", "profilePicture")
        .where({ id: payload.id })
        .first();

      if (!user) throw new Error("Utilisateur absent");

      socket.data.user = { ...user, id: Number(user.id) };
      next();
    } catch {
      next(new Error("Session expirée. Reconnecte-toi pour appeler."));
    }
  });

  namespace.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(room(user.id));

    // Appli ouverte depuis la notification : on renvoie l'appel qui sonne encore
    const pending = calls.get(busy.get(user.id));
    if (pending && pending.state === "ringing" && pending.to === user.id) {
      socket.emit("call:incoming", {
        callId: pending.id,
        conversationId: pending.conversationId,
        type: pending.type,
        peer: pending.peer,
      });
    }

    socket.on("call:config", (_, ack) => {
      if (typeof ack === "function") {
        ack({ ok: true, iceServers: iceServers(user.id) });
      }
    });

    let starting = false;

    socket.on("call:start", async (data, ack) => {
      if (typeof ack !== "function") return;

      if (starting) {
        return ack({ ok: false, error: "Une demande est déjà en cours." });
      }

      starting = true;

      try {
        const conversationId = Number(data?.conversationId);
        const callId = data?.callId;
        const type = data?.type;

        if (
          !Number.isInteger(conversationId) ||
          conversationId <= 0 ||
          !["audio", "video"].includes(type) ||
          typeof callId !== "string" ||
          !/^[a-zA-Z0-9-]{12,80}$/.test(callId)
        ) {
          throw new Error("Demande d’appel invalide.");
        }

        const conversation = await db("conversations")
          .where({ id: conversationId })
          .first();

        const members = conversation
          ? [Number(conversation.sender_id), Number(conversation.receiver_id)]
          : [];

        if (!members.includes(user.id)) {
          throw new Error("Cette conversation ne t’appartient pas.");
        }

        const otherId = members.find((id) => id !== user.id);
        if (!otherId) throw new Error("Destinataire invalide.");

        const other = await db("users")
          .select("id", "username", "profilePicture")
          .where({ id: otherId })
          .first();

        // Recontrôle après les opérations asynchrones.
        if (!socket.connected) return;
        if (!other) throw new Error("Destinataire introuvable.");
        if (calls.has(callId)) throw new Error("Identifiant déjà utilisé.");

        if (busy.has(user.id) || busy.has(otherId)) {
          throw new Error("Un des participants est déjà en appel.");
        }

        const call = {
          id: callId,
          from: user.id,
          to: otherId,
          callerSocket: socket.id,
          calleeSocket: null,
          state: "ringing",
          type,
          conversationId,
          peer: user,
        };

        calls.set(callId, call);
        busy.set(user.id, callId);
        busy.set(otherId, callId);

        call.timer = setTimeout(() => finish(call, "no-answer"), 45000);

        namespace.to(room(otherId)).emit("call:incoming", {
          callId,
          conversationId,
          type,
          peer: user,
        });

        // Fait sonner le téléphone même si l'appli est fermée
        if (push) {
          push
            .sendToUser(otherId, {
              type: "call",
              callId,
              callType: type,
              conversationId,
              title: user.username || "ONVM",
              body: type === "video" ? "📹 Appel vidéo entrant…" : "📞 Appel vocal entrant…",
              icon: /^https:/.test(user.profilePicture || "") ? user.profilePicture : undefined,
              url: `/conversations?call=${callId}`,
              answerUrl: `/conversations?answer=${callId}`,
              userId: otherId,
              sig: push.declineSignature(callId, otherId),
              tag: `call-${callId}`,
              ttl: 45,
            })
            .catch(() => {});
        }

        ack({ ok: true, peer: other });
      } catch (error) {
        ack({ ok: false, error: error.message });
      } finally {
        starting = false;
      }
    });

    socket.on("call:accept", ({ callId } = {}, ack) => {
      if (typeof ack !== "function") return;

      const call = calls.get(callId);

      if (
        !call ||
        call.to !== user.id ||
        call.state !== "ringing"
      ) {
        return ack({ ok: false, error: "Cet appel n’est plus disponible." });
      }

      call.calleeSocket = socket.id;
      call.state = "accepted";

      clearTimeout(call.timer);
      call.timer = setTimeout(() => finish(call, "connection-failed"), 45000);

      // Les autres onglets du destinataire cessent de sonner.
      socket.to(room(user.id)).emit("call:answered-elsewhere", { callId });

      ack({ ok: true });

      namespace.to(call.callerSocket).emit("call:accepted", { callId });
    });

    socket.on("call:signal", ({ callId, description, candidate } = {}) => {
      const call = calls.get(callId);
      if (!call || call.state !== "accepted") return;

      const caller = socket.id === call.callerSocket;
      const callee = socket.id === call.calleeSocket;
      if (!caller && !callee) return;

      if (description) {
        if (
          (caller && description.type !== "offer") ||
          (callee && description.type !== "answer") ||
          typeof description.sdp !== "string" ||
          description.sdp.length > 100000
        ) {
          return;
        }
      } else if (
        !candidate ||
        typeof candidate.candidate !== "string" ||
        candidate.candidate.length > 10000
      ) {
        return;
      }

      namespace
        .to(caller ? call.calleeSocket : call.callerSocket)
        .emit("call:signal", { callId, description, candidate });
    });

    socket.on("call:connected", ({ callId } = {}) => {
      const call = calls.get(callId);

      if (
        call?.state === "accepted" &&
        [call.callerSocket, call.calleeSocket].includes(socket.id)
      ) {
        call.connected = call.connected || new Set();
        call.connected.add(socket.id);

        if (call.connected.size === 2) clearTimeout(call.timer);
      }
    });

    socket.on("call:end", ({ callId, reason } = {}) => {
      const call = calls.get(callId);
      if (!participant(socket, call)) return;

      const ownsDevice =
        socket.id === call.callerSocket ||
        socket.id === call.calleeSocket;

      const canDecline =
        call.state === "ringing" && user.id === call.to;

      if (ownsDevice || canDecline) {
        finish(call, reason === "declined" ? "declined" : "ended");
      }
    });

    socket.on("disconnect", () => {
      const call = calls.get(busy.get(user.id));
      if (!call) return;

      // Le destinataire hors ligne n'arrête plus l'appel :
      // son téléphone sonne par notification jusqu'à 45 s.
      if (
        socket.id === call.callerSocket ||
        socket.id === call.calleeSocket
      ) {
        finish(call, "disconnected");
      }
    });
  });

  return {
    decline(callId, userId) {
      const call = calls.get(callId);
      if (call && call.state === "ringing" && call.to === userId) {
        finish(call, "declined");
      }
    },
  };
};
