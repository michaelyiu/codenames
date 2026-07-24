import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket.js";

const NAME_KEY = "codenames:name";

export default function Home() {
  const nav = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  // If the player is already in an active game, redirect them back.
  useEffect(() => {
    function check() {
      socket.emit("room:check", null, (res) => {
        if (res?.activeRoom) {
          nav(`/room/${res.activeRoom}`, { replace: true });
        }
      });
    }
    if (socket.connected) check();
    else socket.once("connect", check);
    return () => socket.off("connect", check);
  }, [nav]);

  function saveName() {
    const n = name.trim();
    if (!n) {
      setError("Enter a nickname first");
      return null;
    }
    localStorage.setItem(NAME_KEY, n);
    return n;
  }

  function createRoom() {
    const n = saveName();
    if (!n) return;
    setError("");
    socket.emit("room:create", { name: n }, (res) => {
      if (res?.error) return setError(res.error);
      nav(`/room/${res.code}`);
    });
  }

  function joinRoom() {
    const n = saveName();
    if (!n) return;
    const c = code.trim().toUpperCase();
    if (!c) return setError("Enter a room code");
    setError("");
    socket.emit("room:join", { code: c, name: n }, (res) => {
      if (res?.error) return setError(res.error);
      nav(`/room/${res.code}`);
    });
  }

  function devSoloStart() {
    const n = saveName() || "You";
    localStorage.setItem(NAME_KEY, n);
    setError("");
    socket.emit("dev:soloStart", { name: n }, (res) => {
      if (res?.error) return setError(res.error);
      nav(`/room/${res.code}?dev=1`);
    });
  }

  return (
    <div className="home">
      <h1>Codenames</h1>
      <p style={{ color: "var(--muted)" }}>Multiplayer party word game.</p>

      <label>Nickname</label>
      <div className="row">
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      <div className="row" style={{ marginTop: 24 }}>
        <button className="primary" onClick={createRoom}>
          Create room
        </button>
      </div>

      <div
        style={{ textAlign: "center", margin: "16px 0", color: "var(--muted)" }}
      >
        or
      </div>

      <div className="row">
        <input
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Room code"
          style={{ textTransform: "uppercase", letterSpacing: "0.2em" }}
        />
        <button onClick={joinRoom}>Join</button>
      </div>

      <div className="error">{error}</div>

      <hr style={{ margin: "24px 0", borderColor: "var(--border)" }} />
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        Dev / testing
      </div>
      <button onClick={devSoloStart} style={{ width: "100%" }}>
        Solo test (skip lobby, with bots)
      </button>
    </div>
  );
}
