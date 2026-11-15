const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
 
// ---- Settings (tweak these) ----
const GRAVITY = 0.45;
const FLAP = -7.5;
const BIRD_R = 20;          // size of the face
const FRONT_X = 90;         // main bird position
const BACK_X = 45;          // Ven's clone position
const SCORE_X = 90;         // a trap scores when it passes this x
const HUD_H = 56;           // ability bar at the bottom
const PLAY_H = canvas.height - HUD_H;
const ONLINE_WINDOW = 45000; // ms: a player counts as online if seen within this time

// bosses
const BOSS_FIRST = 100;     // the first boss shows up at 100 points
const BOSS_LATER = 500;     // after he runs away, the next boss comes at 500, then 1000, 1500...
const BOSS_REWARD = 50;     // points for beating a boss
const BOSS_R = 80;          // boss radius (giant!)
const BULLET_SPEED = 3.4;
const BULLET_R = 12;
const BOSS_MOUTH = { x: -62, y: 40 }; // where shots come out (relative to boss center)

// traps and difficulty
const TRAP_SHRINK = 0.55;   // Emanski: traps shrink to this size (bigger gaps)
const LEVEL_EVERY = 15;     // every 15 points the level goes up and everything gets harder
const MAX_LEVEL = 24;       // the game stops getting faster at this level
 
// ---- Abilities (cd = cooldown in seconds) ----
const ABILITIES = {
  xyruz:   { name: "Teleport",      cd: 10, manual: true,  desc: "Blink to the safest spot on the screen, away from traps and boss shots. Use it right before you get hit.", cdNote: "10s after use" },
  nogz:    { name: "Extra Life",    cd: 25, manual: false, desc: "Passive. Your first crash doesn't count: you get a second chance and a moment of safety.", cdNote: "25s after the extra life is used" },
  penerz:  { name: "Phase Leap",    cd: 15, manual: true,  charges: 3, desc: "Turn into a ghost and fly straight through the next 3 traps.", cdNote: "15s after the 3rd trap" },
  renxu:   { name: "Double Score",  cd: 20, manual: true,  duration: 15, desc: "Everything you score counts double for 15 seconds. Dodge as many traps as you can!", cdNote: "20s after it ends" },
  ven:     { name: "Clone",         cd: 15, manual: false, desc: "Passive. A clone flies beside you, so you only lose when both of you crash. A lost clone comes back after the cooldown.", cdNote: "15s after a bird is lost" },
  zigvin:  { name: "Trap Smasher",  cd: 15, manual: true,  charges: 3, desc: "Charge up, then smash and destroy the next 3 traps you touch.", cdNote: "15s after the 3rd trap" },
  emanski: { name: "Big Gap",       cd: 15, manual: true,  duration: 5, desc: "Shrinks every trap for 5 seconds, so squeezing through is much easier.", cdNote: "15s after it ends" },
  lloydie: { name: "Time Reversal", cd: 15, manual: false, desc: "Passive. After a crash, time rewinds and you come back to life, but you lose 2 points.", cdNote: "15s after it is used" },
};
 
// ---- Skins (pictures come from skins.js) ----
const SKINS = [
  { id: "xyruz", name: "Xyruz" },
  { id: "nogz", name: "Nogz" },
  { id: "penerz", name: "Penerz" },
  { id: "renxu", name: "Renxu" },
  { id: "ven", name: "Ven" },
  { id: "zigvin", name: "Zigvin" },
  { id: "emanski", name: "Emanski" },
  { id: "lloydie", name: "Lloydie" },
];
SKINS.forEach(s => {
  s.ability = ABILITIES[s.id];
  s.src = SKIN_DATA[s.id];
  s.img = new Image();
  s.img.src = s.src;
});
 
// ---- Menu elements ----
const menu = document.getElementById("menu");
const nameInput = document.getElementById("username");
const skinGrid = document.getElementById("skinGrid");
const skinInfo = document.getElementById("skinInfo");
const playBtn = document.getElementById("playBtn");
const board = document.getElementById("board");
const lastScore = document.getElementById("lastScore");
const onlineEl = document.getElementById("online");
 
let selected = SKINS[0];
let player = "";
let dt = 1; // time step: 1 = one frame at 60 fps
let birds, traps, score, state = "menu"; // "menu" | "ready" | "playing" | "over"
let ab, invuln, gapNow, gapTarget, mult, msg;   // gapNow = trap size (1 = normal)
let particles = [];
let shake = 0;
let tick = 0;
let spawnT = 1.2, curLevel = 1;
let boss = null, bullets = [], bossCount = 0, nextBossAt = BOSS_FIRST;
 
// ---- Online database (Firebase) ----
const DB_URL = "https://floppyflop-leaderboard-default-rtdb.asia-southeast1.firebasedatabase.app";

// fetch that gives up after 6 seconds so the game never hangs
function fetchTimeout(url, opts = {}, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

function userKey(name) {
  // Firebase keys can't contain . $ # [ ] /
  return name.toLowerCase().replace(/[.$#\[\]\/\s]/g, "_");
}

// ---- Leaderboard ----
async function loadBoard() {
  try {
    const res = await fetchTimeout(`${DB_URL}/scores.json`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return Object.values(data || {})
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch {
    return null; // null = couldn't connect
  }
}

async function saveScore(name, skinId, pts) {
  if (pts <= 0) return;
  const url = `${DB_URL}/scores/${encodeURIComponent(userKey(name))}.json`;
  try {
    const res = await fetchTimeout(url);
    const mine = await res.json();
    if (mine && mine.score >= pts) return; // keep personal best only
    await fetchTimeout(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, skin: skinId, score: pts }),
    });
  } catch {}
}

async function renderBoard() {
  board.innerHTML = "<li>Loading...</li>";
  const list = await loadBoard();
  if (list === null) { board.innerHTML = "<li>Can't reach leaderboard. Check your connection.</li>"; return; }
  board.innerHTML = "";
  // always show at least 5 rows; empty slots are placeholders
  const MIN_ROWS = 5;
  for (let i = list.length; i < MIN_ROWS; i++) list.push(null);
  list.forEach((e, i) => {
    if (!e) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="nm" style="opacity:.5">---</span>`;
      board.appendChild(li);
      return;
    }
    const skin = SKINS.find(s => s.id === e.skin) || SKINS[0];
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="rank">${i + 1}</span><img src="${skin.src}" alt="">` +
      `<span class="nm"></span><span class="sc"></span>`;
    li.querySelector(".nm").textContent = e.name + " (" + skin.name + ")";
    li.querySelector(".sc").textContent = e.score;
    board.appendChild(li);
  });
}

// refresh while the menu is open so you see friends' new scores
setInterval(() => { if (!menu.hidden) renderBoard(); }, 15000);

// ---- Players online ----
const SESSION_ID = Math.random().toString(36).slice(2, 10);
const PRESENCE_URL = `${DB_URL}/presence/${SESSION_ID}.json`;
let onlineCount = 0;

function showOnline(text) {
  if (onlineEl) onlineEl.textContent = text;
}

async function heartbeat() {
  try {
    // write "I'm here" with the server's clock
    const res = await fetchTimeout(PRESENCE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: { ".sv": "timestamp" } }),
    });
    if (!res.ok) throw new Error(res.status);
    const mine = await res.json();
    const now = mine && typeof mine.t === "number" ? mine.t : Date.now();

    // count everyone seen recently
    const all = await (await fetchTimeout(`${DB_URL}/presence.json`)).json() || {};
    let n = 0;
    for (const [id, v] of Object.entries(all)) {
      const age = now - ((v && v.t) || 0);
      if (age <= ONLINE_WINDOW) n++;
      else if (age > 5 * 60 * 1000) {
        // clean up old entries
        fetchTimeout(`${DB_URL}/presence/${id}.json`, { method: "DELETE" }).catch(() => {});
      }
    }
    onlineCount = Math.max(1, n);
    showOnline("● " + onlineCount + " online");
  } catch {
    onlineCount = 0;
    showOnline("");
  }
}
heartbeat();
setInterval(heartbeat, 20000);
// leave the list when the tab closes
window.addEventListener("pagehide", () => {
  try { fetch(PRESENCE_URL, { method: "DELETE", keepalive: true }); } catch {}
});
 
// ---- Menu setup ----
function showInfo() {
  const a = selected.ability;
  skinInfo.innerHTML =
    `<b>${selected.name}: ${a.name}</b><br>${a.desc}<br>` +
    `<small>${a.manual ? "Press E or tap the bottom bar to use. " : ""}Cooldown: ${a.cdNote}.</small>`;
}
SKINS.forEach(s => {
  const b = document.createElement("button");
  b.className = "skin" + (s === selected ? " selected" : "");
  b.innerHTML = `<img src="${s.src}" alt=""><span>${s.name}</span><span class="ab">${s.ability.name}</span>`;
  b.onclick = () => {
    selected = s;
    document.querySelectorAll(".skin").forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
    showInfo();
  };
  skinGrid.appendChild(b);
});
showInfo();
try { nameInput.value = localStorage.getItem("flappy_name") || ""; } catch {}
renderBoard();
 
playBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); nameInput.placeholder = "Username required"; return; }
  player = name;
  try { localStorage.setItem("flappy_name", name); } catch {}
  playBtn.blur();
  menu.hidden = true;
  resetGame();
};
 
function showMenu(pts) {
  renderBoard();
  lastScore.hidden = false;
  lastScore.textContent = player + " scored " + pts;
  menu.hidden = false;
  state = "menu";
}
 
// ---- Clouds ----
const clouds = Array.from({ length: 5 }, (_, i) => ({
  x: Math.random() * canvas.width,
  y: 40 + i * 85 + Math.random() * 30,
  s: 0.7 + Math.random() * 0.8,
  v: 0.2 + Math.random() * 0.3,
}));
function drawClouds() {
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (const c of clouds) {
    c.x -= c.v * dt;
    if (c.x < -90 * c.s) c.x = canvas.width + 40;
    const r = 18 * c.s;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.arc(c.x + r * 1.1, c.y - r * 0.5, r * 1.2, 0, Math.PI * 2);
    ctx.arc(c.x + r * 2.3, c.y, r, 0, Math.PI * 2);
    ctx.arc(c.x + r * 1.1, c.y + r * 0.3, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- Particles & effects ----
function addParticle(q) {
  particles.push(q);
  if (particles.length > 300) particles.shift();
}
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (0.4 + Math.random() * 0.6) * speed;
    const life = 0.5 + Math.random() * 0.4;
    addParticle({ type: "circle", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.08, life, max: life, s: 2 + Math.random() * 3, color });
  }
}
function ring(x, y, color, r) {
  addParticle({ type: "ring", x, y, vx: 0, vy: 0, g: 0, life: 0.55, max: 0.55, r, color });
}
function floatText(x, y, text, color, size = 22, life = 0.9) {
  addParticle({ type: "text", x, y, vx: 0, vy: -1, g: 0, life, max: life, text, color, size });
}
function debris(x, y, color) {
  const life = 0.7 + Math.random() * 0.5;
  addParticle({
    type: "rect", x, y,
    vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 5 - 1, g: 0.35,
    life, max: life, s: 6 + Math.random() * 11,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, color,
  });
}
function updateParticles() {
  const sec = dt / 60;
  for (const q of particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += q.g * dt;
    if (q.type === "rect") q.rot += q.vr * dt;
    q.life -= sec;
  }
  particles = particles.filter(q => q.life > 0);
  shake *= Math.pow(0.88, dt);
  if (shake < 0.2) shake = 0;
}
function drawParticles() {
  for (const q of particles) {
    const a = Math.max(0, q.life / q.max);
    ctx.globalAlpha = a;
    if (q.type === "ring") {
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 4 * a + 1;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (1 - a) + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (q.type === "rect") {
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.fillStyle = q.color;
      ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s * 0.7);
      ctx.restore();
    } else if (q.type === "text") {
      ctx.fillStyle = q.color;
      ctx.font = "bold " + (q.size || 22) + "px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(q.text, q.x, q.y);
    } else {
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// plays a sound if extras.js is loaded (never crashes the game)
function sfx(name) {
  try { if (typeof SFX !== "undefined" && SFX[name]) SFX[name](); } catch {}
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
 
// ---- Game setup ----
function makeBird(x, clone) {
  return { x, y: PLAY_H / 2, vy: 0, clone };
}
 
function resetGame() {
  birds = [makeBird(FRONT_X, false)];
  if (selected.id === "ven") birds.push(makeBird(BACK_X, true)); // Ven starts with a clone
  traps = [];
  particles = [];
  shake = 0;
  tick = 0;
  spawnT = 1.2;
  curLevel = 1;
  boss = null;
  bullets = [];
  bossCount = 0;
  nextBossAt = BOSS_FIRST;
  score = 0;
  ab = { state: "ready", t: 0, charges: 0 }; // state: "ready" | "active" | "cooldown"
  invuln = 0;
  gapNow = gapTarget = 1;
  mult = 1;
  msg = null;
  state = "ready";
}
 
function toast(text) { msg = { text, t: 1.6 }; }

// ---- Difficulty ----
const lvl = () => Math.min(MAX_LEVEL, 1 + Math.floor(score / LEVEL_EVERY));
function diff() {
  const L = lvl();
  return {
    L,
    spd: 1 + (L - 1) * 0.035,                       // how fast traps fly
    gap: Math.max(0.6, 1.45 - (L - 1) * 0.04),      // seconds between waves
    warn: Math.max(0.45, 0.9 - (L - 1) * 0.015),    // seconds of warning before a trap appears
  };
}
 
// ---- Abilities ----
function startCd() {
  ab.state = "cooldown";
  ab.t = selected.ability.cd;
}

// Everything that could hurt a bird soon: { ta: seconds until it reaches the bird, y, hr: size }
function dangers(b) {
  const out = [];
  const W = canvas.width;
  for (const t of traps) {
    if (t.dead) continue;
    if (t.type === "laser") {
      const ta = Math.max(0, t.warn);
      if (ta < 1.4 && t.fire > 0) out.push({ ta, y: t.y, hr: t.h / 2 });
      continue;
    }
    const sp = Math.abs(t.vx) || 1;
    const x0 = t.warn > 0 ? W + 50 : t.x;
    const ta = Math.max(0, t.warn) + Math.max(0, x0 - b.x) / (sp * 60);
    if (ta > 1.6) continue;
    const y = t.type === "meteor" ? t.y + t.vy * ta * 60 : t.y;
    out.push({ ta, y, hr: (t.type === "missile" ? 8 : t.r || 14) + 2 });
  }
  for (const q of bullets) {
    if (q.vx >= 0) continue;
    const ta = (q.x - b.x) / (-q.vx * 60);
    if (ta < -0.2 || ta > 1.6) continue;
    out.push({ ta, y: q.y + q.vy * ta * 60, hr: BULLET_R });
  }
  return out;
}

// the closest spot that is safe from traps and shots
function safeY(b) {
  const ds = dangers(b);
  let best = b.y, bestScore = -Infinity;
  for (let y = BIRD_R + 8; y <= PLAY_H - BIRD_R - 8; y += 8) {
    let clear = Infinity;
    for (const d of ds) clear = Math.min(clear, Math.abs(y - d.y) - d.hr - BIRD_R);
    const sc = Math.min(clear, 50) * 10 - Math.abs(y - b.y) * 0.05;   // safe first, then close to where you are
    if (sc > bestScore) { bestScore = sc; best = y; }
  }
  return best;
}
 
function useAbility() {
  const a = selected.ability;
  if (state !== "playing" || !a.manual || ab.state !== "ready") return;
  const id = selected.id;
  if (id === "xyruz") {
    birds.forEach(b => {
      ring(b.x, b.y, "#ffd23f", 45);
      burst(b.x, b.y, "#ffd23f", 14, 3.5);
      b.y = safeY(b);
      b.vy = 0;
      ring(b.x, b.y, "#ffffff", 55);
      burst(b.x, b.y, "#9ad7ff", 18, 4);
    });
    invuln = 0.4;
    toast("Teleport!");
    startCd();
    return;
  }
  ab.state = "active";
  const fx = birds[0];
  if (id === "penerz") { ab.charges = a.charges; toast("Phase Leap: 3 traps"); ring(fx.x, fx.y, "#9db8ff", 60); }
  if (id === "zigvin") { ab.charges = a.charges; toast("Smash ready: 3 traps"); ring(fx.x, fx.y, "#ff9a5a", 60); }
  if (id === "renxu") { ab.t = a.duration; mult = 2; toast("Double score!"); ring(fx.x, fx.y, "#ffd23f", 60); burst(fx.x, fx.y, "#ffd23f", 16, 4); }
  if (id === "emanski") { ab.t = a.duration; gapTarget = TRAP_SHRINK; toast("Big gap!"); ring(fx.x, fx.y, "#7ee8f5", 60); shake = 5; }
}
 
function spendCharge() {
  ab.charges--;
  if (ab.charges <= 0) startCd();
}
 
function tickAbility(sec) {
  if (ab.state === "active" && ab.t > 0) {
    ab.t -= sec;
    if (ab.t <= 0) {
      mult = 1;
      gapTarget = 1;
      startCd();
    }
  } else if (ab.state === "cooldown") {
    ab.t -= sec;
    if (ab.t <= 0) {
      ab.t = 0;
      ab.state = "ready";
      if (selected.id === "ven" && birds.length === 1) {
        const free = [FRONT_X, BACK_X].find(x => !birds.some(b => b.x === x));
        const buddy = makeBird(free, true);
        buddy.y = birds[0].y;
        buddy.vy = birds[0].vy;
        birds.push(buddy);
        ring(buddy.x, buddy.y, "#9ad7ff", 50);
        burst(buddy.x, buddy.y, "#9ad7ff", 14, 3.5);
        toast("Clone is back!");
      }
    }
  }
}

// ---- Traps ----
// missile: flies straight (warning first)      meteor: falls diagonally from the sky
// saw: wavy spinning blade                      orb: bouncing energy ball
// laser: beam across the whole screen           wall: a row of missiles with one gap
function pickType(L) {
  const pool = [["missile", 10]];
  if (L >= 3) pool.push(["meteor", 7]);
  if (L >= 5) pool.push(["saw", 6]);
  if (L >= 7) pool.push(["orb", 5]);
  if (L >= 9) pool.push(["laser", 4]);
  if (L >= 12) pool.push(["wall", 3]);
  let r = Math.random() * pool.reduce((a, p) => a + p[1], 0);
  for (const [k, w] of pool) { if ((r -= w) < 0) return k; }
  return "missile";
}

function spawnWave(D) {
  const n = D.L >= 8 && Math.random() < 0.3 ? 2 : 1;      // sometimes two traps at once
  for (let i = 0; i < n; i++) spawnTrap(pickType(D.L), D, i === 0 ? 1 : 0, i * 0.4);
  sfx("warn");
}

function spawnTrap(type, D, val, delay) {
  const W = canvas.width, f = birds[0];
  const aim = f && Math.random() < 0.55;                  // often aimed at where you are
  const randY = () => 40 + Math.random() * (PLAY_H - 80);
  const aimY = () => (aim ? clamp(f.y + (Math.random() - 0.5) * 150, 36, PLAY_H - 36) : randY());
  const warn = D.warn + delay;
  const base = { type, val, age: 0, warn, warnMax: warn, passed: false, dead: false, immune: false, smashed: false, ang: 0 };

  if (type === "missile") {
    traps.push({ ...base, x: W + 50, y: aimY(), vx: -(4 + Math.random() * 0.8) * D.spd, vy: 0, w: 44, h: 14 });
  } else if (type === "meteor") {
    const vx = -(2.4 + Math.random() * 1.2) * D.spd, vy = (2.8 + Math.random() * 1.2) * D.spd;
    let x = W * 0.4 + Math.random() * W * 0.55;
    if (aim) x = clamp(f.x + (-vx / vy) * (f.y + 30) + (Math.random() - 0.5) * 80, 70, W - 20);
    traps.push({ ...base, x, sx: x, y: -30, vx, vy, r: 15 });
  } else if (type === "saw") {
    const amp = 40 + Math.random() * 60, b0 = 100 + Math.random() * (PLAY_H - 200), ph = Math.random() * 6.28;
    const w = 0.4 + delay;
    traps.push({ ...base, warn: w, warnMax: w, x: W + 30, base: b0, amp, freq: 2 + Math.random() * 1.5, phase: ph,
      y: b0 + Math.sin(ph) * amp, vx: -(2.5 + Math.random() * 0.6) * D.spd, vy: 0, r: 17 });
  } else if (type === "orb") {
    const w = 0.4 + delay;
    traps.push({ ...base, warn: w, warnMax: w, x: W + 30, y: randY(), vx: -(2.3 + Math.random() * 0.5) * D.spd,
      vy: (2 + Math.random()) * D.spd * (Math.random() < 0.5 ? -1 : 1), r: 15 });
  } else if (type === "laser") {
    const w = Math.max(0.8, D.warn + 0.4) + delay;
    traps.push({ ...base, warn: w, warnMax: w, fire: 0.6, x: W / 2, y: aimY(), h: 30 });
  } else if (type === "wall") {
    const slots = 6, gapAt = Math.floor(Math.random() * slots), step = (PLAY_H - 80) / (slots - 1);
    const w = D.warn + 0.4 + delay;
    let first = true;
    for (let i = 0; i < slots; i++) {
      if (i === gapAt) continue;
      traps.push({ ...base, type: "missile", val: first ? val : 0, warn: w, warnMax: w, x: W + 50, y: 40 + i * step, vx: -3.8 * D.spd, vy: 0, w: 44, h: 14 });
      first = false;
    }
  }
}

function updateTrap(t, sec) {
  t.age += sec;
  if (t.type === "laser") {
    if (t.warn > 0) {
      t.warn -= sec;
      if (t.warn <= 0) { sfx("zap"); shake = Math.max(shake, 4); }
    } else {
      t.fire -= sec;
      if (t.fire <= 0) t.dead = true;
    }
    return;
  }
  if (t.warn > 0) { t.warn -= sec; return; }
  t.x += t.vx * dt;
  if (t.type === "meteor") {
    t.y += t.vy * dt;
    if (tick % 2 === 0) addParticle({ type: "circle", x: t.x, y: t.y, vx: 0.6, vy: -0.4, g: 0, life: 0.3, max: 0.3, s: 5, color: "#ff9a2f" });
  } else if (t.type === "saw") {
    t.y = t.base + Math.sin(t.age * t.freq + t.phase) * t.amp;
    t.ang += 0.3 * dt;
  } else if (t.type === "orb") {
    t.y += t.vy * dt;
    if (t.y < 30) { t.y = 30; t.vy = Math.abs(t.vy); }
    if (t.y > PLAY_H - 30) { t.y = PLAY_H - 30; t.vy = -Math.abs(t.vy); }
  }
}

function hitsTrap(b, t) {
  const r = BIRD_R - 5, s = gapNow;     // slightly forgiving
  if (t.type === "laser") return t.warn <= 0 && t.fire > 0 && Math.abs(b.y - t.y) < (t.h * s) / 2 + r;
  if (t.warn > 0) return false;         // still only a warning
  if (t.type === "missile") {
    const hw = 19 * s, hh = 6.5 * s, cx = t.x - 4 * s;
    const nx = clamp(b.x, cx - hw, cx + hw), ny = clamp(b.y, t.y - hh, t.y + hh);
    return (b.x - nx) ** 2 + (b.y - ny) ** 2 < r * r;
  }
  return Math.hypot(b.x - t.x, b.y - t.y) < (t.r - 2) * s + r;
}

function award(t) {                      // score for dodging a trap
  t.passed = true;
  score += mult;
  if (mult > 1 && birds[0]) floatText(SCORE_X + 15, birds[0].y - 30, "+" + mult, "#ffd23f");
}

// The smash animation: the trap explodes into chunks
function shatterTrap(t, b) {
  const palettes = {
    missile: ["#d0d6df", "#8b94a3", "#e23b3b", "#ff9a2f"],
    meteor:  ["#8a2a0a", "#ff8a3d", "#ffd23f", "#4a2a1a"],
    saw:     ["#b8c0cc", "#5b6470", "#ff4d4d", "#2a2f38"],
    orb:     ["#c58bff", "#5b2bb5", "#ffffff", "#a06bff"],
    laser:   ["#ff4040", "#ffffff", "#ffd23f", "#222831"],
  };
  const cols = palettes[t.type] || ["#ffffff"];
  const cx = t.type === "laser" ? b.x + 40 : t.x, cy = t.y;
  for (let i = 0; i < 22; i++) debris(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40, cols[i % cols.length]);
  ring(cx, cy, "#ffb36b", 70);
  burst(cx, cy, "#ffd23f", 14, 5);
  shake = 10;
}

// ---- Boss fight ----
function startBoss() {
  bossCount++;
  // first boss at 100; after he runs away the next one comes at 500, then every 500
  nextBossAt = bossCount === 1 ? BOSS_LATER : nextBossAt + BOSS_LATER;
  boss = {
    phase: "incoming",           // incoming -> enter -> fight -> (robot.js: fleeing)
    x: canvas.width + BOSS_R + 20,
    y: PLAY_H / 2,
    t: 0, flash: 0, kick: 0,
    maxHp: Math.min(20, 10 + 2 * (bossCount - 1)),   // = number of shots he fires
    interval: Math.max(0.75, 1.15 - 0.08 * (bossCount - 1)),
    shootT: 1.2, deathT: 0, popped: false,
  };
  boss.hp = boss.hpShown = boss.maxHp;
  bullets = [];
  // charge-based abilities end when a boss shows up
  if (ab.state === "active" && selected.ability.charges) startCd();
}

function bossShoot() {
  const sx = boss.x + BOSS_MOUTH.x, sy = boss.y + BOSS_MOUTH.y;
  const t = birds[Math.floor(Math.random() * birds.length)];
  const aims = [t.y];
  if (boss.hp <= boss.maxHp / 2) aims.push(t.y + (Math.random() < 0.5 ? -1 : 1) * 110); // double shot when hurt
  for (const ay of aims) {
    const dx = t.x - sx, dy = ay - sy, d = Math.hypot(dx, dy);
    bullets.push({ x: sx, y: sy, vx: dx / d * BULLET_SPEED, vy: dy / d * BULLET_SPEED });
  }
  boss.hp--;                 // every shot costs him health
  boss.flash = 0.18;
  boss.kick = 1;
  burst(sx, sy, "#ff6b6b", 8, 3);
  if (boss.hp <= 0) { startBossDeath(); return; }
  boss.shootT = boss.interval;
}

function startBossDeath() {
  boss.phase = "dying";
  boss.deathT = 0;
  bullets.forEach(q => burst(q.x, q.y, "#ff6b6b", 8, 3));
  bullets = [];
  toast("He is falling apart...");
}

function popBoss() {
  boss.popped = true;
  score += BOSS_REWARD;
  const cx = boss.x, cy = boss.y;
  ring(cx, cy, "#ffffff", 220);
  ring(cx, cy, "#ff9a5a", 160);
  burst(cx, cy, "#ffd23f", 24, 10);
  burst(cx, cy, "#ff6b6b", 24, 8);
  floatText(cx - 30, cy, "+" + BOSS_REWARD, "#ffd23f", 48, 1.4);
  shake = 20;
  toast("BOSS DEFEATED! +" + BOSS_REWARD);
}

function updateBoss(sec) {
  if (!boss) return;
  boss.t += sec;
  boss.flash = Math.max(0, boss.flash - sec);
  boss.kick *= Math.pow(0.85, dt);
  boss.hpShown += (boss.hp - boss.hpShown) * Math.min(1, 0.15 * dt);
  if (boss.phase !== "dying") boss.y = PLAY_H / 2 + Math.sin(boss.t * 1.4) * 120;

  if (boss.phase === "incoming") {
    if (!traps.length) boss.phase = "enter";          // wait until the traps are gone
  } else if (boss.phase === "enter") {
    boss.x -= 2.2 * dt;
    if (boss.x <= canvas.width - BOSS_R - 10) {
      boss.x = canvas.width - BOSS_R - 10;
      boss.phase = "fight";
      boss.shootT = 1.2;
      shake = 8;
      toast("BOSS FIGHT!");
    }
  } else if (boss.phase === "fight") {
    boss.shootT -= sec;
    if (boss.shootT <= 0) bossShoot();
  } else if (boss.phase === "dying") {
    boss.deathT += sec;
    if (!boss.popped && boss.deathT >= 1.0) popBoss();
    if (boss.popped && boss.deathT >= 1.7) boss = null;
  }

  // shots
  for (const q of bullets) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    if (tick % 2 === 0) addParticle({ type: "circle", x: q.x, y: q.y, vx: 0, vy: 0, g: 0, life: 0.25, max: 0.25, s: 5, color: "#ff6b6b" });
  }
  bullets = bullets.filter(q => q.x > -30 && q.x < canvas.width + 30 && q.y > -30 && q.y < PLAY_H + 30);
}

// ---- Game logic ----
function flap() {
  if (state === "ready") state = "playing";
  if (state === "playing") birds.forEach(b => (b.vy = FLAP));
}
 
function gameOver() {
  state = "over";
  // Show the menu no matter what, then save the score in the background
  // and refresh the board once it is saved.
  setTimeout(() => showMenu(score), 700);
  saveScore(player, selected.id, score).then(() => { if (!menu.hidden) renderBoard(); });
}
 
function die(b) {
  const id = selected.id;
  if ((id === "nogz" || id === "lloydie") && ab.state === "ready") {
    b.y = safeY(b);
    b.vy = 0;
    invuln = 1.5;
    if (id === "lloydie") {
      score = Math.max(0, score - 2);
      ring(b.x, b.y, "#c58bff", 110);
      ring(b.x, b.y, "#e6ccff", 70);
      burst(b.x, b.y, "#c58bff", 22, 4.5);
      floatText(b.x + 20, b.y - 30, "-2", "#e6ccff");
      toast("Time reversed! -2");
    } else {
      ring(b.x, b.y, "#7fd6ff", 90);
      burst(b.x, b.y, "#7fd6ff", 26, 5);
      toast("Extra life used!");
    }
    startCd();
    return;
  }
  burst(b.x, b.y, "#ff6b6b", 20, 5);
  shake = Math.max(shake, 6);
  birds = birds.filter(x => x !== b);
  if (!birds.length) { gameOver(); return; }
  if (id === "ven") {
    if (ab.state === "ready") startCd();
    toast("One bird down!");
  }
}
 
function update() {
  const sec = dt / 60;
  updateParticles();
  invuln = Math.max(0, (invuln || 0) - sec);
  if (msg) { msg.t -= sec; if (msg.t <= 0) msg = null; }
  if (gapNow !== undefined) gapNow += (gapTarget - gapNow) * Math.min(1, 0.12 * dt);
  if (state !== "playing") return;
 
  tickAbility(sec);
  tick++;

  // passive visual effects while an ability is active
  if (ab.state === "active" && tick % 3 === 0) {
    if (selected.id === "penerz") {
      birds.forEach(b => addParticle({ type: "circle", x: b.x - 8, y: b.y, vx: -1.5, vy: 0, g: 0, life: 0.4, max: 0.4, s: 6, color: "#9db8ff" }));
    }
    if (selected.id === "renxu") {
      birds.forEach(b => addParticle({ type: "circle", x: b.x + (Math.random() - 0.5) * 30, y: b.y + (Math.random() - 0.5) * 30, vx: 0, vy: -1, g: 0, life: 0.5, max: 0.5, s: 3, color: "#ffd23f" }));
    }
  }
 
  for (const b of birds) { b.vy += GRAVITY * dt; b.y += b.vy * dt; }

  // the level goes up as your score grows
  const D = diff();
  if (D.L > curLevel) {
    curLevel = D.L;
    toast("LEVEL " + D.L);
    ring(canvas.width / 2, 120, "#ffffff", 150);
    shake = Math.max(shake, 4);
  }

  // new traps (not while a boss is around)
  if (!boss) {
    spawnT -= sec;
    if (spawnT <= 0) {
      spawnWave(D);
      spawnT = D.gap * (0.8 + Math.random() * 0.5);
    }
  }
  for (const t of traps) updateTrap(t, sec);
  for (const t of traps) {
    if (!t.passed && t.val && t.type !== "laser" && t.warn <= 0 && t.x < SCORE_X - 30) award(t);
  }
 
  if (!boss && score >= nextBossAt) startBoss();
  updateBoss(sec);

  for (const b of birds.slice()) {
    if (state !== "playing") break;
    let dead = false;
    // boss shots
    if (boss && boss.phase === "fight" && invuln <= 0) {
      for (const q of bullets) {
        if (Math.hypot(q.x - b.x, q.y - b.y) < BULLET_R + BIRD_R - 6) {
          q.hit = true;
          burst(q.x, q.y, "#ff6b6b", 10, 4);
          dead = true;
        }
      }
      bullets = bullets.filter(q => !q.hit);
    }
    if (b.y + BIRD_R > PLAY_H || b.y - BIRD_R < 0) {
      if (invuln > 0) { b.y = Math.max(BIRD_R, Math.min(PLAY_H - BIRD_R, b.y)); b.vy = 0; }
      else dead = true;
    }
    for (const t of traps) {
      if (t.immune || t.dead || invuln > 0 || !hitsTrap(b, t)) continue;
      if (selected.id === "penerz" && ab.state === "active") {
        t.immune = true;                 // ghost through it
        burst(b.x, b.y, "#9db8ff", 14, 3.5);
        ring(b.x, b.y, "#9db8ff", 40);
        spendCharge();
        continue;
      }
      if (selected.id === "zigvin" && ab.state === "active") {
        t.dead = true;                   // smash it
        t.smashed = true;
        shatterTrap(t, b);
        if (!t.passed && t.val) award(t);
        toast("SMASH!");
        spendCharge();
        continue;
      }
      dead = true;
    }
    if (dead) die(b);
  }

  // remove traps that are gone (and give the points if you dodged them)
  traps = traps.filter(t => {
    const gone = t.dead || (t.type !== "laser" && t.warn <= 0 && (t.x < -80 || t.y > PLAY_H + 60));
    if (gone && !t.passed && t.val && !t.smashed) award(t);
    return !gone;
  });
}
 
// ---- Drawing ----
const AURA = { zigvin: "#ff7a2f", penerz: "#8fb0ff", emanski: "#5fe3f2", renxu: "#ffd23f" };

function drawWarn(x, y, t) {
  const on = Math.floor(t.warn * 8) % 2 === 0;
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.45;
  ctx.fillStyle = "#ffcc00";
  ctx.strokeStyle = "#7a1c1c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - 15);
  ctx.lineTo(x + 14, y + 11);
  ctx.lineTo(x - 14, y + 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#7a1c1c";
  ctx.font = "bold 16px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("!", x, y + 9);
  ctx.restore();
}

function drawLaser(t) {
  const W = canvas.width, h = t.h * gapNow;
  ctx.save();
  ctx.globalAlpha = t.immune ? 0.35 : 1;
  if (t.warn > 0) {
    const on = Math.floor(t.warn * 10) % 2 === 0;
    ctx.globalAlpha *= on ? 0.9 : 0.4;
    ctx.strokeStyle = "#ff4040";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(0, t.y);
    ctx.lineTo(W, t.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawWarn(30, t.y - 18, t);
    drawWarn(W - 30, t.y - 18, t);
  } else if (t.fire > 0) {
    const flick = 0.8 + Math.random() * 0.2;
    ctx.globalAlpha *= flick;
    const g = ctx.createLinearGradient(0, t.y - h / 2, 0, t.y + h / 2);
    g.addColorStop(0, "rgba(255,40,40,0)");
    g.addColorStop(0.3, "rgba(255,60,60,0.9)");
    g.addColorStop(0.5, "#ffffff");
    g.addColorStop(0.7, "rgba(255,60,60,0.9)");
    g.addColorStop(1, "rgba(255,40,40,0)");
    ctx.shadowColor = "#ff2a2a";
    ctx.shadowBlur = 24;
    ctx.fillStyle = g;
    ctx.fillRect(0, t.y - h / 2, W, h);
  }
  ctx.restore();
  // beam machines on both sides
  ctx.fillStyle = "#222831";
  ctx.fillRect(0, t.y - 17, 11, 34);
  ctx.fillRect(W - 11, t.y - 17, 11, 34);
  ctx.fillStyle = t.warn <= 0 ? "#ff3b3b" : "#7a1c1c";
  ctx.beginPath(); ctx.arc(7, t.y, 4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(W - 7, t.y, 4, 0, 7); ctx.fill();
}

function drawTrap(t, aura) {
  const W = canvas.width, s = gapNow;
  if (t.type === "laser") { drawLaser(t); return; }

  if (t.warn > 0) {                      // warning sign where it will appear
    if (t.type === "meteor") {
      drawWarn(clamp(t.sx, 18, W - 18), 20, t);
    } else {
      if (t.type === "missile") {        // faint line showing the path
        ctx.save();
        ctx.strokeStyle = "rgba(255,60,60,0.3)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(W - 34, t.y); ctx.lineTo(0, t.y); ctx.stroke();
        ctx.restore();
      }
      drawWarn(W - 20, t.y - 4, t);
    }
    return;
  }

  ctx.save();
  ctx.globalAlpha = t.immune ? 0.35 : 1;
  ctx.translate(t.x, t.y);
  ctx.scale(s, s);
  if (aura) { ctx.shadowColor = aura; ctx.shadowBlur = 16; }

  if (t.type === "missile") {
    const fl = 10 + Math.random() * 8;
    ctx.fillStyle = "#ff9a2f";                                   // flame
    ctx.beginPath(); ctx.moveTo(14, -5); ctx.lineTo(14 + fl, 0); ctx.lineTo(14, 5); ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath(); ctx.moveTo(14, -2.5); ctx.lineTo(14 + fl * 0.6, 0); ctx.lineTo(14, 2.5); ctx.fill();
    ctx.fillStyle = "#7a1c1c";                                   // fins
    ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(18, -12); ctx.lineTo(15, -6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(18, 12); ctx.lineTo(15, 6); ctx.fill();
    const g = ctx.createLinearGradient(0, -7, 0, 7);             // body
    g.addColorStop(0, "#d0d6df"); g.addColorStop(0.5, "#8b94a3"); g.addColorStop(1, "#4a525e");
    ctx.fillStyle = g;
    ctx.fillRect(-14, -6.5, 28, 13);
    ctx.fillStyle = "#e23b3b";                                   // nose + stripe
    ctx.beginPath(); ctx.moveTo(-14, -6.5); ctx.lineTo(-24, 0); ctx.lineTo(-14, 6.5); ctx.fill();
    ctx.fillRect(2, -6.5, 5, 13);
  } else if (t.type === "meteor") {
    const sp = Math.hypot(t.vx, t.vy) || 1, ux = -t.vx / sp, uy = -t.vy / sp;
    for (let i = 4; i >= 1; i--) {                               // fiery tail
      ctx.globalAlpha = (t.immune ? 0.35 : 1) * (0.55 - i * 0.1);
      ctx.fillStyle = i > 2 ? "#ff8a3d" : "#ffd23f";
      ctx.beginPath(); ctx.arc(ux * i * 9, uy * i * 9, 13 - i * 1.5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = t.immune ? 0.35 : 1;
    const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, 16);
    g.addColorStop(0, "#fff2b0"); g.addColorStop(0.5, "#ff8a3d"); g.addColorStop(1, "#8a2a0a");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(60,20,5,0.5)";
    ctx.beginPath(); ctx.arc(-5, 3, 3.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -4, 2.5, 0, 7); ctx.fill();
  } else if (t.type === "saw") {
    ctx.rotate(t.ang);
    ctx.fillStyle = "#b8c0cc";
    ctx.strokeStyle = "#2a2f38";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.2832, a2 = ((i + 0.5) / 12) * 6.2832;
      ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
      ctx.lineTo(Math.cos(a2) * 13, Math.sin(a2) * 13);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#5b6470";
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
    ctx.fillStyle = "#ff4d4d";
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fill();
  } else if (t.type === "orb") {
    const pulse = 1 + 0.08 * Math.sin(t.age * 8);
    ctx.shadowColor = "#a06bff"; ctx.shadowBlur = 20;
    const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, 16 * pulse);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.45, "#c58bff"); g.addColorStop(1, "#5b2bb5");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 15 * pulse, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#e6ccff";
    for (let i = 0; i < 3; i++) {
      const a = t.age * 4 + (i * 6.2832) / 3;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 22, Math.sin(a) * 22, 2.5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

function drawBird(b) {
  let alpha = b.clone ? 0.7 : 1;
  if (invuln > 0 && Math.floor(invuln * 10) % 2 === 0) alpha *= 0.4;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, BIRD_R, 0, Math.PI * 2);
  ctx.clip();
  if (selected.img.complete && selected.img.naturalWidth > 0) {
    ctx.drawImage(selected.img, b.x - BIRD_R, b.y - BIRD_R, BIRD_R * 2, BIRD_R * 2);
  } else {
    ctx.fillStyle = "#ffd23f";
    ctx.fill();
    ctx.fillStyle = "#1d2b3a";
    ctx.textAlign = "center";
    ctx.font = "bold 20px system-ui";
    ctx.fillText(selected.name[0], b.x, b.y + 7);
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = ab && ab.state === "active" ? "#ffd23f" : b.clone ? "#9ad7ff" : "#fff";
  ctx.beginPath();
  ctx.arc(b.x, b.y, BIRD_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
 
function drawHUD() {
  const a = selected.ability;
  const y = PLAY_H;
  ctx.fillStyle = "#14212e";
  ctx.fillRect(0, y, canvas.width, HUD_H);
 
  let label, frac, color;
  if (ab.state === "active") {
    label = a.charges ? `${a.name}: ${ab.charges} left` : `${a.name}: ${Math.ceil(ab.t)}s left`;
    frac = a.charges ? ab.charges / a.charges : ab.t / a.duration;
    color = "#ffd23f";
  } else if (ab.state === "cooldown") {
    label = selected.id === "ven" ? `Clone returns in ${Math.ceil(ab.t)}s` : `${a.name}: cooldown ${Math.ceil(ab.t)}s`;
    frac = 1 - ab.t / a.cd;
    color = "#5b7a99";
  } else {
    label = a.manual ? `${a.name}: READY (E / tap here)` : `${a.name}: READY (passive)`;
    frac = 1;
    color = "#4caf50";
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 15px system-ui";
  ctx.fillText(label, canvas.width / 2, y + 24);
  ctx.fillStyle = "#0b141d";
  ctx.fillRect(14, y + 36, canvas.width - 28, 8);
  ctx.fillStyle = color;
  ctx.fillRect(14, y + 36, (canvas.width - 28) * Math.max(0, Math.min(1, frac)), 8);
}
 
// simple boss (robot.js replaces this with the robot)
function drawBoss() {
  if (!boss || boss.popped || boss.phase === "incoming") return;
  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.fillStyle = "#505b6a";
  ctx.beginPath(); ctx.arc(0, 0, BOSS_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff3b3b";
  ctx.beginPath(); ctx.arc(-14, -10, 22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBullets() {
  for (const q of bullets) {
    ctx.save();
    ctx.shadowColor = "#ff3b3b";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ff5252";
    ctx.beginPath();
    ctx.arc(q.x, q.y, BULLET_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffd6d6";
    ctx.beginPath();
    ctx.arc(q.x, q.y, BULLET_R * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBossUI() {
  if (!boss) return;
  if (boss.phase === "incoming" || boss.phase === "enter") {
    // warning flash
    const on = Math.floor(boss.t * 4) % 2 === 0;
    ctx.fillStyle = on ? "rgba(255,0,0,0.14)" : "rgba(255,0,0,0.04)";
    ctx.fillRect(0, 0, canvas.width, PLAY_H);
    ctx.textAlign = "center";
    ctx.fillStyle = on ? "#ff5252" : "#ffffff";
    ctx.font = "bold 38px system-ui";
    ctx.fillText("WARNING!", canvas.width / 2, 190);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px system-ui";
    ctx.fillText("A giant boss is coming", canvas.width / 2, 220);
  }
  if (boss.phase !== "incoming" && !boss.popped) {
    const bw = 300, bh = 14, bx = (canvas.width - bw) / 2, by = 16;
    ctx.fillStyle = "#0b141d";
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(bx, by, bw * Math.max(0, boss.hpShown / boss.maxHp), bh);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("BOSS", canvas.width / 2, by + 11);
  }
}

function drawScene() {
  const L = lvl();
  if (L > 1) {                             // the sky turns angry as the level rises
    ctx.fillStyle = "rgba(255,70,40," + Math.min(0.3, (L - 1) * 0.012) + ")";
    ctx.fillRect(0, 0, canvas.width, PLAY_H);
  }
  const aura = ab && ab.state === "active" ? AURA[selected.id] || null : null;
  for (const t of traps) drawTrap(t, aura);
  ctx.globalAlpha = 1;
  drawBoss();
  drawBullets();
  birds.forEach(drawBird);
  drawParticles();
  drawHUD();
  drawBossUI();
 
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 40px system-ui";
  ctx.fillText(score, canvas.width / 2, 70);
  if (mult > 1) {
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 22px system-ui";
    ctx.fillText("x" + mult, canvas.width / 2 + 55, 68);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 13px system-ui";
  ctx.fillText("LEVEL " + L, 10, 56);
  ctx.textAlign = "center";
  if (msg) {
    ctx.globalAlpha = Math.min(1, msg.t * 2);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px system-ui";
    ctx.fillText(msg.text, canvas.width / 2, 115);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#fff";
  ctx.font = "20px system-ui";
  if (state === "ready") ctx.fillText("Press space to start", canvas.width / 2, 340);
  if (state === "over") {
    ctx.font = "bold 32px system-ui";
    ctx.fillText("Aray mo!", canvas.width / 2, 300);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawClouds();
  if (state !== "menu") drawScene();
  ctx.restore();
}
 
let lastTime = performance.now();
function loop(now = performance.now()) {
  dt = Math.min((now - lastTime) / (1000 / 60), 3);
  lastTime = now;
  update();
  draw();
  requestAnimationFrame(loop);
}
 
// ---- Input: Space/click/tap = flap, E or tap the bottom bar = ability ----
document.addEventListener("keydown", e => {
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")) return;
  if (e.code === "Space") { e.preventDefault(); flap(); }
  if (e.code === "KeyE") useAbility();
});
canvas.addEventListener("pointerdown", e => {
  const r = canvas.getBoundingClientRect();
  const y = (e.clientY - r.top) * canvas.height / r.height;
  if (y > PLAY_H && selected.ability.manual) useAbility();
  else flap();
});
 
loop();
