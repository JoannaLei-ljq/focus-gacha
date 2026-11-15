// Shared helpers: time formatting, stats math, and capsule colors.

export const FOCUS_SECONDS = 5 * 60;

// Format seconds as mm:ss
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Format seconds into a friendlier duration string
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

// Is this task-history timestamp from today (local calendar day)?
export function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Today-only totals, in the same shape as the lifetime stats so the stat
// tiles can render either one interchangeably.
export function computeTodayStats(taskHistory) {
  const todays = taskHistory.filter((task) => isToday(task.drawnAt));
  const completed = todays.filter((task) => task.status === "completed");
  return {
    totalDraws: todays.length,
    completedTasks: completed.length,
    totalTimeSpent: completed.reduce((sum, task) => sum + (task.timeSpent || 0), 0),
  };
}

// Capsule palette. "Want" tasks get warm candy colors, "need" tasks get
// cool ones, so the dome reads at a glance without labels.
export const PALETTE = {
  pink: { base: "#F4A3B8", light: "#FBD3DE", deep: "#DE7F9A" },
  peach: { base: "#F8BE94", light: "#FCDDC6", deep: "#E0956A" },
  butter: { base: "#F5D77E", light: "#FBEBBC", deep: "#D9B451" },
  mint: { base: "#9FD8B9", light: "#CFEEDC", deep: "#6DB892" },
  sky: { base: "#96C6EE", light: "#CBE3F7", deep: "#659FD3" },
  lilac: { base: "#C3B2EA", light: "#E3DAF6", deep: "#9A85D3" },
};

const WANT_COLORS = ["pink", "peach", "butter"];
const NEED_COLORS = ["mint", "sky", "lilac"];

// Stable color per task: hashed from the id so a capsule keeps its color
// across reloads and redraws.
export function capsuleColor(egg) {
  const list = egg.type === "want" ? WANT_COLORS : NEED_COLORS;
  const id = String(egg.id);
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return list[hash % list.length];
}

export function typeLabel(type) {
  return type === "want" ? "Want to do" : "Need to do";
}
