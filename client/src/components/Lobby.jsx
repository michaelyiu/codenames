import { useState } from "react";
import { socket } from "../socket.js";

export default function Lobby({ state }) {
  const [error, setError] = useState("");
  const me = state.players.find((p) => p.id === state.youId);
  const isHost = state.hostId === state.youId;
  const settings = state.settings || { boardSize: 5, turnTimer: 60 };

  const red = state.players.filter((p) => p.team === "red");
  const blue = state.players.filter((p) => p.team === "blue");
  const unassigned = state.players.filter((p) => !p.team);

  function choose(team, role) {
    setError("");
    socket.emit("team:choose", { team, role }, (res) => {
      if (res?.error) setError(res.error);
    });
  }
  function randomizeTeams() {
    socket.emit("team:randomize");
  }
  function randomizeSpymasters() {
    socket.emit("spymaster:randomize");
  }
  function assignSpymaster(targetId) {
    socket.emit("spymaster:assign", { targetId }, (res) => {
      if (res?.error) setError(res.error);
    });
  }
  function updateSetting(key, value) {
    socket.emit("settings:update", { [key]: value }, (res) => {
      if (res?.error) setError(res.error);
    });
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
          onJoin={(role) => choose("red", role)}
          inTeam={me?.team === "red"}
          isHost={isHost}
          onAssignSpymaster={assignSpymaster}
        />
        <TeamPanel
          color="blue"
          title="Blue Team"
          players={blue}
          youId={state.youId}
          onJoin={(role) => choose("blue", role)}
          inTeam={me?.team === "blue"}
          isHost={isHost}
          onAssignSpymaster={assignSpymaster}
        />
        {unassigned.length > 0 && (
          <div className="unassigned">
            <strong>Unassigned:</strong>{" "}
            {unassigned.map((p) => p.name).join(", ")}
          </div>
        )}
      </div>

      <div className="settings-panel">
        <h3>Game Settings</h3>
        <div className="setting-row">
          <label>Board Size</label>
          <div className="setting-options">
            {[3, 4, 5, 6].map((s) => (
              <button
                key={s}
                className={state.settings.boardSize === s ? "active" : ""}
                onClick={() => updateSetting("boardSize", s)}
                disabled={!isHost}
              >
                {s}×{s}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <label>Turn Timer</label>
          <div className="setting-options">
            {[
              { v: 20, l: "20s" },
              { v: 30, l: "30s" },
              { v: 60, l: "60s" },
              { v: 90, l: "90s" },
              { v: 0, l: "None" },
            ].map(({ v, l }) => (
              <button
                key={v}
                className={state.settings.turnTimer === v ? "active" : ""}
                onClick={() => updateSetting("turnTimer", v)}
                disabled={!isHost}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {!isHost && (
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "6px 0 0" }}>
            Only the host can change settings.
          </p>
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

function TeamPanel({
  color,
  title,
  players,
  youId,
  onJoin,
  inTeam,
  isHost,
  onAssignSpymaster,
}) {
  const hasSpymaster = players.some((p) => p.role === "spymaster");

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
            {p.role === "spymaster" ? (
              <span className="role-badge">Spymaster</span>
            ) : (
              isHost && (
                <button
                  className="assign-btn"
                  onClick={() => onAssignSpymaster(p.id)}
                  title="Assign as spymaster"
                >
                  🕵️
                </button>
              )
            )}
          </li>
        ))}
        {players.length === 0 && (
          <li style={{ color: "var(--muted)" }}>(empty)</li>
        )}
      </ul>
      {!inTeam && (
        <div className="team-actions">
          <button className={color} onClick={() => onJoin("operative")}>
            Join {color}
          </button>
          <button
            className={`${color} spy-join`}
            onClick={() => onJoin("spymaster")}
            disabled={hasSpymaster}
          >
            Join as Spymaster{hasSpymaster ? " (taken)" : ""}
          </button>
        </div>
      )}
    </div>
  );
}
