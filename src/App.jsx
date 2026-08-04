import { useState, useEffect, useRef } from "react";
import "./App.css";

// Starter pool of gacha "eggs" (tasks)
const initialEggs = [
  { id: 1, name: "Homework", type: "need", color: "red", stars: 1 },
  { id: 2, name: "Write a novel", type: "want", color: "blue", stars: 2 },
  { id: 3, name: "Play a game", type: "need", color: "green", stars: 3 },
  { id: 4, name: "Clean my room", type: "want", color: "yellow", stars: 4 },
];

// Format seconds as mm:ss
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Format seconds into a friendlier duration string
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Is this task-history timestamp from today (local calendar day)?
function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Derive today-only totals from the full task history, in the same shape
// as the lifetime stats (totalDraws / completedTasks / totalTimeSpent) so
// the stat cards can render either one interchangeably.
function computeTodayStats(taskHistory) {
  const todaysEntries = taskHistory.filter((task) => isToday(task.drawnAt));
  const completedToday = todaysEntries.filter((task) => task.status === "completed");
  return {
    totalDraws: todaysEntries.length,
    completedTasks: completedToday.length,
    totalTimeSpent: completedToday.reduce((sum, task) => sum + task.timeSpent, 0),
  };
}

// Give any egg that doesn't have a position yet a starting spot near the top
// of the (circular) glass dome. Coordinates are % within the dome's own
// bounding box, where (50, 50) is the center — gravity does the rest,
// pulling capsules down into a resting pile.
function assignPositions(eggList) {
  return eggList.map((egg, index) => {
    if (egg.x && egg.y) return egg;

    const attempts = 8;
    let newX, newY, overlapping;

    for (let i = 0; i < attempts; i++) {
      newX = 35 + Math.random() * 30; // 35%-65%, near the horizontal center
      newY = 10 + Math.random() * 20; // 10%-30%, near the top of the dome

      overlapping = eggList.slice(0, index).some((existingEgg) => {
        if (!existingEgg.x || !existingEgg.y) return false;
        const dx = parseFloat(existingEgg.x) - newX;
        const dy = parseFloat(existingEgg.y) - newY;
        return Math.sqrt(dx * dx + dy * dy) < 10;
      });

      if (!overlapping) break;
    }

    return { ...egg, x: `${newX}%`, y: `${newY}%` };
  });
}

function Stars({ count }) {
  return <span>{"⭐".repeat(count)}</span>;
}

function App() {
  // Egg pool: read from localStorage first, fall back to the starter pool.
  // Positions are assigned once up front so every egg is placed before the
  // first paint (no flash of unpositioned balls).
  const [eggs, setEggs] = useState(() => {
    if (typeof window === "undefined") return assignPositions(initialEggs);
    try {
      const saved = localStorage.getItem("focus-gacha-eggs");
      return assignPositions(saved ? JSON.parse(saved) : initialEggs);
    } catch {
      return assignPositions(initialEggs);
    }
  });

  // Audio: use a ref for the AudioContext (so it survives re-renders without
  // being recreated) and real React state for the "is audio ready" indicator,
  // so the UI actually reflects it.
  const audioContextRef = useRef(null);
  const [audioReady, setAudioReady] = useState(false);

  function initAudioContext() {
    if (audioContextRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      audioContextRef.current = ctx;
      setAudioReady(true);
    } catch (error) {
      console.log("Audio init failed:", error);
    }
  }

  function playNotificationSound() {
    try {
      initAudioContext();
      const ctx =
        audioContextRef.current ||
        new (window.AudioContext || window.webkitAudioContext)();

      // Simple two-note "ding-ding" using the Web Audio API
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);

      setTimeout(() => {
        const oscillator2 = ctx.createOscillator();
        const gainNode2 = ctx.createGain();

        oscillator2.connect(gainNode2);
        gainNode2.connect(ctx.destination);

        oscillator2.frequency.setValueAtTime(1000, ctx.currentTime);
        gainNode2.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        oscillator2.start(ctx.currentTime);
        oscillator2.stop(ctx.currentTime + 0.5);
      }, 200);
    } catch (error) {
      console.log("Could not play notification sound:", error);
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]); // fall back to vibration on mobile
      }
    }
  }

  // App state
  const [selectedEgg, setSelectedEgg] = useState(null);
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("want");
  const [newStars, setNewStars] = useState(3);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeMode, setTimeMode] = useState("idle"); // idle | countdown | overtime
  const [overtimeSec, setOvertimeSec] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [drawnBall, setDrawnBall] = useState(null);
  const [ballPhysics, setBallPhysics] = useState({});

  // Stats & achievements
  const emptyStatistics = {
    totalDraws: 0,
    completedTasks: 0,
    totalTimeSpent: 0, // seconds
    taskHistory: [],
    achievements: {
      firstDraw: false,
      complete5Tasks: false,
      spend1Hour: false,
      complete10Tasks: false,
      spend5Hours: false,
    },
  };

  const [statistics, setStatistics] = useState(() => {
    try {
      const saved = localStorage.getItem("focus-gacha-statistics");
      return saved ? JSON.parse(saved) : emptyStatistics;
    } catch {
      return emptyStatistics;
    }
  });
  // Which side panel (if any) is open. A single value instead of two
  // independent booleans keeps the page from growing lopsided when both
  // Stats and Tasks used to be open at the same time.
  const [activePanel, setActivePanel] = useState("none"); // "none" | "stats" | "pool"

  // Which range the stat cards show. Achievements and the history log
  // below stay lifetime regardless — only the four overview numbers switch.
  const [statsRange, setStatsRange] = useState("today"); // "today" | "all"

  // Ball physics: real gravity inside a round glass dome. Capsules fall,
  // bounce off the *circular* wall, and pile up at the bottom to rest —
  // like marbles settling in a bowl, matching the actual dome shape.
  useEffect(() => {
    if (!eggs.length) return;

    const physicsInterval = setInterval(() => {
      setBallPhysics((prev) => {
        const newPhysics = { ...prev };

        // Lazily give any egg that doesn't have a physics entry yet
        // (e.g. one just added to the pool) a starting state near the top,
        // so it drops in and settles with the rest of the pile.
        eggs.forEach((egg) => {
          if (!newPhysics[egg.id]) {
            newPhysics[egg.id] = {
              x: parseFloat(egg.x) || 50,
              y: Math.min(parseFloat(egg.y) || 20, 25),
              vx: (Math.random() - 0.5) * 0.4,
              vy: 0,
              rotation: 0,
              rotationSpeed: (Math.random() - 0.5) * 1.5,
              resting: false,
            };
          }
        });

        const center = { x: 50, y: 50 };
        const domeRadius = 48; // circular wall, % of the dome's own box
        const ballRadius = 7.5;
        const gravity = 0.03;
        const friction = 0.95;
        const wallBounce = 0.35; // low restitution so drops settle, not bounce forever
        const restSpeed = 0.06; // below this, a ball is considered at rest

        const currentEggs = eggs.filter((egg) => newPhysics[egg.id]);

        currentEggs.forEach((egg) => {
          const ball = newPhysics[egg.id];
          if (!ball) return;

          if (ball.resting) return; // skip settled balls until something disturbs them

          ball.vy += gravity;
          ball.x += ball.vx;
          ball.y += ball.vy;

          // Bounce off the circular dome wall
          const dxCenter = ball.x - center.x;
          const dyCenter = ball.y - center.y;
          const distFromCenter = Math.hypot(dxCenter, dyCenter);
          const maxDist = domeRadius - ballRadius;

          if (distFromCenter > maxDist && distFromCenter > 0) {
            const nx = dxCenter / distFromCenter;
            const ny = dyCenter / distFromCenter;
            ball.x = center.x + nx * maxDist;
            ball.y = center.y + ny * maxDist;

            const vDotN = ball.vx * nx + ball.vy * ny;
            if (vDotN > 0) {
              ball.vx -= (1 + wallBounce) * vDotN * nx;
              ball.vy -= (1 + wallBounce) * vDotN * ny;
            }
          }

          // Ball-to-ball collisions: push apart and shed energy (no bouncy
          // velocity swap) so a pile settles instead of jittering.
          currentEggs.forEach((otherEgg) => {
            if (egg.id === otherEgg.id) return;
            const otherBall = newPhysics[otherEgg.id];
            if (!otherBall) return;

            const dx = otherBall.x - ball.x;
            const dy = otherBall.y - ball.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = ballRadius * 1.9;

            if (distance < minDistance && distance > 0) {
              const overlap = minDistance - distance;
              const separationX = (dx / distance) * overlap * 0.5;
              const separationY = (dy / distance) * overlap * 0.5;

              ball.x -= separationX;
              ball.y -= separationY;
              ball.vx -= (dx / distance) * 0.06;
              ball.vy -= (dy / distance) * 0.06;

              if (!otherBall.resting) {
                otherBall.x += separationX;
                otherBall.y += separationY;
                otherBall.vx += (dx / distance) * 0.06;
                otherBall.vy += (dy / distance) * 0.06;
              } else {
                // Nudging a resting ball wakes it back up
                otherBall.resting = false;
              }
            }
          });

          ball.vx *= friction;
          ball.vy *= friction;

          if (Math.abs(ball.vx) < restSpeed && Math.abs(ball.vy) < restSpeed) {
            ball.vx = 0;
            ball.vy = 0;
            ball.rotationSpeed = 0;
            ball.resting = true;
          } else {
            ball.rotation += ball.rotationSpeed + ball.vx * 4;
            ball.rotationSpeed *= friction;
          }
        });

        return newPhysics;
      });
    }, 50); // ~20 FPS

    return () => clearInterval(physicsInterval);
    // Intentionally only depends on the egg count: restarting this interval
    // on every position/rotation change would fight the physics loop itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eggs.length]);

  // Persist eggs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("focus-gacha-eggs", JSON.stringify(eggs));
    } catch {
      // ignore storage failures (e.g. private browsing)
    }
  }, [eggs]);

  // Persist statistics to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("focus-gacha-statistics", JSON.stringify(statistics));
    } catch {
      // ignore storage failures
    }
  }, [statistics]);

  // Countdown / overtime timer
  useEffect(() => {
    if (timeMode === "idle") return;
    if (!isTimerRunning) return;

    const timerId = setInterval(() => {
      if (timeMode === "countdown") {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setTimeMode("overtime");
            playNotificationSound();
            setMessage("🎉 5 minutes done! Keep going, or draw your next task~");
            return 0;
          }
          return prev - 1;
        });
      } else if (timeMode === "overtime") {
        setOvertimeSec((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(timerId);
    // playNotificationSound is stable in practice (only reads refs/state
    // setters); omitting it avoids restarting the interval every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeMode, isTimerRunning]);

  // Click the "draw" button
  const handleDraw = () => {
    setMessage("");
    setIsTimerRunning(false);
    setTimeLeft(0);
    setTimeMode("idle");
    setOvertimeSec(0);
    setDrawnBall(null);

    // If a task was already in progress, mark it abandoned
    if (selectedEgg) {
      setStatistics((prev) => ({
        ...prev,
        taskHistory: prev.taskHistory.map((task) =>
          task.eggId === selectedEgg.id && task.status === "drawn"
            ? { ...task, status: "abandoned", completedAt: new Date().toISOString() }
            : task
        ),
      }));

      setMessage(`Abandoned "${selectedEgg.name}", drawing a new task...`);
    }

    setSelectedEgg(null);

    if (eggs.length === 0) {
      setMessage("The pool is empty — add some tasks first!");
      return;
    }

    setIsShaking(true);
    setMessage("Shaking...");

    // Give the balls a burst of random velocity for the shake effect,
    // waking up any that had settled at the bottom of the pile.
    setBallPhysics((prev) => {
      const newPhysics = { ...prev };
      eggs.forEach((egg) => {
        const ball = newPhysics[egg.id];
        if (ball) {
          ball.resting = false;
          ball.vx += (Math.random() - 0.5) * 3;
          ball.vy -= Math.random() * 2.5; // toss upward, gravity brings it back down
          ball.rotationSpeed += (Math.random() - 0.5) * 10;
        }
      });
      return newPhysics;
    });

    // Stop shaking after 1.5s and draw a random egg
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * eggs.length);
      const egg = eggs[randomIndex];

      setIsShaking(false);
      setDrawnBall(egg);
      setMessage("Dropping...");

      setStatistics((prev) => {
        const newStats = {
          ...prev,
          totalDraws: prev.totalDraws + 1,
          taskHistory: [
            ...prev.taskHistory,
            {
              id: Date.now(),
              eggId: egg.id,
              taskName: egg.name,
              taskType: egg.type,
              taskStars: egg.stars,
              drawnAt: new Date().toISOString(),
              status: "drawn", // drawn -> completed/skipped/abandoned
              timeSpent: 0,
              completedAt: null,
            },
          ],
        };

        if (!prev.achievements.firstDraw) {
          newStats.achievements.firstDraw = true;
        }

        return newStats;
      });

      // Reveal the result once the drop animation finishes
      setTimeout(() => {
        setSelectedEgg(egg);
        setMessage(`You drew: ${egg.name} (${egg.stars}⭐)`);
      }, 800);
    }, 1500);
  };

  // Done! Put the egg back in the pool.
  // Gated on the 5-minute timer actually finishing: the timer only reaches
  // "overtime" once the full 5 minutes have counted down, so if it's still
  // idle or mid-countdown, this isn't a completed round yet — nudge the
  // person to go finish it instead of silently letting it count.
  const handlePutBack = () => {
    if (!selectedEgg) return;

    if (timeMode !== "overtime") {
      setMessage("⏳ Not yet — finish the full 5 minutes first, then come back and mark it done.");
      return;
    }

    const totalTime = 5 * 60 + overtimeSec;

    setStatistics((prev) => {
      const newStats = {
        ...prev,
        completedTasks: prev.completedTasks + 1,
        totalTimeSpent: prev.totalTimeSpent + totalTime,
        taskHistory: prev.taskHistory.map((task) =>
          task.eggId === selectedEgg.id && task.status === "drawn"
            ? { ...task, status: "completed", timeSpent: totalTime, completedAt: new Date().toISOString() }
            : task
        ),
      };

      if (!prev.achievements.complete5Tasks && newStats.completedTasks >= 5) {
        newStats.achievements.complete5Tasks = true;
      }
      if (!prev.achievements.complete10Tasks && newStats.completedTasks >= 10) {
        newStats.achievements.complete10Tasks = true;
      }
      if (!prev.achievements.spend1Hour && newStats.totalTimeSpent >= 3600) {
        newStats.achievements.spend1Hour = true;
      }
      if (!prev.achievements.spend5Hours && newStats.totalTimeSpent >= 18000) {
        newStats.achievements.spend5Hours = true;
      }

      return newStats;
    });

    setSelectedEgg(null);
    setIsTimerRunning(false);
    setTimeLeft(0);
    setTimeMode("idle");
    setOvertimeSec(0);
    setMessage("Task complete! Egg is back in the pool.");
  };

  // Remove for today (don't want to draw this one again today)
  const handleRemoveForToday = () => {
    if (!selectedEgg) return;

    setStatistics((prev) => ({
      ...prev,
      taskHistory: prev.taskHistory.map((task) =>
        task.eggId === selectedEgg.id && task.status === "drawn"
          ? { ...task, status: "skipped", completedAt: new Date().toISOString() }
          : task
      ),
    }));

    setEggs((prev) => prev.filter((egg) => egg.id !== selectedEgg.id));
    setSelectedEgg(null);
    setIsTimerRunning(false);
    setTimeLeft(0);
    setTimeMode("idle");
    setOvertimeSec(0);
    setMessage("Removed for today — it won't come up again until you add it back.");
  };

  // Permanently delete an egg from the pool
  const handleDeleteEgg = (id) => {
    setEggs((prev) => prev.filter((egg) => egg.id !== id));
    if (selectedEgg && selectedEgg.id === id) {
      setSelectedEgg(null);
      setIsTimerRunning(false);
      setTimeLeft(0);
    }
    setMessage("Deleted that task for good.");
  };

  // Add a new egg
  const handleAddEgg = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setMessage("Type something for the new task first~");
      return;
    }
    const starsNum = Number(newStars) || 1;
    const defaultColor = newType === "want" ? "pink" : "skyblue";

    let newX, newY;
    let attempts = 0;
    do {
      newX = 15 + Math.random() * 70;
      newY = 20 + Math.random() * 60;
      attempts++;

      const overlapping = eggs.some((existingEgg) => {
        if (!existingEgg.x || !existingEgg.y) return false;
        const dx = parseFloat(existingEgg.x) - newX;
        const dy = parseFloat(existingEgg.y) - newY;
        return Math.sqrt(dx * dx + dy * dy) < 15;
      });

      if (!overlapping || attempts >= 10) break;
    } while (attempts < 10);

    const newEgg = {
      id: Date.now(),
      name,
      type: newType,
      stars: Math.max(1, Math.min(5, starsNum)),
      color: defaultColor,
      x: `${newX}%`,
      y: `${newY}%`,
      velocityX: (Math.random() - 0.5) * 2,
      velocityY: Math.random() * 1,
      rotation: Math.random() * 360,
    };

    setEggs((prev) => [...prev, newEgg]);
    setNewName("");
    setNewStars(3);
    setNewType("want");
    setMessage("New task added to the pool!");
  };

  // Start a 5-minute timer
  const handleStartTimer = () => {
    initAudioContext(); // needs a user gesture to unlock audio
    setTimeMode("countdown");
    setTimeLeft(5 * 60);
    setOvertimeSec(0);
    setIsTimerRunning(true);
    setMessage("Timer started! Hang in there for 5 minutes~");
  };

  const handlePauseTimer = () => {
    setIsTimerRunning(false);
    setMessage("Paused — take a breather.");
  };

  const handleResumeTimer = () => {
    if (timeMode === "idle") return;
    setIsTimerRunning(true);
    setMessage("Back to it!");
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setTimeMode("idle");
    setTimeLeft(0);
    setOvertimeSec(0);
    setMessage("Timer reset.");
  };

  // Wipe all stats, achievements, and history back to zero. Destructive and
  // permanent, so it's confirmed before anything is cleared.
  const handleResetStats = () => {
    const confirmed = window.confirm(
      "Reset all stats and achievements? This clears your draw count, focus time, and history for good."
    );
    if (!confirmed) return;

    setStatistics(emptyStatistics);
    setMessage("Stats and achievements have been reset.");
  };

  const todayStats = computeTodayStats(statistics.taskHistory);
  const displayedStats = statsRange === "today" ? todayStats : statistics;

  return (
    <div className="App">
      <header className="app-header">
        <h1>Focus Gacha</h1>
        <p className="subtitle">
          Draw a task and do it for at least 5 minutes — more is fine, less isn't 🐣
        </p>
      </header>

      <section className="machine-hero">
          <div className={`gacha-machine ${isShaking ? "shaking" : ""}`}>
            <svg
              className="gacha-svg"
              viewBox="0 0 300 420"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="domeGlass" cx="35%" cy="26%" r="85%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#f4f8fc" />
                  <stop offset="100%" stopColor="#dbe6f0" />
                </radialGradient>
                <linearGradient id="bodyRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffa07a" />
                  <stop offset="55%" stopColor="#ff7a6b" />
                  <stop offset="100%" stopColor="#f0604f" />
                </linearGradient>
                <linearGradient id="panelGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff3d6" />
                  <stop offset="100%" stopColor="#ffcf7a" />
                </linearGradient>
                <radialGradient id="handleMetal" cx="35%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="#7c6a8a" />
                  <stop offset="100%" stopColor="#3d3350" />
                </radialGradient>
                <linearGradient id="baseMaroon" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f0866f" />
                  <stop offset="100%" stopColor="#d0654e" />
                </linearGradient>
              </defs>

              {/* ground shadow */}
              <ellipse cx="150" cy="410" rx="105" ry="9" fill="#3a2416" opacity="0.14" />

              {/* base */}
              <rect x="22" y="357" width="256" height="44" rx="20" fill="url(#baseMaroon)" stroke="#4a3a4f" strokeWidth="3.5" />

              {/* body */}
              <rect x="35" y="186" width="230" height="178" rx="34" fill="url(#bodyRed)" stroke="#4a3a4f" strokeWidth="3.5" />

              {/* dispenser outlet */}
              <rect x="110" y="300" width="80" height="34" rx="16" fill="#4a3a4f" />
              <rect x="126" y="321" width="48" height="6" rx="3" fill="#332a3a" />

              {/* coin/control panel */}
              <rect x="88" y="204" width="124" height="66" rx="18" fill="url(#panelGold)" stroke="#4a3a4f" strokeWidth="3" />

              {/* handle */}
              <circle
                cx="150"
                cy="237"
                r="29"
                fill="url(#handleMetal)"
                stroke="#332a3a"
                strokeWidth="2.5"
                className="control-handle"
                onClick={handleDraw}
              />
              <rect x="136" y="233" width="28" height="8" rx="4" fill="#c9bfd6" pointerEvents="none" />

              {/* dome collar */}
              <ellipse cx="150" cy="203" rx="98" ry="15" fill="#5a4a63" stroke="#4a3a4f" strokeWidth="3" />

              {/* glass dome */}
              <circle cx="150" cy="108" r="100" fill="url(#domeGlass)" stroke="#4a3a4f" strokeWidth="4.5" />

              {/* glass shine */}
              <ellipse
                cx="112"
                cy="66"
                rx="34"
                ry="50"
                fill="#ffffff"
                opacity="0.45"
                transform="rotate(-25 112 66)"
                pointerEvents="none"
              />
            </svg>

            <div className="ball-layer">
              {eggs.slice(0, 16).map((egg) => {
                const physics = ballPhysics[egg.id];
                const x = physics ? physics.x : parseFloat(egg.x) || 50;
                const y = physics ? physics.y : parseFloat(egg.y) || 20;
                const rotation = physics ? physics.rotation : 0;

                return (
                  <div
                    key={egg.id}
                    className="egg-ball"
                    data-type={egg.type}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                    }}
                  />
                );
              })}
            </div>
          </div>

          <p className="pool-count">🎯 {eggs.length} task{eggs.length === 1 ? "" : "s"} in the pool</p>

          {drawnBall && (
            <div className="draw-area">
              <div className="drawn-ball drop" data-type={drawnBall.type} title={drawnBall.name} />
            </div>
          )}

          {selectedEgg && (
            <div className="result">
              <h2>You drew 🎉</h2>
              <p style={{ fontSize: "18px", marginTop: "8px" }}>
                🎯 Task: <strong>{selectedEgg.name}</strong>
              </p>
              <p>
                Type: {selectedEgg.type === "want" ? "Want to do" : "Need to do"} ·{" "}
                <Stars count={selectedEgg.stars} />
              </p>
              <p>Spend at least 5 minutes on it to count this round as done.</p>

              <div className="timer-section">
                <div className="timer-display">
                  <span>⏰</span>
                  <strong>
                    {timeMode === "idle" && <span className="timer-status">Not started</span>}
                    {timeMode === "countdown" && (
                      <span className="timer-status countdown">{formatTime(timeLeft)}</span>
                    )}
                    {timeMode === "overtime" && (
                      <span className="timer-status overtime">+{formatTime(overtimeSec)}</span>
                    )}
                  </strong>
                  <span className={`audio-indicator ${audioReady ? "enabled" : "disabled"}`}>
                    {audioReady ? "🔔 Sound on" : "🔇 Click start to enable sound"}
                  </span>
                </div>

                <div className="timer-controls">
                  {timeMode === "idle" && (
                    <button type="button" className="timer-btn primary" onClick={handleStartTimer}>
                      <span>▶️</span>
                      Start 5-minute timer
                    </button>
                  )}

                  {timeMode === "idle" && !audioReady && (
                    <button
                      type="button"
                      className="timer-btn outline"
                      onClick={() => {
                        initAudioContext();
                        playNotificationSound();
                      }}
                      style={{ fontSize: "12px", padding: "8px 16px" }}
                    >
                      <span>🔔</span>
                      Test sound
                    </button>
                  )}

                  {timeMode !== "idle" && !isTimerRunning && (
                    <button type="button" className="timer-btn secondary" onClick={handleResumeTimer}>
                      <span>▶️</span>
                      Resume
                    </button>
                  )}

                  {timeMode !== "idle" && isTimerRunning && (
                    <button type="button" className="timer-btn warning" onClick={handlePauseTimer}>
                      <span>⏸️</span>
                      Pause
                    </button>
                  )}

                  {timeMode !== "idle" && (
                    <button type="button" className="timer-btn outline" onClick={handleResetTimer}>
                      <span>🔄</span>
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="task-actions">
                <button className="task-btn success" onClick={handlePutBack}>
                  ✅ Done — put it back in the pool
                </button>
                <button className="task-btn danger" onClick={handleRemoveForToday}>
                  ❌ Skip for today
                </button>
              </div>
            </div>
          )}

          {message && (
            <p className={`message ${message.startsWith("⏳") ? "message-warning" : ""}`}>{message}</p>
          )}
      </section>

      <section className="panel-section">
          <nav className="panel-tabs">
            <button
              type="button"
              className={`panel-tab ${activePanel === "stats" ? "active" : ""}`}
              onClick={() => setActivePanel((prev) => (prev === "stats" ? "none" : "stats"))}
            >
              📊 Stats
            </button>
            <button
              type="button"
              className={`panel-tab ${activePanel === "pool" ? "active" : ""}`}
              onClick={() => setActivePanel((prev) => (prev === "pool" ? "none" : "pool"))}
            >
              🗂️ Tasks
            </button>
          </nav>

          {activePanel === "stats" && (
            <div className="statistics-panel">
              <div className="stats-header">
                <h3>📊 Stats & Achievements</h3>
                <button type="button" className="stats-reset-btn" onClick={handleResetStats}>
                  🗑️ Reset
                </button>
              </div>

              <div className="stats-range-toggle">
                <button
                  type="button"
                  className={`range-pill ${statsRange === "today" ? "active" : ""}`}
                  onClick={() => setStatsRange("today")}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`range-pill ${statsRange === "all" ? "active" : ""}`}
                  onClick={() => setStatsRange("all")}
                >
                  All time
                </button>
              </div>

              <div className="stats-overview">
                <div className="stat-card">
                  <span className="stat-number">{displayedStats.totalDraws}</span>
                  <div className="stat-label">Draws</div>
                </div>
                <div className="stat-card">
                  <span className="stat-number">{displayedStats.completedTasks}</span>
                  <div className="stat-label">Completed</div>
                </div>
                <div className="stat-card">
                  <span className="stat-number">
                    {displayedStats.totalDraws > 0
                      ? Math.round((displayedStats.completedTasks / displayedStats.totalDraws) * 100)
                      : 0}
                    %
                  </span>
                  <div className="stat-label">Completion rate</div>
                </div>
                <div className="stat-card">
                  <span className="stat-number">{formatDuration(displayedStats.totalTimeSpent)}</span>
                  <div className="stat-label">Focus time</div>
                </div>
              </div>

              <div className="achievements-section">
                <h4>🏆 Achievements</h4>
                <div className="achievements-grid">
                  <div className={`achievement-badge ${statistics.achievements.firstDraw ? "unlocked" : "locked"}`}>
                    <span>🎯</span>
                    <span>First try — draw your first egg</span>
                  </div>
                  <div className={`achievement-badge ${statistics.achievements.complete5Tasks ? "unlocked" : "locked"}`}>
                    <span>⭐</span>
                    <span>Getting somewhere — complete 5 tasks</span>
                  </div>
                  <div className={`achievement-badge ${statistics.achievements.spend1Hour ? "unlocked" : "locked"}`}>
                    <span>⏰</span>
                    <span>Focused — 1 hour of total time</span>
                  </div>
                  <div className={`achievement-badge ${statistics.achievements.complete10Tasks ? "unlocked" : "locked"}`}>
                    <span>🚀</span>
                    <span>Task master — complete 10 tasks</span>
                  </div>
                  <div className={`achievement-badge ${statistics.achievements.spend5Hours ? "unlocked" : "locked"}`}>
                    <span>💎</span>
                    <span>Deep focus — 5 hours of total time</span>
                  </div>
                </div>
              </div>

              <div className="task-history">
                <h4>📝 Recent history</h4>
                <div className="history-list">
                  {statistics.taskHistory
                    .slice(-10)
                    .reverse()
                    .map((task) => (
                      <div key={task.id} className={`history-item ${task.status}`}>
                        <div className="task-info">
                          <div className="task-name">{task.taskName}</div>
                          <div className="task-meta">
                            {task.taskType === "want" ? "Want to do" : "Need to do"} •{" "}
                            {"⭐".repeat(task.taskStars)} •{" "}
                            {new Date(task.drawnAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <div className={`task-status ${task.status}`}>
                          {task.status === "completed" && (
                            <>
                              <span>✅</span>
                              <span>Done • {formatDuration(task.timeSpent)}</span>
                            </>
                          )}
                          {task.status === "skipped" && (
                            <>
                              <span>⏭️</span>
                              <span>Skipped</span>
                            </>
                          )}
                          {task.status === "drawn" && (
                            <>
                              <span>🎯</span>
                              <span>In progress</span>
                            </>
                          )}
                          {task.status === "abandoned" && (
                            <>
                              <span>🚫</span>
                              <span>Abandoned</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  {statistics.taskHistory.length === 0 && (
                    <p className="history-empty">No history yet — go draw your first task!</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activePanel === "pool" && (
            <div className="pool-panel">
              <form className="add-task-form" onSubmit={handleAddEgg}>
                <input
                  type="text"
                  className="add-task-input"
                  placeholder="e.g. Homework for 5 minutes / Outline a novel chapter"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <div className="add-task-row">
                  <select
                    className="add-task-select"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                  >
                    <option value="want">Want to do</option>
                    <option value="need">Need to do</option>
                  </select>

                  <select
                    className="add-task-select"
                    value={newStars}
                    onChange={(e) => setNewStars(e.target.value)}
                  >
                    <option value={1}>⭐</option>
                    <option value={2}>⭐⭐</option>
                    <option value={3}>⭐⭐⭐</option>
                    <option value={4}>⭐⭐⭐⭐</option>
                    <option value={5}>⭐⭐⭐⭐⭐</option>
                  </select>

                  <button type="submit" className="add-task-btn">
                    Add
                  </button>
                </div>
              </form>

              <ul className="task-list">
                {eggs.map((egg) => (
                  <li key={egg.id} className="task-row">
                    <span className={`task-dot ${egg.type}`} />
                    <span className="task-row-name">{egg.name}</span>
                    <span className={`task-type-pill ${egg.type}`}>
                      {egg.type === "want" ? "Want" : "Need"}
                    </span>
                    <span className="task-row-stars">
                      <Stars count={egg.stars} />
                    </span>
                    <button
                      type="button"
                      className="task-delete-btn"
                      onClick={() => handleDeleteEgg(egg.id)}
                      aria-label={`Delete ${egg.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {eggs.length === 0 && (
                  <li className="task-row-empty">Pool's empty — refill it whenever you're ready~</li>
                )}
              </ul>
            </div>
          )}
      </section>
    </div>
  );
}

export default App;
