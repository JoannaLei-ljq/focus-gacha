import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, RotateCcw, Bell, BellRing, Check, Lock, SkipForward } from "lucide-react";
import Stars from "./Stars";
import { FOCUS_SECONDS, formatTime } from "../lib/utils";

const FLAVOR = {
  want: "Something you actually want to do. Dive in and enjoy the flow — momentum starts here.",
  need: "Not glamorous, but future-you will thank you. Just start: five minutes is all it asks.",
};

function sunburst(points, outer, inner, c = 100) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
const BURST = sunburst(14, 96, 62);

function TimerRing({ timeMode, timeLeft, overtimeSec, running }) {
  const C = 2 * Math.PI * 46;
  const progress =
    timeMode === "idle" ? 0 : timeMode === "countdown" ? (FOCUS_SECONDS - timeLeft) / FOCUS_SECONDS : 1;

  let label = "Ready";
  let time = formatTime(FOCUS_SECONDS);
  if (timeMode === "countdown") {
    label = running ? "Focusing" : "Paused";
    time = formatTime(timeLeft);
  } else if (timeMode === "overtime") {
    label = running ? "Bonus time" : "Paused";
    time = `+${formatTime(overtimeSec)}`;
  }

  return (
    <div className={`ring ${timeMode} ${running ? "running" : ""}`}>
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r="46" className="ring-track" />
        <motion.circle
          cx="55"
          cy="55"
          r="46"
          className="ring-progress"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: C * (1 - progress) }}
          transition={{ duration: 0.9, ease: "linear" }}
          transform="rotate(-90 55 55)"
        />
      </svg>
      <div className="ring-center" role="timer" aria-live="off">
        <span className="ring-time">{time}</span>
        <span className="ring-label">{label}</span>
      </div>
    </div>
  );
}

export function TaskCard({ egg, faceUp, phase, poolEmpty, timer }) {
  const drawing = phase === "shaking" || phase === "dropping";
  return (
    <div className="card-scene">
      <motion.div
        className="card"
        initial={false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ type: "spring", stiffness: 120, damping: 16, mass: 1 }}
      >
        {/* front */}
        <div className="card-face card-front" data-type={egg?.type ?? "want"} aria-hidden={!faceUp}>
          {egg && (
            <>
              <header className="card-head">
                <span>{egg.type === "want" ? "WANT" : "NEED"}</span>
                <span className="card-no">No.{String(egg.id).slice(-3).padStart(3, "0")}</span>
              </header>
              <div className="card-art">
                <svg className={`burst ${timer.running ? "spin" : ""}`} viewBox="0 0 200 200" aria-hidden="true">
                  <polygon points={BURST} />
                </svg>
                <TimerRing {...timer} />
              </div>
              <div className="card-namebar">
                <h2 className="card-name">{egg.name}</h2>
                <Stars count={egg.stars} size={13} className="card-stars" />
              </div>
              <p className="card-power">
                <span className="card-power-label">Power:</span>
                <span>{FLAVOR[egg.type]}</span>
              </p>
              <footer className="card-foot">≈ focus 5 min or more to count this round ≈</footer>
            </>
          )}
        </div>

        {/* back */}
        <div className="card-face card-back" aria-hidden={faceUp}>
          <motion.div
            className="card-back-inner"
            animate={drawing ? { rotate: [0, -1.5, 1.5, -1, 1, 0], scale: [1, 1.02, 1] } : { rotate: 0, scale: 1 }}
            transition={drawing ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
          >
            <div className="card-back-emblem" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" fill="#F4A3B8" />
                <path d="M6 24 A18 18 0 0 1 42 24 Z" fill="#fff" opacity="0.55" />
                <path d="M7 24 H41" stroke="#DE7F9A" strokeWidth="1.6" opacity="0.6" />
                <ellipse cx="17" cy="15" rx="5" ry="3" fill="#fff" opacity="0.85" transform="rotate(-30 17 15)" />
              </svg>
            </div>
            <p className="card-back-title">Focus Gacha</p>
            <p className="card-back-hint">
              {drawing ? "Drawing your task…" : poolEmpty ? "Your pool is empty" : "Turn the pink knob to draw"}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export function TaskControls({ timer, audioReady, onStart, onPause, onResume, onReset, onTestSound, onDone, onSkip }) {
  const { timeMode, running } = timer;
  const doneUnlocked = timeMode === "overtime";

  return (
    <div className="controls">
      <div className="controls-row">
        <AnimatePresence mode="popLayout" initial={false}>
          {timeMode === "idle" && (
            <motion.button key="start" {...swap} type="button" className="btn btn-primary btn-lg grow" onClick={onStart}>
              <Play size={18} fill="currentColor" /> Start 5-min focus
            </motion.button>
          )}
          {timeMode !== "idle" && running && (
            <motion.button key="pause" {...swap} type="button" className="btn btn-cream btn-lg grow" onClick={onPause}>
              <Pause size={18} fill="currentColor" /> Pause
            </motion.button>
          )}
          {timeMode !== "idle" && !running && (
            <motion.button key="resume" {...swap} type="button" className="btn btn-primary btn-lg grow" onClick={onResume}>
              <Play size={18} fill="currentColor" /> Resume
            </motion.button>
          )}
        </AnimatePresence>
        {timeMode !== "idle" && (
          <button type="button" className="btn btn-cream btn-icon btn-lg" onClick={onReset} aria-label="Reset timer" title="Reset timer">
            <RotateCcw size={18} />
          </button>
        )}
        <button
          type="button"
          className={`btn btn-cream btn-icon btn-lg ${audioReady ? "is-on" : ""}`}
          onClick={onTestSound}
          aria-label={audioReady ? "Sound is on — play test sound" : "Enable sound"}
          title={audioReady ? "Sound on · tap to test" : "Tap to enable sound"}
        >
          {audioReady ? <BellRing size={18} /> : <Bell size={18} />}
        </button>
      </div>

      <div className="controls-row">
        <button
          type="button"
          className={`btn btn-mint grow ${doneUnlocked ? "" : "is-locked"}`}
          onClick={onDone}
          aria-disabled={!doneUnlocked}
        >
          {doneUnlocked ? <Check size={17} strokeWidth={2.6} /> : <Lock size={15} />}
          {doneUnlocked ? "Done · back to pool" : "Done unlocks at 5:00"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          <SkipForward size={16} /> Skip today
        </button>
      </div>
    </div>
  );
}

const swap = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
  transition: { type: "spring", stiffness: 400, damping: 28 },
};
