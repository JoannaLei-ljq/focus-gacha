import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PALETTE, capsuleColor } from "../lib/utils";

// ---------------------------------------------------------------------------
// Geometry (all in SVG viewBox units, so everything scales with the machine)
// ---------------------------------------------------------------------------
const VB_W = 320;
const VB_H = 460;
const R = 22; // capsule radius (physics)
const ART_R = 17; // radius the capsule artwork is drawn at
const MAX_VISIBLE = 12;

// Inside of the glass bowl, as a rounded rectangle. Capsules collide with
// this shape (straight walls + rounded corners), matching what's drawn.
const BOX = { x0: 46, x1: 274, y0: 100, y1: 266, r: 46 };
const INNER = {
  x0: BOX.x0 + BOX.r,
  x1: BOX.x1 - BOX.r,
  y0: BOX.y0 + BOX.r,
  y1: BOX.y1 - BOX.r,
};

const GRAVITY = 1150; // units / s² — a bit floaty, so tumbles read as gentle
const BALL_RESTITUTION = 0.25;
const WALL_RESTITUTION = 0.3;
const DEG = 180 / Math.PI;

// Window where the drawn capsule lands, and the knob — shared between the
// SVG drawing and the HTML overlays positioned on top of it.
const CHUTE = { x: 62, y: 296, w: 104, h: 100 };
const KNOB = { cx: 222, cy: 334, r: 38 };

const pct = (v, total) => `${(v / total) * 100}%`;

function spawnBody(scatter = false) {
  return {
    x: 96 + Math.random() * 128,
    y: scatter ? 120 + Math.random() * 120 : 112 + Math.random() * 14,
    vx: (Math.random() - 0.5) * 90,
    vy: scatter ? 0 : 40,
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 120,
    sleep: false,
    still: 0,
  };
}

// One physics step. Position-based separation + impulses: cheap, stable,
// and settles into a natural-looking pile instead of jittering forever.
function step(bodies, dt, force) {
  const list = [...bodies.values()];

  for (const b of list) {
    if (b.sleep) continue;
    b.vy += GRAVITY * dt;
    if (force) {
      b.vx += force.x * dt;
      b.vy += force.y * dt;
    }
    b.vx *= 1 - 0.4 * dt;
    b.vy *= 1 - 0.1 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    b.vr *= 1 - 2.2 * dt;
  }

  // Capsule ↔ capsule
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const c = list[j];
      if (a.sleep && c.sleep) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 2 * R;
      if (d2 >= min * min || d2 === 0) continue;

      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = min - d;
      const rvx = c.vx - a.vx;
      const rvy = c.vy - a.vy;
      const vn = rvx * nx + rvy * ny; // < 0 means approaching

      // A hard hit wakes a sleeping capsule; a gentle touch doesn't, so the
      // pile stays put while new capsules land on top.
      if (a.sleep && vn < -90) a.sleep = false;
      if (c.sleep && vn < -90) c.sleep = false;

      if (a.sleep) {
        c.x += nx * overlap;
        c.y += ny * overlap;
      } else if (c.sleep) {
        a.x -= nx * overlap;
        a.y -= ny * overlap;
      } else {
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        c.x += (nx * overlap) / 2;
        c.y += (ny * overlap) / 2;
      }

      if (vn < 0) {
        const share = a.sleep || c.sleep ? 1 : 2;
        const imp = (-(1 + BALL_RESTITUTION) * vn) / share;
        if (!a.sleep) {
          a.vx -= imp * nx;
          a.vy -= imp * ny;
        }
        if (!c.sleep) {
          c.vx += imp * nx;
          c.vy += imp * ny;
        }
        // Glancing hits add spin
        const vt = -rvx * ny + rvy * nx;
        if (!a.sleep) a.vr += vt * 0.22;
        if (!c.sleep) c.vr -= vt * 0.22;
      }
    }
  }

  // Capsule ↔ rounded-rect glass
  for (const b of list) {
    if (b.sleep) continue;
    const cx = Math.min(Math.max(b.x, INNER.x0), INNER.x1);
    const cy = Math.min(Math.max(b.y, INNER.y0), INNER.y1);
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    const max = BOX.r - R;
    if (d > max) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = cx + nx * max;
      b.y = cy + ny * max;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) {
        b.vx -= (1 + WALL_RESTITUTION) * vn * nx;
        b.vy -= (1 + WALL_RESTITUTION) * vn * ny;
        const tx = -ny;
        const ty = nx;
        const vt = b.vx * tx + b.vy * ty;
        b.vx -= vt * tx * 0.05;
        b.vy -= vt * ty * 0.05;
        b.vr = (-vt / R) * DEG * 0.45; // roll along the glass
      }
    }
  }

  // Put still capsules to sleep so the pile is perfectly calm at rest
  for (const b of list) {
    if (b.sleep) continue;
    if (!force && Math.hypot(b.vx, b.vy) < 20) {
      b.still += dt;
      if (b.still > 0.3) {
        b.sleep = true;
        b.vx = 0;
        b.vy = 0;
        b.vr = 0;
      }
    } else {
      b.still = 0;
    }
  }
}

function wakeAll(bodies) {
  for (const b of bodies.values()) {
    b.sleep = false;
    b.still = 0;
  }
}

// Build the first pile off-screen so the page opens with capsules already
// resting at the bottom — no flash of balls hanging in mid-air.
function presettle(ids) {
  const bodies = new Map();
  ids.forEach((id) => bodies.set(id, spawnBody(true)));
  for (let i = 0; i < 360; i++) step(bodies, 1 / 120, null);
  return bodies;
}

function starPoints(outer, inner, cx = 0, cy = 0, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / n) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const HEART =
  "M0 4 C -4.5 0.8 -6 -2 -4 -4 C -2.5 -5.4 -0.7 -4.8 0 -3.3 C 0.7 -4.8 2.5 -5.4 4 -4 C 6 -2 4.5 0.8 0 4 Z";
const SMALL_STAR = starPoints(5.6, 2.5);

// A capsule drawn at the origin. The inner group spins; the glossy
// highlight sits outside it so the light source stays fixed.
function CapsuleShape({ color, type }) {
  const p = PALETTE[color];
  const R = ART_R;
  return (
    <g transform={`scale(${22 / ART_R})`}>
      <g className="capsule-spin">
        <circle r={R} fill={`url(#cap-${color})`} />
        <path d={`M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0 Z`} fill="#fff" opacity="0.42" />
        <path d={`M ${-R + 1.5} 0 L ${R - 1.5} 0`} stroke={p.deep} strokeWidth="1.3" opacity="0.45" />
        {type === "want" ? (
          <path d={HEART} fill="#fff" opacity="0.9" transform="translate(0 6) scale(0.85)" />
        ) : (
          <polygon points={SMALL_STAR} fill="#fff" opacity="0.9" transform="translate(0 6.5)" />
        )}
      </g>
      <ellipse cx="-6.5" cy="-8.5" rx="5.5" ry="3.2" fill="#fff" opacity="0.85" transform="rotate(-32 -6.5 -8.5)" />
      <circle r={R - 0.5} fill="none" stroke={p.deep} strokeOpacity="0.25" />
    </g>
  );
}

export default function GachaMachine({
  eggs,
  hiddenId,
  phase, // idle | shaking | dropping | revealed
  drawnEgg,
  drawKey,
  onTurn,
  canTurn,
  turns, // increments on every draw; spins the knob
}) {
  const visible = eggs.filter((egg) => egg.id !== hiddenId).slice(0, MAX_VISIBLE);
  const visibleKey = visible.map((e) => e.id).join(",");

  const [bodies] = useState(() => presettle(visible.map((e) => e.id)));
  const nodes = useRef(new Map());
  const shakingRef = useRef(false);
  const [leaving, setLeaving] = useState(null);

  useEffect(() => {
    shakingRef.current = phase === "shaking";
  }, [phase]);

  // Make sure every visible capsule has a body before paint, so a newly
  // rendered node never shows up at (0, 0) for a frame.
  for (const egg of visible) {
    if (!bodies.has(egg.id)) bodies.set(egg.id, spawnBody(false));
  }

  // Drop bodies whose capsules are gone; when the drawn capsule leaves the
  // bowl, keep a ghost of it shrinking away at its last position.
  useLayoutEffect(() => {
    const keep = new Set(visible.map((e) => e.id));
    let changed = false;
    for (const id of [...bodies.keys()]) {
      if (keep.has(id)) continue;
      const b = bodies.get(id);
      const egg = eggs.find((e) => e.id === id);
      if (id === hiddenId && egg) {
        // Reading the body's last position is a measurement, like reading
        // layout — it has to happen here, after the body leaves the sim.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLeaving({ id, x: b.x, y: b.y, rot: b.rot, color: capsuleColor(egg), type: egg.type });
      }
      bodies.delete(id);
      changed = true;
    }
    if (changed) wakeAll(bodies);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, hiddenId]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), 450);
    return () => clearTimeout(t);
  }, [leaving]);

  // Start of a shake: toss everything up once
  useEffect(() => {
    if (phase !== "shaking") return;
    for (const b of bodies.values()) {
      b.sleep = false;
      b.still = 0;
      b.vx += (Math.random() - 0.5) * 240;
      b.vy -= 260 + Math.random() * 260;
      b.vr += (Math.random() - 0.5) * 260;
    }
  }, [phase, bodies]);

  // Animation loop: real-time physics on requestAnimationFrame, writing
  // transforms straight to the SVG nodes (no React re-render per frame).
  useEffect(() => {
    let raf;
    let last = performance.now();
    const loop = (now) => {
      const frame = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const shaking = shakingRef.current;

      let force = null;
      if (shaking) {
        force = { x: Math.sin(now / 85) * 1100, y: 0 };
        for (const b of bodies.values()) {
          b.sleep = false;
          if (Math.random() < frame * 1.6) {
            b.vx += (Math.random() - 0.5) * 200;
            b.vy -= 200 + Math.random() * 220;
          }
        }
      }

      let awake = false;
      for (const b of bodies.values()) if (!b.sleep) awake = true;

      if (awake) {
        const sub = 3;
        for (let i = 0; i < sub; i++) step(bodies, frame / sub, force);
        for (const [id, b] of bodies) {
          const el = nodes.current.get(id);
          if (!el) continue;
          el.setAttribute("transform", `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`);
          el.firstChild.setAttribute("transform", `rotate(${b.rot.toFixed(1)})`);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bodies]);

  const opened = phase === "revealed";
  const drawnColor = drawnEgg ? capsuleColor(drawnEgg) : null;

  return (
    <motion.div
      className="machine"
      animate={
        phase === "shaking"
          ? { rotate: [0, -2.2, 2.4, -2, 1.8, -1.2, 0.8, 0], y: [0, -3, 0, -3, 0, -2, 0, 0] }
          : { rotate: 0, y: 0 }
      }
      transition={phase === "shaking" ? { duration: 1.3, ease: "easeInOut" } : { type: "spring", stiffness: 200, damping: 18 }}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="machine-svg" role="img" aria-label={`Gacha machine with ${eggs.length} tasks`}>
        <defs>
          <linearGradient id="glassFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F4FAFE" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#D2E7F7" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A2CFF1" />
            <stop offset="55%" stopColor="#82B8E5" />
            <stop offset="100%" stopColor="#6FA8DA" />
          </linearGradient>
          <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ADD6F4" />
            <stop offset="100%" stopColor="#80B6E4" />
          </linearGradient>
          <radialGradient id="knobGrad" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#FCD0DB" />
            <stop offset="60%" stopColor="#F4A3B8" />
            <stop offset="100%" stopColor="#E68BA5" />
          </radialGradient>
          <linearGradient id="windowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4F80B4" />
            <stop offset="100%" stopColor="#6797C9" />
          </linearGradient>
          <linearGradient id="windowShade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E3A5C" stopOpacity="0.45" />
            <stop offset="45%" stopColor="#1E3A5C" stopOpacity="0" />
          </linearGradient>
          {Object.entries(PALETTE).map(([key, p]) => (
            <radialGradient key={key} id={`cap-${key}`} cx="36%" cy="30%" r="80%">
              <stop offset="0%" stopColor={p.light} />
              <stop offset="55%" stopColor={p.base} />
              <stop offset="100%" stopColor={p.deep} />
            </radialGradient>
          ))}
          <clipPath id="bowlClip">
            <rect x="36" y="86" width="248" height="190" rx="56" />
          </clipPath>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#2E4A70" floodOpacity="0.18" />
          </filter>
          <filter id="blurShadow" x="-30%" y="-200%" width="160%" height="500%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* ground shadow */}
        <ellipse cx="160" cy="446" rx="122" ry="10" fill="#2E4A70" opacity="0.18" filter="url(#blurShadow)" />

        {/* glass bowl — back */}
        <rect x="36" y="86" width="248" height="190" rx="56" fill="url(#glassFill)" />

        {/* capsules */}
        <g clipPath="url(#bowlClip)">
          {visible.map((egg) => {
            const b = bodies.get(egg.id);
            return (
              <g
                key={egg.id}
                ref={(el) => {
                  if (el) nodes.current.set(egg.id, el);
                  else nodes.current.delete(egg.id);
                }}
                transform={`translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`}
              >
                <g transform={`rotate(${b.rot.toFixed(1)})`}>
                  <CapsuleShape color={capsuleColor(egg)} type={egg.type} />
                </g>
              </g>
            );
          })}
          {leaving && (
            <g key={`leave-${leaving.id}`} transform={`translate(${leaving.x} ${leaving.y})`}>
              <g className="capsule-leave">
                <g transform={`rotate(${leaving.rot})`}>
                  <CapsuleShape color={leaving.color} type={leaving.type} />
                </g>
              </g>
            </g>
          )}
        </g>

        {/* glass bowl — front reflections */}
        <rect x="36" y="86" width="248" height="190" rx="56" fill="none" stroke="#fff" strokeOpacity="0.95" strokeWidth="3" />
        <rect x="34.5" y="84.5" width="251" height="193" rx="57.5" fill="none" stroke="#9CC4E6" strokeOpacity="0.55" strokeWidth="1.2" />
        <path d="M58 196 Q54 138 86 112" stroke="#fff" strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.7" />
        <path d="M57 218 L57 226" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity="0.6" />
        <path d="M262 130 Q268 160 264 200" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.35" />

        {/* cap */}
        <rect x="40" y="96" width="240" height="14" rx="7" fill="#5F93C6" opacity="0.28" />
        <g filter="url(#soft)">
          <rect x="26" y="42" width="268" height="62" rx="28" fill="url(#capGrad)" />
        </g>
        <path d="M54 50 H266" stroke="#fff" strokeOpacity="0.5" strokeWidth="4" strokeLinecap="round" />
        <text x="160" y="83.5" textAnchor="middle" className="machine-title machine-title-light">
          FOCUS GACHA
        </text>
        <text x="160" y="85" textAnchor="middle" className="machine-title">
          FOCUS GACHA
        </text>

        {/* little cloud */}
        <g transform="translate(52 34)" filter="url(#soft)">
          <circle cx="0" cy="8" r="9" fill="#fff" />
          <circle cx="11" cy="2" r="12" fill="#fff" />
          <circle cx="24" cy="8" r="9" fill="#fff" />
          <rect x="-4" y="6" width="32" height="11" rx="5.5" fill="#fff" />
        </g>

        {/* body */}
        <g filter="url(#soft)">
          <rect x="38" y="262" width="244" height="172" rx="30" fill="url(#bodyGrad)" />
        </g>
        <rect x="52" y="267" width="216" height="6" rx="3" fill="#fff" opacity="0.4" />
        <rect x="38" y="410" width="244" height="24" rx="12" fill="#5E97CC" opacity="0.25" />

        {/* chute window */}
        <rect x={CHUTE.x} y={CHUTE.y} width={CHUTE.w} height={CHUTE.h} rx="24" fill="url(#windowGrad)" />
        <rect x={CHUTE.x + 10} y={CHUTE.y + CHUTE.h - 22} width={CHUTE.w - 20} height="14" rx="7" fill="#2D557F" opacity="0.35" />

        {/* small cream button */}
        <circle cx="262" cy="292" r="7" fill="#FFF3DC" />
        <circle cx="262" cy="292" r="7" fill="none" stroke="#5E97CC" strokeOpacity="0.4" />

        {/* knob */}
        <circle cx={KNOB.cx} cy={KNOB.cy} r={KNOB.r} fill="#6DA5D8" />
        <circle cx={KNOB.cx} cy={KNOB.cy + 1.5} r={KNOB.r - 2} fill="#5C94C9" opacity="0.6" />
        <motion.g
          className="knob"
          animate={{ rotate: turns * 360 }}
          transition={{ type: "spring", stiffness: 55, damping: 13, mass: 1 }}
        >
          <circle cx={KNOB.cx} cy={KNOB.cy} r={KNOB.r - 5} fill="url(#knobGrad)" />
          <g transform={`rotate(-35 ${KNOB.cx} ${KNOB.cy})`}>
            <rect x={KNOB.cx - 23} y={KNOB.cy - 6.5} width="46" height="13" rx="6.5" fill="#DF7E99" />
            <rect x={KNOB.cx - 20} y={KNOB.cy - 4.5} width="40" height="4" rx="2" fill="#C9677F" opacity="0.6" />
          </g>
          <ellipse cx={KNOB.cx - 13} cy={KNOB.cy - 15} rx="8" ry="4.5" fill="#fff" opacity="0.55" transform={`rotate(-30 ${KNOB.cx - 13} ${KNOB.cy - 15})`} />
        </motion.g>

        {/* LED counter */}
        <rect x="186" y="386" width="72" height="24" rx="7" fill="#2F4E72" />
        <text x="222" y="403" textAnchor="middle" className="machine-led">
          {`POOL ${String(eggs.length).padStart(2, "0")}`}
        </text>
      </svg>

      {/* drawn capsule, dropping into the chute window */}
      <div
        className="chute"
        style={{
          left: pct(CHUTE.x, VB_W),
          top: pct(CHUTE.y, VB_H),
          width: pct(CHUTE.w, VB_W),
          height: pct(CHUTE.h, VB_H),
        }}
      >
        <div className="chute-shade" />
        <AnimatePresence>
          {drawnEgg && (
            <motion.div
              key={drawKey}
              className="drop-capsule"
              style={{
                "--c-base": PALETTE[drawnColor].base,
                "--c-light": PALETTE[drawnColor].light,
                "--c-deep": PALETTE[drawnColor].deep,
              }}
              initial={{ y: "-170%", rotate: -60, opacity: 1 }}
              animate={{ y: "0%", rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0, y: "20%", transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
              transition={{ type: "spring", stiffness: 300, damping: 12, mass: 0.9 }}
            >
              <motion.div
                className="drop-capsule-top"
                animate={opened ? { y: "-62%", x: "34%", rotate: 34 } : { y: "0%", x: "0%", rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 15 }}
              />
              <div className="drop-capsule-bottom" />
              <AnimatePresence>
                {opened && (
                  <>
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="sparkle"
                        initial={{ scale: 0, opacity: 0, x: "-50%", y: "0%" }}
                        animate={{
                          scale: [0, 1, 0.8],
                          opacity: [0, 1, 0],
                          x: ["-50%", `${-50 + (i - 1) * 140}%`],
                          y: ["0%", `${-160 - (i % 2) * 60}%`],
                        }}
                        transition={{ duration: 0.9, delay: 0.08 * i, ease: "easeOut" }}
                      />
                    ))}
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* accessible knob control */}
      <button
        type="button"
        className="knob-hit"
        style={{
          left: pct(KNOB.cx - KNOB.r, VB_W),
          top: pct(KNOB.cy - KNOB.r, VB_H),
          width: pct(KNOB.r * 2, VB_W),
          height: pct(KNOB.r * 2, VB_H),
        }}
        onClick={onTurn}
        disabled={!canTurn}
        aria-label="Turn the knob to draw a task"
      />
    </motion.div>
  );
}
