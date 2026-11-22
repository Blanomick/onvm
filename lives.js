// backend/lives.js — Lives vidéo ONVM
//
// La personne en direct envoie son image à chaque spectateur (WebRTC, via
// les relais Cloudflare si besoin). Simple et gratuit, mais limité par la
// connexion de celui qui diffuse : MAX_VIEWERS spectateurs en même temps.
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const MAX_VIEWERS = Number(process.env.LIVE_MAX_VIEWERS) || 20;

module.exports = function installLives(io, db, iceServers) {
  const namespace = io.of("/lives");
  const lives = new Map(); // id -> live

  const publicLive = (live) => ({
    id: live.id,
    title: live.title,
    host: live.host,
    startedAt: live.startedAt,
    viewers: live.viewers.size,
    likes: live.likes,
    full: live.viewers.size >= MAX_VIEWERS,
  });

  const list = () =>
    [...lives.values()]
      .filter((live) => live.hostSocket)
      .sort((a, b) => b.viewers.size - a.viewers.size || b.startedAt - a.startedAt)
      .map(publicLive);

  const broadcastList = () => namespace.emit("live:list", list());

  const stats = (live) =>
    namespace.to(`live:${live.id}`).emit("live:stats", {
      liveId: live.id,
      viewers: live.viewers.size,
      likes: live.likes,
    });

  function end(live, reason = "ended") {
    if (!lives.has(live.id)) return;
    clearTimeout(live.graceTimer);
    lives.delete(live.id);
    namespace.to(`live:${live.id}`).emit("live:ended", { liveId: live.id, reason });
    namespace.in(`live:${live.id}`).socketsLeave(`live:${live.id}`);
    broadcastList();
  }

  // Prévient les abonnés : « X est en direct »
  async function notifyFollowers(live) {
    try {
      const followers = await db("follows")
        .where({ followingId: live.host.id })
        .pluck("followerId");
      if (!followers.length) return;
      await db("notifications").insert(
        followers.map((followerId) => ({
          user_id: followerId,
          actor_id: live.host.id,
          type: "live",
          entity_type: "live",
          entity_id: Math.floor(live.startedAt / 1000),
          metadata: {
            actor_username: live.host.username,
            live_id: live.id,
            snippet: live.title,
          },
        }))
      );
    } catch (error) {
      console.warn("[LIVES] Notification abonnés :", error.message);
    }
  }

  namespace.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      const user = await db("users")
        .select("id", "username", "profilePicture")
        .where({ id: payload.id })
        .first();
      if (!user) throw new Error("absent");
      socket.data.user = { ...user, id: Number(user.id) };
      next();
    } catch {
      next(new Error("Session expirée. Reconnecte-toi."));
    }
  });

  namespace.on("connection", (socket) => {
    const user = socket.data.user;
    const reply = (ack) => (typeof ack === "function" ? ack : () => {});

    socket.on("live:config", async (_, ack) => {
      reply(ack)({ ok: true, iceServers: await iceServers(user.id), maxViewers: MAX_VIEWERS });
    });

    socket.on("live:list", (_, ack) => reply(ack)({ ok: true, lives: list() }));

    // Démarrer un live
    socket.on("live:start", ({ title } = {}, ack) => {
      // Un seul live à la fois par personne
      for (const live of lives.values()) {
        if (live.host.id === user.id) end(live, "replaced");
      }
      const live = {
        id: crypto.randomUUID(),
        title: String(title || "").trim().slice(0, 100) || `${user.username} est en direct`,
        host: { id: user.id, username: user.username, profilePicture: user.profilePicture },
        hostSocket: socket.id,
        startedAt: Date.now(),
        viewers: new Map(),
        likes: 0,
      };
      lives.set(live.id, live);
      socket.join(`live:${live.id}`);
      socket.data.hosting = live.id;
      reply(ack)({ ok: true, live: publicLive(live) });
      broadcastList();
      notifyFollowers(live);
    });

    // Le diffuseur revient après une coupure réseau
    socket.on("live:resume", ({ liveId } = {}, ack) => {
      const live = lives.get(liveId);
      if (!live || live.host.id !== user.id) return reply(ack)({ ok: false });
      clearTimeout(live.graceTimer);
      live.hostSocket = socket.id;
      socket.data.hosting = live.id;
      socket.join(`live:${live.id}`);
      reply(ack)({ ok: true, viewers: [...live.viewers.entries()].map(([id, v]) => ({ socketId: id, ...v })) });
      broadcastList();
    });

    // Regarder un live
    socket.on("live:join", ({ liveId } = {}, ack) => {
      const live = lives.get(liveId);
      if (!live) return reply(ack)({ ok: false, error: "Ce live est terminé." });
      if (live.host.id === user.id) return reply(ack)({ ok: false, error: "C’est ton propre live." });
      if (!live.viewers.has(socket.id) && live.viewers.size >= MAX_VIEWERS) {
        return reply(ack)({ ok: false, error: "Ce live est complet pour le moment, réessaie dans un instant." });
      }
      live.viewers.set(socket.id, { userId: user.id, username: user.username });
      socket.join(`live:${live.id}`);
      socket.data.watching = live.id;
      reply(ack)({ ok: true, live: publicLive(live) });
      namespace.to(live.hostSocket).emit("live:viewer-joined", {
        liveId: live.id,
        socketId: socket.id,
        username: user.username,
      });
      namespace.to(`live:${live.id}`).emit("live:chat", {
        liveId: live.id,
        system: true,
        text: `${user.username} a rejoint le live`,
        at: Date.now(),
      });
      stats(live);
      broadcastList();
    });

    function leave(liveId) {
      const live = lives.get(liveId);
      if (!live || !live.viewers.has(socket.id)) return;
      live.viewers.delete(socket.id);
      socket.leave(`live:${live.id}`);
      namespace.to(live.hostSocket).emit("live:viewer-left", { liveId: live.id, socketId: socket.id });
      stats(live);
      broadcastList();
    }

    socket.on("live:leave", ({ liveId } = {}) => leave(liveId));

    // Échange WebRTC entre le diffuseur et un spectateur
    socket.on("live:signal", ({ liveId, to, description, candidate } = {}) => {
      const live = lives.get(liveId);
      if (!live || !to) return;
      const fromHost = socket.id === live.hostSocket;
      const toHost = to === live.hostSocket;
      const isViewer = live.viewers.has(socket.id);
      if (!(fromHost && live.viewers.has(to)) && !(isViewer && toHost)) return;
      namespace.to(to).emit("live:signal", { liveId, from: socket.id, description, candidate });
    });

    // Commentaires et cœurs
    socket.on("live:chat", ({ liveId, text } = {}) => {
      const live = lives.get(liveId);
      const clean = String(text || "").trim().slice(0, 300);
      if (!live || !clean) return;
      if (socket.id !== live.hostSocket && !live.viewers.has(socket.id)) return;
      namespace.to(`live:${live.id}`).emit("live:chat", {
        liveId: live.id,
        userId: user.id,
        username: user.username,
        host: socket.id === live.hostSocket,
        text: clean,
        at: Date.now(),
      });
    });

    socket.on("live:like", ({ liveId } = {}) => {
      const live = lives.get(liveId);
      if (!live) return;
      live.likes += 1;
      namespace.to(`live:${live.id}`).emit("live:like", { liveId: live.id, likes: live.likes });
    });

    socket.on("live:end", ({ liveId } = {}) => {
      const live = lives.get(liveId);
      if (live && live.host.id === user.id) end(live);
    });

    socket.on("disconnect", () => {
      if (socket.data.watching) leave(socket.data.watching);
      const live = lives.get(socket.data.hosting);
      if (live && live.hostSocket === socket.id) {
        // 25 s pour revenir (réseau faible) avant de couper le live
        live.hostSocket = null;
        broadcastList();
        live.graceTimer = setTimeout(() => end(live, "host-left"), 25000);
      }
    });
  });

  return { list };
};
