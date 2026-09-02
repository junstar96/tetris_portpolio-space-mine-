/* ================================================================
   TETRIS – Full Game Engine
   ================================================================ */

// ─── CONSTANTS ───
const COLS = 10;
const ROWS = 20;
const HIDDEN_ROWS = 2;         // rows above visible area
const TOTAL_ROWS = ROWS + HIDDEN_ROWS;
const CELL = 32;               // px per cell
const NEXT_CELL = 20;          // px per cell in preview

// Piece colors (index 1-7)
const COLORS = [
  null,
  '#ff3b3b',   // 1 red    – Z
  '#3b7bff',   // 2 blue   – J
  '#ffd83b',   // 3 yellow – O
  '#3bff6e',   // 4 green  – S
  '#b83bff',   // 5 purple – T
  '#3bffff',   // 6 cyan   – I
  '#ff8c3b',   // 7 orange – L
];

const GLOW = [
  null,
  'rgba(255,59,59,0.35)',
  'rgba(59,123,255,0.35)',
  'rgba(255,216,59,0.35)',
  'rgba(59,255,110,0.35)',
  'rgba(184,59,255,0.35)',
  'rgba(59,255,255,0.35)',
  'rgba(255,140,59,0.35)',
];

// Piece shapes – each is array of rotations, each rotation is array of [row, col]
const SHAPES = {
  Z: { id: 1, rotations: [
    [[0,0],[0,1],[1,1],[1,2]],
    [[0,1],[1,0],[1,1],[2,0]],
    [[0,0],[0,1],[1,1],[1,2]],
    [[0,1],[1,0],[1,1],[2,0]],
  ]},
  J: { id: 2, rotations: [
    [[0,0],[1,0],[1,1],[1,2]],
    [[0,0],[0,1],[1,0],[2,0]],
    [[0,0],[0,1],[0,2],[1,2]],
    [[0,0],[1,0],[2,-1],[2,0]],
  ]},
  O: { id: 3, rotations: [
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
  ]},
  S: { id: 4, rotations: [
    [[0,1],[0,2],[1,0],[1,1]],
    [[0,0],[1,0],[1,1],[2,1]],
    [[0,1],[0,2],[1,0],[1,1]],
    [[0,0],[1,0],[1,1],[2,1]],
  ]},
  T: { id: 5, rotations: [
    [[0,1],[1,0],[1,1],[1,2]],
    [[0,0],[1,0],[1,1],[2,0]],
    [[0,0],[0,1],[0,2],[1,1]],
    [[0,0],[1,-1],[1,0],[2,0]],
  ]},
  I: { id: 6, rotations: [
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,0],[1,0],[2,0],[3,0]],
  ]},
  L: { id: 7, rotations: [
    [[0,2],[1,0],[1,1],[1,2]],
    [[0,0],[1,0],[2,0],[2,1]],
    [[0,0],[0,1],[0,2],[1,0]],
    [[0,0],[0,1],[1,1],[2,1]],
  ]},
};

const PIECE_NAMES = ['Z','J','O','S','T','I','L'];

// Wall kick data (SRS simplified)
const WALL_KICKS = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1], [-1, 1], [1, 1],
  [-2, 0], [2, 0],
];

// Scoring
const LINE_SCORES = [0, 100, 300, 500, 800]; // 0,1,2,3,4 lines

// ─── GAME STATE ───
let board = [];
let gemBoard = [];            // parallel board: true if cell has a gem
let currentPiece = null;
let heldPiece = null;
let canHold = true;
let nextQueue = [];
let bag = [];
let score = 0;
let level = 1;
let lines = 0;
let playTime = 0;
let timerInterval = null;
let gameInterval = null;
let isPlaying = false;
let isPaused = false;
let dropSpeed = 800;
let lastDrop = 0;
let animFrame = null;
let lockDelay = 0;
let lockLimit = 500; // ms before lock
let lineFlashRows = [];
let lineFlashTime = 0;

// ─── GEM SYSTEM STATE ───
let gemTimeThreshold = 0;     // seconds until gem activates (10-30)
let gemBlockThreshold = 0;    // blocks until gem activates (100-500)
let gemTimerElapsed = 0;      // seconds elapsed since last gem reset
let gemBlocksDropped = 0;     // blocks dropped since last gem reset
let gemNextPieceReady = false; // flag: the NEXT spawned piece gets a gem
let gemBonusPopup = null;     // {text, x, y, time} for "x10" popup animation
let totalGemsCollected = 0;   // lifetime gems cleared this game

// Canvas refs
let canvas, ctx;
let holdCanvas, holdCtx;
let nextCanvases = [], nextCtxs = [];

// ─── INITIALIZATION ───
function initCanvases() {
  canvas = document.getElementById('game-canvas');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  ctx = canvas.getContext('2d');

  holdCanvas = document.getElementById('hold-canvas');
  holdCtx = holdCanvas.getContext('2d');

  nextCanvases = [];
  nextCtxs = [];
  for (let i = 0; i < 3; i++) {
    const c = document.getElementById(`next-canvas-${i}`);
    nextCanvases.push(c);
    nextCtxs.push(c.getContext('2d'));
  }
}

// ─── BAG SYSTEM (7-bag randomizer) ───
function refillBag() {
  bag = [...PIECE_NAMES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function getNextPieceName() {
  if (bag.length === 0) refillBag();
  return bag.pop();
}

function fillQueue() {
  while (nextQueue.length < 4) {
    nextQueue.push(getNextPieceName());
  }
}

// ─── PIECE MANAGEMENT ───
function createPiece(name) {
  const shape = SHAPES[name];
  return {
    name,
    id: shape.id,
    rotation: 0,
    row: HIDDEN_ROWS - 1,
    col: Math.floor(COLS / 2) - 1,
    cells: shape.rotations[0],
  };
}

function getPieceCells(piece, rotation) {
  return SHAPES[piece.name].rotations[rotation !== undefined ? rotation : piece.rotation];
}

function getAbsCells(piece, rowOff, colOff, rotation) {
  const cells = getPieceCells(piece, rotation);
  const r = piece.row + (rowOff || 0);
  const c = piece.col + (colOff || 0);
  return cells.map(([dr, dc]) => [r + dr, c + dc]);
}

function isValid(piece, rowOff, colOff, rotation) {
  const abs = getAbsCells(piece, rowOff, colOff, rotation);
  return abs.every(([r, c]) => r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS && board[r][c] === 0);
}

// ─── GEM HELPERS ───
function resetGemCounters() {
  gemTimeThreshold = 10 + Math.floor(Math.random() * 21);   // 10-30
  gemBlockThreshold = 100 + Math.floor(Math.random() * 401); // 100-500
  gemTimerElapsed = 0;
  gemBlocksDropped = 0;
  gemNextPieceReady = false;
  updateGemUI();
}

function checkGemTrigger() {
  if (gemNextPieceReady) return; // already triggered, waiting for spawn
  if (gemTimerElapsed >= gemTimeThreshold || gemBlocksDropped >= gemBlockThreshold) {
    gemNextPieceReady = true;
    updateGemUI();
  }
}

function updateGemUI() {
  const el = document.getElementById('gem-status');
  if (!el) return;
  if (gemNextPieceReady) {
    el.textContent = '준비됨!';
    el.className = 'panel-value gem-ready';
  } else {
    // Show whichever condition is closer (as percentage)
    const timePct = Math.min(100, Math.floor((gemTimerElapsed / gemTimeThreshold) * 100));
    const blockPct = Math.min(100, Math.floor((gemBlocksDropped / gemBlockThreshold) * 100));
    const pct = Math.max(timePct, blockPct);
    el.textContent = `${pct}%`;
    el.className = 'panel-value' + (pct >= 70 ? ' gem-near' : '');
  }
}

// ─── BOARD ───
function createBoard() {
  board = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(0));
  gemBoard = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(false));
}

function lockPiece() {
  const abs = getAbsCells(currentPiece);
  abs.forEach(([r, c], idx) => {
    if (r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS) {
      board[r][c] = currentPiece.id;
      // If this piece has a gem and this is the gem cell, mark it
      if (currentPiece.hasGem && idx === currentPiece.gemCellIndex) {
        gemBoard[r][c] = true;
      }
    }
  });
  canHold = true;

  // Count this block for gem system
  gemBlocksDropped++;
  checkGemTrigger();
  updateGemUI();

  clearLines();
  spawnPiece();
}

function clearLines() {
  const fullRows = [];
  for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
    if (board[r].every(cell => cell !== 0)) {
      fullRows.push(r);
    }
  }
  if (fullRows.length === 0) return;

  // Check if any cleared row contains a gem
  let hasGemInCleared = false;
  for (const r of fullRows) {
    for (let c = 0; c < COLS; c++) {
      if (gemBoard[r][c]) {
        hasGemInCleared = true;
        break;
      }
    }
    if (hasGemInCleared) break;
  }

  // Flash animation — gem rows flash gold instead of white
  lineFlashRows = fullRows;
  lineFlashTime = performance.now();
  lineFlashGem = hasGemInCleared;

  setTimeout(() => {
    // Remove rows from both boards
    fullRows.forEach(r => {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(0));
      gemBoard.splice(r, 1);
      gemBoard.unshift(Array(COLS).fill(false));
    });
    lineFlashRows = [];
    lineFlashGem = false;

    const cleared = fullRows.length;
    lines += cleared;

    // SCORING: 10x multiplier if gem was in cleared rows
    const multiplier = hasGemInCleared ? 10 : 1;
    const gained = LINE_SCORES[cleared] * level * multiplier;
    score += gained;

    if (hasGemInCleared) {
      totalGemsCollected++;
      // Show x10 bonus popup
      gemBonusPopup = {
        text: `x10 GEM! +${gained.toLocaleString()}`,
        y: (fullRows[0] - HIDDEN_ROWS) * CELL,
        time: performance.now(),
      };
      // Reset gem counters for next cycle
      resetGemCounters();
    }

    level = Math.floor(lines / 10) + 1;
    dropSpeed = Math.max(80, 800 - (level - 1) * 60);

    updateUI();
  }, 200);
}

let lineFlashGem = false; // true if gem flash (golden)

function spawnPiece() {
  fillQueue();
  const name = nextQueue.shift();
  currentPiece = createPiece(name);

  // Gem system: attach gem to this piece if triggered
  if (gemNextPieceReady) {
    currentPiece.hasGem = true;
    const cellCount = getPieceCells(currentPiece).length;
    currentPiece.gemCellIndex = Math.floor(Math.random() * cellCount);
    gemNextPieceReady = false;
    // Don't reset counters yet — reset happens when gem line is cleared
    // But DO reset the trigger counters so next cycle starts fresh
    resetGemCounters();
  }

  fillQueue();
  drawNextPreviews();

  if (!isValid(currentPiece, 0, 0)) {
    gameOver();
  }
}

// ─── MOVEMENT ───
function moveLeft() {
  if (!currentPiece || !isPlaying || isPaused) return;
  if (isValid(currentPiece, 0, -1)) {
    currentPiece.col--;
    lockDelay = 0;
  }
}

function moveRight() {
  if (!currentPiece || !isPlaying || isPaused) return;
  if (isValid(currentPiece, 0, 1)) {
    currentPiece.col++;
    lockDelay = 0;
  }
}

function moveDown() {
  if (!currentPiece || !isPlaying || isPaused) return;
  if (isValid(currentPiece, 1, 0)) {
    currentPiece.row++;
    score += 1; // soft drop bonus
    lockDelay = 0;
    updateUI();
    return true;
  }
  return false;
}

function hardDrop() {
  if (!currentPiece || !isPlaying || isPaused) return;
  let dropped = 0;
  while (isValid(currentPiece, 1, 0)) {
    currentPiece.row++;
    dropped++;
  }
  score += dropped * 2;
  updateUI();
  lockPiece();
}

function rotate() {
  if (!currentPiece || !isPlaying || isPaused) return;
  const newRot = (currentPiece.rotation + 1) % 4;

  // Try wall kicks
  for (const [dc, dr] of WALL_KICKS) {
    const testPiece = { ...currentPiece, col: currentPiece.col + dc, row: currentPiece.row + dr };
    if (isValid(testPiece, 0, 0, newRot)) {
      currentPiece.col = testPiece.col;
      currentPiece.row = testPiece.row;
      currentPiece.rotation = newRot;
      currentPiece.cells = getPieceCells(currentPiece, newRot);
      lockDelay = 0;
      return;
    }
  }
}

function holdPiece() {
  if (!currentPiece || !canHold || !isPlaying || isPaused) return;
  canHold = false;
  const hadGem = currentPiece.hasGem;
  const gemIdx = currentPiece.gemCellIndex;
  const name = currentPiece.name;
  if (heldPiece) {
    const held = heldPiece;
    heldPiece = name;
    currentPiece = createPiece(held);
    // Transfer gem to the swapped piece
    if (hadGem) {
      currentPiece.hasGem = true;
      const cellCount = getPieceCells(currentPiece).length;
      currentPiece.gemCellIndex = Math.min(gemIdx, cellCount - 1);
    }
  } else {
    heldPiece = name;
    spawnPiece();
  }
  drawHoldPreview();
}

// ─── GHOST PIECE ───
function getGhostRow() {
  if (!currentPiece) return currentPiece.row;
  let ghostRow = currentPiece.row;
  const ghost = { ...currentPiece };
  while (true) {
    ghost.row = ghostRow + 1;
    if (isValid(ghost, 0, 0)) {
      ghostRow++;
    } else {
      break;
    }
  }
  return ghostRow;
}

// ─── RENDERING ───
function drawCell(ctx, x, y, size, colorIdx, ghost, hasGem) {
  if (!colorIdx) return;
  const color = COLORS[colorIdx];
  const glow = GLOW[colorIdx];

  if (ghost) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    if (hasGem) {
      // Ghost gem hint
      ctx.globalAlpha = 0.15;
      drawGemIcon(ctx, x, y, size);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Main fill
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

  // Highlight (top-left)
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 1, y + 1, size - 2, 3);
  ctx.fillRect(x + 1, y + 1, 3, size - 2);

  // Shadow (bottom-right)
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 1, y + size - 4, size - 2, 3);
  ctx.fillRect(x + size - 4, y + 1, 3, size - 2);

  // Inner glow
  ctx.shadowColor = glow;
  ctx.shadowBlur = 6;
  ctx.fillStyle = 'transparent';
  ctx.fillRect(x, y, size, size);
  ctx.shadowBlur = 0;

  // Draw gem overlay if this cell has a gem
  if (hasGem) {
    drawGemIcon(ctx, x, y, size);
  }
}

// ─── GEM ICON RENDERER ───
function drawGemIcon(ctx, x, y, size) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const s = size * 0.36;
  const pulse = 0.9 + 0.1 * Math.sin(performance.now() / 200); // subtle pulse
  const ps = s * pulse;

  ctx.save();

  // Outer glow
  ctx.shadowColor = '#ffe066';
  ctx.shadowBlur = 10;

  // Diamond shape
  ctx.beginPath();
  ctx.moveTo(cx, cy - ps);        // top
  ctx.lineTo(cx + ps, cy);        // right
  ctx.lineTo(cx, cy + ps);        // bottom
  ctx.lineTo(cx - ps, cy);        // left
  ctx.closePath();

  // Fill with golden gradient
  const grad = ctx.createLinearGradient(cx - ps, cy - ps, cx + ps, cy + ps);
  grad.addColorStop(0, '#fffbe6');
  grad.addColorStop(0.3, '#ffe066');
  grad.addColorStop(0.6, '#ffb300');
  grad.addColorStop(1, '#ff8f00');
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner highlight
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ps * 0.5);
  ctx.lineTo(cx + ps * 0.3, cy);
  ctx.lineTo(cx, cy + ps * 0.2);
  ctx.lineTo(cx - ps * 0.3, cy);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();

  // Border
  ctx.beginPath();
  ctx.moveTo(cx, cy - ps);
  ctx.lineTo(cx + ps, cy);
  ctx.lineTo(cx, cy + ps);
  ctx.lineTo(cx - ps, cy);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,180,0,0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.restore();
}

function drawBoard() {
  // Background grid
  ctx.fillStyle = '#0a0a16';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(40, 40, 80, 0.4)';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, canvas.height);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(canvas.width, r * CELL);
    ctx.stroke();
  }

  // Locked cells
  for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        const vr = r - HIDDEN_ROWS;
        drawCell(ctx, c * CELL, vr * CELL, CELL, board[r][c], false, gemBoard[r][c]);
      }
    }
  }

  // Line clear flash (golden if gem, white otherwise)
  if (lineFlashRows.length > 0) {
    const elapsed = performance.now() - lineFlashTime;
    const alpha = Math.max(0, 1 - elapsed / 200);
    if (lineFlashGem) {
      ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.85})`;
    } else {
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
    }
    lineFlashRows.forEach(r => {
      const vr = r - HIDDEN_ROWS;
      ctx.fillRect(0, vr * CELL, canvas.width, CELL);
    });
  }

  // Ghost piece
  if (currentPiece) {
    const ghostRow = getGhostRow();
    if (ghostRow !== currentPiece.row) {
      const cells = getPieceCells(currentPiece);
      cells.forEach(([dr, dc], idx) => {
        const vr = ghostRow + dr - HIDDEN_ROWS;
        const vc = currentPiece.col + dc;
        const isGemCell = currentPiece.hasGem && idx === currentPiece.gemCellIndex;
        if (vr >= 0 && vr < ROWS) {
          drawCell(ctx, vc * CELL, vr * CELL, CELL, currentPiece.id, true, isGemCell);
        }
      });
    }

    // Current piece
    const pcells = getPieceCells(currentPiece);
    pcells.forEach(([dr, dc], idx) => {
      const vr = currentPiece.row + dr - HIDDEN_ROWS;
      const vc = currentPiece.col + dc;
      const isGemCell = currentPiece.hasGem && idx === currentPiece.gemCellIndex;
      if (vr >= 0 && vr < ROWS) {
        drawCell(ctx, vc * CELL, vr * CELL, CELL, currentPiece.id, false, isGemCell);
      }
    });
  }

  // Draw gem bonus popup
  if (gemBonusPopup) {
    const elapsed = performance.now() - gemBonusPopup.time;
    const duration = 1500;
    if (elapsed < duration) {
      const progress = elapsed / duration;
      const alpha = 1 - progress;
      const yOff = -progress * 60;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ff8c00';
      ctx.shadowBlur = 15;
      ctx.fillText(gemBonusPopup.text, canvas.width / 2, Math.max(30, gemBonusPopup.y + yOff));
      ctx.restore();
    } else {
      gemBonusPopup = null;
    }
  }
}

function drawPreview(ctx, canvas, pieceName, showGem, gemIdx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!pieceName) return;

  const shape = SHAPES[pieceName];
  const cells = shape.rotations[0];
  const minR = Math.min(...cells.map(c => c[0]));
  const maxR = Math.max(...cells.map(c => c[0]));
  const minC = Math.min(...cells.map(c => c[1]));
  const maxC = Math.max(...cells.map(c => c[1]));
  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const offX = (canvas.width - w * NEXT_CELL) / 2;
  const offY = (canvas.height - h * NEXT_CELL) / 2;

  cells.forEach(([r, c], idx) => {
    const isGem = showGem && idx === gemIdx;
    drawCell(ctx, offX + (c - minC) * NEXT_CELL, offY + (r - minR) * NEXT_CELL, NEXT_CELL, shape.id, false, isGem);
  });
}

function drawNextPreviews() {
  for (let i = 0; i < 3; i++) {
    drawPreview(nextCtxs[i], nextCanvases[i], nextQueue[i] || null);
  }
}

function drawHoldPreview() {
  // If hold piece has the gem (transferred via hold), show it
  // We don't track gem on held piece separately — gem stays on currentPiece
  drawPreview(holdCtx, holdCanvas, heldPiece, false, -1);
}

// ─── UI UPDATES ───
function updateUI() {
  document.getElementById('score-display').textContent = score.toLocaleString();
  document.getElementById('level-display').textContent = level;
  document.getElementById('lines-display').textContent = lines;
}

function updateTimer() {
  playTime++;
  const mins = Math.floor(playTime / 60);
  const secs = playTime % 60;
  const display = mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
  document.getElementById('time-display').textContent = display;

  // Gem timer tick
  if (isPlaying && !isPaused) {
    gemTimerElapsed++;
    checkGemTrigger();
    updateGemUI();
  }
}

// ─── GAME LOOP ───
function gameLoop(timestamp) {
  if (!isPlaying || isPaused) {
    animFrame = requestAnimationFrame(gameLoop);
    return;
  }

  if (!lastDrop) lastDrop = timestamp;
  const delta = timestamp - lastDrop;

  // Check if piece can fall
  if (currentPiece && !isValid(currentPiece, 1, 0)) {
    lockDelay += delta;
    if (lockDelay >= lockLimit) {
      lockPiece();
      lockDelay = 0;
      lastDrop = timestamp;
    }
  } else if (delta >= dropSpeed) {
    if (currentPiece) {
      currentPiece.row++;
    }
    lastDrop = timestamp;
    lockDelay = 0;
  }

  drawBoard();
  animFrame = requestAnimationFrame(gameLoop);
}

// ─── GAME CONTROLS ───
function startGame() {
  switchScreen('game-screen');
  initCanvases();
  createBoard();

  score = 0;
  level = 1;
  lines = 0;
  playTime = 0;
  dropSpeed = 800;
  heldPiece = null;
  canHold = true;
  lockDelay = 0;
  lastDrop = 0;
  lineFlashRows = [];
  lineFlashGem = false;
  bag = [];
  nextQueue = [];
  gemBonusPopup = null;
  totalGemsCollected = 0;
  resetGemCounters();

  updateUI();
  document.getElementById('time-display').textContent = '0초';
  drawHoldPreview();

  // Hide overlays
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');

  isPlaying = true;
  isPaused = false;

  fillQueue();
  spawnPiece();
  drawNextPreviews();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);

  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (!isPlaying) return;
  isPaused = !isPaused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !isPaused);
  if (isPaused) {
    clearInterval(timerInterval);
  } else {
    timerInterval = setInterval(updateTimer, 1000);
    lastDrop = 0;
  }
}

function resumeGame() {
  if (isPaused) togglePause();
}

function gameOver() {
  isPlaying = false;
  isPaused = false;
  clearInterval(timerInterval);

  document.getElementById('final-score').textContent = score.toLocaleString();
  document.getElementById('final-level').textContent = level;
  document.getElementById('final-lines').textContent = lines;
  const mins = Math.floor(playTime / 60);
  const secs = playTime % 60;
  document.getElementById('final-time').textContent = mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;

  document.getElementById('gameover-overlay').classList.remove('hidden');
}

async function saveScore() {
  const name = document.getElementById('player-name').value.trim() || 'Player';
  try {
    await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, lines, level, playTime }),
    });
  } catch (e) {
    console.log('Score save failed (offline mode)');
  }
  showMenu();
}

function backToMenu() {
  isPlaying = false;
  isPaused = false;
  clearInterval(timerInterval);
  if (animFrame) cancelAnimationFrame(animFrame);
  showMenu();
}

// ─── SCREEN NAVIGATION ───
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showMenu() {
  isPlaying = false;
  isPaused = false;
  clearInterval(timerInterval);
  if (animFrame) cancelAnimationFrame(animFrame);
  switchScreen('menu-screen');
}

async function showScores() {
  switchScreen('score-screen');
  try {
    const res = await fetch('/api/scores');
    const scores = await res.json();
    const tbody = document.getElementById('score-tbody');
    if (scores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-score">기록이 없습니다</td></tr>';
    } else {
      tbody.innerHTML = scores.map((s, i) => {
        const mins = Math.floor((s.playTime || 0) / 60);
        const secs = (s.playTime || 0) % 60;
        const timeStr = mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
        const medals = ['🥇', '🥈', '🥉'];
        const rank = i < 3 ? medals[i] : `${i + 1}`;
        return `<tr>
          <td>${rank}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${(s.score || 0).toLocaleString()}</td>
          <td>${s.level || 1}</td>
          <td>${s.lines || 0}</td>
          <td>${timeStr}</td>
        </tr>`;
      }).join('');
    }
  } catch (e) {
    document.getElementById('score-tbody').innerHTML =
      '<tr><td colspan="6" class="empty-score">스코어를 불러올 수 없습니다</td></tr>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function quitGame() {
  isPlaying = false;
  isPaused = false;
  clearInterval(timerInterval);
  if (animFrame) cancelAnimationFrame(animFrame);
  switchScreen('quit-screen');
}

// ─── KEYBOARD INPUT ───
const keyState = {};

document.addEventListener('keydown', (e) => {
  if (keyState[e.code]) return; // Prevent key repeat for some actions
  keyState[e.code] = true;

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault();
      moveLeft();
      break;
    case 'ArrowRight':
      e.preventDefault();
      moveRight();
      break;
    case 'ArrowDown':
      e.preventDefault();
      moveDown();
      break;
    case 'ArrowUp':
      e.preventDefault();
      rotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
    case 'KeyP':
    case 'Escape':
      if (isPlaying) togglePause();
      break;
  }
});

document.addEventListener('keyup', (e) => {
  keyState[e.code] = false;
});

// Allow held arrow keys for movement
let moveRepeatTimer = null;

document.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowDown') {
    if (!moveRepeatTimer || moveRepeatTimer.code !== e.code) {
      clearInterval(moveRepeatTimer?.id);
      const action = e.code === 'ArrowLeft' ? moveLeft :
                     e.code === 'ArrowRight' ? moveRight : moveDown;
      moveRepeatTimer = {
        code: e.code,
        id: setInterval(action, 70),
      };
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (moveRepeatTimer && moveRepeatTimer.code === e.code) {
    clearInterval(moveRepeatTimer.id);
    moveRepeatTimer = null;
  }
});

// ─── DECORATIVE BG BLOCKS ───
function createBgBlocks() {
  const container = document.getElementById('bg-blocks');
  const colors = COLORS.slice(1);
  for (let i = 0; i < 30; i++) {
    const div = document.createElement('div');
    div.className = 'bg-block';
    div.style.left = `${Math.random() * 100}%`;
    div.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    div.style.animationDuration = `${6 + Math.random() * 10}s`;
    div.style.animationDelay = `${Math.random() * 8}s`;
    div.style.width = div.style.height = `${20 + Math.random() * 20}px`;
    container.appendChild(div);
  }
}

// ─── INIT ───
createBgBlocks();
