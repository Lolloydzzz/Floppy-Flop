// extras.js - skills-only menu, unlockable avatars, sounds, install support, friend online dots
// Load this LAST (after admin.js).

// ---------- 1. Pick a skill (no more characters) ----------
const ICONS = { xyruz: "🌀", nogz: "❤️", penerz: "👻", renxu: "✨", ven: "👯", zigvin: "💥", emanski: "↔️", lloydie: "⏪" };

menu.querySelector(".label").textContent = "Pick your skill";
showInfo = function () {
  const a = selected.ability;
  skinInfo.innerHTML =
    `<b>${a.name}</b><br>${a.desc}<br>` +
    `<small>${a.manual ? "Press E or tap the bottom bar to use. " : ""}Cooldown: ${a.cdNote}.</small>`;
};
try { selected = SKINS.find(s => s.id === localStorage.getItem("ff_skill")) || selected; } catch {}
skinGrid.replaceChildren(...SKINS.map(s => {
  const b = el("button", { className: "skin skill" + (s === selected ? " selected" : "") });
  b.innerHTML = `<span class="ico">${ICONS[s.id]}</span><span>${s.ability.name}</span>`;
  b.onclick = () => {
    selected = s;
    try { localStorage.setItem("ff_skill", s.id); } catch {}
    skinGrid.querySelectorAll(".skin").forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
    showInfo();
  };
  return b;
}));
showInfo();

// ---------- 2. Your bird wears your profile picture ----------
function setFace(src) {
  const img = new Image();
  img.src = src;
  SKINS.forEach(s => { s.src = src; s.img = img; });
}
{ const _ra = refreshAcct; refreshAcct = function () { _ra(); setFace(pfpSrc(Social.user.pfp)); }; }

// ---------- 3. Unlockable cartoon avatars (unlock by best score) ----------
const AV_META = {   // id: [name, best score needed]
  xyruz: ["Kitty", 0], nogz: ["Teddy", 0], penerz: ["Bunny", 0],
  renxu: ["Fox", 15], ven: ["Panda", 30], zigvin: ["Froggy", 50],
  emanski: ["Penguin", 75], lloydie: ["Dino", 100],
};
let best = 0, fresh = [];

function buildFaces() {
  $("prof").querySelector(".sub").textContent = "Pick a cartoon avatar (score points to unlock more) or upload a photo";
  $("profFaces").replaceChildren(...AVATARS.map(a => {
    const [name, need] = AV_META[a.id] || [a.id, 0];
    const lock = best < need;
    const b = el("button", { className: "face" + (lock ? " locked" : ""), title: name + (lock ? " - unlocks at " + need + " points" : "") });
    b.append(el("img", { src: a.src, alt: name }));
    if (lock) b.append(el("span", { className: "lk", textContent: "🔒" }));
    b.onclick = () => {
      if (lock) { $("profMsg").textContent = name + " unlocks at " + need + " points. Your best: " + best + "."; return; }
      draftPfp = "skin:" + a.id;
      $("profPfp").src = a.src;
      $("profMsg").textContent = name + " selected. Press Save.";
    };
    return b;
  }));
}

async function loadBest() {
  try { const s = await dbCall(`scores/${Social.user.uid}`); best = (s && s.score) || 0; } catch {}
  const p = Social.user.pfp || "";
  if (p.startsWith("skin:") && AV_META[p.slice(5)] && best < AV_META[p.slice(5)][1]) {   // equipped avatar is still locked
    Social.user.pfp = "skin:xyruz";
    refreshAcct();
    dbCall(`users/${Social.user.uid}`, "PATCH", { pfp: "skin:xyruz" }).catch(() => {});
  }
  buildFaces();
}

// scores now show your avatar, and unlocks are announced
saveScore = async function (name, skinId, pts) {
  if (pts <= 0 || !Social.user) return;
  const old = best;
  if (pts > best) {
    best = pts;
    fresh = Object.values(AV_META).filter(([n, need]) => old < need && need <= best).map(([n]) => n);
    buildFaces();
  }
  try {
    const path = `scores/${Social.user.uid}`, p = Social.user.pfp || "";
    const mine = await dbCall(path);
    if (mine && mine.score >= pts) return;
    await dbCall(path, "PUT", { name: Social.user.name, skin: p.startsWith("skin:") ? p.slice(5) : "xyruz", score: pts });
  } catch {}
};
{
  const _sm = showMenu;
  showMenu = function (pts) {
    _sm(pts);
    if (fresh.length) { lastScore.textContent += " | Unlocked: " + fresh.join(", ") + "!"; SFX.win(); fresh = []; }
  };
}
renderBoard = async function () {
  if (!board.children.length) board.innerHTML = "<li>Loading...</li>";
  const list = await loadBoard();
  if (list === null) { board.innerHTML = "<li>Can't reach leaderboard. Check your connection.</li>"; return; }
  while (list.length < 5) list.push(null);
  board.replaceChildren(...list.map((e, i) => {
    const li = document.createElement("li");
    if (!e) { li.innerHTML = `<span class="rank">${i + 1}</span><span class="nm" style="opacity:.5">---</span>`; return li; }
    const av = AVATARS.find(a => a.id === e.skin) || AVATARS[0];
    li.innerHTML = `<span class="rank">${i + 1}</span><img src="${av.src}" alt=""><span class="nm"></span><span class="sc"></span>`;
    li.querySelector(".nm").textContent = e.name;
    li.querySelector(".sc").textContent = e.score;
    return li;
  }));
};

// ---------- 4. Sounds (made with the browser, no files) + mute ----------
let actx = null, muted = false;
try { muted = localStorage.getItem("ff_mute") === "1"; } catch {}
function ac() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
function tone(freq, dur, type = "sine", vol = 0.15, slideTo = 0, delay = 0) {
  const c = muted ? null : ac();
  if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3) {
  const c = muted ? null : ac();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf; g.gain.value = vol;
  s.connect(g).connect(c.destination);
  s.start();
}
const SFX = {
  flap:     () => tone(420, 0.09, "square", 0.05, 720),
  teleport: () => { tone(300, 0.25, "sine", 0.18, 1400); tone(1400, 0.2, "triangle", 0.1, 500, 0.12); },
  life:     () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, "triangle", 0.18, 0, i * 0.1)),
  phase:    () => tone(520, 0.35, "sawtooth", 0.07, 120),
  arm:      () => tone(200, 0.2, "square", 0.1, 420),
  double:   () => [660, 880, 1100].forEach((f, i) => tone(f, 0.12, "square", 0.07, 0, i * 0.08)),
  clone:    () => { tone(440, 0.15, "sine", 0.15); tone(554, 0.2, "sine", 0.15, 0, 0.12); },
  smash:    () => { noise(0.35, 0.35); tone(120, 0.3, "sawtooth", 0.2, 40); },
  gap:      () => tone(220, 0.3, "sine", 0.2, 660),
  rewind:   () => tone(900, 0.5, "sawtooth", 0.1, 150),
  boss:     () => { tone(110, 0.5, "sawtooth", 0.2, 90); tone(82, 0.6, "square", 0.12, 0, 0.1); },
  win:      () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.18, 0, i * 0.1)),
  die:      () => tone(300, 0.5, "sawtooth", 0.15, 60),
};
const TOAST_SFX = [["Teleport", "teleport"], ["Phase", "phase"], ["Smash ready", "arm"], ["SMASH", "smash"], ["Double", "double"],
  ["Big gap", "gap"], ["Extra life", "life"], ["Time reversed", "rewind"], ["Clone", "clone"], ["One bird", "die"],
  ["BOSS FIGHT", "boss"], ["BOSS DEFEATED", "win"]];
{
  const _toast = toast, _flap = flap, _go = gameOver;
  toast = function (text) {
    _toast(text);
    const hit = TOAST_SFX.find(([p]) => text.startsWith(p));
    if (hit) SFX[hit[1]]();
  };
  flap = function () { _flap(); if (state === "playing") SFX.flap(); };
  gameOver = function () { SFX.die(); _go(); };
}

const toolBar = el("div", { id: "tools" });
const muteBtn = el("button", { id: "muteBtn" });
const showMute = () => { muteBtn.textContent = muted ? "🔇 Sound off" : "🔊 Sound on"; };
muteBtn.onclick = () => {
  muted = !muted;
  try { localStorage.setItem("ff_mute", muted ? "1" : "0"); } catch {}
  showMute();
  muteBtn.blur();
  SFX.flap();
};
showMute();
toolBar.append(muteBtn);
document.querySelector(".hint").after(toolBar);

// ---------- 5. Install on phone ----------
{
  let ev = null;
  const btn = el("button", { id: "installBtn", textContent: "Install app", hidden: true });
  const tip = el("p", { className: "tip" });
  toolBar.append(btn, tip);
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); ev = e; btn.hidden = false; });
  window.addEventListener("appinstalled", () => { btn.hidden = true; });
  btn.onclick = async () => { if (!ev) return; ev.prompt(); try { await ev.userChoice; } catch {} ev = null; btn.hidden = true; };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const app = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (ios && !app) tip.textContent = "On iPhone: tap Share, then Add to Home Screen.";
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ---------- 6. Online dots (friends only) ----------
const PR = { friends: {}, now: 0, nowAt: 0 };
const prNow = () => (PR.now ? PR.now + (Date.now() - PR.nowAt) : Date.now());

async function myBeat() {
  if (!Social.user || document.hidden) return;
  try {
    const r = await rdb(`presence3/${meId()}`, "PUT", { t: SV });
    if (r && typeof r.t === "number") { PR.now = r.t; PR.nowAt = Date.now(); }
  } catch {}
}
async function pollFriends() {
  if (!Social.user || document.hidden) return;
  const ids = Object.keys(Soc2.friends);
  const res = await Promise.all(ids.map(id => rdb(`presence3/${id}`).catch(() => null)));
  const now = prNow();
  PR.friends = {};
  ids.forEach((id, i) => { PR.friends[id] = !!(res[i] && now - res[i].t <= 50000); });
}
async function updatePresence() {
  const before = JSON.stringify(PR.friends);
  await pollFriends();
  if (before !== JSON.stringify(PR.friends) && !$("soc").hidden && Soc2.tab !== "search") renderTab();
}
function dropPresence() {
  try {
    if (Social.user && Social.user.idToken)
      fetch(`${DB_URL}/presence3/${Social.user.uid}.json?auth=${Social.user.idToken}`, { method: "DELETE", keepalive: true });
  } catch {}
}
{
  const _userRow = userRow;
  userRow = function (uid, p, sub, extra, onclick) {
    const r = _userRow(uid, p, sub, extra, onclick);
    const adminDot = extra && extra.classList && extra.classList.contains("dot");
    if (Soc2.friends[uid] && !adminDot) r.append(el("i", { className: "odot " + (PR.friends[uid] ? "on" : "off") }));
    return r;
  };
  const _eg = enterGame;
  enterGame = function () { _eg(); loadBest(); myBeat(); setTimeout(updatePresence, 1500); };
  const prev = $("outBtn").onclick;
  $("outBtn").onclick = () => { dropPresence(); best = 0; PR.friends = {}; buildFaces(); prev(); };
}
setInterval(myBeat, 20000);
setInterval(updatePresence, 8000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { myBeat(); updatePresence(); } });
window.addEventListener("pagehide", dropPresence);

buildFaces();
renderBoard();

// ---------- App name ----------
document.title = "Floppy Flop";
const authTitle = document.querySelector("#auth h1");
if (authTitle) authTitle.textContent = "Floppy Flop";
