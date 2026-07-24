import { customAlphabet } from "nanoid";
import { WORDS } from "./words.js";

const codeGen = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 4);

/** @type {Map<string, Room>} */
const rooms = new Map();

/** Find the room a player is currently in (if any). */
export function findPlayerRoom(playerId) {
  for (const room of rooms.values()) {
    if (room.players[playerId]) return room;
  }
  return null;
}

export function createRoom(hostPlayerId, hostName) {
  let code;
  do {
    code = codeGen();
  } while (rooms.has(code));

  const room = {
    code,
    hostId: hostPlayerId, // stable playerId
    players: {}, // playerId -> { id, name, team, role, connected }
    phase: "lobby", // 'lobby' | 'playing' | 'ended'
    game: null,
    log: [],
  };
  rooms.set(code, room);
  addPlayer(room, hostPlayerId, hostName);
  return room;
}

export function getRoom(code) {
  return rooms.get((code || "").toUpperCase());
}

export function deleteRoomIfEmpty(room) {
  if (!room) return false;
  const anyConnected = Object.values(room.players).some(
    (x) => x.connected && !x.isBot,
  );
  if (!anyConnected) {
    rooms.delete(room.code);
    return true;
  }
  return false;
}

/**
 * Add or reattach a player. If the playerId already exists, preserves their
 * team/role/etc and just marks them connected and updates their name.
 */
export function addPlayer(room, playerId, name) {
  const cleanName = (name || "Player").slice(0, 20);
  const existing = room.players[playerId];
  if (existing) {
    existing.connected = true;
    if (cleanName) existing.name = cleanName;
    return existing;
  }
  const player = {
    id: playerId,
    name: cleanName,
    team: null, // 'red' | 'blue'
    role: "operative", // 'spymaster' | 'operative'
    connected: true,
  };
  room.players[playerId] = player;
  return player;
}

/**
 * Mark a player disconnected. Records are preserved across phases so a refresh
 * can reattach with the same playerId. Host transfers if the host is the only
 * connected player and disconnects.
 */
export function markDisconnected(room, playerId) {
  const p = room.players[playerId];
  if (!p) return;
  p.connected = false;
  // If the host is now disconnected and someone else is connected, transfer host
  if (room.hostId === playerId) {
    const nextHost = Object.values(room.players).find(
      (x) => x.connected && !x.isBot,
    );
    if (nextHost) room.hostId = nextHost.id;
  }
}

/** Permanently remove a player (e.g. they hit "Leave"). */
export function removePlayer(room, playerId) {
  const p = room.players[playerId];
  if (!p) return;
  delete room.players[playerId];
  if (room.hostId === playerId) {
    const next = Object.values(room.players).find((x) => !x.isBot);
    if (next) room.hostId = next.id;
  }
  // Clear any selection they had
  if (room.game?.selections) delete room.game.selections[playerId];
}

export function setTeam(room, playerId, team) {
  const p = room.players[playerId];
  if (!p) return;
  if (team !== "red" && team !== "blue" && team !== null) return;
  p.team = team;
  // If they leave a team mid-lobby, drop spymaster role
  if (team === null) p.role = "operative";
}

export function randomizeTeams(room) {
  if (room.phase !== "lobby") return;
  const ids = Object.keys(room.players);
  shuffle(ids);
  ids.forEach((id, i) => {
    room.players[id].team = i % 2 === 0 ? "red" : "blue";
    room.players[id].role = "operative";
  });
}

export function randomizeSpymasters(room) {
  if (room.phase !== "lobby") return;
  // Reset all to operative first
  for (const p of Object.values(room.players)) p.role = "operative";
  for (const team of ["red", "blue"]) {
    const teamPlayers = Object.values(room.players).filter(
      (p) => p.team === team,
    );
    if (teamPlayers.length === 0) continue;
    const pick = teamPlayers[Math.floor(Math.random() * teamPlayers.length)];
    pick.role = "spymaster";
  }
}

export function startGame(room) {
  if (room.phase !== "lobby") return { error: "Game already started" };
  // Need at least 2 per team and 1 spymaster per team
  const red = Object.values(room.players).filter((p) => p.team === "red");
  const blue = Object.values(room.players).filter((p) => p.team === "blue");
  if (red.length < 2 || blue.length < 2) {
    return { error: "Each team needs at least 2 players" };
  }
  if (
    !red.some((p) => p.role === "spymaster") ||
    !blue.some((p) => p.role === "spymaster")
  ) {
    return { error: "Each team needs a spymaster" };
  }

  const words = pickWords(25);
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  const key = buildKey(startingTeam);

  room.game = {
    words,
    key,
    revealed: Array(25).fill(false),
    startingTeam,
    turn: startingTeam,
    clue: null, // { word, count, guessesLeft }
    winner: null,
    remaining: {
      red: key.filter((c) => c === "red").length,
      blue: key.filter((c) => c === "blue").length,
    },
    // playerId -> card index they have tentatively selected (this turn only)
    selections: {},
  };
  room.log = [{ type: "start", startingTeam }];
  room.phase = "playing";
  return { ok: true };
}

export function giveClue(room, playerId, word, count) {
  if (room.phase !== "playing" || !room.game) return { error: "Not in game" };
  const p = room.players[playerId];
  if (!p) return { error: "Unknown player" };
  if (p.role !== "spymaster" || p.team !== room.game.turn) {
    return { error: "Not your turn to give a clue" };
  }
  if (room.game.clue) return { error: "Clue already given" };
  const clean = String(word || "")
    .trim()
    .slice(0, 30);
  const n = Math.max(0, Math.min(9, parseInt(count, 10) || 0));
  if (!clean) return { error: "Clue word required" };
  room.game.clue = { word: clean, count: n, guessesLeft: n + 1 };
  room.log.push({ type: "clue", team: p.team, word: clean, count: n });
  return { ok: true };
}

export function revealCard(room, playerId, index) {
  if (room.phase !== "playing" || !room.game) return { error: "Not in game" };
  const g = room.game;
  if (!g.clue) return { error: "Wait for a clue" };
  const p = room.players[playerId];
  if (!p) return { error: "Unknown player" };
  if (p.role !== "operative" || p.team !== g.turn) {
    return { error: "Not your turn to guess" };
  }
  if (index < 0 || index >= 25 || g.revealed[index]) {
    return { error: "Invalid card" };
  }
  // Must have selected this card first (two-step confirm)
  if (g.selections[playerId] !== index) {
    return { error: "Select this card first, then confirm" };
  }
  g.revealed[index] = true;
  // Clear any selections pointing at this now-revealed card
  for (const pid of Object.keys(g.selections)) {
    if (g.selections[pid] === index) delete g.selections[pid];
  }
  const color = g.key[index];
  room.log.push({
    type: "reveal",
    team: p.team,
    index,
    word: g.words[index],
    color,
  });

  if (color === "assassin") {
    g.winner = otherTeam(p.team);
    room.phase = "ended";
    return { ok: true };
  }
  if (color === "red" || color === "blue") {
    g.remaining[color] = Math.max(0, g.remaining[color] - 1);
    if (g.remaining[color] === 0) {
      g.winner = color;
      room.phase = "ended";
      return { ok: true };
    }
  }
  // Decide whether to continue turn
  if (color === g.turn) {
    g.clue.guessesLeft -= 1;
    if (g.clue.guessesLeft <= 0) endTurnInternal(room);
  } else {
    endTurnInternal(room);
  }
  return { ok: true };
}

export function endTurn(room, playerId) {
  if (room.phase !== "playing" || !room.game) return { error: "Not in game" };
  const g = room.game;
  const p = room.players[playerId];
  if (!p) return { error: "Unknown player" };
  if (p.team !== g.turn) return { error: "Not your turn" };
  if (!g.clue) return { error: "Wait for a clue first" };
  endTurnInternal(room);
  return { ok: true };
}

function endTurnInternal(room) {
  const g = room.game;
  g.turn = otherTeam(g.turn);
  g.clue = null;
  g.selections = {};
  room.log.push({ type: "endTurn", nextTeam: g.turn });
}

/** Toggle a tentative selection on a card. Same card again = deselect. */
export function selectCard(room, playerId, index) {
  if (room.phase !== "playing" || !room.game) return { error: "Not in game" };
  const g = room.game;
  const p = room.players[playerId];
  if (!p) return { error: "Unknown player" };
  if (p.role !== "operative" || p.team !== g.turn) {
    return { error: "Not your turn to guess" };
  }
  if (!g.clue) return { error: "Wait for a clue" };
  if (index === null || index === undefined) {
    delete g.selections[playerId];
    return { ok: true };
  }
  if (index < 0 || index >= 25 || g.revealed[index]) {
    return { error: "Invalid card" };
  }
  if (g.selections[playerId] === index) {
    delete g.selections[playerId]; // toggle off
  } else {
    g.selections[playerId] = index;
  }
  return { ok: true };
}

export function resetGame(room) {
  room.phase = "lobby";
  room.game = null;
  room.log = [];
  for (const p of Object.values(room.players)) p.role = "operative";
}

// ---- DEV / TESTING HELPERS ----
// These bypass normal lobby rules. Useful for solo testing only.

/** Create a room pre-populated with bot players and start a game immediately. */
export function devCreateSoloRoom(hostPlayerId, hostName) {
  const room = createRoom(hostPlayerId, hostName || "You");
  // Add 3 bot players (not real sockets — they won't receive broadcasts).
  const bots = ["Bot Red", "Bot Blue 1", "Bot Blue 2"];
  bots.forEach((n, i) => {
    const fakeId = `bot-${room.code}-${i}`;
    room.players[fakeId] = {
      id: fakeId,
      name: n,
      team: null,
      role: "operative",
      connected: true,
      isBot: true,
    };
  });
  // Force teams: you = red spymaster, Bot Red = red operative, Bot Blue 1 = blue spymaster, Bot Blue 2 = blue operative
  const ids = Object.keys(room.players);
  const you = ids.find((id) => id === hostPlayerId);
  const botRed = ids.find((id) => room.players[id].name === "Bot Red");
  const botBlueSpy = ids.find((id) => room.players[id].name === "Bot Blue 1");
  const botBlueOp = ids.find((id) => room.players[id].name === "Bot Blue 2");
  room.players[you].team = "red";
  room.players[you].role = "spymaster";
  room.players[botRed].team = "red";
  room.players[botRed].role = "operative";
  room.players[botBlueSpy].team = "blue";
  room.players[botBlueSpy].role = "spymaster";
  room.players[botBlueOp].team = "blue";
  room.players[botBlueOp].role = "operative";
  startGame(room);
  return room;
}

/** Force-set your own team/role at any time (dev only). */
export function devSetMe(room, playerId, team, role) {
  const p = room.players[playerId];
  if (!p) return { error: "Unknown player" };
  if (team !== "red" && team !== "blue") return { error: "Bad team" };
  if (role !== "spymaster" && role !== "operative")
    return { error: "Bad role" };
  p.team = team;
  p.role = role;
  return { ok: true };
}

/** Build a state object tailored to a specific viewer (masks key for non-spymasters). */
export function viewState(room, playerId) {
  const me = room.players[playerId];
  const isSpymaster = !!me && me.role === "spymaster";
  const game = room.game
    ? {
        words: room.game.words,
        revealed: room.game.revealed,
        // Reveal full key only to spymasters or once game is ended
        key:
          isSpymaster || room.phase === "ended"
            ? room.game.key
            : room.game.revealed.map((r, i) => (r ? room.game.key[i] : null)),
        startingTeam: room.game.startingTeam,
        turn: room.game.turn,
        clue: room.game.clue,
        winner: room.game.winner,
        remaining: room.game.remaining,
        // [{ playerId, name, index }] — tentative picks visible to everyone
        selections: Object.entries(room.game.selections || {}).map(
          ([pid, idx]) => ({
            playerId: pid,
            name: room.players[pid]?.name || "?",
            index: idx,
          }),
        ),
      }
    : null;
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    youId: playerId,
    players: Object.values(room.players),
    game,
    log: room.log.slice(-50),
  };
}

// helpers
function otherTeam(t) {
  return t === "red" ? "blue" : "red";
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pickWords(n) {
  const pool = [...WORDS];
  shuffle(pool);
  return pool.slice(0, n);
}
function buildKey(startingTeam) {
  // 9 for starting team, 8 for other, 7 neutral, 1 assassin
  const key = [];
  const startCount = 9;
  const otherCount = 8;
  for (let i = 0; i < startCount; i++) key.push(startingTeam);
  for (let i = 0; i < otherCount; i++) key.push(otherTeam(startingTeam));
  for (let i = 0; i < 7; i++) key.push("neutral");
  key.push("assassin");
  return shuffle(key);
}
