import { useEffect, useMemo } from "react";
import { motion, useReducedMotionConfig } from "motion/react";

/**
 * The bleed: a colour that spreads across the whole window like ink and covers it. While
 * the window is covered the colour settles into the app's own background, and then the
 * whole thing fades away to show what is underneath. Settling first means a light bleed
 * never flashes against a dark app, or the other way round.
 *
 *   from a point      spreads outwards from where you clicked
 *   from the bottom   rises from the bottom edge to the top
 */
export type BleedOrigin = { kind: "point"; x: number; y: number } | { kind: "bottom" };

export interface BleedSpec {
  origin: BleedOrigin;
  /** The colour that spreads. */
  color: string;
  /** The app's background, which the colour settles into before it clears. */
  settleTo: string;
}

const SETTLE = 0.32;
const CLEAR = 0.45;

interface Props {
  spec: BleedSpec;
  /** `covering`: spreading over the window. `clearing`: fading out. */
  phase: "covering" | "clearing";
  /** The window is fully covered. Safe to swap what is underneath. */
  onCovered: () => void;
  /** The bleed has gone. */
  onCleared: () => void;
}

const SPREAD = [0.6, 0, 0.3, 1] as const;

/** Evenly spread, repeatable "random" numbers, so the edge looks organic but never changes. */
function wobble(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function Bleed({ spec, phase, onCovered, onCleared }: Props) {
  const reduced = useReducedMotionConfig();
  const { innerWidth: w, innerHeight: h } = window;

  // A plain cross-fade for people who have asked for less motion.
  useEffect(() => {
    if (!reduced || phase !== "covering") return;
    const timer = setTimeout(onCovered, 220);
    return () => clearTimeout(timer);
  }, [reduced, phase, onCovered]);

  const clearing = phase === "clearing";
  // Nothing to settle when the bleed is already the colour of the app.
  const settles = !reduced && spec.color.toLowerCase() !== spec.settleTo.toLowerCase();

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      initial={{ opacity: reduced ? 0 : 1 }}
      animate={{ opacity: clearing ? 0 : 1 }}
      transition={{ duration: clearing ? CLEAR : 0.2, delay: clearing && settles ? SETTLE : 0, ease: "easeOut" }}
      onAnimationComplete={() => clearing && onCleared()}
      // With less motion there is no spreading colour, only a fade to the app's background and back.
      style={reduced ? { background: spec.settleTo } : undefined}
    >
      {!reduced &&
        (spec.origin.kind === "point" ? (
          <FromPoint x={spec.origin.x} y={spec.origin.y} w={w} h={h} color={spec.color} onCovered={onCovered} />
        ) : (
          <FromBottom w={w} h={h} color={spec.color} onCovered={onCovered} />
        ))}
      {settles && (
        <motion.div
          className="absolute inset-0"
          style={{ background: spec.settleTo }}
          initial={{ opacity: 0 }}
          animate={{ opacity: clearing ? 1 : 0 }}
          transition={{ duration: SETTLE, ease: "easeInOut" }}
        />
      )}
    </motion.div>
  );
}

/** One big circle grows from the point. Smaller ones run ahead of it, so the edge is uneven. */
function FromPoint({ x, y, w, h, color, onCovered }: { x: number; y: number; w: number; h: number; color: string; onCovered: () => void }) {
  // Far enough to reach the furthest corner.
  const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  const blobs = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2 + wobble(i, 1) * 0.5;
        const distance = reach * (0.32 + wobble(i, 2) * 0.34);
        return {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          radius: reach * (0.3 + wobble(i, 3) * 0.26),
          duration: 0.62 + wobble(i, 4) * 0.22,
          delay: wobble(i, 5) * 0.1,
        };
      }),
    [reach],
  );

  const circle = (radius: number) => ({
    position: "absolute" as const,
    left: x - radius,
    top: y - radius,
    width: radius * 2,
    height: radius * 2,
    borderRadius: "50%",
    background: color,
  });

  return (
    <>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          style={circle(b.radius)}
          initial={{ x: 0, y: 0, scale: 0 }}
          animate={{ x: b.dx, y: b.dy, scale: 1 }}
          transition={{ duration: b.duration, delay: b.delay, ease: SPREAD }}
        />
      ))}
      <motion.div
        style={circle(reach * 1.05)}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.95, ease: SPREAD }}
        onAnimationComplete={onCovered}
      />
    </>
  );
}

/** A sheet rises from the bottom. Bobbing circles along its top edge make it uneven. */
function FromBottom({ w, h, color, onCovered }: { w: number; h: number; color: string; onCovered: () => void }) {
  const count = 9;
  const radius = (w / count) * 0.95;
  const bumps = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (w * (i + 0.5)) / count - radius,
        lift: radius * (0.35 + wobble(i, 6) * 0.5),
        duration: 0.55 + wobble(i, 7) * 0.35,
        delay: wobble(i, 8) * 0.18,
      })),
    [w, radius],
  );

  return (
    <motion.div
      style={{ position: "absolute", left: 0, right: 0, top: 0, height: h + radius * 2, background: color }}
      initial={{ y: h + radius * 2 }}
      animate={{ y: -radius * 2 }}
      transition={{ duration: 1.05, ease: SPREAD }}
      onAnimationComplete={onCovered}
    >
      {bumps.map((b, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            left: b.left,
            top: -radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: "50%",
            background: color,
          }}
          initial={{ y: 0 }}
          animate={{ y: [0, -b.lift, b.lift * 0.2, -b.lift * 0.6, 0] }}
          transition={{ duration: b.duration + 0.5, delay: b.delay, ease: "easeInOut" }}
        />
      ))}
    </motion.div>
  );
}
