const PLAYER_ID_KEY = "codenames:playerId";

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers — not cryptographically strong but unique enough.
  return (
    Math.random().toString(36).slice(2) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

export function getPlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}
