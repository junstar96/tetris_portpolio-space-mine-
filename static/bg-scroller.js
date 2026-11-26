/* ═══════════════════════════════════════════════════════════════
   BG SCROLLER – vertical belt-scroll gameplay background
   ───────────────────────────────────────────────────────────────
   • Two themes: 'jewel' (Jewel Mine) and 'space' (Space Open-Pit Mine)
   • Each theme = 4 images stitched vertically (1 → 2 → 3 → 4).
     The camera descends from the top of image 1 to the bottom of
     image 4 and then stops (no more image changes).
   • Scroll speed is proportional to the game speed of the current
     level (same formula as the gravity: 800 - (level-1)*60 ms).
   • The total distance is split into 9 segments (level 1..9). Each
     level's segment length is proportional to its speed factor, so
     the camera arrives at the very bottom exactly when level 10 is
     reached. Within a level the camera can never pass the end of its
     segment (soft brake), and if the player levels up faster than
     expected the camera smoothly catches up.
   Shared by desktop (tetris.js) and mobile (mobile.js).
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const THEMES = {
    jewel: ['/backgrounds/jewel_1.webp', '/backgrounds/jewel_2.webp', '/backgrounds/jewel_3.webp', '/backgrounds/jewel_4.webp'],
    space: ['/backgrounds/space_1.webp', '/backgrounds/space_2.webp', '/backgrounds/space_3.webp', '/backgrounds/space_4.webp'],
  };

  const SRC_W = 578;              // native width of the source images
  const SRC_H = 1024;             // native height (fallback before load)
  const FINAL_LEVEL = 10;         // reaching this level = bottom of image 4
  const T_LEVEL = 60;             // expected seconds spent per level (calibration)
  const BRAKE_ZONE = 0.25;        // last 25% of a segment → soft brake
  const CATCHUP_SEC = 1.5;        // seconds to catch up after a fast level-up
  const LINE_SYNC_SEC = 3.0;      // seconds to sync with line progress inside a level
  const MIN_GLIDE = 0.12;         // min catch-up speed (fraction of total per second)
  const PRE_FINAL_MAX = 0.97;     // max progress before level 10 (final 3% = arrival at level 10)

  // Gravity interval per level — identical to the game formula.
  function dropSpeedFor(level) { return Math.max(80, 800 - (level - 1) * 60); }
  // Game speed factor relative to level 1 (level 1 = 1.0, level 9 = 2.5)
  function speedFactor(level) { return 800 / dropSpeedFor(level); }

  // Precompute segment boundaries (as fractions 0..1 of the scrollable distance)
  const segStart = [];            // index = level
  const segEnd = [];
  (function buildSegments() {
    let sum = 0;
    for (let l = 1; l < FINAL_LEVEL; l++) sum += speedFactor(l);
    let acc = 0;
    for (let l = 1; l < FINAL_LEVEL; l++) {
      segStart[l] = (acc / sum) * PRE_FINAL_MAX;
      acc += speedFactor(l);
      segEnd[l] = (acc / sum) * PRE_FINAL_MAX;
    }
    segStart[FINAL_LEVEL] = PRE_FINAL_MAX;
    segEnd[FINAL_LEVEL] = 1;
  })();

  // Image cache (shared between themes / restarts)
  const cache = {};
  function loadTheme(theme) {
    if (cache[theme]) return cache[theme];
    cache[theme] = (THEMES[theme] || THEMES.jewel).map(src => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      return img;
    });
    return cache[theme];
  }
  const isReady = img => img.complete && img.naturalWidth > 0;

  const BgScroller = {
    theme: 'jewel',
    images: [],
    progress: 0,                  // 0 = top of image 1, 1 = bottom of image 4
    finished: false,

    preload() { Object.keys(THEMES).forEach(loadTheme); },

    start(theme, startLevel) {
      this.theme = THEMES[theme] ? theme : 'jewel';
      this.images = loadTheme(this.theme);
      // Games that start above level 1 (roguelike stages) begin mid-descent
      const L = Math.min(FINAL_LEVEL, Math.max(1, startLevel | 0 || 1));
      this.progress = segStart[L] || 0;
      this.finished = false;
    },

    /**
     * Advance the scroll.
     * @param {number} dtMs  frame delta in ms
     * @param {number} level current game level (1-based)
     * @param {number} [lines] total cleared lines (optional – used to keep
     *                         the camera in sync with progress inside a level)
     */
    update(dtMs, level, lines) {
      if (this.finished || !(dtMs > 0)) return;
      const dt = Math.min(dtMs, 250) / 1000;
      let p = this.progress;
      let v;

      if (level >= FINAL_LEVEL) {
        // Level 10 reached → glide to the very bottom and stop
        // Exponential ease toward the bottom with a minimum glide speed so it
        // always arrives (and stops) within a couple of seconds.
        v = Math.max(MIN_GLIDE, (1 - p) / CATCHUP_SEC);
        p = Math.min(1, p + v * dt);
        if (p >= 0.99999) { p = 1; this.finished = true; }
        this.progress = p;
        return;
      }

      const L = Math.max(1, level | 0);
      const s = segStart[L], e = segEnd[L], len = e - s;
      // Base velocity — proportional to game speed of this level
      v = len / T_LEVEL;

      // Fast level-up: camera is behind this level's segment → catch up
      if (p < s) v += Math.max(MIN_GLIDE * 0.5, (s - p) / CATCHUP_SEC);

      // Keep pace with the lines cleared inside the current level
      if (typeof lines === 'number') {
        const inLevel = Math.max(0, Math.min(10, lines - (L - 1) * 10));
        const target = s + len * (inLevel / 10);
        if (p < target) v += (target - p) / LINE_SYNC_SEC;
      }

      // Soft brake: never pass the end of this level's segment
      const remaining = e - p;
      const zone = len * BRAKE_ZONE;
      if (remaining < zone) v *= Math.max(0, remaining / zone);

      p += v * dt;
      if (p > e) p = e;
      this.progress = p;
    },

    /**
     * Draw the stitched background into ctx, scaled to the canvas width.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} w canvas width
     * @param {number} h canvas height
     * @param {number} [veil=0.5] dark overlay alpha for block readability
     */
    draw(ctx, w, h, veil) {
      ctx.fillStyle = '#0a0a16';
      ctx.fillRect(0, 0, w, h);
      const imgs = this.images;
      if (!imgs.length) return;

      const scale = w / SRC_W;
      const heights = imgs.map(img => (isReady(img) ? img.naturalHeight * (SRC_W / img.naturalWidth) : SRC_H) * scale);
      const total = heights.reduce((a, b) => a + b, 0);
      const scrollable = Math.max(0, total - h);
      const offset = Math.round(this.progress * scrollable);

      let top = -offset;
      for (let i = 0; i < imgs.length; i++) {
        const ih = heights[i];
        if (top < h && top + ih > 0 && isReady(imgs[i])) {
          // +1px overlap hides hairline seams between stitched images
          ctx.drawImage(imgs[i], 0, Math.round(top), w, Math.ceil(ih) + 1);
        }
        top += ih;
      }

      const a = typeof veil === 'number' ? veil : 0.5;
      if (a > 0) {
        ctx.fillStyle = `rgba(6, 6, 18, ${a})`;
        ctx.fillRect(0, 0, w, h);
      }
    },

    // Exposed for debugging / tests
    _segments: { segStart, segEnd },
    _speedFactor: speedFactor,
  };

  BgScroller.preload();
  global.BgScroller = BgScroller;
})(typeof window !== 'undefined' ? window : globalThis);
