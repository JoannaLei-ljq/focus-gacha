import { useEffect, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "motion/react";
import {
  X,
  Plus,
  Trash2,
  Star,
  Sparkles,
  Clock,
  Rocket,
  Gem,
  Check,
  SkipForward,
  Target,
  Ban,
  RotateCcw,
} from "lucide-react";
import Stars from "./Stars";
import { PALETTE, capsuleColor, formatDuration, typeLabel } from "../lib/utils";

// ---------------------------------------------------------------------------
// Drawer: slides in from the right on desktop, up from the bottom on phones
// (where it can also be dragged down by its grip to dismiss).
// ---------------------------------------------------------------------------
export function Drawer({ open, onClose, isMobile, tab, onTab, tabs, children }) {
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const hidden = isMobile ? { y: "100%" } : { x: "100%" };
  const shown = isMobile ? { y: 0 } : { x: 0 };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={tabs.find((t) => t.id === tab)?.label}
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            drag={isMobile ? "y" : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            {isMobile && (
              <div className="drawer-grip" onPointerDown={(e) => drag.start(e)}>
                <span />
              </div>
            )}
            <header className="drawer-head" onPointerDown={(e) => isMobile && drag.start(e)}>
              <div className="segmented" role="tablist">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={tab === t.id ? "active" : ""}
                    onClick={() => onTab(t.id)}
                  >
                    {tab === t.id && (
                      <motion.span layoutId="seg-pill" className="segmented-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                    )}
                    <span className="segmented-label">{t.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
                <X size={18} />
              </button>
            </header>
            <div className="drawer-body">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Task pool
// ---------------------------------------------------------------------------
export function PoolPanel({ eggs, onAdd, onDelete }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("want");
  const [stars, setStars] = useState(3);
  const [hoverStars, setHoverStars] = useState(0);

  const submit = (e) => {
    e.preventDefault();
    if (onAdd({ name, type, stars })) {
      setName("");
      setStars(3);
      setType("want");
    }
  };

  return (
    <div className="pool">
      <form className="add-form" onSubmit={submit}>
        <label className="field-label" htmlFor="new-task">
          New capsule
        </label>
        <input
          id="new-task"
          className="input"
          placeholder="e.g. Outline chapter 3, tidy the desk…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <div className="add-row">
          <div className="type-toggle" role="radiogroup" aria-label="Task type">
            {["want", "need"].map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                className={`type-opt ${t} ${type === t ? "active" : ""}`}
                onClick={() => setType(t)}
              >
                <span className="type-dot" />
                {t === "want" ? "Want" : "Need"}
              </button>
            ))}
          </div>
          <div className="star-picker" role="radiogroup" aria-label="Stars" onMouseLeave={() => setHoverStars(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={(hoverStars || stars) >= n ? "on" : ""}
                onMouseEnter={() => setHoverStars(n)}
                onClick={() => setStars(n)}
              >
                <Star size={18} strokeWidth={2.2} />
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          <Plus size={17} strokeWidth={2.6} /> Add to pool
        </button>
      </form>

      <div className="section-head">
        <h3>In the pool</h3>
        <span className="count-chip">{eggs.length}</span>
      </div>
      <ul className="task-list">
        <AnimatePresence initial={false}>
          {eggs.map((egg) => {
            const c = PALETTE[capsuleColor(egg)];
            return (
              <motion.li
                key={egg.id}
                layout
                className="task-row"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              >
                <span className="task-capsule" style={{ "--c-base": c.base, "--c-deep": c.deep, "--c-light": c.light }} />
                <div className="task-row-main">
                  <span className="task-row-name">{egg.name}</span>
                  <span className="task-row-meta">
                    {typeLabel(egg.type)} · <Stars count={egg.stars} size={11} />
                  </span>
                </div>
                <button type="button" className="icon-btn danger" onClick={() => onDelete(egg.id)} aria-label={`Delete ${egg.name}`}>
                  <Trash2 size={16} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {eggs.length === 0 && <li className="empty">Pool’s empty — add a few capsules to get rolling.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats & achievements
// ---------------------------------------------------------------------------
const ACHIEVEMENTS = [
  { key: "firstDraw", icon: Sparkles, title: "First try", desc: "Draw your first capsule", color: "butter" },
  { key: "complete5Tasks", icon: Star, title: "Getting there", desc: "Complete 5 tasks", color: "pink" },
  { key: "spend1Hour", icon: Clock, title: "Focused", desc: "1 hour total focus", color: "sky" },
  { key: "complete10Tasks", icon: Rocket, title: "Task master", desc: "Complete 10 tasks", color: "peach" },
  { key: "spend5Hours", icon: Gem, title: "Deep focus", desc: "5 hours total focus", color: "lilac" },
];

const STATUS = {
  completed: { icon: Check, label: "Done" },
  skipped: { icon: SkipForward, label: "Skipped" },
  drawn: { icon: Target, label: "In progress" },
  abandoned: { icon: Ban, label: "Abandoned" },
};

export function StatsPanel({ stats, statistics, range, onRange, onReset }) {
  const rate = stats.totalDraws > 0 ? Math.round((stats.completedTasks / stats.totalDraws) * 100) : 0;
  const tiles = [
    { label: "Draws", value: stats.totalDraws },
    { label: "Completed", value: stats.completedTasks },
    { label: "Completion", value: `${rate}%` },
    { label: "Focus time", value: formatDuration(stats.totalTimeSpent) },
  ];
  const unlocked = ACHIEVEMENTS.filter((a) => statistics.achievements[a.key]).length;

  return (
    <div className="stats">
      <div className="section-head">
        <div className="mini-toggle">
          {[
            ["today", "Today"],
            ["all", "All time"],
          ].map(([id, label]) => (
            <button key={id} type="button" className={range === id ? "active" : ""} onClick={() => onRange(id)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="text-btn" onClick={onReset}>
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <motion.span key={`${range}-${t.value}`} className="tile-value" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {t.value}
            </motion.span>
            <span className="tile-label">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h3>Stickers</h3>
        <span className="count-chip">
          {unlocked}/{ACHIEVEMENTS.length}
        </span>
      </div>
      <div className="stickers">
        {ACHIEVEMENTS.map(({ key, icon: Icon, title, desc, color }) => {
          const on = statistics.achievements[key];
          const c = PALETTE[color];
          return (
            <div key={key} className={`sticker ${on ? "on" : ""}`} style={{ "--c-base": c.base, "--c-light": c.light, "--c-deep": c.deep }} title={desc}>
              <span className="sticker-badge">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span className="sticker-title">{title}</span>
              <span className="sticker-desc">{desc}</span>
            </div>
          );
        })}
      </div>

      <div className="section-head">
        <h3>Recent</h3>
      </div>
      <ul className="history">
        {statistics.taskHistory
          .slice(-10)
          .reverse()
          .map((task) => {
            const s = STATUS[task.status] || STATUS.drawn;
            const Icon = s.icon;
            return (
              <li key={task.id} className="history-row">
                <div className="history-main">
                  <span className="history-name">{task.taskName}</span>
                  <span className="history-meta">
                    {typeLabel(task.taskType)} ·{" "}
                    {new Date(task.drawnAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <span className={`status-chip ${task.status}`}>
                  <Icon size={13} strokeWidth={2.4} />
                  {s.label}
                  {task.status === "completed" && ` · ${formatDuration(task.timeSpent)}`}
                </span>
              </li>
            );
          })}
        {statistics.taskHistory.length === 0 && <li className="empty">No history yet — go draw your first capsule!</li>}
      </ul>
    </div>
  );
}
