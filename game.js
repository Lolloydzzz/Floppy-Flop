const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
 
// ---- Settings (tweak these) ----
const GRAVITY = 0.45;
const FLAP = -7.5;
const PIPE_SPEED = 2.5;
const PIPE_GAP = 160;
const BIG_GAP = 1.6;        // Emanski's gap multiplier
const PIPE_WIDTH = 60;
const PIPE_SPACING = 220;
const BIRD_R = 20;          // size of the face
const FRONT_X = 90;         // main bird position
const BACK_X = 45;          // Ven's clone position
const SCORE_X = 90;         // a pipe scores when it passes this x
const HUD_H = 56;           // ability bar at the bottom
const PLAY_H = canvas.height - HUD_H;
const ONLINE_WINDOW = 45000; // ms: a player counts as online if seen within this time
 
// ---- Abilities (cd = cooldown in seconds) ----
const ABILITIES = {
  xyruz:   { name: "Teleport",      cd: 10, manual: true,  desc: "Teleports you into the safe gap of the next pipe when danger is near.", cdNote: "10s after use" },
  nogz:    { name: "Extra Life",    cd: 25, manual: false, desc: "Passive. Survive one crash automatically.", cdNote: "25s after the extra life is used" },
  penerz:  { name: "Phase Leap",    cd: 15, manual: true,  charges: 3, desc: "Fly straight through the next 3 pipes like a ghost.", cdNote: "15s after the 3rd pipe" },
  renxu:   { name: "Double Score",  cd: 20, manual: true,  duration: 15, desc: "Earn 2x score for 15 seconds.", cdNote: "20s after it ends" },
  ven:     { name: "Clone",         cd: 15, manual: false, desc: "Passive. Flies with a clone. You only lose when both crash. A lost clone returns after the cooldown.", cdNote: "15s after a bird is lost" },
  zigvin:  { name: "Pipe Smasher",  cd: 15, manual: true,  charges: 3, desc: "Smash through the next 3 pipes and destroy them.", cdNote: "15s after the 3rd pipe" },
  emanski: { name: "Big Gap",       cd: 15, manual: true,  duration: 5, desc: "Pipe gaps become much bigger for 5 seconds.", cdNote: "15s after it ends" },
  lloydie: { name: "Time Reversal", cd: 15, manual: false, desc: "Passive. After a crash, time reverses and you revive, but your score drops by 2.", cdNote: "15s after it is used" },
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
let birds, pipes, score, state = "menu"; // "menu" | "ready" | "playing" | "over"
let ab, invuln, gapNow, gapTarget, mult, msg;
let particles = [];
let shake = 0;
let tick = 0;
 
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
function floatText(x, y, text, color) {
  addParticle({ type: "text", x, y, vx: 0, vy: -1, g: 0, life: 0.9, max: 0.9, text, color });
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
      ctx.font = "bold 22px system-ui";
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

// The smash animation: the pipe explodes into chunks
function shatterPipe(p, b) {
  const top = p.cy - gapNow / 2, bot = p.cy + gapNow / 2;
  const colors = ["#7be07b", "#46b856", "#ff9a5a", "#d9622f", "#6e230e"];
  const pick = () => colors[Math.floor(Math.random() * colors.length)];
  // chunks around the bird
  for (let i = 0; i < 16; i++) {
    debris(p.x + Math.random() * PIPE_WIDTH, b.y + (Math.random() - 0.5) * 150, pick());
  }
  // chunks from the rest of the pipe
  for (let i = 0; i < 14; i++) {
    const y = Math.random() < 0.5 ? Math.random() * Math.max(1, top) : bot + Math.random() * (PLAY_H - bot);
    debris(p.x + Math.random() * PIPE_WIDTH, y, pick());
  }
  ring(p.x + PIPE_WIDTH / 2, b.y, "#ffb36b", 70);
  burst(p.x + PIPE_WIDTH / 2, b.y, "#ffd23f", 14, 5);
  shake = 11;
}
 
// ---- Game setup ----
function makeBird(x, clone) {
  return { x, y: PLAY_H / 2, vy: 0, clone };
}
 
function resetGame() {
  birds = [makeBird(FRONT_X, false)];
  if (selected.id === "ven") birds.push(makeBird(BACK_X, true)); // Ven starts with a clone
  pipes = [];
  particles = [];
  shake = 0;
  tick = 0;
  score = 0;
  ab = { state: "ready", t: 0, charges: 0 }; // state: "ready" | "active" | "cooldown"
  invuln = 0;
  gapNow = gapTarget = PIPE_GAP;
  mult = 1;
  msg = null;
  state = "ready";
}
 
function addPipe() {
  const half = PIPE_GAP * BIG_GAP / 2 + 12;
  const cy = half + 12 + Math.random() * (PLAY_H - 2 * (half + 12));
  pipes.push({ x: canvas.width, cy, passed: false });
}
 
function toast(text) { msg = { text, t: 1.6 }; }
 
// ---- Abilities ----
function startCd() {
  ab.state = "cooldown";
  ab.t = selected.ability.cd;
}
 
function safeY(b) {
  // middle of the gap of the nearest pipe that is not fully behind the bird
  const p = pipes.find(p => !p.dead && p.x + PIPE_WIDTH > b.x - BIRD_R);
  return p ? p.cy : PLAY_H / 2;
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
  if (id === "penerz") { ab.charges = a.charges; toast("Phase Leap: 3 pipes"); ring(fx.x, fx.y, "#9db8ff", 60); }
  if (id === "zigvin") { ab.charges = a.charges; toast("Smash ready: 3 pipes"); ring(fx.x, fx.y, "#ff9a5a", 60); }
  if (id === "renxu") { ab.t = a.duration; mult = 2; toast("Double score!"); ring(fx.x, fx.y, "#ffd23f", 60); burst(fx.x, fx.y, "#ffd23f", 16, 4); }
  if (id === "emanski") { ab.t = a.duration; gapTarget = PIPE_GAP * BIG_GAP; toast("Big gap!"); ring(fx.x, fx.y, "#7ee8f5", 60); shake = 5; }
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
      gapTarget = PIPE_GAP;
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
 
function hitsPipe(b, p) {
  const r = BIRD_R - 4; // slightly forgiving
  if (!(b.x + r > p.x && b.x - r < p.x + PIPE_WIDTH)) return false;
  return b.y - r < p.cy - gapNow / 2 || b.y + r > p.cy + gapNow / 2;
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
      birds.forEach(b => addParticle({ type: "circle", x: b.x - 8, y: b.y, vx: -PIPE_SPEED * 0.6, vy: 0, g: 0, life: 0.4, max: 0.4, s: 6, color: "#9db8ff" }));
    }
    if (selected.id === "renxu") {
      birds.forEach(b => addParticle({ type: "circle", x: b.x + (Math.random() - 0.5) * 30, y: b.y + (Math.random() - 0.5) * 30, vx: 0, vy: -1, g: 0, life: 0.5, max: 0.5, s: 3, color: "#ffd23f" }));
    }
  }
 
  for (const b of birds) { b.vy += GRAVITY * dt; b.y += b.vy * dt; }
 
  if (!pipes.length || pipes[pipes.length - 1].x < canvas.width - PIPE_SPACING) addPipe();
  for (const p of pipes) {
    p.x -= PIPE_SPEED * dt;
    if (!p.passed && p.x + PIPE_WIDTH < SCORE_X) {
      p.passed = true;
      score += mult;
      if (mult > 1 && birds[0]) floatText(SCORE_X + 15, birds[0].y - 30, "+" + mult, "#ffd23f");
    }
  }
 
  for (const b of birds.slice()) {
    if (state !== "playing") break;
    let dead = false;
    if (b.y + BIRD_R > PLAY_H || b.y - BIRD_R < 0) {
      if (invuln > 0) { b.y = Math.max(BIRD_R, Math.min(PLAY_H - BIRD_R, b.y)); b.vy = 0; }
      else dead = true;
    }
    for (const p of pipes) {
      if (p.immune || p.dead || invuln > 0 || !hitsPipe(b, p)) continue;
      if (selected.id === "penerz" && ab.state === "active") {
        p.immune = true;
        burst(b.x, b.y, "#9db8ff", 14, 3.5);
        ring(b.x, b.y, "#9db8ff", 40);
        spendCharge();
        continue;
      }
      if (selected.id === "zigvin" && ab.state === "active") {
        p.dead = true;
        shatterPipe(p, b);
        if (!p.passed) { p.passed = true; score += mult; }
        toast("SMASH!");
        spendCharge();
        continue;
      }
      dead = true;
    }
    if (dead) die(b);
  }
  pipes = pipes.filter(p => !p.dead && p.x + PIPE_WIDTH > 0);
}
 
// ---- Drawing ----
// Pipe colors. Each ability can give the pipes its own look while active.
const PALETTES = {
  normal:  { c: ["#2a7d37", "#7be07b", "#46b856", "#1f5f2a"], edge: "#174a20", glow: null },
  zigvin:  { c: ["#a33a1c", "#ff9a5a", "#d9622f", "#6e230e"], edge: "#4d1706", glow: "#ff7a2f" },
  penerz:  { c: ["#4a63c9", "#bcd0ff", "#7391f2", "#2f428f"], edge: "#22316e", glow: "#8fb0ff" },
  emanski: { c: ["#1d8a99", "#8ef0fa", "#36b4c4", "#126673"], edge: "#0b4852", glow: "#5fe3f2" },
  renxu:   { c: ["#b8860b", "#fff0a0", "#e6b92e", "#7a5a05"], edge: "#523b02", glow: "#ffd23f" },
};
function pipePalette() {
  if (ab && ab.state === "active" && PALETTES[selected.id]) return PALETTES[selected.id];
  return PALETTES.normal;
}
function pipeGrad(x, w, pal) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, pal.c[0]);
  g.addColorStop(0.3, pal.c[1]);
  g.addColorStop(0.7, pal.c[2]);
  g.addColorStop(1, pal.c[3]);
  return g;
}
function drawPipe(p, pal) {
  const top = p.cy - gapNow / 2, bot = p.cy + gapNow / 2;
  const capH = 24, capW = PIPE_WIDTH + 10, capX = p.x - 5;
  const body = pipeGrad(p.x, PIPE_WIDTH, pal);
  const cap = pipeGrad(capX, capW, pal);
  const topBodyH = top - capH + 2;
  const botBodyY = bot + capH - 2;

  ctx.save();
  ctx.globalAlpha = p.immune ? 0.35 : 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = pal.edge;
  if (pal.glow) { ctx.shadowColor = pal.glow; ctx.shadowBlur = 14; }

  // bodies
  ctx.fillStyle = body;
  if (topBodyH > 0) { ctx.fillRect(p.x, 0, PIPE_WIDTH, topBodyH); ctx.strokeRect(p.x, 0, PIPE_WIDTH, topBodyH); }
  ctx.fillRect(p.x, botBodyY, PIPE_WIDTH, PLAY_H - botBodyY);
  ctx.strokeRect(p.x, botBodyY, PIPE_WIDTH, PLAY_H - botBodyY);

  // caps
  ctx.fillStyle = cap;
  ctx.fillRect(capX, top - capH, capW, capH);
  ctx.strokeRect(capX, top - capH, capW, capH);
  ctx.fillRect(capX, bot, capW, capH);
  ctx.strokeRect(capX, bot, capW, capH);

  // shine
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  if (topBodyH > 0) ctx.fillRect(p.x + 9, 0, 6, topBodyH);
  ctx.fillRect(p.x + 9, botBodyY, 6, PLAY_H - botBodyY);
  ctx.fillRect(capX + 8, top - capH + 3, 6, capH - 6);
  ctx.fillRect(capX + 8, bot + 3, 6, capH - 6);
  // shadow under each cap
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(capX, top - 5, capW, 5);
  ctx.fillRect(capX, bot, capW, 5);
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
 
function drawScene() {
  const pal = pipePalette();
  for (const p of pipes) drawPipe(p, pal);
  ctx.globalAlpha = 1;
  birds.forEach(drawBird);
  drawParticles();
  drawHUD();
 
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 40px system-ui";
  ctx.fillText(score, canvas.width / 2, 70);
  if (mult > 1) {
    ctx.fillStyle = "#ffd23f";
    ctx.font = "bold 22px system-ui";
    ctx.fillText("x" + mult, canvas.width / 2 + 55, 68);
  }
  if (onlineCount > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("● " + onlineCount + " online", 10, 20);
    ctx.textAlign = "center";
  }
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
  if (document.activeElement === nameInput) return;
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
