// social2.js - friends, chat and player search (phase 2)
// Load this AFTER social.js. It reuses token(), Social, $, DB_URL, fetchTimeout and pfpSrc from the other files.

const Soc2 = {
  profiles: new Map(),   // uid -> { p, at }
  friends: {},           // uid -> true
  inbox: {},             // uid -> { t, text, from, seen }
  reqs: {},              // uid -> { t }   (incoming friend requests)
  tab: "chats",
  chatWith: null,
  chatTimer: null,
  chatWatch: null,
  chatSig: "",
  renderId: 0,
  searchId: 0,
  searchTimer: null,
  sending: false,
};

const SV = { ".sv": "timestamp" };
const enc = encodeURIComponent;
const chatId = (a, b) => [a, b].sort().join("_");
const meId = () => Social.user.uid;

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) Object.assign(e, props);
  kids.forEach(k => k != null && e.append(k));
  return e;
}

function timeText(t) {
  if (!t) return "";
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
  const today = new Date().toDateString() === d.toDateString();
  return today ? hh + ":" + mm : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + hh + ":" + mm;
}

// ---- Database helper (path may be "" for multi-path updates at the root) ----
async function rdb(path, method = "GET", body, query = "") {
  if (!Social.user) throw new Error("Not logged in");
  const t = await token();
  const res = await fetchTimeout(`${DB_URL}/${path}.json?auth=${t}${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Database error " + res.status);
  return res.json();
}

// Give every chat request a hard time limit, so a stalled connection can't
// leave the log stuck on "Loading..." forever.
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message || "Timed out")), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

async function getProfile(uid) {
  const c = Soc2.profiles.get(uid);
  if (c && Date.now() - c.at < 60000) return c.p;
  let p = null;
  try { p = await rdb(`users/${uid}`); } catch {}
  p = p || { name: "Unknown player", bio: "", pfp: "" };
  Soc2.profiles.set(uid, { p, at: Date.now() });
  return p;
}

// ---- Polling: friends, inbox, requests ----
const unreadOf = uid => {
  const i = Soc2.inbox[uid];
  return !!i && i.from !== meId() && (i.t || 0) > (i.seen || 0);
};

async function refreshSocial() {
  if (!Social.user || document.hidden) return;
  const me = meId();
  try {
    const [f, i, r] = await Promise.all([rdb(`friends/${me}`), rdb(`inbox/${me}`), rdb(`requests/${me}`)]);
    Soc2.friends = f || {};
    Soc2.inbox = i || {};
    Soc2.reqs = r || {};
    updateBadges();
    if (!$("soc").hidden && Soc2.tab !== "search") renderTab();
  } catch {}
}

function setBadge(id, n) {
  const b = $(id);
  if (!b) return;
  b.textContent = n > 99 ? "99+" : n;
  b.hidden = n <= 0;
}
function updateBadges() {
  const unread = Object.keys(Soc2.friends).filter(unreadOf).length;
  const reqs = Object.keys(Soc2.reqs).length;
  setBadge("bdgChatsBtn", unread);
  setBadge("bdgFriendsBtn", reqs);
  setBadge("bdgChatsTab", unread);
  setBadge("bdgReqTab", reqs);
}

// ---- Building the screens ----
function buildSocialUI() {
  const stage = $("stage");

  const soc = el("div", { id: "soc", className: "ov", hidden: true });
  soc.innerHTML =
    `<div class="shead"><h2>Social</h2><button id="socClose" class="alt">Close</button></div>
     <div class="tabs">
       <button data-tab="chats">Chats<i class="bdg" id="bdgChatsTab" hidden></i></button>
       <button data-tab="friends">Friends</button>
       <button data-tab="requests">Requests<i class="bdg" id="bdgReqTab" hidden></i></button>
       <button data-tab="search">Find</button>
     </div>
     <div id="socBody"></div>`;
  stage.appendChild(soc);

  const chat = el("div", { id: "chat", className: "ov", hidden: true });
  chat.innerHTML =
    `<div class="chead"><button id="chatBack" class="alt">&lsaquo; Back</button><img id="chatPfp" alt=""><b id="chatName"></b></div>
     <div id="chatLog"></div>
     <p id="chatMsg" class="msg"></p>
     <div class="crow"><input id="chatInput" type="text" maxlength="300" placeholder="Type a message..." autocomplete="off"><button id="chatSend">Send</button></div>`;
  stage.appendChild(chat);

  const pv = el("div", { id: "pview", className: "ov", hidden: true });
  pv.innerHTML =
    `<div class="shead"><button id="pBack" class="alt">&lsaquo; Back</button></div>
     <img id="pPfp" class="big" alt="">
     <h2 id="pName"></h2>
     <p id="pBio" class="sub"></p>
     <p id="pScore" class="sub"></p>
     <div id="pActions" class="row"></div>
     <p id="pMsg" class="msg"></p>`;
  stage.appendChild(pv);

  // buttons under the account bar in the main menu
  const row = el("div", { id: "socbar" });
  row.innerHTML =
    `<button data-open="chats">Chats<i class="bdg" id="bdgChatsBtn" hidden></i></button>
     <button data-open="friends">Friends<i class="bdg" id="bdgFriendsBtn" hidden></i></button>
     <button data-open="search">Find players</button>`;
  $("acct").after(row);

  // search box (built once so typing isn't lost when the list refreshes)
  Soc2.searchBox = el("div", { className: "searchbox" });
  Soc2.searchInput = el("input", { id: "socSearch", type: "text", maxlength: 12, placeholder: "Search a username...", autocomplete: "off" });
  Soc2.searchResults = el("div", { id: "socResults" });
  Soc2.searchBox.append(Soc2.searchInput, Soc2.searchResults);

  // wiring
  row.querySelectorAll("button").forEach(b => (b.onclick = () => openPanel(b.dataset.open)));
  soc.querySelectorAll(".tabs button").forEach(b => (b.onclick = () => setTab(b.dataset.tab)));
  $("socClose").onclick = closeAll;
  $("chatBack").onclick = () => { stopChat(); openPanel("chats"); };
  $("pBack").onclick = () => { pv.hidden = true; soc.hidden = false; renderTab(); };
  $("chatSend").onclick = sendMsg;
  $("chatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendMsg(); });
  Soc2.searchInput.addEventListener("input", () => {
    clearTimeout(Soc2.searchTimer);
    Soc2.searchTimer = setTimeout(runSearch, 350);
  });

  // game.js listens for Space/E on the whole page; keep it from eating typing
  ["authName", "authPass", "profBio", "chatInput", "socSearch"].forEach(id => {
    const x = $(id);
    if (x) x.addEventListener("keydown", e => e.stopPropagation());
  });
}

function hideViews() {
  $("soc").hidden = true;
  $("chat").hidden = true;
  $("pview").hidden = true;
}
function closeAll() { stopChat(); hideViews(); }

function openPanel(tab) {
  stopChat();
  $("chat").hidden = true;
  $("pview").hidden = true;
  $("soc").hidden = false;
  setTab(tab);
}

function setTab(tab) {
  Soc2.tab = tab;
  $("soc").querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  renderTab();
  refreshSocial();
}

// ---- Lists ----
function userRow(uid, p, sub, extra, onclick) {
  const info = el("div", { className: "info" }, el("b", { textContent: p.name }));
  if (sub) info.append(el("small", { textContent: sub }));
  const r = el("div", { className: "urow" }, el("img", { src: pfpSrc(p.pfp), alt: "" }), info);
  if (extra) r.append(extra);
  if (onclick) { r.classList.add("click"); r.onclick = onclick; }
  return r;
}
const empty = text => el("p", { className: "sub emptymsg", textContent: text });

async function renderTab() {
  const body = $("socBody");
  const id = ++Soc2.renderId;
  const tab = Soc2.tab;

  if (tab === "search") {
    if (!body.contains(Soc2.searchBox)) {
      body.replaceChildren(Soc2.searchBox);
      if (!Soc2.searchResults.childNodes.length) runSearch();
    }
    return;
  }

  const me = meId();
  let rows = [];

  if (tab === "chats") {
    const list = Object.entries(Soc2.inbox)
      .filter(([uid]) => Soc2.friends[uid])
      .sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    if (!list.length) { body.replaceChildren(empty("No chats yet. Add a friend and say hi!")); return; }
    const profs = await Promise.all(list.map(([uid]) => getProfile(uid)));
    if (id !== Soc2.renderId) return;
    rows = list.map(([uid, i], n) => {
      const dot = unreadOf(uid) ? el("i", { className: "dot" }) : null;
      const preview = (i.from === me ? "You: " : "") + (i.text || "");
      return userRow(uid, profs[n], preview, dot, () => openChat(uid));
    });
    rows.forEach((r, n) => { if (unreadOf(list[n][0])) r.classList.add("unread"); });
  }

  if (tab === "friends") {
    const ids = Object.keys(Soc2.friends);
    if (!ids.length) { body.replaceChildren(empty("No friends yet. Use Find to search for players.")); return; }
    const profs = await Promise.all(ids.map(getProfile));
    if (id !== Soc2.renderId) return;
    rows = ids
      .map((uid, n) => ({ uid, p: profs[n] }))
      .sort((a, b) => a.p.name.localeCompare(b.p.name))
      .map(({ uid, p }) => {
        const btn = el("button", { className: "mini", textContent: "Chat" });
        btn.onclick = e => { e.stopPropagation(); openChat(uid); };
        return userRow(uid, p, p.bio || "", btn, () => openPlayer(uid));
      });
  }

  if (tab === "requests") {
    const ids = Object.keys(Soc2.reqs);
    if (!ids.length) { body.replaceChildren(empty("No friend requests right now.")); return; }
    const profs = await Promise.all(ids.map(getProfile));
    if (id !== Soc2.renderId) return;
    rows = ids.map((uid, n) => {
      const ok = el("button", { className: "mini", textContent: "Accept" });
      const no = el("button", { className: "mini alt", textContent: "Decline" });
      ok.onclick = async e => { e.stopPropagation(); ok.disabled = no.disabled = true; try { await acceptRequest(uid); } catch { ok.disabled = no.disabled = false; } await refreshSocial(); renderTab(); };
      no.onclick = async e => { e.stopPropagation(); ok.disabled = no.disabled = true; try { await rdb(`requests/${meId()}/${uid}`, "DELETE"); } catch { ok.disabled = no.disabled = false; } await refreshSocial(); renderTab(); };
      return userRow(uid, profs[n], "wants to be friends", el("div", { className: "btns" }, ok, no), () => openPlayer(uid));
    });
  }

  if (id !== Soc2.renderId) return;   // a newer render already took over
  body.replaceChildren(...rows);
}

// ---- Search ----
async function runSearch() {
  const q = Soc2.searchInput.value.trim().toLowerCase();
  const box = Soc2.searchResults;
  const id = ++Soc2.searchId;
  if (!q) { box.replaceChildren(empty("Type a username to find players.")); return; }
  if (!/^[a-z0-9_]{1,12}$/.test(q)) { box.replaceChildren(empty("Usernames use letters, numbers and _ only.")); return; }
  box.replaceChildren(empty("Searching..."));
  try {
    // endAt must be a little "higher" than the typed text, otherwise only an exact username matches
    const qs = `&orderBy=${enc('"$key"')}&startAt=${enc('"' + q + '"')}&endAt=${enc('"' + q + '\uf8ff' + '"')}&limitToFirst=10`;
    const data = (await rdb("usernames", "GET", undefined, qs)) || {};
    const me = meId();
    const ids = Object.values(data).filter(uid => uid !== me);
    if (id !== Soc2.searchId) return;
    if (!ids.length) { box.replaceChildren(empty("No players found.")); return; }
    const profs = await Promise.all(ids.map(getProfile));
    if (id !== Soc2.searchId) return;
    box.replaceChildren(...ids.map((uid, n) => userRow(uid, profs[n], profs[n].bio || "", null, () => openPlayer(uid))));
  } catch {
    if (id === Soc2.searchId) box.replaceChildren(empty("Couldn't search. Check your connection."));
  }
}

// ---- Friend requests ----
async function acceptRequest(from) {
  const me = meId();
  await rdb("", "PATCH", {
    [`friends/${me}/${from}`]: true,
    [`friends/${from}/${me}`]: true,
    [`requests/${me}/${from}`]: null,
    [`requests/${from}/${me}`]: null,
  });
}

async function relationTo(uid) {
  if (Soc2.friends[uid]) return "friend";
  if (Soc2.reqs[uid]) return "incoming";
  try { if (await rdb(`requests/${uid}/${meId()}`)) return "outgoing"; } catch {}
  return "none";
}

// ---- Player profile view ----
async function openPlayer(uid) {
  hideViews();
  $("pview").hidden = false;
  const pName = $("pName"), pBio = $("pBio"), pScore = $("pScore"), acts = $("pActions"), msg = $("pMsg");
  pName.textContent = "Loading..."; pBio.textContent = ""; pScore.textContent = ""; msg.textContent = "";
  acts.replaceChildren();
  $("pPfp").src = pfpSrc("");
  const p = await getProfile(uid);
  if ($("pview").hidden) return;
  pName.textContent = p.name;
  pBio.textContent = p.bio || "No bio yet";
  $("pPfp").src = pfpSrc(p.pfp);
  rdb(`scores/${uid}`).then(s => { pScore.textContent = s && s.score != null ? "Best score: " + s.score : "No score yet"; }).catch(() => {});

  if (uid === meId()) { pBio.textContent += " (this is you)"; return; }
  const rel = await relationTo(uid);
  if ($("pview").hidden) return;
  drawActions(uid, rel);
}

function drawActions(uid, rel) {
  const acts = $("pActions"), msg = $("pMsg");
  acts.replaceChildren();
  const btn = (text, fn, alt) => {
    const b = el("button", { textContent: text, className: alt ? "alt" : "" });
    b.onclick = async () => {
      acts.querySelectorAll("button").forEach(x => (x.disabled = true));
      msg.textContent = "";
      try { await fn(); }
      catch { msg.textContent = "Something went wrong. Try again."; acts.querySelectorAll("button").forEach(x => (x.disabled = false)); return; }
      await refreshSocial();
    };
    return b;
  };
  const me = meId();
  if (rel === "none") {
    acts.append(btn("Add friend", async () => {
      await rdb(`requests/${uid}/${me}`, "PUT", { t: SV });
      drawActions(uid, "outgoing");
    }));
  } else if (rel === "outgoing") {
    const sent = el("button", { textContent: "Request sent", disabled: true });
    acts.append(sent, btn("Cancel", async () => {
      await rdb(`requests/${uid}/${me}`, "DELETE");
      drawActions(uid, "none");
    }, true));
  } else if (rel === "incoming") {
    acts.append(
      btn("Accept", async () => { await acceptRequest(uid); drawActions(uid, "friend"); }),
      btn("Decline", async () => { await rdb(`requests/${me}/${uid}`, "DELETE"); drawActions(uid, "none"); }, true)
    );
  } else if (rel === "friend") {
    const m = el("button", { textContent: "Message" });
    m.onclick = () => openChat(uid);
    acts.append(m, btn("Unfriend", async () => {
      if (!confirm("Remove this friend?")) { drawActions(uid, "friend"); return; }
      await rdb("", "PATCH", { [`friends/${me}/${uid}`]: null, [`friends/${uid}/${me}`]: null });
      drawActions(uid, "none");
    }, true));
  }
}

// ---- Chat ----
// Every request is time-limited and every failure is shown in the chat window,
// so it can never sit on "Loading..." forever.
function chatProblem(text) {
  const log = $("chatLog");
  if (!log) return;
  const retry = el("button", { className: "mini", textContent: "Retry" });
  retry.onclick = () => {
    log.replaceChildren(empty("Loading..."));
    Soc2.chatSig = "";
    loadMessages(true);
  };
  log.replaceChildren(empty(text), retry);
  console.warn("[chat] " + text);
}

async function fetchMessages(me, them) {
  const path = `chats/${chatId(me, them)}/messages`;
  try {
    return await withTimeout(
      rdb(path, "GET", undefined, `&orderBy=${enc('"$key"')}&limitToLast=60`),
      10000, "The chat server did not answer"
    );
  } catch (e) {
    // Some rule setups reject ordered queries; try one plain read before giving up.
    if (!/400|index/i.test((e && e.message) || "")) throw e;
    const raw = await withTimeout(rdb(path, "GET"), 10000, "The chat server did not answer");
    const all = raw || {};
    const keys = Object.keys(all).sort().slice(-60);
    const out = {};
    keys.forEach(k => { out[k] = all[k]; });
    return out;
  }
}

async function openChat(uid) {
  if (!Soc2.friends[uid] || !Social.user) return;
  stopChat();
  hideViews();
  $("chat").hidden = false;
  Soc2.chatWith = uid;
  Soc2.chatSig = "";
  $("chatLog").replaceChildren(empty("Loading..."));
  $("chatMsg").textContent = "";
  $("chatInput").value = "";
  $("chatName").textContent = "";
  $("chatPfp").src = pfpSrc("");
  getProfile(uid).then(p => {
    if (Soc2.chatWith !== uid) return;
    $("chatName").textContent = p.name;
    $("chatPfp").src = pfpSrc(p.pfp);
  });
  // watchdog: whatever happens, the "Loading..." text is replaced
  Soc2.chatWatch = setTimeout(() => {
    if (Soc2.chatWith === uid && Soc2.chatSig === "" && !$("chat").hidden) {
      chatProblem("The chat is taking too long to load.");
    }
  }, 12000);
  loadMessages(true);
  Soc2.chatTimer = setInterval(() => loadMessages(false), 2500);
  $("chatInput").focus();
}

function stopChat() {
  clearInterval(Soc2.chatTimer);
  Soc2.chatTimer = null;
  clearTimeout(Soc2.chatWatch);
  Soc2.chatWatch = null;
  Soc2.chatWith = null;
}

async function loadMessages(first) {
  const them = Soc2.chatWith;
  if (!them || !Social.user) return;
  if (!first && document.hidden) return;   // polling pauses in the background, the first load never does
  const me = meId();
  let data;
  try {
    data = await fetchMessages(me, them);
  } catch (e) {
    console.error("[chat] load failed:", e);
    if (Soc2.chatWith !== them || $("chat").hidden) return;
    if (Soc2.chatSig === "") chatProblem("Couldn't load messages. " + ((e && e.message) || "Network error") + ".");
    return;
  }
  if (Soc2.chatWith !== them || $("chat").hidden) return;

  data = data || {};
  const keys = Object.keys(data).sort();
  const sig = keys.length + ":" + (keys[keys.length - 1] || "");
  const log = $("chatLog");
  clearTimeout(Soc2.chatWatch);

  if (sig !== Soc2.chatSig) {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    if (!keys.length) {
      log.replaceChildren(empty("Say hi!"));
    } else {
      log.replaceChildren(...keys.map(k => {
        const m = data[k], mine = m.from === me;
        return el("div", { className: "bub " + (mine ? "mine" : "theirs") },
          el("span", { textContent: m.text }),
          el("small", { textContent: timeText(m.t) }));
      }));
    }
    if (first || Soc2.chatSig === "" || nearBottom) log.scrollTop = log.scrollHeight;
    Soc2.chatSig = sig;
  }

  // mark their latest message as read
  const last = data[keys[keys.length - 1]];
  const seen = (Soc2.inbox[them] && Soc2.inbox[them].seen) || 0;
  if (last && last.from === them && (last.t || 0) > seen && Soc2.inbox[them]) {
    Soc2.inbox[them].seen = last.t;
    updateBadges();
    try { await rdb(`inbox/${me}/${them}`, "PATCH", { seen: last.t }); } catch {}
  }
}

async function sendMsg() {
  const them = Soc2.chatWith;
  const input = $("chatInput");
  const text = input.value.trim().slice(0, 300);
  if (!them || !text || Soc2.sending) return;
  Soc2.sending = true;
  $("chatMsg").textContent = "";
  const me = meId();
  const key = Date.now().toString(36).padStart(9, "0") + Math.random().toString(36).slice(2, 6);
  const preview = text.slice(0, 60);
  try {
    await withTimeout(rdb("", "PATCH", {
      [`chats/${chatId(me, them)}/messages/${key}`]: { from: me, text, t: SV },
      [`inbox/${me}/${them}/t`]: SV,
      [`inbox/${me}/${them}/text`]: preview,
      [`inbox/${me}/${them}/from`]: me,
      [`inbox/${me}/${them}/seen`]: SV,
      [`inbox/${them}/${me}/t`]: SV,
      [`inbox/${them}/${me}/text`]: preview,
      [`inbox/${them}/${me}/from`]: me,
    }), 12000, "Send timed out");
    input.value = "";
    await loadMessages(false);
    Soc2.chatSig = "";           // force a redraw + scroll to the new message
    await loadMessages(true);
    refreshSocial();
  } catch {
    $("chatMsg").textContent = "Couldn't send. Are you still friends?";
  }
  Soc2.sending = false;
}

// ---- Hook into login / logout (social.js stays untouched) ----
function resetSocial() {
  stopChat();
  hideViews();
  Soc2.profiles.clear();
  Soc2.friends = {}; Soc2.inbox = {}; Soc2.reqs = {};
  Soc2.searchInput.value = "";
  Soc2.searchResults.replaceChildren();
  updateBadges();
}

buildSocialUI();

const _enterGame = enterGame;
enterGame = function () { _enterGame(); Soc2.profiles.clear(); refreshSocial(); };

$("outBtn").onclick = () => { resetSocial(); logOut(); };

setInterval(refreshSocial, 6000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshSocial(); });
