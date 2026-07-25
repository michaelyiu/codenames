import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { socket } from "../socket.js";

export default function Game({ state }) {
  const [searchParams] = useSearchParams();
  const devMode = searchParams.get("dev") === "1";
  const me = state.players.find((p) => p.id === state.youId);
  const g = state.game;
  const [clueWord, setClueWord] = useState("");
  const [clueCount, setClueCount] = useState(1);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(null);

  // Countdown timer synced to server deadline
  useEffect(() => {
    if (!g?.turnDeadline) {
      setTimeLeft(null);
      return;
    }
    function tick() {
      const remaining = Math.max(
        0,
        Math.ceil((g.turnDeadline - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [g?.turnDeadline]);

  if (!g || !me) return null;

  const isSpymaster = me.role === "spymaster";
  const isMyTurn = me.team === g.turn;
  const canGiveClue = isSpymaster && isMyTurn && !g.clue && !g.winner;
  const canGuess = !isSpymaster && isMyTurn && !!g.clue && !g.winner;

  function reveal(i) {
    if (!canGuess) return;
    if (g.revealed[i]) return;
    setError("");
    socket.emit("card:reveal", { index: i }, (res) => {
      if (res?.error) setError(res.error);
    });
  }
  function selectCard(i) {
    if (!canGuess) return;
    if (g.revealed[i]) return;
    setError("");
    socket.emit("card:select", { index: i }, (res) => {
      if (res?.error) setError(res.error);
    });
  }
  function clearSelection() {
    socket.emit("card:select", { index: null });
  }
  function submitClue(e) {
    e.preventDefault();
    setError("");
    const trimmed = clueWord.trim();
    if (!trimmed) return setError("Clue word required");
    if (!/^[a-zA-Z]+$/.test(trimmed)) {
      return setError("Clue must be a single word, letters only");
    }
    socket.emit("clue:give", { word: trimmed, count: clueCount }, (res) => {
      if (res?.error) return setError(res.error);
      setClueWord("");
      setClueCount(1);
    });
  }
  function endTurn() {
    setError("");
    socket.emit("turn:end", null, (res) => {
      if (res?.error) setError(res.error);
    });
  }
  function newGame() {
    socket.emit("game:reset");
  }
  function devSwitch(team, role) {
    socket.emit("dev:setMe", { team, role }, (res) => {
      if (res?.error) setError(res.error);
    });
  }

  return (
    <>
      {g.winner && (
        <div className={`winner-banner ${g.winner}`}>
          {g.winner.toUpperCase()} TEAM WINS!
        </div>
      )}
      <div className="board-wrap">
        <div
          className="board"
          style={{
            gridTemplateColumns: `repeat(${g.boardSize || 5}, minmax(0, 1fr))`,
          }}
        >
          {g.words.map((w, i) => {
            const selectedBy = (g.selections || []).filter(
              (s) => s.index === i,
            );
            const mySelectionIndex = (g.selections || []).find(
              (s) => s.playerId === state.youId,
            )?.index;
            return (
              <Card
                key={i}
                word={w}
                revealed={g.revealed[i]}
                color={g.key[i]}
                isSpymasterView={isSpymaster}
                clickable={canGuess && !g.revealed[i]}
                selectedBy={selectedBy}
                isMySelection={mySelectionIndex === i}
                turnTeam={g.turn}
                onClick={() => selectCard(i)}
              />
            );
          })}
        </div>

        <aside className="sidebar">
          <div className="panel score">
            <span className="red">Red: {g.remaining.red}</span>
            <span className="blue">Blue: {g.remaining.blue}</span>
          </div>

          {!g.winner && (
            <div className={`turn-banner ${g.turn}`}>
              {g.turn.toUpperCase()}'s turn —{" "}
              {g.clue ? "guessing" : "spymaster gives a clue"}
              {timeLeft !== null && (
                <span className={`timer${timeLeft <= 10 ? " timer-low" : ""}`}>
                  {" "}
                  ⏱ {timeLeft}s
                </span>
              )}
            </div>
          )}

          {g.clue && (
            <div className="panel clue-display">
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Clue</div>
              <strong>{g.clue.word.toUpperCase()}</strong> · {g.clue.count}
              {!isSpymaster && (
                <div
                  style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}
                >
                  Guesses left this turn: {g.clue.guessesLeft}
                </div>
              )}
            </div>
          )}

          {canGiveClue && (
            <form className="panel clue-form" onSubmit={submitClue}>
              <input
                type="text"
                placeholder="Clue word"
                value={clueWord}
                maxLength={30}
                onChange={(e) => setClueWord(e.target.value)}
              />
              <input
                type="number"
                min="0"
                max="9"
                value={clueCount}
                onChange={(e) => setClueCount(e.target.value)}
              />
              <button className="primary" type="submit">
                Give
              </button>
            </form>
          )}

          {canGuess && <button onClick={endTurn}>End turn</button>}

          {canGuess &&
            (() => {
              const mySel = (g.selections || []).find(
                (s) => s.playerId === state.youId,
              );
              if (mySel === undefined) return null;
              const word = g.words[mySel.index];
              const teamColor = g.turn === "red" ? "var(--red)" : "var(--blue)";
              return (
                <div className="panel" style={{ borderColor: teamColor }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginBottom: 6,
                    }}
                  >
                    Your pick
                  </div>
                  <div
                    style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}
                  >
                    {word}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="primary"
                      style={{ flex: 1 }}
                      onClick={() => reveal(mySel.index)}
                    >
                      Confirm guess
                    </button>
                    <button onClick={clearSelection}>Cancel</button>
                  </div>
                </div>
              );
            })()}

          <div className="panel">
            <div
              style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}
            >
              You: <strong>{me.name}</strong> ({me.team} {me.role})
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Started by: {g.startingTeam.toUpperCase()}
            </div>
          </div>

          {g.winner && (
            <button className="primary" onClick={newGame}>
              New game (back to lobby)
            </button>
          )}

          {devMode && (
            <div className="panel" style={{ borderColor: "var(--accent)" }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--accent)",
                  marginBottom: 6,
                  fontWeight: 700,
                }}
              >
                DEV — switch perspective
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                }}
              >
                <button onClick={() => devSwitch("red", "spymaster")}>
                  Red Spymaster
                </button>
                <button onClick={() => devSwitch("red", "operative")}>
                  Red Operative
                </button>
                <button onClick={() => devSwitch("blue", "spymaster")}>
                  Blue Spymaster
                </button>
                <button onClick={() => devSwitch("blue", "operative")}>
                  Blue Operative
                </button>
              </div>
              <div
                style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}
              >
                Bots are passive — switch in to act for either team.
              </div>
            </div>
          )}

          <div className="panel">
            <div
              style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}
            >
              Log
            </div>
            <div className="log">
              {state.log
                .slice()
                .reverse()
                .map((entry, i) => (
                  <div className="log-entry" key={i}>
                    {formatLog(entry)}
                  </div>
                ))}
            </div>
          </div>

          <p className="error">{error}</p>
        </aside>
      </div>
    </>
  );
}

function Card({
  word,
  revealed,
  color,
  isSpymasterView,
  clickable,
  selectedBy,
  isMySelection,
  turnTeam,
  onClick,
}) {
  const classes = ["card"];
  if (revealed) {
    classes.push("revealed", color);
  } else if (isSpymasterView && color) {
    classes.push("tinted-" + color);
  }
  if (!revealed && selectedBy && selectedBy.length > 0) {
    classes.push("selected", "selected-" + turnTeam);
    if (isMySelection) classes.push("selected-me");
  }
  return (
    <div
      className={classes.join(" ")}
      onClick={clickable ? onClick : undefined}
      style={{ cursor: clickable ? "pointer" : "default" }}
    >
      <span className="card-word">{word}</span>
      {!revealed && selectedBy && selectedBy.length > 0 && (
        <div className="selection-tabs">
          {selectedBy.map((s) => (
            <span
              key={s.playerId}
              className={
                "selection-tab" +
                (isMySelection && s.playerId === undefined ? " me" : "")
              }
              title={s.name}
            >
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatLog(e) {
  switch (e.type) {
    case "start":
      return `Game started — ${e.startingTeam.toUpperCase()} goes first`;
    case "clue":
      return `${e.team.toUpperCase()} clue: "${e.word}" ${e.count}`;
    case "reveal":
      return `${e.team.toUpperCase()} revealed ${e.word} → ${e.color}`;
    case "endTurn":
      return `Turn passed to ${e.nextTeam.toUpperCase()}`;
    case "timerExpired":
      return `${e.team.toUpperCase()}'s time ran out!`;
    default:
      return JSON.stringify(e);
  }
}
