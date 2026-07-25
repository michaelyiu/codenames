import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import {
  createRoom,
  getRoom,
  findPlayerRoom,
  addPlayer,
  markDisconnected,
  removePlayer,
  deleteRoomIfEmpty,
  setTeam,
  setSettings,
  randomizeTeams,
  randomizeSpymasters,
  setSpymaster,
  claimSpymaster,
  startGame,
  giveClue,
  revealCard,
  endTurn,
  resetGame,
  viewState,
  selectCard,
  devCreateSoloRoom,
  devSetMe,
  forceEndTurn,
  getAllRooms,
} from "./rooms.js";

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_ORIGIN } });

/**
 * Identity bookkeeping.
 *  - socketBindings: socketId -> { playerId, roomCode }
 *  - roomPlayerSockets: Map<roomCode, Map<playerId, socketId>>
 *
 * The socketId is ephemeral; the playerId comes from the client's localStorage
 * via socket.handshake.auth.playerId and is stable across refreshes.
 */
const socketBindings = new Map();
const roomPlayerSockets = new Map();

function getPlayerId(socket) {
  // Trust the client-supplied playerId. It's not a security boundary; it just
  // lets the same browser re-attach to its existing player record.
  const id = socket.handshake?.auth?.playerId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function bindSocket(socket, room, playerId) {
  // If this socket was previously bound elsewhere, clean that up first.
  unbindSocket(socket.id);
  socketBindings.set(socket.id, { playerId, roomCode: room.code });
  let map = roomPlayerSockets.get(room.code);
  if (!map) {
    map = new Map();
    roomPlayerSockets.set(room.code, map);
  }
  // If the same playerId is already bound to another socket (another tab or a
  // stale connection), evict the old one — latest tab wins.
  const existingSocketId = map.get(playerId);
  if (existingSocketId && existingSocketId !== socket.id) {
    socketBindings.delete(existingSocketId);
    const stale = io.sockets.sockets.get(existingSocketId);
    if (stale) stale.disconnect(true);
  }
  map.set(playerId, socket.id);
  socket.join(room.code);
}

function unbindSocket(socketId) {
  const binding = socketBindings.get(socketId);
  if (!binding) return null;
  socketBindings.delete(socketId);
  const map = roomPlayerSockets.get(binding.roomCode);
  if (map && map.get(binding.playerId) === socketId) {
    map.delete(binding.playerId);
  }
  return binding;
}

function ctx(socket) {
  const binding = socketBindings.get(socket.id);
  if (!binding) return { room: null, playerId: null };
  return {
    room: getRoom(binding.roomCode),
    playerId: binding.playerId,
  };
}

function broadcast(room) {
  if (!room) return;
  const map = roomPlayerSockets.get(room.code);
  if (!map) return;
  for (const playerId of Object.keys(room.players)) {
    const socketId = map.get(playerId);
    if (!socketId) continue; // bot or disconnected
    io.to(socketId).emit("room:state", viewState(room, playerId));
  }
}

io.on("connection", (socket) => {
  const playerId = getPlayerId(socket);
  if (!playerId) {
    socket.emit("server:error", { error: "Missing playerId" });
    socket.disconnect(true);
    return;
  }

  socket.on("room:check", (_p, ack) => {
    const existing = findPlayerRoom(playerId);
    if (existing && existing.phase === "playing") {
      return ack && ack({ activeRoom: existing.code });
    }
    ack && ack({ activeRoom: null });
  });

  socket.on("room:create", ({ name }, ack) => {
    // If already in an active game, redirect back
    const existing = findPlayerRoom(playerId);
    if (existing && existing.phase === "playing") {
      bindSocket(socket, existing, playerId);
      ack && ack({ ok: true, code: existing.code, rejoin: true });
      broadcast(existing);
      return;
    }
    // If in a non-active room (lobby/ended), leave it first
    if (existing) {
      removePlayer(existing, playerId);
      if (!deleteRoomIfEmpty(existing)) broadcast(existing);
    }
    const room = createRoom(playerId, name);
    bindSocket(socket, room, playerId);
    ack && ack({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on("room:join", ({ code, name }, ack) => {
    // If already in an active game in a DIFFERENT room, redirect back
    const existing = findPlayerRoom(playerId);
    if (
      existing &&
      existing.phase === "playing" &&
      existing.code !== code.toUpperCase()
    ) {
      bindSocket(socket, existing, playerId);
      ack && ack({ ok: true, code: existing.code, rejoin: true });
      broadcast(existing);
      return;
    }
    // If in a non-active different room, leave it first
    if (existing && existing.code !== code.toUpperCase()) {
      removePlayer(existing, playerId);
      if (!deleteRoomIfEmpty(existing)) broadcast(existing);
    }
    const room = getRoom(code);
    if (!room) return ack && ack({ error: "Room not found" });
    addPlayer(room, playerId, name);
    bindSocket(socket, room, playerId);
    ack && ack({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on("room:leave", () => {
    const { room, playerId: pid } = ctx(socket);
    if (!room || !pid) return;
    removePlayer(room, pid);
    unbindSocket(socket.id);
    socket.leave(room.code);
    if (!deleteRoomIfEmpty(room)) broadcast(room);
  });

  socket.on("team:choose", ({ team, role }, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = setTeam(room, pid, team, role);
    if (r?.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("team:randomize", () => {
    const { room } = ctx(socket);
    if (!room) return;
    randomizeTeams(room);
    broadcast(room);
  });

  socket.on("settings:update", ({ boardSize, turnTimer }, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = setSettings(room, pid, { boardSize, turnTimer });
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("spymaster:randomize", () => {
    const { room } = ctx(socket);
    if (!room) return;
    randomizeSpymasters(room);
    broadcast(room);
  });

  socket.on("spymaster:assign", ({ targetId }, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = setSpymaster(room, pid, targetId);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("spymaster:claim", (_p, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = claimSpymaster(room, pid);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("game:start", (_p, ack) => {
    const { room } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = startGame(room);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("clue:give", ({ word, count }, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = giveClue(room, pid, word, count);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("card:reveal", ({ index }, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = revealCard(room, pid, index);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("card:select", ({ index }, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = selectCard(room, pid, index);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("turn:end", (_p, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = endTurn(room, pid);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("game:reset", () => {
    const { room } = ctx(socket);
    if (!room) return;
    resetGame(room);
    broadcast(room);
  });

  // ---- DEV ----
  socket.on("dev:soloStart", ({ name }, ack) => {
    const existing = findPlayerRoom(playerId);
    if (existing && existing.phase === "playing") {
      bindSocket(socket, existing, playerId);
      ack && ack({ ok: true, code: existing.code, rejoin: true });
      broadcast(existing);
      return;
    }
    if (existing) {
      removePlayer(existing, playerId);
      if (!deleteRoomIfEmpty(existing)) broadcast(existing);
    }
    const room = devCreateSoloRoom(playerId, name);
    bindSocket(socket, room, playerId);
    ack && ack({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on("dev:setMe", ({ team, role }, ack) => {
    const { room, playerId: pid } = ctx(socket);
    if (!room) return ack && ack({ error: "No room" });
    const r = devSetMe(room, pid, team, role);
    if (r.error) return ack && ack(r);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const binding = unbindSocket(socket.id);
    if (!binding) return;
    const room = getRoom(binding.roomCode);
    if (!room) return;
    markDisconnected(room, binding.playerId);
    // Sweep: if no human is connected in 60s, drop the room.
    setTimeout(() => {
      const r = getRoom(binding.roomCode);
      if (!r) return;
      deleteRoomIfEmpty(r);
    }, 60_000);
    broadcast(room);
  });
});

server.listen(PORT, () => {
  console.log(`[codenames-server] listening on :${PORT}`);
});

// Timer tick: every second, check all active rooms for expired turn deadlines.
setInterval(() => {
  const now = Date.now();
  for (const room of getAllRooms().values()) {
    if (
      room.phase === "playing" &&
      room.game?.turnDeadline &&
      now >= room.game.turnDeadline
    ) {
      forceEndTurn(room);
      broadcast(room);
    }
  }
}, 1000);
