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
 
// ---- Abilities (cd = cooldown in seconds) ----
const ABILITIES = {
  xyruz:   { name: "Teleport",      cd: 10, manual: true,  desc: "Teleports you into the safe gap of the next pipe when danger is near.", cdNote: "10s after use" },
  nogz:    { name: "Extra Life",    cd: 15, manual: false, desc: "Passive. Survive one crash automatically.", cdNote: "15s after the extra life is used" },
  penerz:  { name: "Phase Leap",    cd: 15, manual: true,  charges: 3, desc: "Fly straight through the next 3 pipes like a ghost.", cdNote: "15s after the 3rd pipe" },
  renxu:   { name: "Double Score",  cd: 20, manual: true,  duration: 15, desc: "Earn 2x score for 15 seconds.", cdNote: "20s after it ends" },
  ven:     { name: "Clone",         cd: 15, manual: false, desc: "Passive. Flies with a clone. You only lose when both crash. A lost clone returns after the cooldown.", cdNote: "15s after a bird is lost" },
  zigvin:  { name: "Pipe Smasher",  cd: 15, manual: true,  charges: 3, desc: "Smash through the next 3 pipes and destroy them.", cdNote: "15s after the 3rd pipe" },
  emanski: { name: "Big Gap",       cd: 15, manual: true,  duration: 5, desc: "Pipe gaps become much bigger for 5 seconds.", cdNote: "15s after it ends" },
  lloydie: { name: "Time Reversal", cd: 20, manual: false, desc: "Passive. After a crash, time reverses and you revive, but your score drops by 2.", cdNote: "20s after it is used" },
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
 
let selected = SKINS[0];
let player = "";
let dt = 1; // time step: 1 = one frame at 60 fps
let birds, pipes, score, state = "menu"; // "menu" | "ready" | "playing" | "over"
let ab, invuln, gapNow, gapTarget, mult, msg;
 
// ---- Leaderboard (shared online via Firebase) ----
// This is the DATABASE address, not the console page address.
// If you chose Singapore as the location, use:
// "https://floppyflop-leaderboard-default-rtdb.asia-southeast1.firebasedatabase.app"
const DB_URL = "https://floppyflop-leaderboard-default-rtdb.asia-southeast1.firebasedatabase.app";

function userKey(name) {
  // Firebase keys can't contain . $ # [ ] /
  return name.toLowerCase().replace(/[.$#\[\]\/\s]/g, "_");
}

async function loadBoard() {
  try {
    const res = await fetch(`${DB_URL}/scores.json`);
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
    const res = await fetch(url);
    const mine = await res.json();
    if (mine && mine.score >= pts) return; // keep personal best only
    await fetch(url, {
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
  board.innerHTML = list.length ? "" : "<li>No scores yet. Be the first!</li>";
  list.forEach((e, i) => {
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
 
// ---- Game setup ----
function makeBird(x, clone) {
  return { x, y: PLAY_H / 2, vy: 0, clone };
}
 
function resetGame() {
  birds = [makeBird(FRONT_X, false)];
  if (selected.id === "ven") birds.push(makeBird(BACK_X, true)); // Ven starts with a clone
  pipes = [];
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
    birds.forEach(b => { b.y = safeY(b); b.vy = 0; });
    invuln = 0.4;
    toast("Teleport!");
    startCd();
    return;
  }
  ab.state = "active";
  if (id === "penerz") { ab.charges = a.charges; toast("Phase Leap: 3 pipes"); }
  if (id === "zigvin") { ab.charges = a.charges; toast("Smash ready: 3 pipes"); }
  if (id === "renxu") { ab.t = a.duration; mult = 2; toast("Double score!"); }
  if (id === "emanski") { ab.t = a.duration; gapTarget = PIPE_GAP * BIG_GAP; toast("Big gap!"); }
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
  const saved = saveScore(player, selected.id, score);
  setTimeout(() => saved.then(() => showMenu(score)), 700);
}
 
function die(b) {
  const id = selected.id;
  if ((id === "nogz" || id === "lloydie") && ab.state === "ready") {
    b.y = safeY(b);
    b.vy = 0;
    invuln = 1.5;
    if (id === "lloydie") {
      score = Math.max(0, score - 2);
      toast("Time reversed! -2");
    } else {
      toast("Extra life used!");
    }
    startCd();
    return;
  }
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
  invuln = Math.max(0, (invuln || 0) - sec);
  if (msg) { msg.t -= sec; if (msg.t <= 0) msg = null; }
  if (gapNow !== undefined) gapNow += (gapTarget - gapNow) * Math.min(1, 0.12 * dt);
  if (state !== "playing") return;
 
  tickAbility(sec);
 
  for (const b of birds) { b.vy += GRAVITY * dt; b.y += b.vy * dt; }
 
  if (!pipes.length || pipes[pipes.length - 1].x < canvas.width - PIPE_SPACING) addPipe();
  for (const p of pipes) {
    p.x -= PIPE_SPEED * dt;
    if (!p.passed && p.x + PIPE_WIDTH < SCORE_X) { p.passed = true; score += mult; }
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
      if (selected.id === "penerz" && ab.state === "active") { p.immune = true; spendCharge(); continue; }
      if (selected.id === "zigvin" && ab.state === "active") {
        p.dead = true;
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
 
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawClouds();
  if (state === "menu") return;
 
  for (const p of pipes) {
    const top = p.cy - gapNow / 2, bot = p.cy + gapNow / 2;
    ctx.globalAlpha = p.immune ? 0.35 : 1;
    ctx.fillStyle = "#4caf50";
    ctx.fillRect(p.x, 0, PIPE_WIDTH, top);
    ctx.fillRect(p.x, bot, PIPE_WIDTH, PLAY_H - bot);
  }
  ctx.globalAlpha = 1;
  birds.forEach(drawBird);
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
