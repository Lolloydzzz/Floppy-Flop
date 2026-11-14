// admin.js - admin panel: who is online + account reset (phase 3)
// Load this AFTER social2.js. Reuses el, rdb, getProfile, userRow, empty, setBadge, timeText, SV, meId from social2.js.

const Adm = { isAdmin: false, now: 0, nowAt: 0, tab: "online", timer: null, names: null, renderId: 0 };
const ONLINE_MS = 50000;   // seen in the last 50s = online (heartbeat is every 20s)

const serverNow = () => (Adm.now ? Adm.now + (Date.now() - Adm.nowAt) : Date.now());
const admSay = t => { $("admMsg").textContent = t || ""; };

// ---- Everybody sends a heartbeat so the admin can see who is online ----
async function beat() {
  if (!Social.user || document.hidden) return;
  try {
    const r = await rdb(`presence2/${meId()}`, "PUT", { name: Social.user.name, t: SV });
    if (r && typeof r.t === "number") { Adm.now = r.t; Adm.nowAt = Date.now(); }
  } catch {}
}

// ---- UI ----
function buildAdminUI() {
  const adm = el("div", { id: "adm", className: "ov", hidden: true });
  adm.innerHTML =
    `<div class="shead"><h2>Admin</h2><button id="admClose" class="alt">Close</button></div>
     <div class="tabs">
       <button data-tab="online">Online<i class="bdg" id="bdgOnline" hidden></i></button>
       <button data-tab="players">Players</button>
     </div>
     <div id="admBody"></div>
     <p id="admMsg" class="msg"></p>`;
  $("stage").appendChild(adm);

  const bar = el("div", { id: "admbar", hidden: true });
  bar.innerHTML = `<button id="admBtn">Admin panel</button>`;
  $("socbar").after(bar);

  Adm.pBox = el("div", { className: "searchbox" });
  Adm.pInput = el("input", { id: "admSearch", type: "text", maxlength: 12, placeholder: "Search a player...", autocomplete: "off" });
  Adm.pList = el("div");
  Adm.pBox.append(Adm.pInput, Adm.pList);
  Adm.pInput.addEventListener("keydown", e => e.stopPropagation());
  Adm.pInput.addEventListener("input", () => { clearTimeout(Adm.pTimer); Adm.pTimer = setTimeout(renderPlayers, 250); });

  $("admBtn").onclick = openAdmin;
  $("admClose").onclick = closeAdmin;
  adm.querySelectorAll(".tabs button").forEach(b => (b.onclick = () => setAdmTab(b.dataset.tab)));
}

function openAdmin() {
  if (!Adm.isAdmin) return;
  hideViews();
  $("adm").hidden = false;
  admSay("");
  setAdmTab("online");
  clearInterval(Adm.timer);
  Adm.timer = setInterval(() => { if (!document.hidden && Adm.tab === "online" && !$("adm").hidden) renderOnline(); }, 5000);
}
function closeAdmin() {
  clearInterval(Adm.timer);
  Adm.timer = null;
  $("adm").hidden = true;
}
function setAdmTab(tab) {
  Adm.tab = tab;
  $("adm").querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  admSay("");
  if (tab === "online") { $("admBody").replaceChildren(empty("Loading...")); renderOnline(); }
  else renderPlayers();
}

// ---- Who is online ----
async function renderOnline() {
  const id = ++Adm.renderId, body = $("admBody");
  let data;
  try { data = (await rdb("presence2")) || {}; }
  catch { body.replaceChildren(empty("Couldn't load. Are the new rules published, and is your uid in admins?")); return; }
  if (id !== Adm.renderId || Adm.tab !== "online") return;

  const now = serverNow();
  const list = Object.entries(data)
    .map(([uid, v]) => ({ uid, name: (v && v.name) || "?", t: (v && v.t) || 0 }))
    .map(x => ({ ...x, on: now - x.t <= ONLINE_MS }))
    .sort((a, b) => (b.on - a.on) || (b.t - a.t))
    .slice(0, 60);
  const onCount = list.filter(x => x.on).length;
  setBadge("bdgOnline", onCount);

  const profs = await Promise.all(list.map(x => (x.on ? getProfile(x.uid) : null)));
  if (id !== Adm.renderId || Adm.tab !== "online") return;

  const head = el("p", { className: "sub", textContent: onCount + (onCount === 1 ? " player online now" : " players online now") });
  const rows = list.map((x, n) => {
    const p = { ...(profs[n] || { bio: "", pfp: "" }), name: x.name };
    const dot = el("i", { className: "dot " + (x.on ? "on" : "off") });
    return userRow(x.uid, p, x.on ? "online now" : "last seen " + timeText(x.t), dot, null);
  });
  body.replaceChildren(head, ...(rows.length ? rows : [empty("Nobody has been seen yet.")]));
}

// ---- Players + account reset ----
async function loadNames() {
  const d = (await rdb("usernames")) || {};
  Adm.names = Object.entries(d).map(([key, uid]) => ({ key, uid })).sort((a, b) => a.key.localeCompare(b.key));
}

async function renderPlayers() {
  const id = ++Adm.renderId, body = $("admBody");
  if (!body.contains(Adm.pBox)) body.replaceChildren(Adm.pBox);
  if (!Adm.names) {
    Adm.pList.replaceChildren(empty("Loading..."));
    try { await loadNames(); }
    catch { Adm.pList.replaceChildren(empty("Couldn't load players.")); return; }
  }
  const q = Adm.pInput.value.trim().toLowerCase();
  const matches = Adm.names.filter(n => !q || n.key.includes(q)).slice(0, 25);
  if (!matches.length) { Adm.pList.replaceChildren(empty("No players found.")); return; }
  const profs = await Promise.all(matches.map(m => getProfile(m.uid)));
  if (id !== Adm.renderId || Adm.tab !== "players") return;

  const head = el("p", { className: "sub", textContent: Adm.names.length + " players" });
  const rows = matches.map((m, n) => {
    const p = profs[n];
    const label = p.name && p.name !== "Unknown player" ? p.name : m.key;
    if (m.uid === meId()) return userRow(m.uid, { ...p, name: label }, "you", null, null);
    const b = el("button", { className: "mini", textContent: "Reset" });
    b.onclick = () => resetAccount(m.key, m.uid, label);
    return userRow(m.uid, { ...p, name: label }, "@" + m.key, b, null);
  });
  Adm.pList.replaceChildren(head, ...rows);
}

// Reset = free the username so the player can sign up again with a new password.
// Their best score is kept (it is restored when they sign up again). Friends and chats are cleared.
async function resetAccount(key, uid, label) {
  if (!confirm(
    `Reset ${label}'s account?\n\n` +
    `They will sign up again with the same username and a NEW password.\n` +
    `Their best score is kept. Their friends and chats are cleared.`)) return;
  admSay("Resetting...");
  try {
    const [fr, sc, gen] = await Promise.all([rdb(`friends/${uid}`), rdb(`scores/${uid}`), rdb(`gens/${key}`)]);
    const upd = {
      [`usernames/${key}`]: null,
      [`users/${uid}`]: null,
      [`scores/${uid}`]: null,
      [`presence2/${uid}`]: null,
      [`friends/${uid}`]: null,
      [`inbox/${uid}`]: null,
      [`requests/${uid}`]: null,
      [`gens/${key}`]: (Number(gen) || 1) + 1,
    };
    if (sc && sc.score > 0) upd[`recover/${key}`] = { score: sc.score, skin: sc.skin || "xyruz" };
    Object.keys(fr || {}).forEach(f => { upd[`friends/${f}/${uid}`] = null; upd[`inbox/${f}/${uid}`] = null; });
    await rdb("", "PATCH", upd);
    Soc2.profiles.delete(uid);
    Adm.names = null;
    admSay(label + " can now sign up again with the same username.");
    renderPlayers();
  } catch {
    admSay("Reset failed. Check that the new rules are published.");
  }
}

// ---- Hook into login / logout ----
async function adminInit() {
  Adm.isAdmin = false;
  $("admbar").hidden = true;
  beat();
  try {
    if ((await rdb(`admins/${meId()}`)) === true) { Adm.isAdmin = true; $("admbar").hidden = false; }
  } catch {}
}

buildAdminUI();

const _enterGame2 = enterGame;
enterGame = function () { _enterGame2(); adminInit(); };

{
  const prevOut = $("outBtn").onclick;
  $("outBtn").onclick = () => {
    closeAdmin();
    Adm.isAdmin = false; Adm.names = null;
    $("admbar").hidden = true;
    prevOut();
  };
}

setInterval(beat, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
window.addEventListener("pagehide", () => {   // best effort: go offline right away
  try {
    if (Social.user && Social.user.idToken)
      fetch(`${DB_URL}/presence2/${Social.user.uid}.json?auth=${Social.user.idToken}`, { method: "DELETE", keepalive: true });
  } catch {}
});