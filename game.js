
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
 
// ---- Settings (tweak these) ----
const GRAVITY = 0.45;
const FLAP = -7.5;
const PIPE_SPEED = 2.5;
const PIPE_GAP = 160;
const PIPE_WIDTH = 60;
const PIPE_SPACING = 220;
const BIRD_R = 20; // size of the face
 
// ---- Skins: files live in the skins/ folder ----
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
  s.src = "skins/" + s.id + ".png";
  s.img = new Image();
  s.img.src = s.src;
});
 
// ---- Menu elements ----
const menu = document.getElementById("menu");
const nameInput = document.getElementById("username");
const skinGrid = document.getElementById("skinGrid");
const playBtn = document.getElementById("playBtn");
const board = document.getElementById("board");
const lastScore = document.getElementById("lastScore");
 
let selected = SKINS[0];
let player = "";
let dt = 1; // time step: 1 = one frame at 60 fps
let bird, pipes, score, state = "menu"; // "menu" | "ready" | "playing" | "over"
 
// ---- Leaderboard (saved in this browser) ----
function loadBoard() {
  try { return JSON.parse(localStorage.getItem("flappy_board")) || []; }
  catch { return []; }
}
function saveScore(name, skinId, pts) {
  if (pts <= 0) return;
  let list = loadBoard();
  const mine = list.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (mine) {
    if (pts > mine.score) { mine.score = pts; mine.skin = skinId; mine.name = name; }
  } else {
    list.push({ name, skin: skinId, score: pts });
  }
  list.sort((a, b) => b.score - a.score);
  try { localStorage.setItem("flappy_board", JSON.stringify(list.slice(0, 10))); } catch {}
}
function renderBoard() {
  const list = loadBoard();
  board.innerHTML = list.length ? "" : "<li>No scores yet. Be the first!</li>";
  list.forEach((e, i) => {
    const skin = SKINS.find(s => s.id === e.skin) || SKINS[0];
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="rank">${i + 1}</span><img src="${skin.src}" alt="">` +
      `<span class="nm"></span><span class="sc">${e.score}</span>`;
    li.querySelector(".nm").textContent = e.name + " (" + skin.name + ")";
    board.appendChild(li);
  });
}
 
// ---- Menu setup ----
SKINS.forEach(s => {
  const b = document.createElement("button");
  b.className = "skin" + (s === selected ? " selected" : "");
  b.innerHTML = `<img src="${s.src}" alt=""><span>${s.name}</span>`;
  b.onclick = () => {
    selected = s;
    document.querySelectorAll(".skin").forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
  };
  skinGrid.appendChild(b);
});
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
  y: 40 + i * 90 + Math.random() * 30,
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
 
// ---- Game ----
function resetGame() {
  bird = { x: 90, y: 280, vy: 0 };
  pipes = [];
  score = 0;
  state = "ready";
}
 
function addPipe() {
  const top = 60 + Math.random() * (canvas.height - PIPE_GAP - 120);
  pipes.push({ x: canvas.width, top, passed: false });
}
 
function flap() {
  if (state === "ready") state = "playing";
  if (state === "playing") bird.vy = FLAP;
}
 
function gameOver() {
  state = "over";
  saveScore(player, selected.id, score);
  setTimeout(() => showMenu(score), 700);
}
 
function update() {
  if (state !== "playing") return;
  bird.vy += GRAVITY * dt;
  bird.y += bird.vy * dt;
 
  if (!pipes.length || pipes[pipes.length - 1].x < canvas.width - PIPE_SPACING) addPipe();
 
  for (const p of pipes) {
    p.x -= PIPE_SPEED * dt;
    if (!p.passed && p.x + PIPE_WIDTH < bird.x) { p.passed = true; score++; }
    const hitR = BIRD_R - 4; // slightly forgiving
    const hitsX = bird.x + hitR > p.x && bird.x - hitR < p.x + PIPE_WIDTH;
    const hitsY = bird.y - hitR < p.top || bird.y + hitR > p.top + PIPE_GAP;
    if (hitsX && hitsY) { gameOver(); return; }
  }
  pipes = pipes.filter(p => p.x + PIPE_WIDTH > 0);
 
  if (bird.y + BIRD_R > canvas.height || bird.y - BIRD_R < 0) gameOver();
}
 
function drawBird() {
  ctx.save();
  ctx.beginPath();
  ctx.arc(bird.x, bird.y, BIRD_R, 0, Math.PI * 2);
  ctx.clip();
  if (selected.img.complete && selected.img.naturalWidth > 0) {
    ctx.drawImage(selected.img, bird.x - BIRD_R, bird.y - BIRD_R, BIRD_R * 2, BIRD_R * 2);
  } else {
    // Skin image missing: draw a yellow circle with the first letter instead
    ctx.fillStyle = "#ffd23f";
    ctx.fill();
    ctx.fillStyle = "#1d2b3a";
    ctx.textAlign = "center";
    ctx.font = "bold 20px system-ui";
    ctx.fillText(selected.name[0], bird.x, bird.y + 7);
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.arc(bird.x, bird.y, BIRD_R, 0, Math.PI * 2);
  ctx.stroke();
}
 
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawClouds();
  if (state === "menu") return;
 
  ctx.fillStyle = "#4caf50";
  for (const p of pipes) {
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.top);
    ctx.fillRect(p.x, p.top + PIPE_GAP, PIPE_WIDTH, canvas.height);
  }
  drawBird();
 
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 40px system-ui";
  ctx.fillText(score, canvas.width / 2, 70);
  ctx.font = "20px system-ui";
  if (state === "ready") ctx.fillText("Press space to start", canvas.width / 2, 340);
  if (state === "over") {
    ctx.font = "bold 32px system-ui";
    ctx.fillText("Aray mo!", canvas.width / 2, 300);
  }
}
 
let lastTime = performance.now();
function loop(now = performance.now()) {
  // Speed no longer depends on the screen/device frame rate
  dt = Math.min((now - lastTime) / (1000 / 60), 3);
  lastTime = now;
  update();
  draw();
  requestAnimationFrame(loop);
}
 
document.addEventListener("keydown", e => {
  if (e.code === "Space" && document.activeElement !== nameInput) { e.preventDefault(); flap(); }
});
canvas.addEventListener("pointerdown", flap);
 
loop();
 