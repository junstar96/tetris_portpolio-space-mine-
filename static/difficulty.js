/* ═══════════════════════════════════════════════════════════════
   DIFFICULTY – level → gravity speed & score multiplier
   Shared by desktop (tetris.js), mobile (mobile.js) and bg-scroller.js.
   ───────────────────────────────────────────────────────────────
   Gravity speed is defined in rows per second (piecewise linear):
     L1  → L10 : straight line            1.25 →  3.85 rows/s
     L10 → L25 : gentle slope             3.85 → 12.0  rows/s
     L25 → L30 : steep slope              12.0 → 80.0  rows/s
   At L30 one row takes 12.5ms, so a piece crosses the 20 visible rows
   in 0.25s (< 0.3s requirement, with a frame of margin).
   Score multiplier: 1 + int(sqrt(level + 6)) * 0.2
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const MAX_LEVEL = 30;
  // [level, rows per second] knots of the speed curve
  const KNOTS = [
    [1, 1000 / 800],   // 800ms per row (unchanged start)
    [10, 1000 / 260],  // 260ms per row (unchanged L10)
    [25, 12],          // ~83ms per row
    [30, 80],          // 12.5ms per row → 20 rows in 0.25s
  ];

  const clampLevel = l => Math.min(MAX_LEVEL, Math.max(1, Math.floor(l) || 1));

  /** Gravity speed in rows per second. */
  function gravitySpeed(level) {
    const L = clampLevel(level);
    for (let i = 1; i < KNOTS.length; i++) {
      const [l0, s0] = KNOTS[i - 1], [l1, s1] = KNOTS[i];
      if (L <= l1) return s0 + (s1 - s0) * (L - l0) / (l1 - l0);
    }
    return KNOTS[KNOTS.length - 1][1];
  }

  /** Milliseconds per row of gravity. */
  function dropInterval(level) { return 1000 / gravitySpeed(level); }

  /** Score multiplier applied to every point gain: 1 + int(sqrt(level+6)) * 0.2 */
  function scoreMultiplier(level) {
    return Math.round((1 + Math.floor(Math.sqrt(clampLevel(level) + 6)) * 0.2) * 10) / 10;
  }

  /** Level from cleared lines (10 lines per level), capped at MAX_LEVEL. */
  function levelFromLines(lines, startLevel) {
    return clampLevel(Math.floor(lines / 10) + (startLevel || 1));
  }

  global.Difficulty = { MAX_LEVEL, gravitySpeed, dropInterval, scoreMultiplier, levelFromLines, clampLevel };
})(typeof window !== 'undefined' ? window : globalThis);
