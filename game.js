const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ---- No zooming when you tap fast (double-tap zoom / pinch) ----
{
  const st = document.createElement("style");
  st.textContent =
    "html,body{touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}" +
    "canvas{touch-action:none}input,textarea{-webkit-user-select:text;user-select:text}";
  document.head.appendChild(st);
  document.addEventListener("gesturestart", e => e.preventDefault());   // iPhone pinch zoom
  document.addEventListener("dblclick", e => e.preventDefault());
  canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
}
 
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
const TRAP_SHRINK = 0.55;   // Trap Shrinker: traps shrink to this size (bigger gaps)
const LEVEL_EVERY = 15;     // every 15 points the level goes up and everything gets harder
const MAX_LEVEL = 24;       // the game stops getting faster at this level

// combo + close calls (they charge your skill, they do NOT change your score)
const NEAR_MISS = 14;       // px: slipping past a trap this closely is a "close call"
const CD_PER_DODGE = 0.2;   // every dodge makes your skill cooldown 0.2s shorter
const CD_PER_CLOSE = 0.7;   // a close call: 0.7s shorter
const COMBO_STEP = 10;      // every 10 in a row, your skill is instantly ready again

// pickups (glowing orbs that fly in)
const PICKUP_EVERY = [9, 15];  // seconds between orbs
const SLOW_TIME = 5;           // slow-mo lasts this many real seconds
const SLOW_SCALE = 0.55;       // game speed during slow-mo
const BIOME_EVERY = 45;        // the world changes look every 45 points

// ---- Abilities (cd = cooldown in seconds) ----
const ABILITIES = {
  xyruz:   { name: "Teleport",      cd: 10, manual: true,  desc: "Blink to the safest spot on the screen, away from traps and boss shots. Use it right before you get hit.", cdNote: "10s after use" },
  nogz:    { name: "Extra Life",    cd: 25, manual: false, desc: "Passive. Your first crash doesn't count: you get a second chance and a moment of safety.", cdNote: "25s after the extra life is used" },
  penerz:  { name: "Phase Leap",    cd: 15, manual: true,  charges: 3, desc: "Turn into a ghost and fly straight through the next 3 traps.", cdNote: "15s after the 3rd trap" },
  renxu:   { name: "Double Score",  cd: 20, manual: true,  duration: 15, desc: "Everything you score counts double for 15 seconds. Dodge as many traps as you can!", cdNote: "20s after it ends" },
  ven:     { name: "Clone",         cd: 15, manual: false, desc: "Passive. A clone flies beside you, so you only lose when both of you crash. A lost clone comes back after the cooldown.", cdNote: "15s after a bird is lost" },
  zigvin:  { name: "Trap Smasher",  cd: 15, manual: true,  charges: 3, desc: "Charge up, then smash and destroy the next 3 traps you touch.", cdNote: "15s after the 3rd trap" },
  emanski: { name: "Trap Shrinker", cd: 15, manual: true,  duration: 5, desc: "Shrinks every trap for 5 seconds, so squeezing through is much easier.", cdNote: "15s after it ends" },
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
let dt = 1; // time step: 1 = one frame at 60 fps (already scaled by slow-mo)
let birds, traps, score, state = "menu"; // "menu" | "ready" | "playing" | "over"
let ab, invuln, gapNow, gapTarget, mult, msg;   // gapNow = trap size (1 = normal)
let particles = [];
let shake = 0;
let tick = 0;
let curLevel = 1, curBiome = 0;
let boss = null, bullets = [], bossCount = 0, nextBossAt = BOSS_FIRST;
// new: combo, pickups, effects, look
let combo = 0, bestCombo = 0, comboMilestone = 0, comboFlash = 0;
let shield = 0, slowT = 0, timeScale = 1, rsec = 1 / 60, flash = null;
let pickups = [], pickupT = 10;
let bgX = 0, clock = 0, overT = 0;
 

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
 
// ---- Little helpers ----
const rand = ([a, b]) => a + Math.random() * (b - a);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixN = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = c => "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
const smooth = t => t * t * (3 - 2 * t);
function rr(x, y, w, h, r) {              // rounded rectangle path
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// text with a dark outline (easy to read on any sky)
function bigText(text, x, y, size, fill, align = "center") {
  ctx.font = "bold " + size + "px system-ui, sans-serif";
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
// a little rounded label; returns its width
function pill(text, x, y, color = "#fff", bg = "rgba(8,16,26,0.55)", size = 12) {
  ctx.font = "bold " + size + "px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 18;
  ctx.fillStyle = bg;
  rr(x, y, w, size + 10, (size + 10) / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.fillText(text, x + 9, y + size + 1);
  return w;
}

// ---- Background: four worlds that blend into each other as your score grows ----
const BIOMES = [
  { name: "SUNNY SKY",   sky: ["#3f9fd6", "#8dd3ea", "#d6f3f3"], far: "#7fc1b4", near: "#4f9d8a", cloud: [255, 255, 255], cloudA: 0.88, star: 0,    sun: { x: 300, y: 120, r: 34, c: "#fff3a6", g: "#ffe066" } },
  { name: "SUNSET RUSH", sky: ["#4b2f7f", "#ff7e5f", "#ffd194"], far: "#8a3f73", near: "#52265a", cloud: [255, 190, 160], cloudA: 0.7,  star: 0.15, sun: { x: 270, y: 330, r: 52, c: "#ffb347", g: "#ff7e2f" } },
  { name: "MOONLIGHT",   sky: ["#050a1f", "#16255a", "#2f4585"], far: "#1c2b5c", near: "#101c42", cloud: [120, 140, 210], cloudA: 0.35, star: 1,    sun: { x: 300, y: 110, r: 26, c: "#eef2ff", g: "#aab8ff" } },
  { name: "NEON NIGHT",  sky: ["#10002b", "#3c0a6e", "#9b2fae"], far: "#2a0b52", near: "#18063a", cloud: [255, 80, 220],  cloudA: 0.22, star: 0.6,  sun: { x: 200, y: 300, r: 60, c: "#ff4fd8", g: "#ff1fa9" } },
];
BIOMES.forEach(b => { b.skyRGB = b.sky.map(hex); b.farRGB = hex(b.far); b.nearRGB = hex(b.near); b.sunRGB = hex(b.sun.c); b.glowRGB = hex(b.sun.g); });

// the world you are in right now (blends into the next one near the end of each stretch)
function world() {
  const p = (state === "menu" ? 0 : Math.max(0, score || 0)) / BIOME_EVERY;
  const i = Math.floor(p) % BIOMES.length, j = (i + 1) % BIOMES.length;
  const f = smooth(Math.max(0, Math.min(1, (p - Math.floor(p) - 0.7) / 0.3)));
  const A = BIOMES[i], B = BIOMES[j];
  return {
    i, j, f, name: f > 0.5 ? B.name : A.name,
    sky: A.skyRGB.map((c, k) => mixN(c, B.skyRGB[k], f)),
    far: mixN(A.farRGB, B.farRGB, f), near: mixN(A.nearRGB, B.nearRGB, f),
    cloud: mixN(A.cloud, B.cloud, f), cloudA: A.cloudA + (B.cloudA - A.cloudA) * f,
    star: A.star + (B.star - A.star) * f,
    sun: { x: A.sun.x + (B.sun.x - A.sun.x) * f, y: A.sun.y + (B.sun.y - A.sun.y) * f, r: A.sun.r + (B.sun.r - A.sun.r) * f, c: mixN(A.sunRGB, B.sunRGB, f), g: mixN(A.glowRGB, B.glowRGB, f) },
    neon: (i === 3 ? 1 - f : 0) + (j === 3 ? f : 0),
  };
}

const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * 400, y: Math.random() * 330, s: 0.7 + Math.random() * 1.6, tw: 1 + Math.random() * 3, ph: Math.random() * 6.28 }));
const clouds = Array.from({ length: 5 }, (_, i) => ({
  x: Math.random() * 400,
  y: 40 + i * 85 + Math.random() * 30,
  s: 0.7 + Math.random() * 0.8,
  v: 0.2 + Math.random() * 0.3,
}));

function hillY(x, seed, base, amp) { return base + Math.sin(x * 0.012 + seed) * amp + Math.sin(x * 0.031 + seed * 2.3) * amp * 0.45; }
function drawHills(off, seed, base, amp, color) {
  ctx.fillStyle = rgb(color);
  ctx.beginPath();
  ctx.moveTo(0, PLAY_H + 2);
  for (let x = 0; x <= canvas.width + 10; x += 10) ctx.lineTo(x, hillY(x + off, seed, base, amp));
  ctx.lineTo(canvas.width, PLAY_H + 2);
  ctx.closePath();
  ctx.fill();
}
function drawSkyline(off, alpha) {            // the neon city
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const w = 38, first = Math.floor(off / w);
  for (let k = first - 1; k < first + canvas.width / w + 2; k++) {
    const h = 80 + (Math.abs((k * 7919) % 97) / 97) * 150, x = k * w - off, top = PLAY_H - h;
    ctx.fillStyle = "#14052e";
    ctx.fillRect(x, top, w - 4, h);
    ctx.fillStyle = "#ff4fd8";
    ctx.fillRect(x, top, w - 4, 2);
    ctx.fillStyle = "rgba(120,240,255,0.6)";
    for (let r = 0; r < (h - 18) / 14; r++) for (let c = 0; c < 3; c++) {
      if (Math.abs(k * 31 + r * 7 + c * 3) % 5 < 2) ctx.fillRect(x + 5 + c * 9, top + 10 + r * 14, 3, 5);
    }
  }
  ctx.restore();
}
function drawGrid(alpha) {                    // the neon floor
  if (alpha <= 0.01) return;
  const hy = PLAY_H * 0.82;
  ctx.save();
  ctx.globalAlpha = alpha * 0.6;
  ctx.strokeStyle = "#ff4fd8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -6; i <= 6; i++) { ctx.moveTo(canvas.width / 2 + i * 14, hy); ctx.lineTo(canvas.width / 2 + i * 120, PLAY_H); }
  const sc = (bgX * 0.02) % 1;
  for (let k = 0; k < 8; k++) { const t = (k + sc) / 8, y = hy + (PLAY_H - hy) * t * t; ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
  ctx.stroke();
  ctx.restore();
}

function drawBackground() {
  const W = canvas.width, w = world();
  const g = ctx.createLinearGradient(0, 0, 0, PLAY_H);
  g.addColorStop(0, rgb(w.sky[0]));
  g.addColorStop(0.55, rgb(w.sky[1]));
  g.addColorStop(1, rgb(w.sky[2]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, canvas.height);

  if (w.star > 0.02) {                        // twinkling stars
    ctx.fillStyle = "#fff";
    for (const s of stars) {
      const a = w.star * (0.45 + 0.55 * Math.sin(clock * s.tw + s.ph));
      if (a <= 0.03) continue;
      ctx.globalAlpha = a;
      ctx.fillRect((((s.x - bgX * 0.05) % W) + W) % W, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  const sn = w.sun;                           // sun / moon / neon sun
  const sg = ctx.createRadialGradient(sn.x, sn.y, 2, sn.x, sn.y, sn.r * 2.8);
  sg.addColorStop(0, rgba(sn.g, 0.6));
  sg.addColorStop(1, rgba(sn.g, 0));
  ctx.fillStyle = sg;
  ctx.fillRect(sn.x - sn.r * 3, sn.y - sn.r * 3, sn.r * 6, sn.r * 6);
  ctx.fillStyle = rgb(sn.c);
  ctx.beginPath(); ctx.arc(sn.x, sn.y, sn.r, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = rgba(w.cloud, w.cloudA);    // clouds
  for (const c of clouds) {
    c.x -= c.v * dt;
    if (c.x < -90 * c.s) c.x = W + 40;
    const r = 18 * c.s;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.arc(c.x + r * 1.1, c.y - r * 0.5, r * 1.2, 0, Math.PI * 2);
    ctx.arc(c.x + r * 2.3, c.y, r, 0, Math.PI * 2);
    ctx.arc(c.x + r * 1.1, c.y + r * 0.3, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHills(bgX * 0.18, 1.3, PLAY_H - 140, 26, w.far);       // far hills (slow)
  drawSkyline(bgX * 0.3, w.neon);
  drawHills(bgX * 0.42, 4.1, PLAY_H - 82, 20, w.near);       // near hills (faster)
  drawGrid(w.neon);
}
function drawClouds() { drawBackground(); }   // old name, kept so nothing else breaks

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
  return { x, y: PLAY_H / 2, vy: 0, clone, trail: [] };
}
 
function resetGame() {
  birds = [makeBird(FRONT_X, false)];
  if (selected.id === "ven") birds.push(makeBird(BACK_X, true)); // Ven starts with a clone
  traps = [];
  particles = [];
  pickups = [];
  shake = 0;
  tick = 0;
  curLevel = 1;
  curBiome = 0;
  DIR.t = 1.4; DIR.q = []; DIR.age = 0; DIR.count = 0; DIR.last = "";
  boss = null;
  bullets = [];
  bossCount = 0;
  nextBossAt = BOSS_FIRST;
  score = 0;
  combo = 0; bestCombo = 0; comboMilestone = 0; comboFlash = 0;
  shield = 0; slowT = 0; timeScale = 1; flash = null;
  pickupT = rand(PICKUP_EVERY);
  overT = 0;
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

// Everything that could hurt a bird soon: { ta: seconds until it reaches the bird, y, hr: size, x (for things that don't fly straight at you) }
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
    if (t.type === "icicle" || t.type === "bomb" || t.type === "drone" || t.type === "pendulum") {
      if (t.warn <= 0) out.push({ ta: 0, x: t.x, y: t.y, hr: (t.type === "bomb" ? 76 : t.r || 14) + 6 });
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
    for (const d of ds) {
      if (d.x != null && Math.abs(d.x - b.x) > d.hr + 30) continue;
      clear = Math.min(clear, Math.abs(y - d.y) - d.hr - BIRD_R);
    }
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
// rain: falling icicles   bomb: drops, blinks, explodes   drone: homing   pendulum: swinging ball
// laser: beam across the whole screen           wall: a row of missiles with one gap
function spawnTrap(type, D, val, delay) {
  const out = [], add = o => { traps.push(o); out.push(o); return o; };
  const W = canvas.width, f = birds[0];
  const aim = f && Math.random() < 0.55;   // often aimed at where you are
  const randY = () => 40 + Math.random() * (PLAY_H - 80);
  const aimY = () => (aim ? clamp(f.y + (Math.random() - 0.5) * 150, 36, PLAY_H - 36) : randY());
  const warn = D.warn + delay;
  const base = { type, val, age: 0, warn, warnMax: warn, passed: false, dead: false, immune: false, smashed: false, ang: 0 };

  if (type === "missile") {
    add({ ...base, x: W + 50, y: aimY(), vx: -(4 + Math.random() * 0.8) * D.spd, vy: 0, w: 44, h: 14 });
  } else if (type === "meteor") {
    const vx = -(2.4 + Math.random() * 1.2) * D.spd, vy = (2.8 + Math.random() * 1.2) * D.spd;
    let x = W * 0.4 + Math.random() * W * 0.55;
    if (aim) x = clamp(f.x + (-vx / vy) * (f.y + 30) + (Math.random() - 0.5) * 80, 70, W - 20);
    add({ ...base, x, sx: x, y: -30, vx, vy, r: 15 });
  } else if (type === "saw") {
    const amp = 40 + Math.random() * 60, b0 = 100 + Math.random() * (PLAY_H - 200), ph = Math.random() * 6.28;
    const w = 0.4 + delay;
    add({ ...base, warn: w, warnMax: w, x: W + 30, base: b0, amp, freq: 2 + Math.random() * 1.5, phase: ph,
      y: b0 + Math.sin(ph) * amp, vx: -(2.5 + Math.random() * 0.6) * D.spd, vy: 0, r: 17 });
  } else if (type === "orb") {
    const w = 0.4 + delay;
    add({ ...base, warn: w, warnMax: w, x: W + 30, y: randY(), vx: -(2.3 + Math.random() * 0.5) * D.spd,
      vy: (2 + Math.random()) * D.spd * (Math.random() < 0.5 ? -1 : 1), r: 15 });
  } else if (type === "rain") {
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const w = D.warn * 0.7 + delay + i * 0.13;
      const x = clamp(170 + (Math.random() - 0.5) * 260, 50, W - 20);
      add({ ...base, type: "icicle", val: i === 0 ? val : 0, warn: w, warnMax: w, x, sx: x, y: -30,
        vx: -(0.6 + Math.random() * 0.6) * D.spd, vy: (3.8 + Math.random() * 1.0) * D.spd, r: 10 });
    }
  } else if (type === "bomb") {
    const vy = 3.2 * D.spd, vx = -2.4 * D.spd;
    const ty = aim ? clamp(f.y + (Math.random() - 0.5) * 100, 60, PLAY_H - 60) : randY();
    const frames = (ty + 30) / vy + 54;                              // fall time + fuse time
    const x = clamp(f.x + -vx * frames + (Math.random() - 0.5) * 80, 120, W - 20);
    const w = Math.max(0.4, D.warn * 0.7) + delay;
    add({ ...base, warn: w, warnMax: w, x, sx: x, y: -30, vx, vy, ty, stage: "fall", fuse: 0.9, boom: 0.35, br: 0, r: 12 });
  } else if (type === "drone") {
    const w = 0.5 + delay;
    add({ ...base, warn: w, warnMax: w, x: W + 30, y: randY(), vx: -2, vy: 0, r: 13, life: 4.5, max: 2.4 * D.spd });
  } else if (type === "pendulum") {
    const len = 110 + Math.random() * 130, w = D.warn + delay;
    add({ ...base, warn: w, warnMax: w, ax: W + 70, len, th: 0.95, om: 2 + Math.random(), ph: Math.random() * 6.28,
      vx: -2.2 * D.spd, vy: 0, x: W + 70, y: len * 0.8, r: 16 });
  } else if (type === "laser") {
    const w = Math.max(0.8, D.warn + 0.4) + delay;
    add({ ...base, warn: w, warnMax: w, fire: 0.6, x: W / 2, y: aimY(), h: 30 });
  } else if (type === "wall") {
    const slots = 6, gapAt = Math.floor(Math.random() * slots), step = (PLAY_H - 80) / (slots - 1);
    const w = D.warn + 0.4 + delay;
    let first = true;
    for (let i = 0; i < slots; i++) {
      if (i === gapAt) continue;
      add({ ...base, type: "missile", val: first ? val : 0, warn: w, warnMax: w, x: W + 50, y: 40 + i * step, vx: -3.8 * D.spd, vy: 0, w: 44, h: 14 });
      first = false;
    }
  }
  return out;
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

  if (t.type === "bomb") {
    if (t.stage === "fall") {
      t.x += t.vx * dt; t.y += t.vy * dt;
      if (t.y >= t.ty) { t.y = t.ty; t.stage = "fuse"; }
    } else if (t.stage === "fuse") {
      t.x += t.vx * dt;
      t.fuse -= sec;
      if (t.fuse <= 0) {
        t.stage = "boom";
        sfx("boom");
        shake = Math.max(shake, 7);
        ring(t.x, t.y, "#ffb36b", 90);
      }
    } else {
      t.boom -= sec;
      t.br = 70 * (1 - Math.max(0, t.boom) / 0.35);
      if (t.boom <= 0) t.dead = true;
    }
    return;
  }
  if (t.type === "drone") {                // homes in on you for a few seconds, then flies off
    t.life -= sec;
    const f = birds[0];
    if (t.life > 0 && f) {
      const dx = f.x - t.x, dy = f.y - t.y, d = Math.hypot(dx, dy) || 1;
      t.vx += ((dx / d) * t.max - t.vx) * 0.03 * dt;
      t.vy += ((dy / d) * t.max - t.vy) * 0.03 * dt;
    } else {
      t.vx += (-7 - t.vx) * 0.08 * dt;
      t.vy *= 0.9;
    }
    t.x += t.vx * dt; t.y += t.vy * dt; t.ang += 0.5 * dt;
    return;
  }
  if (t.type === "pendulum") {
    t.ax += t.vx * dt;
    const th = t.th * Math.sin(t.age * t.om + t.ph);
    t.x = t.ax + Math.sin(th) * t.len;
    t.y = Math.cos(th) * t.len;
    t.ang += 0.2 * dt;
    return;
  }

  t.x += t.vx * dt;
  if (t.type === "meteor") {
    t.y += t.vy * dt;
    if (tick % 2 === 0) addParticle({ type: "circle", x: t.x, y: t.y, vx: 0.6, vy: -0.4, g: 0, life: 0.3, max: 0.3, s: 5, color: "#ff9a2f" });
  } else if (t.type === "icicle") {
    t.y += t.vy * dt;
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
  if (t.type === "bomb") {
    const d = Math.hypot(b.x - t.x, b.y - t.y);
    return t.stage === "boom" ? d < t.br * s + r : d < 11 * s + r;
  }
  return Math.hypot(b.x - t.x, b.y - t.y) < (t.r - 2) * s + r;
}

// ---- Score, combo and close calls ----
function award(t) {                      // score for dodging a trap
  t.passed = true;
  score += mult;
  if (mult > 1 && birds[0]) floatText(SCORE_X + 15, birds[0].y - 30, "+" + mult, "#ffd23f");
  combo++;
  refundCd(CD_PER_DODGE);
  checkCombo();
}
function refundCd(sec) {                 // dodging charges your skill
  if (ab && ab.state === "cooldown") ab.t = Math.max(0.001, ab.t - sec);
}
function checkCombo() {
  if (combo > bestCombo) bestCombo = combo;
  const step = Math.floor(combo / COMBO_STEP);
  if (step > comboMilestone) {
    comboMilestone = step;
    comboFlash = 1;
    if (ab && ab.state === "cooldown") ab.t = 0.001;          // skill is ready again
    toast("COMBO x" + combo + "!");
    const f = birds[0];
    if (f) { ring(f.x, f.y, "#ffd23f", 90); burst(f.x, f.y, "#ffd23f", 22, 5); }
    flash = { c: "255,210,63", a: 0.28 };
  }
}
function breakCombo() { combo = 0; comboMilestone = 0; }

// how many px between a bird and a trap's danger zone (below 0 = touching)
function clearance(b, t) {
  const r = BIRD_R - 5, s = gapNow;
  if (t.type === "laser") return Math.abs(b.y - t.y) - ((t.h * s) / 2 + r);
  if (t.type === "missile") {
    const hw = 19 * s, hh = 6.5 * s, cx = t.x - 4 * s;
    const nx = clamp(b.x, cx - hw, cx + hw), ny = clamp(b.y, t.y - hh, t.y + hh);
    return Math.hypot(b.x - nx, b.y - ny) - r;
  }
  if (t.type === "bomb") return Math.hypot(b.x - t.x, b.y - t.y) - (t.stage === "boom" ? t.br * s : 11 * s) - r;
  return Math.hypot(b.x - t.x, b.y - t.y) - (t.r - 2) * s - r;
}
// watches every trap: the closest it ever got to you, and counts it when it moves away again
function trackNear() {
  for (const t of traps) {
    if (t.dead || t.immune || t.warn > 0 || t.nearDone) continue;
    let c = 999;
    for (const b of birds) c = Math.min(c, clearance(b, t));
    if (c < 0) continue;                                       // touching = not a close call
    if (t.minC === undefined || c < t.minC) t.minC = c;
    if (t.minC <= NEAR_MISS && c > t.minC + 6) { t.nearDone = true; closeCall(); }
  }
}
function closeCall() {
  const f = birds[0];
  if (!f) return;
  combo++;
  comboFlash = 1;
  refundCd(CD_PER_CLOSE);
  floatText(f.x + 34, f.y - 30, "CLOSE!", "#ffe066", 20, 0.8);
  burst(f.x, f.y, "#ffe066", 10, 3.5);
  ring(f.x, f.y, "#ffe066", 42);
  sfx("close");
  checkCombo();
}

// The smash animation: the trap explodes into chunks
function shatterTrap(t, b) {
  const palettes = {
    missile:  ["#d0d6df", "#8b94a3", "#e23b3b", "#ff9a2f"],
    meteor:   ["#8a2a0a", "#ff8a3d", "#ffd23f", "#4a2a1a"],
    saw:      ["#b8c0cc", "#5b6470", "#ff4d4d", "#2a2f38"],
    orb:      ["#c58bff", "#5b2bb5", "#ffffff", "#a06bff"],
    laser:    ["#ff4040", "#ffffff", "#ffd23f", "#222831"],
    icicle:   ["#7fd6ff", "#ffffff", "#5aa6e8", "#2a6fb0"],
    bomb:     ["#2a2f38", "#ff9a2f", "#ffd23f", "#ff3b3b"],
    drone:    ["#2b2f3a", "#9aa3b2", "#ff4d4d", "#ffd23f"],
    pendulum: ["#6b7280", "#b8c0cc", "#ff4d4d", "#2a2f38"],
  };
  const cols = palettes[t.type] || ["#ffffff"];
  const cx = t.type === "laser" ? b.x + 40 : t.x, cy = t.y;
  for (let i = 0; i < 22; i++) debris(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40, cols[i % cols.length]);
  ring(cx, cy, "#ffb36b", 70);
  burst(cx, cy, "#ffd23f", 14, 5);
  shake = 10;
}

// ---- Wave director: hand-built patterns, breathers, tension and release ----
// Every trap in a pattern is worth 1 point, so the harder patterns pay more.
const DIR = { t: 1.4, q: [], age: 0, count: 0, last: "" };
const later = (sec, fn) => DIR.q.push({ at: DIR.age + sec, fn });

function simpleType(L) {
  const pool = ["missile"];
  if (L >= 2) pool.push("meteor");
  if (L >= 3) pool.push("saw");
  if (L >= 4) pool.push("orb");
  return pool[Math.floor(Math.random() * pool.length)];
}

const PATTERNS = [
  { name: "single", minL: 1, w: 8, run(D) { spawnTrap(simpleType(D.L), D, 1, 0); return 0.5; } },

  // missiles that jump from the top lane to the bottom lane and back
  { name: "zigzag", minL: 2, w: 5, run(D) {
      const n = D.L >= 6 ? 5 : 4;
      for (let i = 0; i < n; i++) later(i * 0.55, () => { const [t] = spawnTrap("missile", D, 1, 0); t.y = i % 2 ? PLAY_H - 120 : 120; });
      return 0.55 * n; } },

  { name: "rain", minL: 2, w: 5, run(D) { spawnTrap("rain", D, 1, 0); return 1.2; } },

  // a shower of meteors, one every 0.4 seconds
  { name: "shower", minL: 3, w: 4, run(D) {
      const n = 5 + (D.L >= 10 ? 2 : 0);
      for (let i = 0; i < n; i++) later(i * 0.42, () => spawnTrap("meteor", D, 1, 0));
      return 0.42 * n + 0.6; } },

  { name: "orbs", minL: 3, w: 4, run(D) { spawnTrap("orb", D, 1, 0); later(0.7, () => spawnTrap("orb", D, 1, 0)); return 1.3; } },
  { name: "bomb", minL: 3, w: 3, run(D) { spawnTrap("bomb", D, 1, 0); return 1.6; } },

  // two saw blades that open and close like a gate: slip through when it is wide open
  { name: "sawgate", minL: 4, w: 4, run(D) {
      const [a] = spawnTrap("saw", D, 1, 0), [b] = spawnTrap("saw", D, 1, 0);
      const amp = D.L >= 8 ? 78 : 60;
      Object.assign(a, { base: PLAY_H * 0.3, amp, freq: 2.2, phase: 0, y: PLAY_H * 0.3 });
      Object.assign(b, { base: PLAY_H * 0.7, amp, freq: 2.2, phase: Math.PI, y: PLAY_H * 0.7, vx: a.vx, warn: a.warn, warnMax: a.warn });
      return 1.6; } },

  { name: "drone", minL: 5, w: 2, run(D) { spawnTrap("drone", D, 1, 0); return 2.2; } },

  // three missiles aimed around where you are right now
  { name: "barrage", minL: 5, w: 3, run(D) {
      const f = birds[0], y0 = f ? f.y : PLAY_H / 2;
      [-120, 0, 120].forEach((o, i) => later(i * 0.4, () => {
        const [t] = spawnTrap("missile", D, 1, 0);
        t.y = clamp(y0 + o + (Math.random() - 0.5) * 40, 40, PLAY_H - 40);
      }));
      return 1.4; } },

  { name: "pendulum", minL: 6, w: 2, run(D) { spawnTrap("pendulum", D, 1, 0); return 2.4; } },

  // three lasers, one after the other, top / middle / bottom in random order
  { name: "lanes", minL: 7, w: 3, run(D) {
      const ys = [100, PLAY_H / 2, PLAY_H - 100].sort(() => Math.random() - 0.5);
      ys.forEach((y, i) => later(i * 0.95, () => { const [t] = spawnTrap("laser", D, 1, 0); t.y = y; }));
      return 2.6; } },

  { name: "wall", minL: 9, w: 2, run(D) { spawnTrap("wall", D, 1, 0); return 1.6; } },
];

function pickPattern(L) {
  let opts = PATTERNS.filter(p => p.minL <= L && p.name !== DIR.last);   // never the same pattern twice in a row
  if (!opts.length) opts = PATTERNS.filter(p => p.minL <= L);          // (level 1 only has one pattern)
  let r = Math.random() * opts.reduce((a, p) => a + p.w, 0), pick = opts[0];
  for (const p of opts) { if ((r -= p.w) < 0) { pick = p; break; } }
  DIR.last = pick.name;
  return pick;
}

function directorUpdate(sec, D) {
  DIR.age += sec;
  if (DIR.q.length) {                                   // spawns that were scheduled by a pattern
    const due = DIR.q.filter(e => e.at <= DIR.age);
    DIR.q = DIR.q.filter(e => e.at > DIR.age);
    due.forEach(e => { if (!boss) e.fn(); });
  }
  if (boss) return;
  DIR.t -= sec;
  if (DIR.t > 0) return;
  const p = pickPattern(D.L);
  const dur = p.run(D);
  DIR.count++;
  // every 4th pattern you get a short breather
  DIR.t = dur + D.gap * (0.55 + Math.random() * 0.45) + (DIR.count % 4 === 0 ? 1.3 : 0);
  sfx("warn");
}

// ---- Pickups: glowing orbs that fly in. Fly into them! ----
const PICKUP_TYPES = [
  { id: "shield", w: 5, color: "#5ec8ff", label: "SHIELD!" },
  { id: "slow",   w: 4, color: "#9b8cff", label: "SLOW-MO!" },
  { id: "nuke",   w: 2, color: "#ff6a3d", label: "BLAST!" },
];
function spawnPickup() {
  let r = Math.random() * PICKUP_TYPES.reduce((a, p) => a + p.w, 0), type = PICKUP_TYPES[0];
  for (const p of PICKUP_TYPES) { if ((r -= p.w) < 0) { type = p; break; } }
  if (type.id === "shield" && shield > 0) type = PICKUP_TYPES[1];       // you already have one
  const W = canvas.width;
  let y = 80 + Math.random() * (PLAY_H - 160);
  for (let k = 0; k < 8; k++) {                                         // look for a lane with no traps in it
    const c = 80 + Math.random() * (PLAY_H - 160);
    if (!traps.some(t => !t.dead && t.type !== "laser" && Math.abs(t.y - c) < 70 && t.x > W - 230)) { y = c; break; }
  }
  pickups.push({ type, x: W + 30, y, y0: y, age: 0, taken: false });
}
function updatePickups(sec) {
  pickupT -= sec;
  if (pickupT <= 0) {
    if (!boss || boss.phase === "fight") spawnPickup();
    pickupT = rand(PICKUP_EVERY);
  }
  const f = birds[0];
  for (const p of pickups) {
    p.age += sec;
    p.x -= 2.3 * dt;
    if (f) {                                                             // a gentle magnet
      const d = Math.hypot(f.x - p.x, f.y - p.y0);
      if (d < 120 && d > 1) { p.x += (f.x - p.x) * 0.05 * dt; p.y0 += (f.y - p.y0) * 0.05 * dt; }
    }
    p.y = p.y0 + Math.sin(p.age * 3) * 9;
    for (const b of birds) if (!p.taken && Math.hypot(b.x - p.x, b.y - p.y) < BIRD_R + 17) collect(p, b);
  }
  pickups = pickups.filter(p => !p.taken && p.x > -40);
}
function collect(p, b) {
  p.taken = true;
  ring(p.x, p.y, p.type.color, 72);
  burst(p.x, p.y, p.type.color, 18, 4.5);
  toast(p.type.label);
  if (p.type.id === "shield") shield = 1;
  else if (p.type.id === "slow") { slowT = SLOW_TIME; flash = { c: "110,140,255", a: 0.35 }; }
  else nuke(b);
}
function nuke(b) {                                  // BLAST: wipes every trap and shot off the screen
  flash = { c: "255,255,255", a: 0.85 };
  shake = 14;
  ring(b.x, b.y, "#ffffff", 340);
  ring(b.x, b.y, "#ff9a5a", 230);
  for (const t of traps) {
    if (t.dead) continue;
    t.dead = true; t.smashed = true;
    shatterTrap(t, b);
    if (!t.passed && t.val) award(t);
  }
  bullets.forEach(q => burst(q.x, q.y, "#ff6b6b", 8, 3));
  bullets = [];
}

// ---- Boss fight ----
function startBoss() {
  bossCount++;
  DIR.q = [];                // forget scheduled trap spawns
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
    if (!traps.length) boss.phase = "enter";   // wait until the traps are gone
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
  if (state === "playing") {
    birds.forEach(b => {
      b.vy = FLAP;
      for (let i = 0; i < 3; i++) {              // little puffs under the wings
        addParticle({ type: "circle", x: b.x - 6 + Math.random() * 8, y: b.y + 14, vx: -0.6 - Math.random(), vy: 0.8 + Math.random() * 0.8,
          g: 0, life: 0.3, max: 0.3, s: 2.5 + Math.random() * 2, color: "rgba(255,255,255,0.85)" });
      }
    });
  }
}
 
function gameOver() {
  state = "over";
  overT = 0;
  // Show the menu no matter what, then save the score in the background
  // and refresh the board once it is saved.
  setTimeout(() => showMenu(score), 700);
  saveScore(player, selected.id, score).then(() => { if (!menu.hidden) renderBoard(); });
}
 
function die(b) {
  const id = selected.id;
  if (shield > 0) {                                  // the shield takes the hit and blasts everything nearby
    shield = 0;
    invuln = 1.1;
    breakCombo();
    flash = { c: "94,200,255", a: 0.5 };
    shake = Math.max(shake, 9);
    ring(b.x, b.y, "#5ec8ff", 150);
    ring(b.x, b.y, "#ffffff", 100);
    burst(b.x, b.y, "#5ec8ff", 26, 6);
    for (const t of traps) {
      if (t.dead || t.type === "laser" || Math.hypot(t.x - b.x, t.y - b.y) > 150) continue;
      t.dead = true; t.smashed = true;
      shatterTrap(t, b);
      if (!t.passed && t.val) award(t);
    }
    bullets = bullets.filter(q => Math.hypot(q.x - b.x, q.y - b.y) > 150);
    b.y = clamp(b.y, BIRD_R + 2, PLAY_H - BIRD_R - 2);
    b.vy = Math.min(b.vy, 0);
    toast("SHIELD BROKE!");
    return;
  }
  if ((id === "nogz" || id === "lloydie") && ab.state === "ready") {
    b.y = safeY(b);
    b.vy = 0;
    invuln = 1.5;
    breakCombo();
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
  clock += rsec;
  updateParticles();
  invuln = Math.max(0, (invuln || 0) - sec);
  if (msg) { msg.t -= sec; if (msg.t <= 0) msg = null; }
  if (comboFlash > 0) comboFlash = Math.max(0, comboFlash - rsec * 2.2);
  if (flash) { flash.a -= rsec * 1.6; if (flash.a <= 0) flash = null; }
  if (gapNow !== undefined) gapNow += (gapTarget - gapNow) * Math.min(1, 0.12 * dt);
  if (state === "over") overT += rsec;
  bgX += (state === "menu" ? 0.6 : 1.1 + (lvl() - 1) * 0.05) * dt;     // the world scrolls faster as you level up
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
 
  for (const b of birds) {
    b.vy += GRAVITY * dt;
    b.y += b.vy * dt;
    b.trail.push({ x: b.x, y: b.y });                   // the little comet tail
    if (b.trail.length > 16) b.trail.shift();
    for (const p of b.trail) p.x -= 2.6 * dt;
  }

  // the level goes up as your score grows, and the world changes every 45 points
  const D = diff();
  if (D.L > curLevel) {
    curLevel = D.L;
    toast("LEVEL " + D.L);
    ring(canvas.width / 2, 120, "#ffffff", 150);
    shake = Math.max(shake, 4);
  }
  const bi = Math.floor(score / BIOME_EVERY);
  if (bi > curBiome) {
    curBiome = bi;
    floatText(canvas.width / 2, 190, BIOMES[bi % BIOMES.length].name, "#ffffff", 30, 1.9);
    flash = { c: "255,255,255", a: 0.4 };
  }

  directorUpdate(sec, D);                                // new traps (not while a boss is around)
  for (const t of traps) updateTrap(t, sec);
  for (const t of traps) {
    if (!t.passed && t.val && t.type !== "laser" && t.warn <= 0 && t.x < SCORE_X - 30) award(t);
  }
  updatePickups(sec);
  trackNear();
 
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
    if (gone) {
      if (!t.passed && t.val && !t.smashed) award(t);
      if (t.type === "laser" && !t.smashed && !t.nearDone && t.minC !== undefined && t.minC <= NEAR_MISS) { t.nearDone = true; closeCall(); }
    }
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
    if (t.type === "meteor" || t.type === "icicle" || t.type === "bomb") {
      drawWarn(clamp(t.sx, 18, W - 18), 20, t);
    } else if (t.type === "pendulum") {
      drawWarn(W - 20, 26, t);
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

  if (t.type === "pendulum") {           // the chain
    ctx.save();
    ctx.globalAlpha = t.immune ? 0.35 : 1;
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(t.ax, 0); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#2a2f38";
    ctx.beginPath(); ctx.arc(t.ax, 0, 7, 0, 7); ctx.fill();
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
  } else if (t.type === "icicle") {
    const g = ctx.createLinearGradient(-8, 0, 8, 0);
    g.addColorStop(0, "#7fd6ff"); g.addColorStop(0.5, "#ffffff"); g.addColorStop(1, "#5aa6e8");
    ctx.fillStyle = g;
    ctx.strokeStyle = "#2a6fb0";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(8, -16); ctx.lineTo(0, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (t.type === "bomb") {
    if (t.stage === "boom") {
      const a = Math.max(0, t.boom / 0.35), R = Math.max(1, t.br);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.5, "rgba(255,170,60,0.75)"); g.addColorStop(1, "rgba(255,60,30,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,230,160," + a + ")";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    } else {
      if (t.stage === "fuse") {                                  // shows how big the blast will be
        ctx.strokeStyle = "rgba(255,80,40,0.4)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      }
      const blink = t.stage === "fuse" && Math.floor(t.fuse * 10) % 2 === 0;
      ctx.fillStyle = blink ? "#ff3b3b" : "#2a2f38";
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath(); ctx.arc(-4, -4, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(5, -18, 9, -16); ctx.stroke();
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath(); ctx.arc(9, -16, 2.5 + Math.random() * 1.5, 0, 7); ctx.fill();
    }
  } else if (t.type === "drone") {
    ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#2b2f3a";
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ff4d4d";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.stroke();
    ctx.fillStyle = "#ff3b3b";
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffe0e0";
    ctx.beginPath(); ctx.arc(-1.5, -1.5, 1.8, 0, 7); ctx.fill();
    ctx.save();
    ctx.rotate(t.ang);
    ctx.strokeStyle = "#9aa3b2";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-9, -17); ctx.lineTo(9, -17); ctx.moveTo(-9, 17); ctx.lineTo(9, 17); ctx.stroke();
    ctx.restore();
  } else if (t.type === "pendulum") {
    ctx.rotate(t.ang);
    ctx.fillStyle = "#6b7280";
    ctx.strokeStyle = "#2a2f38";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.2832, a2 = ((i + 0.5) / 16) * 6.2832;
      ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
      ctx.lineTo(Math.cos(a2) * 12, Math.sin(a2) * 12);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff4d4d";
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawPickups() {
  for (const p of pickups) {
    const c = p.type.color, pulse = 1 + 0.12 * Math.sin(p.age * 6);
    ctx.save();
    ctx.translate(p.x, p.y);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 34 * pulse);          // glow
    g.addColorStop(0, c + "99");
    g.addColorStop(1, c + "00");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 34 * pulse, 0, 7); ctx.fill();
    ctx.shadowColor = c; ctx.shadowBlur = 14;                                // the orb
    ctx.fillStyle = "#101a2a";
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3; ctx.strokeStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.stroke();
    ctx.fillStyle = "#ffffff";                                               // the icon
    ctx.beginPath();
    if (p.type.id === "shield") {
      ctx.moveTo(0, -9); ctx.quadraticCurveTo(9, -7, 9, 0); ctx.quadraticCurveTo(8, 8, 0, 11);
      ctx.quadraticCurveTo(-8, 8, -9, 0); ctx.quadraticCurveTo(-9, -7, 0, -9);
    } else if (p.type.id === "slow") {
      ctx.moveTo(-7, -9); ctx.lineTo(7, -9); ctx.lineTo(0, 0); ctx.closePath();
      ctx.moveTo(-7, 9); ctx.lineTo(7, 9); ctx.lineTo(0, 0);
    } else {
      for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.2832 + p.age * 2, r = i % 2 ? 5 : 11; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawBird(b) {
  let alpha = b.clone ? 0.7 : 1;
  if (invuln > 0 && Math.floor(invuln * 10) % 2 === 0) alpha *= 0.45;
  const active = ab && ab.state === "active";
  for (let i = 0; i < b.trail.length; i++) {                                 // comet tail
    const p = b.trail[i], k = i / b.trail.length;
    ctx.globalAlpha = alpha * k * 0.32;
    ctx.fillStyle = active ? "#ffd23f" : b.clone ? "#9ad7ff" : "#ffffff";
    ctx.beginPath(); ctx.arc(p.x, p.y, BIRD_R * (0.2 + 0.55 * k), 0, 7); ctx.fill();
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(b.x, b.y);
  ctx.rotate(clamp(b.vy * 0.07, -0.55, 0.8));                                // nose up when flapping, down when falling
  const sq = 1 + clamp(b.vy * 0.012, -0.1, 0.12);
  ctx.scale(1 / sq, sq);
  if (active) { ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 16; }
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.clip();
  if (selected.img.complete && selected.img.naturalWidth > 0) {
    ctx.drawImage(selected.img, -BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2);
  } else {
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(-BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2);
    ctx.fillStyle = "#1d2b3a";
    ctx.textAlign = "center";
    ctx.font = "bold 20px system-ui";
    ctx.fillText(selected.name[0], 0, 7);
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = active ? "#ffd23f" : b.clone ? "#9ad7ff" : "#fff";
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (shield > 0 && !b.clone) {                                              // shield bubble
    const pr = 1 + 0.05 * Math.sin(clock * 6);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = "rgba(94,200,255,0.16)";
    ctx.strokeStyle = "rgba(160,225,255,0.9)";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#5ec8ff"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(0, 0, (BIRD_R + 9) * pr, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
 
function drawHUD() {
  const a = selected.ability, W = canvas.width, y = PLAY_H;
  const g = ctx.createLinearGradient(0, y, 0, y + HUD_H);
  g.addColorStop(0, "#1b2d42");
  g.addColorStop(1, "#0c1624");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, HUD_H);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(0, y, W, 1);

  let status, frac, color;
  if (ab.state === "active") {
    status = a.charges ? ab.charges + " left" : Math.ceil(ab.t) + "s";
    frac = a.charges ? ab.charges / a.charges : ab.t / a.duration;
    color = "#ffd23f";
  } else if (ab.state === "cooldown") {
    status = selected.id === "ven" ? "clone back in " + Math.ceil(ab.t) + "s" : Math.ceil(ab.t) + "s";
    frac = 1 - ab.t / a.cd;
    color = "#6a8fb8";
  } else {
    status = a.manual ? "READY  (tap / E)" : "PASSIVE";
    frac = 1;
    color = "#4cd964";
  }
  const ready = ab.state === "ready";
  ctx.save();                                                                 // icon badge
  ctx.translate(30, y + 28);
  if (ready) { ctx.shadowColor = color; ctx.shadowBlur = 8 + 6 * Math.sin(clock * 5); }
  ctx.fillStyle = "#0b1420";
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(typeof ICONS !== "undefined" && ICONS[selected.id] ? ICONS[selected.id] : selected.name[0], 0, 7);
  ctx.restore();

  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText(a.name, 56, y + 23);
  ctx.textAlign = "right"; ctx.fillStyle = color; ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillText(status, W - 14, y + 23);
  ctx.fillStyle = "rgba(0,0,0,0.5)";                                          // progress bar
  rr(56, y + 32, W - 70, 11, 5.5); ctx.fill();
  const bw = Math.max(11, (W - 70) * Math.max(0, Math.min(1, frac)));
  const bg = ctx.createLinearGradient(0, y + 32, 0, y + 43);
  bg.addColorStop(0, color); bg.addColorStop(1, color + "aa");
  ctx.fillStyle = bg;
  if (ready) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
  rr(56, y + 32, bw, 11, 5.5); ctx.fill();
  ctx.shadowBlur = 0;
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

function drawSpeedLines(L) {
  if (L < 7) return;
  const W = canvas.width, n = Math.min(14, (L - 5) * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = W - ((i * 61.7 + bgX * (4 + (i % 3))) % (W + 90));
    const y = (i * 83.3 + 20) % PLAY_H;
    ctx.moveTo(x, y); ctx.lineTo(x + 36 + (i % 4) * 8, y);
  }
  ctx.stroke();
}

function drawScene() {
  const W = canvas.width, L = lvl(), w = world();
  drawSpeedLines(L);
  const aura = ab && ab.state === "active" ? AURA[selected.id] || null : null;
  for (const t of traps) drawTrap(t, aura);
  ctx.globalAlpha = 1;
  drawPickups();
  drawBoss();
  drawBullets();
  birds.forEach(drawBird);
  drawParticles();

  // slow-mo tint, soft vignette, flashes
  if (timeScale < 0.97) { ctx.fillStyle = "rgba(90,110,255," + ((1 - timeScale) * 0.4).toFixed(3) + ")"; ctx.fillRect(0, 0, W, PLAY_H); }
  const vg = ctx.createRadialGradient(W / 2, PLAY_H / 2, 150, W / 2, PLAY_H / 2, 400);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, PLAY_H);
  if (flash) { ctx.fillStyle = "rgba(" + flash.c + "," + Math.max(0, Math.min(0.9, flash.a)) + ")"; ctx.fillRect(0, 0, W, PLAY_H); }

  drawHUD();
  drawBossUI();

  bigText(String(score), W / 2, 68, 46, "#ffffff");                            // score
  if (mult > 1) bigText("x" + mult, W / 2 + 62, 66, 24, "#ffd23f");

  let ly = 40;                                                                 // left column: level, combo, effects
  pill("LV " + L + "  " + w.name, 10, ly, "#fff");
  ly += 30;
  if (combo >= 2) {
    const sc = 1 + comboFlash * 0.28;
    ctx.save();
    ctx.translate(10, ly + 14);
    ctx.scale(sc, sc);
    bigText("COMBO " + combo, 0, 0, 19, "#ffd23f", "left");
    ctx.restore();
    const prev = comboMilestone * COMBO_STEP, next = prev + COMBO_STEP, f = clamp((combo - prev) / (next - prev), 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; rr(10, ly + 21, 100, 7, 3.5); ctx.fill();
    ctx.fillStyle = "#ffd23f"; rr(10, ly + 21, Math.max(7, 100 * f), 7, 3.5); ctx.fill();
    ly += 38;
  }
  if (shield > 0) { pill("SHIELD", 10, ly, "#bfe9ff", "rgba(20,70,110,0.7)"); ly += 28; }
  if (slowT > 0) { pill("SLOW-MO " + Math.ceil(slowT) + "s", 10, ly, "#d6d0ff", "rgba(50,40,120,0.7)"); ly += 28; }

  if (msg) {                                                                   // messages
    ctx.globalAlpha = Math.min(1, msg.t * 2);
    ctx.font = "bold 20px system-ui, sans-serif";
    const tw = ctx.measureText(msg.text).width + 36;
    ctx.fillStyle = "rgba(8,16,26,0.62)";
    rr(W / 2 - tw / 2, 92, tw, 36, 18); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.fillText(msg.text, W / 2, 117);
    ctx.globalAlpha = 1;
  }

  if (state === "ready") {
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(clock * 4);
    bigText("TAP TO FLAP", W / 2, 330, 32, "#ffffff");
    ctx.globalAlpha = 1;
    ctx.font = "bold 14px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("Dodge the traps  -  grab the glowing orbs", W / 2, 362);
    ctx.fillText("Close calls charge your skill!", W / 2, 384);
  }
  if (state === "over") {
    ctx.fillStyle = "rgba(10,10,28," + Math.min(0.6, overT * 1.8).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, PLAY_H);
    bigText("Aray mo!", W / 2, 270, 46, "#ffd23f");
    bigText("Score " + score, W / 2, 312, 24, "#ffffff");
    if (bestCombo >= 3) bigText("Best combo " + bestCombo, W / 2, 342, 18, "#ffe9a0");
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  if (state !== "menu") drawScene();
  ctx.restore();
}
 
let lastTime = performance.now();
function loop(now = performance.now()) {
  const raw = Math.min((now - lastTime) / (1000 / 60), 3);
  lastTime = now;
  rsec = raw / 60;                                   // real time (slow-mo does not change this)
  if (state === "playing") {
    slowT = Math.max(0, slowT - rsec);
    timeScale += ((slowT > 0 ? SLOW_SCALE : 1) - timeScale) * Math.min(1, 0.12 * raw);
  } else { timeScale = 1; if (state !== "over") slowT = 0; }
  dt = raw * timeScale;
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
