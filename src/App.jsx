import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { ListTodo, Trophy, Info, PartyPopper, Hourglass } from "lucide-react";
import "./App.css";
import GachaMachine from "./components/GachaMachine";
import { TaskCard, TaskControls } from "./components/TaskCard";
import { Drawer, PoolPanel, StatsPanel } from "./components/Panels";
import { FOCUS_SECONDS, computeTodayStats } from "./lib/utils";

// Starter pool of gacha capsules (tasks)
const initialEggs = [
  { id: 1, name: "Homework", type: "need", stars: 1 },
  { id: 2, name: "Write a novel", type: "want", stars: 2 },
  { id: 3, name: "Play a game", type: "need", stars: 3 },
  { id: 4, name: "Clean my room", type: "want", stars: 4 },
];

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

const PANEL_TABS = [
  { id: "pool", label: "Tasks" },
  { id: "stats", label: "Stats" },
];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="logo" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#F4A3B8" />
      <path d="M3 16 A13 13 0 0 1 29 16 Z" fill="#fff" opacity="0.55" />
      <path d="M4 16 H28" stroke="#DE7F9A" strokeWidth="1.4" opacity="0.6" />
      <ellipse cx="11" cy="9.5" rx="3.6" ry="2.1" fill="#fff" opacity="0.9" transform="rotate(-30 11 9.5)" />
    </svg>
  );
}

const TOAST_ICON = { info: Info, success: PartyPopper, warn: Hourglass };

function App() {
  // ---- Pool ---------------------------------------------------------------
  const [eggs, setEggs] = useState(() => {
    try {
      const saved = localStorage.getItem("focus-gacha-eggs");
      return saved ? JSON.parse(saved) : initialEggs;
    } catch {
      return initialEggs;
    }
  });

  // ---- Audio --------------------------------------------------------------
  // The AudioContext lives in a ref (survives re-renders); "ready" is state
  // so the bell button can reflect it.
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

  // Soft two-note chime
  function playNotificationSound() {
    try {
      initAudioContext();
      const ctx = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      const note = (freq, at) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.7);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + 0.75);
      };
      note(880, 0);
      note(1174.66, 0.18);
    } catch (error) {
      console.log("Could not play notification sound:", error);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }

  // ---- Draw / timer state -------------------------------------------------
  const [selectedEgg, setSelectedEgg] = useState(null);
  const [lastEgg, setLastEgg] = useState(null); // keeps card content while it flips away
  const [phase, setPhase] = useState("idle"); // idle | shaking | dropping | revealed
  const [drawnBall, setDrawnBall] = useState(null);
  const [drawKey, setDrawKey] = useState(0);
  const [turns, setTurns] = useState(0);
  const [hiddenId, setHiddenId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeMode, setTimeMode] = useState("idle"); // idle | countdown | overtime
  const [overtimeSec, setOvertimeSec] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timeouts = useRef([]);

  // ---- UI state -----------------------------------------------------------
  const [toast, setToast] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState("pool");
  const [statsRange, setStatsRange] = useState("today");
  const isMobile = useMediaQuery("(max-width: 860px)");
  const cardColRef = useRef(null);

  const notify = useCallback((text, tone = "info") => {
    setToast({ id: Date.now() + Math.random(), text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => () => timeouts.current.forEach(clearTimeout), []);

  // ---- Stats --------------------------------------------------------------
  const [statistics, setStatistics] = useState(() => {
    try {
      const saved = localStorage.getItem("focus-gacha-statistics");
      return saved ? JSON.parse(saved) : emptyStatistics;
    } catch {
      return emptyStatistics;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("focus-gacha-eggs", JSON.stringify(eggs));
    } catch {
      // ignore storage failures (e.g. private browsing)
    }
  }, [eggs]);

  useEffect(() => {
    try {
      localStorage.setItem("focus-gacha-statistics", JSON.stringify(statistics));
    } catch {
      // ignore storage failures
    }
  }, [statistics]);

  // ---- Countdown / overtime timer -----------------------------------------
  useEffect(() => {
    if (timeMode === "idle" || !isTimerRunning) return;
    const timerId = setInterval(() => {
      if (timeMode === "countdown") {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setTimeMode("overtime");
            playNotificationSound();
            notify("5 minutes done! Keep going, or mark it done.", "success");
            return 0;
          }
          return prev - 1;
        });
      } else if (timeMode === "overtime") {
        setOvertimeSec((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeMode, isTimerRunning]);

  const resetTimer = () => {
    setIsTimerRunning(false);
    setTimeLeft(0);
    setTimeMode("idle");
    setOvertimeSec(0);
  };

  const clearDraw = () => {
    setSelectedEgg(null);
    setDrawnBall(null);
    setHiddenId(null);
    setPhase("idle");
    resetTimer();
  };

  const busy = phase === "shaking" || phase === "dropping";

  // ---- Draw ---------------------------------------------------------------
  const handleDraw = () => {
    if (busy) return;

    if (eggs.length === 0) {
      notify("The pool is empty — add some tasks first.", "warn");
      setPanelTab("pool");
      setPanelOpen(true);
      return;
    }

    // A task already in progress counts as abandoned
    if (selectedEgg) {
      setStatistics((prev) => ({
        ...prev,
        taskHistory: prev.taskHistory.map((task) =>
          task.eggId === selectedEgg.id && task.status === "drawn"
            ? { ...task, status: "abandoned", completedAt: new Date().toISOString() }
            : task
        ),
      }));
      notify(`Set “${selectedEgg.name}” aside — drawing a new one.`);
    }

    clearDraw();
    setPhase("shaking");
    setTurns((n) => n + 1);

    const egg = eggs[Math.floor(Math.random() * eggs.length)];

    timeouts.current.push(
      setTimeout(() => {
        setHiddenId(egg.id);
        setDrawnBall(egg);
        setDrawKey((k) => k + 1);
        setPhase("dropping");

        setStatistics((prev) => ({
          ...prev,
          totalDraws: prev.totalDraws + 1,
          achievements: { ...prev.achievements, firstDraw: true },
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
        }));
      }, 1350)
    );

    timeouts.current.push(
      setTimeout(() => {
        setPhase("revealed");
        setSelectedEgg(egg);
        setLastEgg(egg);
        if (window.matchMedia("(max-width: 860px)").matches) {
          cardColRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 2250)
    );
  };

  // Done — only once the full 5 minutes have counted down (timer is in
  // overtime). Before that, nudge instead of silently counting it.
  const handlePutBack = () => {
    if (!selectedEgg) return;
    if (timeMode !== "overtime") {
      notify("Not yet — finish the full 5 minutes first.", "warn");
      return;
    }
    const totalTime = FOCUS_SECONDS + overtimeSec;

    setStatistics((prev) => {
      const completedTasks = prev.completedTasks + 1;
      const totalTimeSpent = prev.totalTimeSpent + totalTime;
      return {
        ...prev,
        completedTasks,
        totalTimeSpent,
        taskHistory: prev.taskHistory.map((task) =>
          task.eggId === selectedEgg.id && task.status === "drawn"
            ? { ...task, status: "completed", timeSpent: totalTime, completedAt: new Date().toISOString() }
            : task
        ),
        achievements: {
          ...prev.achievements,
          complete5Tasks: prev.achievements.complete5Tasks || completedTasks >= 5,
          complete10Tasks: prev.achievements.complete10Tasks || completedTasks >= 10,
          spend1Hour: prev.achievements.spend1Hour || totalTimeSpent >= 3600,
          spend5Hours: prev.achievements.spend5Hours || totalTimeSpent >= 18000,
        },
      };
    });

    clearDraw();
    notify("Nice work! The capsule is back in the pool.", "success");
  };

  // Skip for today: pull it out of the pool
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
    const id = selectedEgg.id;
    clearDraw();
    setEggs((prev) => prev.filter((egg) => egg.id !== id));
    notify("Skipped for today — add it back whenever you like.");
  };

  const handleDeleteEgg = (id) => {
    setEggs((prev) => prev.filter((egg) => egg.id !== id));
    if (selectedEgg && selectedEgg.id === id) clearDraw();
    notify("Capsule deleted.");
  };

  const handleAddEgg = ({ name, type, stars }) => {
    const trimmed = name.trim();
    if (!trimmed) {
      notify("Type a name for the new task first.", "warn");
      return false;
    }
    setEggs((prev) => [
      ...prev,
      { id: Date.now(), name: trimmed, type, stars: Math.max(1, Math.min(5, Number(stars) || 1)) },
    ]);
    notify("Added — watch it drop into the machine!", "success");
    return true;
  };

  // ---- Timer controls -----------------------------------------------------
  const handleStartTimer = () => {
    initAudioContext(); // needs a user gesture to unlock audio
    setTimeMode("countdown");
    setTimeLeft(FOCUS_SECONDS);
    setOvertimeSec(0);
    setIsTimerRunning(true);
  };
  const handlePauseTimer = () => setIsTimerRunning(false);
  const handleResumeTimer = () => timeMode !== "idle" && setIsTimerRunning(true);
  const handleResetTimer = () => resetTimer();
  const handleTestSound = () => {
    initAudioContext();
    playNotificationSound();
  };

  const handleResetStats = () => {
    const confirmed = window.confirm(
      "Reset all stats and achievements? This clears your draw count, focus time, and history for good."
    );
    if (!confirmed) return;
    setStatistics(emptyStatistics);
    notify("Stats and achievements reset.");
  };

  const openPanel = (tab) => {
    setPanelTab(tab);
    setPanelOpen(true);
  };
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const todayStats = computeTodayStats(statistics.taskHistory);
  const displayedStats = statsRange === "today" ? todayStats : statistics;
  const timer = { timeMode, timeLeft, overtimeSec, running: isTimerRunning };
  const ToastIcon = toast ? TOAST_ICON[toast.tone] : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Focus Gacha home">
            <LogoMark />
            <span>Focus Gacha</span>
          </a>
          <nav className="topbar-actions">
            <button type="button" className="pill-btn" onClick={() => openPanel("pool")}>
              <ListTodo size={17} />
              <span>Tasks</span>
              <span className="badge">{eggs.length}</span>
            </button>
            <button type="button" className="pill-btn" onClick={() => openPanel("stats")}>
              <Trophy size={17} />
              <span>Stats</span>
            </button>
          </nav>
        </header>

        <main className="stage">
          <section className="machine-col">
            <div className="machine-wrap">
              <GachaMachine
                eggs={eggs}
                hiddenId={hiddenId}
                phase={phase}
                drawnEgg={drawnBall}
                drawKey={drawKey}
                onTurn={handleDraw}
                canTurn={!busy}
                turns={turns}
              />
            </div>
            <motion.button
              type="button"
              className="btn btn-primary btn-lg draw-cta"
              onClick={handleDraw}
              disabled={busy}
              whileTap={{ scale: 0.97 }}
            >
              {busy ? "Drawing…" : selectedEgg ? "Draw another" : "Draw a task"}
            </motion.button>
          </section>

          <section className="card-col" ref={cardColRef}>
            <div className="intro">
              <p className="eyebrow">Five-minute focus</p>
              <h1>
                Draw a task. <em>Give it five minutes.</em>
              </h1>
              <p className="lede">More is fine — less isn’t.</p>
            </div>

            <TaskCard
              egg={selectedEgg || lastEgg}
              faceUp={!!selectedEgg}
              phase={phase}
              poolEmpty={eggs.length === 0}
              timer={timer}
            />

            <div className="controls-slot">
              <AnimatePresence mode="wait">
                {selectedEgg ? (
                  <motion.div
                    key="controls"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.25, type: "spring", stiffness: 260, damping: 26 } }}
                    exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                  >
                    <TaskControls
                      timer={timer}
                      audioReady={audioReady}
                      onStart={handleStartTimer}
                      onPause={handlePauseTimer}
                      onResume={handleResumeTimer}
                      onReset={handleResetTimer}
                      onTestSound={handleTestSound}
                      onDone={handlePutBack}
                      onSkip={handleRemoveForToday}
                    />
                  </motion.div>
                ) : eggs.length === 0 ? (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button type="button" className="btn btn-cream" onClick={() => openPanel("pool")}>
                      Add tasks to the pool
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </section>
        </main>

        <div className="toast-region" aria-live="polite">
          <AnimatePresence>
            {toast && (
              <motion.div
                key={toast.id}
                className={`toast ${toast.tone}`}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
              >
                <ToastIcon size={16} />
                {toast.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Drawer
          open={panelOpen}
          onClose={closePanel}
          isMobile={isMobile}
          tab={panelTab}
          onTab={setPanelTab}
          tabs={PANEL_TABS}
        >
          {panelTab === "pool" ? (
            <PoolPanel eggs={eggs} onAdd={handleAddEgg} onDelete={handleDeleteEgg} />
          ) : (
            <StatsPanel
              stats={displayedStats}
              statistics={statistics}
              range={statsRange}
              onRange={setStatsRange}
              onReset={handleResetStats}
            />
          )}
        </Drawer>
      </div>
    </MotionConfig>
  );
}

export default App;
