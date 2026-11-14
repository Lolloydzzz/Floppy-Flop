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
const BOSS_EVERY = 100;     // a boss appears every 100 points
const BOSS_REWARD = 50;     // points for beating a boss
const BOSS_R = 80;          // boss radius (giant!)
const BULLET_SPEED = 3.4;
const BULLET_R = 12;
const BOSS_MOUTH = { x: -62, y: 40 }; // where shots come out (relative to boss center)
 
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
let boss = null, bullets = [], bossCount = 0, nextBossAt = BOSS_EVERY;
// Boss face picture, built right into this file so nothing else has to load
const BOSS_FACE = "data:image/jpeg;base64,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";
const bossImg = new Image();
bossImg.src = BOSS_FACE;
 
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
  boss = null;
  bullets = [];
  bossCount = 0;
  nextBossAt = BOSS_EVERY;
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
  if (boss) {
    // boss fight: pick the height farthest from every incoming shot
    if (boss.phase === "fight" && bullets.length) {
      let best = PLAY_H / 2, bestD = -1;
      for (let y = BIRD_R + 10; y <= PLAY_H - BIRD_R - 10; y += 20) {
        let d = Infinity;
        for (const q of bullets) {
          if (q.vx >= 0) continue;
          const t = (b.x - q.x) / q.vx;
          if (t < 0) continue;
          d = Math.min(d, Math.abs(y - (q.y + q.vy * t)));
        }
        if (d !== Infinity && d > bestD) { bestD = d; best = y; }
      }
      return best;
    }
    return PLAY_H / 2;
  }
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
 
// ---- Boss fight ----
function startBoss() {
  bossCount++;
  nextBossAt += BOSS_EVERY;
  boss = {
    phase: "incoming",           // incoming -> enter -> fight -> dying
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
  ring(cx, cy, "#ffd23f", 110);
  burst(cx, cy, "#ffd23f", 24, 10);
  burst(cx, cy, "#ff6b6b", 24, 8);
  burst(cx, cy, "#ffffff", 20, 6);
  burst(cx, cy, "#7be07b", 16, 7);
  const colors = ["#ffd23f", "#ff6b6b", "#7ee8f5", "#c58bff", "#7be07b"];
  for (let i = 0; i < 24; i++) {
    debris(cx + (Math.random() - 0.5) * 120, cy + (Math.random() - 0.5) * 120, colors[i % colors.length]);
  }
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
    if (!pipes.length) boss.phase = "enter";          // wait until the pipes are gone
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
    if (boss.popped && boss.deathT >= 1.7) boss = null;   // back to normal pipes
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
 
  // no new pipes while a boss is around
  if (!boss && (!pipes.length || pipes[pipes.length - 1].x < canvas.width - PIPE_SPACING)) addPipe();
  for (const p of pipes) {
    p.x -= PIPE_SPEED * dt;
    if (!p.passed && p.x + PIPE_WIDTH < SCORE_X) {
      p.passed = true;
      score += mult;
      if (mult > 1 && birds[0]) floatText(SCORE_X + 15, birds[0].y - 30, "+" + mult, "#ffd23f");
    }
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
 
function drawBoss() {
  if (!boss || boss.popped || boss.phase === "incoming") return;
  let x = boss.x, y = boss.y, sc = 1 + boss.kick * 0.07;
  let whiteFlash = boss.flash > 0 ? 0.55 : 0;
  if (boss.phase === "dying") {
    const k = boss.deathT; // 0..1 then pop
    x += (Math.random() - 0.5) * (4 + k * 14);
    y += (Math.random() - 0.5) * (4 + k * 14);
    sc = 1 + 0.4 * k * k;           // swells like a balloon
    if (Math.floor(k * 12) % 2 === 0) whiteFlash = 0.7;
  }
  const R = BOSS_R;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  // glowing aura
  ctx.shadowColor = "#ff3b3b";
  ctx.shadowBlur = 32;
  ctx.fillStyle = "#3a0f0f";
  ctx.beginPath();
  ctx.arc(0, 0, R + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // face
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.clip();
  if (bossImg.complete && bossImg.naturalWidth > 0) {
    ctx.drawImage(bossImg, -R, -R, R * 2, R * 2);
  } else {
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(-R, -R, R * 2, R * 2);
  }
  if (whiteFlash) { ctx.fillStyle = "rgba(255,255,255," + whiteFlash + ")"; ctx.fillRect(-R, -R, R * 2, R * 2); }
  ctx.restore();
  ctx.lineWidth = 7;
  ctx.strokeStyle = whiteFlash ? "#ffffff" : "#ff4d4d";
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.stroke();
  // charging glow before each shot
  if (boss.phase === "fight" && boss.shootT < 0.4) {
    const k = 1 - boss.shootT / 0.4;
    ctx.shadowColor = "#ff3b3b";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#ff5252";
    ctx.beginPath();
    ctx.arc(BOSS_MOUTH.x, BOSS_MOUTH.y, 4 + 10 * k, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const pal = pipePalette();
  for (const p of pipes) drawPipe(p, pal);
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
