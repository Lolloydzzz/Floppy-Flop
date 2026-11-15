// traps.js - replaces the pipes with flying traps (mines, saw blades, meteors, missiles) and moves the boss times.
// Load AFTER robot.js. The old pipe code still runs underneath, so every skill keeps working on the traps.
 
const FIRST_BOSS = 100;        // first boss score
const NEXT_BOSS_EVERY = 500;   // after that: 500, 1000, 1500...
const HZ = { t: 1.1, age: 0, queue: [], nextEvent: 35, eventNo: 0, hadBoss: false };   // wave timer + special events
const diff = () => Math.min(1.35, score / 250 + 0.12 * bossCount);   // difficulty: grows with score, and again after every boss
 
// ---- bosses at 500, 1000, ... ----
{ const _sb = startBoss; startBoss = function () { _sb(); nextBossAt = NEXT_BOSS_EVERY * bossCount; }; }
{
  const _rg = resetGame;
  resetGame = function () { _rg(); Object.assign(HZ, { t: 1.1, age: 0, queue: [], nextEvent: 35, eventNo: 0, hadBoss: false }); nextBossAt = FIRST_BOSS; };
}
 
// ---- skills that talked about pipes ----
ABILITIES.xyruz.desc = "Teleports you to the safest spot on the screen when danger is near.";
ABILITIES.penerz.desc = "Fly straight through the next 3 traps like a ghost.";
ABILITIES.penerz.cdNote = "15s after the 3rd trap";
Object.assign(ABILITIES.zigvin, { name: "Trap Smasher", desc: "Smash through the next 3 traps and destroy them.", cdNote: "15s after the 3rd trap" });
Object.assign(ABILITIES.emanski, { name: "Shrink Traps", desc: "All traps shrink and get easier to dodge for 5 seconds." });
skinGrid.querySelectorAll(".skin").forEach((tile, i) => { tile.children[1].textContent = SKINS[i].ability.name; });
showInfo();
{
  const _toast = toast;
  toast = function (text) {
    if (text === "Big gap!") { text = "Traps shrink!"; if (typeof SFX !== "undefined") SFX.gap(); }
    _toast(text.replace("pipes", "traps"));
  };
}
 
// ---- making traps ----
addPipe = function () {};   // the old pipe spawner does nothing now
const shrink = () => Math.min(1, PIPE_GAP / gapNow);   // Shrink Traps makes everything smaller
 
function addTrap(type, y, dx) {
  const sp = 1 + 0.45 * diff();                          // traps get faster as you go
  const t = { type, x: canvas.width + dx, y, y0: y, passed: false, age: 0, rot: 0, ph: Math.random() * 6.28, amp: 18 + Math.random() * 14, speed: PIPE_SPEED * sp, r: 24 };
  if (type === "saw") Object.assign(t, { r: 26, vy: (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random()) * sp, speed: 3.1 * sp });
  if (type === "meteor") Object.assign(t, { r: 20, y: 20 + Math.random() * 80, vy: (2.6 + Math.random() * 1.2) * sp, speed: 3.6 * sp });
  if (type === "missile") Object.assign(t, { r: 12, speed: 8.5 * sp, state: "warn", w: 0.9 });
  pipes.push(t);
}
 
function spawnWave() {
  const lvl = diff();
  let n = 1;
  if (Math.random() < 0.2 + lvl * 0.5) n++;
  if (Math.random() < lvl * 0.35) n++;
  if (Math.random() < Math.max(0, lvl - 0.8)) n++;   // late game: up to 4 traps per wave when they fit
  const types = ["mine", "saw"];
  if (score >= 8) types.push("missile");
  if (score >= 20) types.push("meteor");
  const lanes = [];
  for (let i = 0; i < n; i++) {
    let y, tries = 0;
    do { y = 70 + Math.random() * (PLAY_H - 140); tries++; } while (lanes.some(l => Math.abs(l - y) < 165) && tries < 12);
    if (lanes.some(l => Math.abs(l - y) < 165)) continue;   // never block every way through
    lanes.push(y);
    addTrap(types[Math.floor(Math.random() * types.length)], y, i * 80);
  }
}
const waveGap = () => Math.max(0.5, 1.3 - 0.75 * diff()) * (0.8 + Math.random() * 0.4);
 
// Special events every 35 points: a meteor shower, then a missile barrage, then a shower again...
function runEvent() {
  if (typeof SFX !== "undefined") SFX.boss();
  if (HZ.eventNo++ % 2 === 0) {
    toast("METEOR SHOWER!");
    for (let i = 0; i < 7; i++) HZ.queue.push({ at: HZ.age + i * 0.45, fn: () => addTrap("meteor", 0, 0) });
  } else {
    toast("MISSILE BARRAGE!");
    [120, 270, 420].sort(() => Math.random() - 0.5).forEach((y, i) => HZ.queue.push({ at: HZ.age + i * 0.7, fn: () => addTrap("missile", y, 0) }));
  }
  HZ.t = Math.max(HZ.t, 3.2);   // normal traps wait while the event plays out
}
 
function moveTrap(p, sec) {
  p.age += sec;
  p.rot += 0.15 * dt;
  if (p.state === "warn") {                      // missile: red warning line, then it launches
    p.x = canvas.width - 24;
    p.w -= sec;
    if (p.w <= 0) { p.state = "fly"; if (typeof tone === "function") tone(180, 0.25, "sawtooth", 0.08, 90); }
    return;
  }
  p.x -= (p.speed - PIPE_SPEED) * dt;            // the old code already moved it at the normal speed
  if (p.type === "mine") p.y = p.y0 + Math.sin(p.age * 2.2 + p.ph) * p.amp;
  if (p.type === "saw") {
    p.y += p.vy * dt;
    if (p.y < 50 || p.y > PLAY_H - 50) { p.vy = -p.vy; p.y = Math.max(50, Math.min(PLAY_H - 50, p.y)); }
  }
  if (p.type === "meteor") { p.y += p.vy * dt; if (p.y > PLAY_H + 60) p.dead = true; }
}
 
{
  const _upd = update;
  update = function () {
    const was = state === "playing";
    _upd();
    if (!was || state !== "playing") return;
    const sec = dt / 60;
    for (const p of pipes) moveTrap(p, sec);
    HZ.age += sec;
    const due = HZ.queue.filter(q => q.at <= HZ.age);
    HZ.queue = HZ.queue.filter(q => q.at > HZ.age);
    due.forEach(q => { if (!boss) q.fn(); });
    if (boss) HZ.hadBoss = true;
    else if (HZ.hadBoss) { HZ.hadBoss = false; HZ.t = 2.2; }          // a short breather after a boss escapes
    if (!boss && score >= HZ.nextEvent) { runEvent(); HZ.nextEvent += 35; }
    if (!boss) {
      HZ.t -= sec;
      if (HZ.t <= 0 && pipes.length < 9) { spawnWave(); HZ.t = waveGap(); }
    }
  };
}
 
// ---- hits, safe spots, smashing ----
hitsPipe = function (b, p) {
  if (p.state === "warn") return false;
  const k = shrink(), r = BIRD_R - 4, cx = p.x + 30;
  if (Math.hypot(b.x - cx, b.y - p.y) < r + p.r * k) return true;
  return p.type === "missile" && Math.hypot(b.x - (cx + 22 * k), b.y - p.y) < r + 11 * k;   // the missile's body
};
 
{
  const _safe = safeY;
  safeY = function (b) {
    if (boss) return _safe(b);                    // boss fights keep their own logic
    const near = pipes.filter(p => !p.dead && !p.immune && p.state !== "warn" && p.x + 60 > b.x - 30 && p.x < b.x + 260);
    let best = PLAY_H / 2, bestD = -1;
    for (let y = 40; y <= PLAY_H - 40; y += 10) {
      const d = near.reduce((m, p) => Math.min(m, Math.abs(y - p.y)), 999);
      if (d > bestD) { bestD = d; best = y; }
    }
    return best;
  };
}
 
shatterPipe = function (p) {
  const x = p.x + 30, colors = ["#ffd23f", "#ff9a5a", "#c9d1dc", "#7a7f88"];
  ring(x, p.y, "#ffb36b", 70);
  burst(x, p.y, "#ffd23f", 18, 6);
  for (let i = 0; i < 12; i++) debris(x + (Math.random() - 0.5) * 40, p.y + (Math.random() - 0.5) * 40, colors[i % 4]);
  shake = 9;
};
 
// ---- drawing ----
drawPipe = function (p, pal) {
  const cx = p.x + 30, cy = p.y, k = shrink();
  if (p.state === "warn") {                       // incoming missile: dotted line + warning sign
    const on = Math.floor(p.age * 8) % 2 === 0;
    ctx.save();
    ctx.strokeStyle = on ? "rgba(255,70,70,0.55)" : "rgba(255,70,70,0.2)";
    ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = on ? "#ff4646" : "#ffb0b0";
    ctx.beginPath(); ctx.moveTo(canvas.width - 24, cy - 18); ctx.lineTo(canvas.width - 6, cy + 14); ctx.lineTo(canvas.width - 42, cy + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1d2b3a"; ctx.font = "bold 16px system-ui"; ctx.textAlign = "center";
    ctx.fillText("!", canvas.width - 24, cy + 11);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = p.immune ? 0.35 : 1;
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  if (pal.glow) { ctx.shadowColor = pal.glow; ctx.shadowBlur = 12; }
 
  if (p.type === "mine") {
    ctx.fillStyle = "#3a3f4a"; ctx.strokeStyle = "#1c2027"; ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.283 + p.rot * 0.3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.14) * 18, Math.sin(a - 0.14) * 18); ctx.lineTo(Math.cos(a) * 27, Math.sin(a) * 27); ctx.lineTo(Math.cos(a + 0.14) * 18, Math.sin(a + 0.14) * 18); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = Math.floor(p.age * 4) % 2 === 0 ? "#ff3b3b" : "#7a1c1c";
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
  } else if (p.type === "saw") {
    ctx.rotate(p.rot * 2);
    ctx.fillStyle = "#c9d1dc"; ctx.beginPath();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.283, r = i % 2 ? 20 : 27; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#6b7380"; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
    ctx.fillStyle = "#2a2f38"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
  } else if (p.type === "meteor") {
    for (let i = 3; i >= 1; i--) {                // flame trail behind it (up and to the right)
      ctx.fillStyle = `rgba(255,${120 + i * 30},40,${0.55 - i * 0.12})`;
      ctx.beginPath(); ctx.arc(i * 14, -i * 10, 20 - i * 3, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#8a5a3c"; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill();
    ctx.fillStyle = "#5e3b25";
    ctx.beginPath(); ctx.arc(-6, -5, 5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(7, 6, 4, 0, 7); ctx.fill();
  } else {   // missile, flying to the left
    const f = 14 + Math.random() * 12;
    ctx.fillStyle = "#ff9a2f"; ctx.beginPath(); ctx.moveTo(28, -6); ctx.lineTo(28 + f, 0); ctx.lineTo(28, 6); ctx.fill();
    ctx.fillStyle = "#cfd6df"; ctx.fillRect(-12, -8, 40, 16);
    ctx.fillStyle = "#e04b4b"; ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-30, 0); ctx.lineTo(-12, 8); ctx.fill();
    ctx.fillStyle = "#555c66";
    ctx.beginPath(); ctx.moveTo(18, -8); ctx.lineTo(30, -17); ctx.lineTo(30, -8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(18, 8); ctx.lineTo(30, 17); ctx.lineTo(30, 8); ctx.fill();
  }
  ctx.restore();
};