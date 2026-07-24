import { useState } from "react";
import { socket } from "../socket.js";

export default function Lobby({ state }) {
  const [error, setError] = useState("");
  const me = state.players.find((p) => p.id === state.youId);
  const isHost = state.hostId === state.youId;

  const red = state.players.filter((p) => p.team === "red");
  const blue = state.players.filter((p) => p.team === "blue");
  const unassigned = state.players.filter((p) => !p.team);

  function choose(team) {
    setError("");
    socket.emit("team:choose", { team });
  }
  function randomizeTeams() {
    socket.emit("team:randomize");
  }
  function randomizeSpymasters() {
    socket.emit("spymaster:randomize");
  }
  function start() {
    setError("");
    socket.emit("game:start", null, (res) => {
      if (res?.error) setError(res.error);
    });
  }

  const teamsBalanced =
    red.length >= 2 &&
    blue.length >= 2 &&
    red.some((p) => p.role === "spymaster") &&
    blue.some((p) => p.role === "spymaster");

  return (
    <>
      <div className="lobby">
        <TeamPanel
          color="red"
          title="Red Team"
          players={red}
          youId={state.youId}
          onJoin={() => choose("red")}
          inTeam={me?.team === "red"}
        />
        <TeamPanel
          color="blue"
          title="Blue Team"
          players={blue}
          youId={state.youId}
          onJoin={() => choose("blue")}
          inTeam={me?.team === "blue"}
        />
        {unassigned.length > 0 && (
          <div className="unassigned">
            <strong>Unassigned:</strong>{" "}
            {unassigned.map((p) => p.name).join(", ")}
          </div>
        )}
      </div>

      <div className="controls">
        <button onClick={() => choose(null)} disabled={!me?.team}>
          Leave team
        </button>
        <button onClick={randomizeTeams}>Randomize teams</button>
        <button onClick={randomizeSpymasters}>Randomize spymasters</button>
        <button
          className="primary"
          onClick={start}
          disabled={!isHost || !teamsBalanced}
        >
          Start game{!isHost && " (host only)"}
        </button>
      </div>

      <p className="error">{error}</p>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Need ≥2 players per team and one spymaster per team. Share the URL to
        invite players.
      </p>
    </>
  );
}

function TeamPanel({ color, title, players, youId, onJoin, inTeam }) {
  return (
    <div className={`team ${color}`}>
      <h3>
        {title} ({players.length})
      </h3>
      <ul>
        {players.map((p) => (
          <li key={p.id} className={p.id === youId ? "you" : ""}>
            <span>
              {p.name}
              {p.id === youId && " (you)"}
            </span>
            {p.role === "spymaster" && (
              <span className="role-badge">Spymaster</span>
            )}
          </li>
        ))}
        {players.length === 0 && (
          <li style={{ color: "var(--muted)" }}>(empty)</li>
        )}
      </ul>
      {!inTeam && (
        <button className={color} onClick={onJoin} style={{ marginTop: 12 }}>
          Join {color}
        </button>
      )}
    </div>
  );
}
