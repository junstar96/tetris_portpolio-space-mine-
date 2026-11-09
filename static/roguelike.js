/* ═══════════════════════════════════════════════════════════════
   ROGUELIKE MODE
   ───────────────────────────────────────────────────────────────
   • Route map drawn over the "roadmap" image: start = top hexagon,
     goal = bottom ring. Every route from start to goal visits
       shortest route : 8~9 nodes
       longest route  : 11~12 nodes
     (guaranteed by generate-and-validate, see generateMap()).
   • Node types: '?' event, 'mine' (mining tetris stage),
                 'pirate' (pirate-ship tetris stage)
   • Events spend run points (starting points + points earned in
     stages). Choice buttons have three states:
       ok     → blue  button (clickable)
       poor   → red   button (not enough points)
       locked → black button (some other condition not met)
   • First event: "자격증 시험일" (license exam) – 4 licenses × 4 grades.
   Depends on globals from tetris.js (startGame, score, lines, ...).
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ─── CONFIG ───
  const ROGUE_START_POINTS = 3000;         // points at the start of a run
  const MAP_W = 572, MAP_H = 1024;         // roadmap image native size
  const START_PT = { x: 285, y: 52 };      // hexagon (start) in the image
  const END_PT = { x: 286, y: 966 };       // ring (goal) in the image
  const LANES = 4;
  const LANE_X = [115, 229, 343, 457];     // symmetric around the centre line
  const ROW_Y0 = 140, ROW_Y1 = 885;        // first / last node row (image px)
  const SHORTEST_RANGE = [8, 9];
  const LONGEST_RANGE = [11, 12];

  const ASSET = 'roguelike/';
  const BTN_IMG = { ok: ASSET + 'btn_blue.webp', poor: ASSET + 'btn_red.webp', locked: ASSET + 'btn_black.webp' };

  // ─── LICENSES ───
  const LICENSE_TYPES = [
    { id: 'bounty_hunter', name: '현상금 사냥꾼' },
    { id: 'gem',           name: '보석 감별사' },
    { id: 'mining',        name: '채굴사' },
    { id: 'repair',        name: '수리공' },
  ];
  const LICENSE_GRADES = [
    { id: 'bronze',   name: '브론즈',   cost: 1000 },
    { id: 'silver',   name: '실버',     cost: 5000 },
    { id: 'gold',     name: '골드',     cost: 10000 },
    { id: 'platinum', name: '플래티넘', cost: 50000 },
  ];
  const licenseImg = (type, gradeIdx) => `${ASSET}licenses/${type}_${LICENSE_GRADES[gradeIdx].id}.webp`;
  const licenseName = (type, gradeIdx) =>
    `${LICENSE_TYPES.find(t => t.id === type).name} ${LICENSE_GRADES[gradeIdx].name}`;

  const NODE_INFO = {
    event:  { icon: '?',  label: '이벤트',  desc: '무슨 일이 일어날지 모른다' },
    mine:   { icon: '⛏', label: '광산',    desc: '목표 줄 수를 제거하면 클리어' },
    pirate: { icon: '☠', label: '해적선',  desc: '해적선을 격추하면 현상금 획득' },
  };

  // ═══════════════════════════════════════════════════════════
  //  MAP GENERATION (pure – no DOM)
  // ═══════════════════════════════════════════════════════════
  const rowY = (r, rows) => ROW_Y0 + (ROW_Y1 - ROW_Y0) * (r / (rows - 1));
  const key = (r, c) => r * 10 + c;

  function randInt(rand, a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  function shuffle(rand, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  // Shortest / longest number of nodes on any start→goal route
  function routeStats(nodes, rows) {
    const list = [...nodes.values()].sort((a, b) => a.row - b.row);
    const sh = new Map(), lo = new Map();
    for (const n of list) {
      if (n.row === 0) { sh.set(n.id, 1); lo.set(n.id, 1); }
      for (const nx of n.next) {
        if (!sh.has(n.id)) continue;
        sh.set(nx, Math.min(sh.has(nx) ? sh.get(nx) : Infinity, sh.get(n.id) + 1));
        lo.set(nx, Math.max(lo.has(nx) ? lo.get(nx) : 0, lo.get(n.id) + 1));
      }
    }
    let shortest = Infinity, longest = 0;
    for (const n of list) {
      if (n.row !== rows - 1 || !sh.has(n.id)) continue;
      shortest = Math.min(shortest, sh.get(n.id));
      longest = Math.max(longest, lo.get(n.id));
    }
    return { shortest, longest };
  }

  // Geometry checks: no crossing edges, no edge passing over another node
  function geometryOk(nodes, rows) {
    const P = n => ({ x: LANE_X[n.col], y: rowY(n.row, rows) });
    const edges = [];
    for (const n of nodes.values()) for (const m of n.next) edges.push([n, nodes.get(m)]);
    const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i], pa = P(a), pb = P(b);
      for (let j = i + 1; j < edges.length; j++) {
        const [c, d] = edges[j];
        if (a === c || a === d || b === c || b === d) continue;
        const pc = P(c), pd = P(d);
        if (orient(pa, pb, pc) * orient(pa, pb, pd) < 0 && orient(pc, pd, pa) * orient(pc, pd, pb) < 0) return false;
      }
      // Skip edges must not run over an intermediate node
      for (const n of nodes.values()) {
        if (n === a || n === b || n.row <= a.row || n.row >= b.row) continue;
        const p = P(n), dx = pb.x - pa.x, dy = pb.y - pa.y;
        const t = ((p.x - pa.x) * dx + (p.y - pa.y) * dy) / (dx * dx + dy * dy);
        const qx = pa.x + t * dx, qy = pa.y + t * dy;
        if (Math.hypot(p.x - qx, p.y - qy) < 30) return false;
      }
    }
    return true;
  }

  function assignTypes(rand, nodes, rows) {
    const list = [...nodes.values()].sort((a, b) => a.row - b.row || a.col - b.col);
    for (let attempt = 0; attempt < 60; attempt++) {
      for (const n of list) {
        if (n.row === 0) { n.type = rand() < 0.5 ? 'event' : 'mine'; continue; }
        const parentPirate = [...n.prev].some(id => nodes.get(id).type === 'pirate');
        const x = rand();
        if (n.row >= 2 && !parentPirate && x < 0.22) n.type = 'pirate';
        else n.type = x < 0.6 ? 'event' : 'mine';
      }
      // Row 0 with 2+ nodes: guarantee one event and one mine
      const row0 = list.filter(n => n.row === 0);
      if (row0.length >= 2) { row0[0].type = 'event'; row0[row0.length - 1].type = 'mine'; }
      const count = t => list.filter(n => n.type === t).length;
      if (count('event') >= 3 && count('pirate') >= 2 && count('mine') >= 3) return;
    }
  }

  function tryGenerate(rand) {
    const rows = rand() < 0.5 ? LONGEST_RANGE[0] : LONGEST_RANGE[1];
    const nodes = new Map();
    const add = (r, c) => {
      const k = key(r, c);
      if (!nodes.has(k)) nodes.set(k, { id: k, row: r, col: c, next: new Set(), prev: new Set() });
      return nodes.get(k);
    };
    const numPaths = 5 + (rand() < 0.5 ? 1 : 0);
    const starts = shuffle(rand, [0, 1, 2, 3]);
    const targetShort = randInt(rand, SHORTEST_RANGE[0], SHORTEST_RANGE[1]);
    // Diagonal edge a→b crosses an existing opposite diagonal in the same row pair?
    const crosses = (r, c, nc) => {
      if (nc === c) return false;
      const o = nodes.get(key(r, nc));
      return !!(o && o.next.has(key(r + 1, c)));
    };
    for (let p = 0; p < numPaths; p++) {
      // Skip budget: path 0 = none (full-length route), path 1 = shortcut route
      // that hits the target shortest length, others = 0~1 short skips.
      let skips = p === 0 ? 0 : p === 1 ? rows - targetShort : (rand() < 0.5 ? 1 : 0);
      let c = p < LANES ? starts[p] : randInt(rand, 0, LANES - 1);
      let r = 0, n = add(0, c);
      while (r < rows - 1) {
        const rowsLeft = rows - 1 - r;
        // Spend skips randomly but make sure the whole budget is used
        let skip = skips > 0 && r + 2 <= rows - 1 && (rand() < skips / Math.max(1, rowsLeft - skips) || rowsLeft <= skips * 2);
        if (skip && nodes.has(key(r + 1, c))) skip = false;        // vertical skip must pass an empty slot
        let nr, nc;
        if (skip) { nr = r + 2; nc = c; skips--; }
        else {
          nr = r + 1;
          nc = Math.max(0, Math.min(LANES - 1, c + randInt(rand, -1, 1)));
          if (crosses(r, c, nc)) nc = c;
        }
        const m = add(nr, nc);
        n.next.add(m.id); m.prev.add(n.id);
        n = m; r = nr; c = nc;
      }
    }
    const { shortest, longest } = routeStats(nodes, rows);
    if (shortest < SHORTEST_RANGE[0] || shortest > SHORTEST_RANGE[1]) return null;
    if (longest < LONGEST_RANGE[0] || longest > LONGEST_RANGE[1]) return null;
    if (!geometryOk(nodes, rows)) return null;

    assignTypes(rand, nodes, rows);
    for (const n of nodes.values()) {
      n.x = LANE_X[n.col] + (rand() - 0.5) * 26;
      n.y = rowY(n.row, rows) + (rand() - 0.5) * 12;
      n.next = [...n.next].sort((a, b) => a - b);
      n.prev = [...n.prev].sort((a, b) => a - b);
    }
    return { rows, shortest, longest, nodes: Object.fromEntries([...nodes].map(([k, v]) => [k, v])) };
  }

  function generateMap(rand = Math.random) {
    for (let i = 0; i < 20000; i++) {
      const m = tryGenerate(rand);
      if (m) return m;
    }
    throw new Error('roguelike map generation failed');
  }

  // ═══════════════════════════════════════════════════════════
  //  RUN STATE & UI
  // ═══════════════════════════════════════════════════════════
  const fmt = n => Math.max(0, Math.floor(n)).toLocaleString('ko-KR');
  const $ = id => document.getElementById(id);

  const Rogue = {
    run: null,
    inStage: false,
    stage: null,
    _built: false,

    // ── Run lifecycle ──
    start() {
      this.run = {
        map: generateMap(),
        points: ROGUE_START_POINTS,
        licenses: Object.fromEntries(LICENSE_TYPES.map(t => [t.id, -1])), // highest grade idx
        currentId: null,       // null = at start hexagon
        path: [],              // visited node ids in order
        earned: 0,
        stagesCleared: 0,
        piratesKilled: 0,
      };
      this.inStage = false;
      this.stage = null;
      this.showMap();
    },

    abandon() {
      this.inStage = false;
      this.stage = null;
      this.run = null;
      this._closeModals();
    },

    confirmAbandon() {
      if (confirm('탐사를 포기하고 메뉴로 돌아갈까요?')) {
        this.abandon();
        showMenu();
      }
    },

    available() {
      const { map, currentId } = this.run;
      if (currentId === null) return Object.values(map.nodes).filter(n => n.row === 0).map(n => n.id);
      const cur = map.nodes[currentId];
      if (cur.row === map.rows - 1) return ['END'];
      return cur.next.slice();
    },

    // ── Map screen ──
    showMap() {
      this._build();
      switchScreen('rogue-screen');
      this._closeModals();
      this.renderMap();
      this.renderSide();
    },

    renderMap() {
      const { map, path, currentId } = this.run;
      const avail = new Set(this.available());
      const visited = new Set(path);
      const svg = $('rg-edges');
      const nodesEl = $('rg-nodes');
      const pt = id => (id === 'S' ? START_PT : id === 'E' ? END_PT : map.nodes[id]);

      // Edges
      const done = new Set();
      const chain = ['S', ...path];
      for (let i = 1; i < chain.length; i++) done.add(chain[i - 1] + '>' + chain[i]);
      if (this.run.finished) done.add(chain[chain.length - 1] + '>E');
      const curKey = currentId === null ? 'S' : currentId;
      let lines = '';
      const line = (a, b) => {
        const k = a + '>' + b, pa = pt(a), pb = pt(b);
        let cls = 'rg-edge';
        if (done.has(k)) cls += ' done';
        else if (String(a) === String(curKey) && (avail.has(b) || (b === 'E' && avail.has('END')))) cls += ' open';
        lines += `<line class="${cls}" x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"/>`;
      };
      for (const n of Object.values(map.nodes)) {
        if (n.row === 0) line('S', n.id);
        n.next.forEach(m => line(n.id, m));
        if (n.row === map.rows - 1) line(n.id, 'E');
      }
      svg.innerHTML = lines;

      // Nodes
      const pct = (v, total) => (v / total * 100).toFixed(3) + '%';
      let html = '';
      for (const n of Object.values(map.nodes)) {
        const info = NODE_INFO[n.type];
        let st = 'locked';
        if (n.id === currentId) st = 'current';
        else if (visited.has(n.id)) st = 'visited';
        else if (avail.has(n.id) && !this.run.finished) st = 'available';
        html += `<button class="rg-node rg-node--${n.type} is-${st}" data-id="${n.id}"
          style="left:${pct(n.x, MAP_W)};top:${pct(n.y, MAP_H)}"
          title="${info.label} — ${info.desc}" ${st === 'available' ? '' : 'tabindex="-1"'}>
          <span class="rg-node-icon">${info.icon}</span></button>`;
      }
      const endOpen = avail.has('END') && !this.run.finished;
      html += `<button class="rg-end ${endOpen ? 'is-available' : ''} ${this.run.finished ? 'is-done' : ''}"
        style="left:${pct(END_PT.x, MAP_W)};top:${pct(END_PT.y, MAP_H)}" title="도착 지점"></button>`;
      html += `<div class="rg-start-label" style="left:${pct(START_PT.x, MAP_W)};top:${pct(START_PT.y + 34, MAP_H)}">START</div>`;
      html += `<div class="rg-end-label" style="left:${pct(END_PT.x, MAP_W)};top:${pct(END_PT.y - 46, MAP_H)}">GOAL</div>`;
      if (currentId === null) {
        html += `<div class="rg-player" style="left:${pct(START_PT.x, MAP_W)};top:${pct(START_PT.y, MAP_H)}"></div>`;
      }
      nodesEl.innerHTML = html;
    },

    renderSide() {
      const r = this.run;
      $('rg-points').textContent = fmt(r.points);
      const depth = r.path.length;
      $('rg-progress').textContent = r.finished ? '도착!' : `${depth} 칸 이동`;
      $('rg-route-info').textContent = `경로 길이 ${r.map.shortest}~${r.map.longest}칸`;
      $('rg-licenses').innerHTML = LICENSE_TYPES.map(t => {
        const g = r.licenses[t.id];
        return `<div class="rg-lic-row ${g < 0 ? 'none' : ''}">
          <img src="${licenseImg(t.id, Math.max(0, g))}" alt="">
          <div><div class="rg-lic-name">${t.name}</div>
          <div class="rg-lic-grade grade-${g < 0 ? 'none' : LICENSE_GRADES[g].id}">${g < 0 ? '미보유' : LICENSE_GRADES[g].name}</div></div>
        </div>`;
      }).join('');
    },

    onMapClick(e) {
      const end = e.target.closest('.rg-end');
      if (end && end.classList.contains('is-available')) { this.finishRun(); return; }
      const btn = e.target.closest('.rg-node.is-available');
      if (!btn) return;
      AudioManager.playSFX('button_click');
      this.enterNode(Number(btn.dataset.id));
    },

    enterNode(id) {
      const node = this.run.map.nodes[id];
      if (!node || !this.available().includes(id)) return;
      if (node.type === 'event') this.openEvent(node);
      else this.startStage(node);
    },

    completeNode(id) {
      this.run.path.push(id);
      this.run.currentId = id;
      this.showMap();
    },

    finishRun() {
      this.run.finished = true;
      this.renderMap();
      this.renderSide();
      const owned = LICENSE_TYPES.filter(t => this.run.licenses[t.id] >= 0)
        .map(t => `<img src="${licenseImg(t.id, this.run.licenses[t.id])}" title="${licenseName(t.id, this.run.licenses[t.id])}">`).join('');
      this._showResult('🏁 탐사 완료!', `
        <p>이동한 칸: <b>${this.run.path.length}</b></p>
        <p>클리어한 스테이지: <b>${this.run.stagesCleared}</b> · 격추한 해적선: <b>${this.run.piratesKilled}</b></p>
        <p>남은 포인트: <b>${fmt(this.run.points)} P</b></p>
        <div class="rg-result-lics">${owned || '<span class="dim">취득한 자격증 없음</span>'}</div>`,
        '메뉴로', () => { this.abandon(); showMenu(); });
    },

    // ── Stages (tetris) ──
    startStage(node) {
      const startLevel = Math.min(9, 1 + Math.floor(node.row * 0.75));
      this.stage = {
        nodeId: node.id,
        type: node.type,
        goalLines: 5 + Math.floor(node.row / 4),
        bounty: 1500 + node.row * 250,
      };
      this.inStage = true;
      startGame(node.type === 'pirate' ? 'pirate' : 'mine', {
        startLevel,
        rogue: true,
        pirateTimeTrigger: 8,           // ship shows up quickly in a pirate stage
      });
      this.updateStagePanel();
    },

    updateStagePanel() {
      if (!this.stage) return;
      const s = this.stage;
      const goal = $('rogue-goal'), hint = $('rogue-goal-hint'), pts = $('rogue-run-points');
      if (s.type === 'mine') {
        goal.textContent = `${Math.min(lines, s.goalLines)} / ${s.goalLines} 줄`;
        hint.textContent = '목표 줄 수를 제거하면 클리어';
      } else {
        goal.textContent = '해적선 격추';
        hint.textContent = `격추 시 현상금 +${fmt(s.bounty)} P`;
      }
      pts.textContent = `${fmt(this.run.points)} P`;
    },

    _haltGame() {
      isPlaying = false;
      isPaused = false;
      clearInterval(timerInterval);
      if (animFrame) cancelAnimationFrame(animFrame);
      if (gameMode === 'pirate') endPirateShip();
      AudioManager.stopAllBGM();
      $('pause-overlay').classList.add('hidden');
    },

    onLinesCleared() {
      if (!this.inStage || this.stage.type !== 'mine') return;
      this.updateStagePanel();
      if (lines >= this.stage.goalLines) this._finishStage('clear');
    },

    // returns true when the result was consumed by the roguelike stage
    onPirateResult(killed) {
      if (!this.inStage || this.stage.type !== 'pirate') return false;
      this._finishStage(killed ? 'kill' : 'miss');
      return true;
    },

    _finishStage(result) {
      this.inStage = false;
      this._haltGame();
      const s = this.stage;
      const stageScore = Math.max(0, score);
      const bonus = result === 'kill' ? s.bounty : 0;
      const earned = stageScore + bonus;
      this.run.points += earned;
      this.run.earned += earned;
      this.run.stagesCleared++;
      if (result === 'kill') this.run.piratesKilled++;
      const title = result === 'clear' ? '⛏ 채굴 완료!' : result === 'kill' ? '☠ 해적선 격추!' : '해적선을 놓쳤다…';
      const body = `
        <p>스테이지 점수 <b>+${fmt(stageScore)} P</b></p>
        ${bonus ? `<p>현상금 <b>+${fmt(bonus)} P</b></p>` : ''}
        <p class="rg-total">보유 포인트 <b>${fmt(this.run.points)} P</b></p>`;
      this._stageOverlay(title, body, '지도로 돌아가기', () => this.completeNode(s.nodeId));
    },

    onStageFailed() {
      this.inStage = false;
      this._haltGame();
      this._stageOverlay('탐사 실패', `
        <p>블록이 천장에 닿았다…</p>
        <p>이동한 칸 <b>${this.run.path.length}</b> · 남은 포인트 <b>${fmt(this.run.points)} P</b></p>`,
        '메뉴로', () => { this.abandon(); showMenu(); });
    },

    _stageOverlay(title, body, btnText, onClick) {
      $('rogue-stage-title').textContent = title;
      $('rogue-stage-body').innerHTML = body;
      const btn = $('rogue-stage-btn');
      btn.textContent = btnText;
      btn.onclick = () => {
        AudioManager.playSFX('button_click');
        $('rogue-stage-overlay').classList.add('hidden');
        onClick();
      };
      $('rogue-stage-overlay').classList.remove('hidden');
    },

    // ═════════════════ EVENTS ═════════════════
    openEvent(node) {
      // Event pool – only the license exam for now
      const pool = [EVENTS.exam];
      const ev = pool[Math.floor(Math.random() * pool.length)];
      this.event = { node, def: ev, state: {} };
      $('rg-event-panel').style.backgroundImage = `url(${ev.image})`;
      $('rg-event').classList.remove('hidden');
      this._fitEventPanel();
      this.renderEvent();
    },

    renderEvent() {
      const { def, state } = this.event;
      $('rg-event-points').textContent = fmt(this.run.points);
      const choices = def.choices(this.run, state);
      const box = $('rg-choice-box');
      box.className = 'rg-choice-box ' + (def.layout || '');
      box.innerHTML = '';
      choices.forEach(ch => box.appendChild(this._choiceButton(ch)));
    },

    /**
     * Choice button. ch = { state:'ok'|'poor'|'locked', title, sub, icon?, wide?, onSelect, reason? }
     */
    _choiceButton(ch) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `rg-btn rg-btn--${ch.state}${ch.wide ? ' rg-btn--wide' : ''}`;
      b.style.borderImageSource = `url(${BTN_IMG[ch.state]})`;
      b.innerHTML = `
        ${ch.icon ? `<img class="rg-btn-icon" src="${ch.icon}" alt="">` : ''}
        <span class="rg-btn-text">
          <span class="rg-btn-title">${ch.title}</span>
          ${ch.sub ? `<span class="rg-btn-sub">${ch.sub}</span>` : ''}
        </span>`;
      b.addEventListener('click', () => {
        if (ch.state === 'ok') {
          AudioManager.playSFX('button_click');
          ch.onSelect();
        } else {
          b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
          this._toast(ch.reason || (ch.state === 'poor' ? '포인트가 부족합니다' : '조건을 만족하지 않습니다'),
            ch.state === 'poor' ? 'red' : 'gray');
        }
      });
      return b;
    },

    closeEvent() {
      const node = this.event && this.event.node;
      this.event = null;
      $('rg-event').classList.add('hidden');
      if (node) this.completeNode(node.id);
    },

    _fitEventPanel() {
      const panel = $('rg-event-panel');
      if (!panel || $('rg-event').classList.contains('hidden')) return;
      const w = Math.min(window.innerWidth * 0.94, 1024, (window.innerHeight - 90) * (1024 / 572));
      panel.style.width = w + 'px';
      panel.style.height = (w * 572 / 1024) + 'px';
      panel.style.fontSize = (w / 1024 * 16) + 'px';   // 1em = 16 image px
    },

    _toast(msg, color) {
      const t = $('rg-toast');
      t.textContent = msg;
      t.className = 'rg-toast show ' + (color || '');
      clearTimeout(this._toastTmr);
      this._toastTmr = setTimeout(() => { t.className = 'rg-toast'; }, 1600);
    },

    _showAcquire(type, gradeIdx, done) {
      const el = $('rg-acquire');
      el.innerHTML = `<div class="rg-acquire-card">
          <img src="${licenseImg(type, gradeIdx)}" alt="">
          <div class="rg-acquire-title">자격증 취득!</div>
          <div class="rg-acquire-name grade-${LICENSE_GRADES[gradeIdx].id}">${licenseName(type, gradeIdx)}</div>
          <div class="rg-acquire-hint">클릭하여 계속</div></div>`;
      el.classList.remove('hidden');
      AudioManager.playSFX('levelup');
      el.onclick = () => { el.classList.add('hidden'); el.onclick = null; done && done(); };
    },

    _showResult(title, body, btnText, onClick) {
      $('rg-result-title').textContent = title;
      $('rg-result-body').innerHTML = body;
      const btn = $('rg-result-btn');
      btn.textContent = btnText;
      btn.onclick = () => { AudioManager.playSFX('button_click'); $('rg-result').classList.add('hidden'); onClick(); };
      $('rg-result').classList.remove('hidden');
    },

    _closeModals() {
      ['rg-event', 'rg-result', 'rg-acquire'].forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
    },

    // ── DOM construction (once) ──
    _build() {
      if (this._built) return;
      this._built = true;
      const root = $('rogue-screen');
      root.innerHTML = `
        <div class="rg-layout">
          <aside class="rg-side">
            <div class="rg-title">🗺️ 로그라이크</div>
            <div class="panel-box"><div class="panel-label">보유 포인트</div>
              <div class="panel-value rg-points"><span id="rg-points">0</span><small> P</small></div></div>
            <div class="panel-box"><div class="panel-label">진행</div>
              <div class="rg-progress" id="rg-progress"></div><div class="rg-route-info" id="rg-route-info"></div></div>
            <div class="panel-box"><div class="panel-label">자격증</div><div class="rg-licenses" id="rg-licenses"></div></div>
            <div class="panel-box rg-legend">
              <div><span class="rg-legend-dot rg-node--event">?</span> 이벤트</div>
              <div><span class="rg-legend-dot rg-node--mine">⛏</span> 광산</div>
              <div><span class="rg-legend-dot rg-node--pirate">☠</span> 해적선</div>
            </div>
            <button class="btn btn-menu rg-giveup" onclick="Rogue.confirmAbandon()">포기하고 메뉴로</button>
          </aside>
          <div class="rg-map" id="rg-map">
            <svg id="rg-edges" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="none"></svg>
            <div id="rg-nodes"></div>
          </div>
        </div>

        <div id="rg-event" class="rg-modal hidden">
          <div class="rg-event-wrap">
            <div class="rg-event-top">💰 보유 포인트 <b id="rg-event-points">0</b> P</div>
            <div class="rg-event-panel" id="rg-event-panel">
              <div class="rg-choice-box" id="rg-choice-box"></div>
            </div>
          </div>
          <div id="rg-acquire" class="rg-acquire hidden"></div>
        </div>

        <div id="rg-result" class="rg-modal hidden">
          <div class="rg-result-card">
            <h2 id="rg-result-title"></h2>
            <div id="rg-result-body"></div>
            <button class="btn btn-resume" id="rg-result-btn"></button>
          </div>
        </div>
        <div id="rg-toast" class="rg-toast"></div>`;
      $('rg-map').addEventListener('click', e => this.onMapClick(e));
      window.addEventListener('resize', () => this._fitEventPanel());
    },
  };

  // ═══════════════════════════════════════════════════════════
  //  EVENT DEFINITIONS
  // ═══════════════════════════════════════════════════════════
  const EVENTS = {
    // 「자격증 시험일」 – take ONE license exam per visit
    exam: {
      id: 'exam',
      image: ASSET + 'event_exam.webp',
      layout: 'grid-2x2',
      choices(run, state) {
        const list = LICENSE_TYPES.map(t => {
          const owned = run.licenses[t.id];
          if (owned >= LICENSE_GRADES.length - 1) {
            return {
              state: 'locked', icon: licenseImg(t.id, owned),
              title: `${t.name} ${LICENSE_GRADES[owned].name}`,
              sub: '최고 등급 보유 중', reason: '이미 최고 등급 자격증을 가지고 있다',
            };
          }
          const g = owned + 1, grade = LICENSE_GRADES[g];
          const base = { icon: licenseImg(t.id, g), title: licenseName(t.id, g) };
          if (state.taken) {
            return { ...base, state: 'locked', sub: '이번 시험은 이미 응시',
              reason: '한 번에 하나 준비하는 게 고작이다' };
          }
          if (run.points < grade.cost) {
            return { ...base, state: 'poor',
              sub: `${fmt(grade.cost)} P · ${fmt(grade.cost - run.points)} P 부족`,
              reason: `포인트가 ${fmt(grade.cost - run.points)} P 부족합니다` };
          }
          return { ...base, state: 'ok', sub: `${fmt(grade.cost)} P 소모`,
            onSelect: () => {
              run.points -= grade.cost;
              run.licenses[t.id] = g;
              state.taken = true;
              Rogue.renderEvent();
              Rogue._showAcquire(t.id, g);
            } };
        });
        list.push(state.taken
          ? { state: 'ok', wide: true, title: '시험장을 나선다', sub: '지도로 돌아간다', onSelect: () => Rogue.closeEvent() }
          : { state: 'ok', wide: true, title: '그냥 돌아간다', sub: '시험을 보지 않고 떠난다', onSelect: () => Rogue.closeEvent() });
        return list;
      },
    },
  };

  // Exposed for debugging / tests
  Rogue._generateMap = generateMap;
  Rogue._routeStats = routeStats;
  Rogue.LICENSE_TYPES = LICENSE_TYPES;
  Rogue.LICENSE_GRADES = LICENSE_GRADES;
  Rogue.START_POINTS = ROGUE_START_POINTS;

  global.Rogue = Rogue;
})(typeof window !== 'undefined' ? window : globalThis);
