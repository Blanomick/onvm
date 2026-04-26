// backend/sockets/webrtc.js
module.exports = function attachWebRTCSockets(io) {
  io.on("connection", (socket) => {
    // Rejoindre/Quittter une room de chat
    socket.on("chat:join", ({ chatId }) => socket.join(`chat:${chatId}`));
    socket.on("chat:leave", ({ chatId }) => socket.leave(`chat:${chatId}`));

    // Messages temps réel (texte / media / notes vocales)
    socket.on("chat:message", ({ chatId, message }) => {
      socket.to(`chat:${chatId}`).emit("chat:message", message);
    });

    // --- Signaling WebRTC ---
    socket.on("webrtc:incoming-call", ({ chatId, type, fromUser }) => {
      socket.to(`chat:${chatId}`).emit("webrtc:incoming-call", { fromUser, type });
    });

    socket.on("webrtc:offer", ({ chatId, sdp, type }) => {
      socket.to(`chat:${chatId}`).emit("webrtc:offer", { sdp, type });
    });

    socket.on("webrtc:answer", ({ chatId, sdp }) => {
      socket.to(`chat:${chatId}`).emit("webrtc:answer", { sdp });
    });

    socket.on("webrtc:ice-candidate", ({ chatId, candidate }) => {
      socket.to(`chat:${chatId}`).emit("webrtc:ice-candidate", { candidate });
    });

    socket.on("webrtc:end", ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit("webrtc:end");
    });
  });
};
