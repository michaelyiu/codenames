import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket.js";
import Lobby from "../components/Lobby.jsx";
import Game from "../components/Game.jsx";

const NAME_KEY = "codenames:name";

export default function Room() {
  const { code } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    function onState(s) {
      setState(s);
    }
    socket.on("room:state", onState);
    return () => socket.off("room:state", onState);
  }, []);

  // Auto-join on mount, and re-join on every (re)connect — covers refresh,
  // direct links, network blips, and server restarts. The server's playerId
  // reattach logic preserves team/role across these.
  useEffect(() => {
    const name = localStorage.getItem(NAME_KEY);
    if (!name) {
      nav(`/?next=/room/${code}`, { replace: true });
      return;
    }
    function attemptJoin() {
      socket.emit("room:join", { code, name }, (res) => {
        if (res?.error) {
          setError(res.error);
          return;
        }
        setError("");
      });
    }
    if (socket.connected) attemptJoin();
    socket.on("connect", attemptJoin);
    return () => socket.off("connect", attemptJoin);
  }, [code, nav]);

  if (error) {
    return (
      <div className="home">
        <h2>Couldn't join</h2>
        <p className="error">{error}</p>
        <button onClick={() => nav("/")}>Back</button>
      </div>
    );
  }
  if (!state) {
    return <div className="container">Connecting…</div>;
  }

  return (
    <div className="container">
      <div className="header">
        <h2>Codenames</h2>
        <div>
          Room <span className="code">{state.code}</span>{" "}
          <button
            onClick={() => navigator.clipboard?.writeText(window.location.href)}
          >
            Copy link
          </button>
        </div>
        {state.phase !== "playing" && (
          <button
            onClick={() => {
              socket.emit("room:leave");
              nav("/");
            }}
          >
            Leave
          </button>
        )}
        {state.phase === "playing" && (
          <button
            onClick={() => {
              if (
                window.confirm("Leave the game? You won't be able to rejoin.")
              ) {
                socket.emit("room:leave");
                nav("/");
              }
            }}
          >
            Leave
          </button>
        )}
      </div>

      {state.phase === "lobby" ? (
        <Lobby state={state} />
      ) : (
        <Game state={state} />
      )}
    </div>
  );
}
