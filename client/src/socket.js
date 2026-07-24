import { io } from "socket.io-client";
import { getPlayerId } from "./identity.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

// Uses the Vite dev proxy to reach :3001. In production, point at deployed server.
export const socket = io(SERVER_URL, {
  autoConnect: true,
  auth: { playerId: getPlayerId() },
});
