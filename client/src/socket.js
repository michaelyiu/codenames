import { io } from "socket.io-client";
import { getPlayerId } from "./identity.js";

// Uses the Vite dev proxy to reach :3001. In production, point at deployed server.
export const socket = io({
  autoConnect: true,
  auth: { playerId: getPlayerId() },
});
