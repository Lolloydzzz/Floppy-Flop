// groups.js - group chats. Load AFTER extras.js. Needs the "groups", "groupMsgs" and "userGroups" rules.
const GR = { list: {}, cur: null, timer: null, sig: "", sending: false };
const gUnread = e => e.from !== meId() && (e.t || 0) > (e.seen || 0);

// ---- screens ----
function buildGroupUI() {
  const mk = (id, html) => { const d = el("div", { id, className: "ov", hidden: true }); d.innerHTML = html; $("stage").appendChild(d); };
  mk("gnew",
    `<div class="shead"><h2>New group</h2><button id="gnBack" class="alt">Back</button></div>
     <input id="gnName" type="text" maxlength="24" placeholder="Group name" autocomplete="off">
     <p class="sub">Pick friends to add (up to 9)</p><div id="gnList"></div>
     <p id="gnMsg" class="msg"></p><div class="row"><button id="gnCreate">Create group</button></div>`);
  mk("gchat",
    `<div class="chead"><button id="gBack" class="alt">&lsaquo; Back</button><b id="gName"></b><button id="gInfoBtn" class="alt">Members</button></div>
     <div id="gLog"></div><p id="gMsg" class="msg"></p>
     <div class="crow"><input id="gInput" type="text" maxlength="300" placeholder="Message the group..." autocomplete="off"><button id="gSend">Send</button></div>`);
  mk("ginfo",
    `<div class="shead"><h2 id="giTitle">Members</h2><button id="giBack" class="alt">Back</button></div>
     <div id="giList"></div><p id="giMsg" class="msg"></p><div class="row"><button id="giLeave" class="alt">Leave group</button></div>`);

  const tab = el("button", { textContent: "Groups" });   // 5th tab in the Social panel
  tab.dataset.tab = "groups";
  tab.append(el("i", { id: "bdgGroupsTab", className: "bdg", hidden: true }));
  tab.onclick = () => setTab("groups");
  $("soc").querySelector(".tabs").append(tab);
  document.querySelector('#socbar [data-open="chats"]').append(el("i", { id: "bdgGroupsBtn", className: "bdg gb", hidden: true }));

  ["gnName", "gInput"].forEach(id => $(id).addEventListener("keydown", e => e.stopPropagation()));
  $("gnBack").onclick = () => { hideViews(); openPanel("groups"); };
  $("gnCreate").onclick = createGroup;
  $("gBack").onclick = () => { hideViews(); openPanel("groups"); };
  $("gSend").onclick = sendG;
  $("gInput").addEventListener("keydown", e => { if (e.key === "Enter") sendG(); });
  $("gInfoBtn").onclick = openInfo;
  $("giBack").onclick = () => { $("ginfo").hidden = true; $("gchat").hidden = false; };
  $("giLeave").onclick = leaveGroup;
}

function stopG() { clearInterval(GR.timer); GR.timer = null; GR.cur = null; }

// ---- the Groups tab ----
function renderGroups() {
  const nb = el("button", { className: "mini", textContent: "+ New group" });
  nb.onclick = openNew;
  const rows = Object.entries(GR.list).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).map(([gid, e]) => {
    const info = el("div", { className: "info" }, el("b", { textContent: e.name }),
      el("small", { textContent: (e.from === meId() ? "You: " : "") + (e.text || "") }));
    const r = el("div", { className: "urow click" + (gUnread(e) ? " unread" : "") }, el("div", { className: "gav", textContent: "👥" }), info);
    if (gUnread(e)) r.append(el("i", { className: "dot" }));
    r.onclick = () => openGroup(gid);
    return r;
  });
  $("socBody").replaceChildren(el("div", { className: "row gtop" }, nb), ...(rows.length ? rows : [empty("No group chats yet. Make one with your friends!")]));
}
{ const _rt = renderTab; renderTab = function () { return Soc2.tab === "groups" ? renderGroups() : _rt(); }; }

async function pollGroups() {
  if (!Social.user || document.hidden) return;
  try { GR.list = (await rdb(`userGroups/${meId()}`)) || {}; } catch { return; }
  const n = Object.values(GR.list).filter(gUnread).length;
  setBadge("bdgGroupsTab", n);
  setBadge("bdgGroupsBtn", n);
  if (!$("soc").hidden && Soc2.tab === "groups") renderGroups();
}

// ---- create a group ----
async function openNew() {
  hideViews();
  $("gnew").hidden = false;
  $("gnName").value = ""; $("gnMsg").textContent = "";
  const ids = Object.keys(Soc2.friends), list = $("gnList");
  if (!ids.length) { list.replaceChildren(empty("Add some friends first.")); return; }
  list.replaceChildren(empty("Loading..."));
  const profs = await Promise.all(ids.map(getProfile));
  list.replaceChildren(...ids.map((uid, n) =>
    el("label", { className: "urow pick" }, el("input", { type: "checkbox", value: uid }),
      el("img", { src: pfpSrc(profs[n].pfp), alt: "" }), el("div", { className: "info" }, el("b", { textContent: profs[n].name })))));
}

async function createGroup() {
  const name = $("gnName").value.trim(), me = meId(), msg = $("gnMsg");
  const picked = [...$("gnList").querySelectorAll("input:checked")].map(x => x.value);
  if (!name) { msg.textContent = "Give your group a name."; return; }
  if (!picked.length) { msg.textContent = "Pick at least one friend."; return; }
  if (picked.length > 9) { msg.textContent = "Up to 9 friends per group."; return; }
  $("gnCreate").disabled = true;
  msg.textContent = "Creating...";
  const gid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const members = { [me]: true };
  picked.forEach(u => (members[u] = true));
  try {
    await rdb(`groups/${gid}`, "PUT", { name, owner: me, t: SV, members });
    const upd = {};
    Object.keys(members).forEach(u => {
      upd[`userGroups/${u}/${gid}`] = { name, t: SV, text: "Group created", from: me, ...(u === me ? { seen: SV } : {}) };
    });
    await rdb("", "PATCH", upd);
    await pollGroups();
    openGroup(gid);
  } catch { msg.textContent = "Couldn't create the group. Are the new rules published?"; }
  $("gnCreate").disabled = false;
}

// ---- group chat ----
async function openGroup(gid) {
  hideViews();
  $("gchat").hidden = false;
  GR.sig = "";
  $("gMsg").textContent = ""; $("gInput").value = "";
  $("gName").textContent = (GR.list[gid] && GR.list[gid].name) || "Group";
  $("gLog").replaceChildren(empty("Loading..."));
  let g = null;
  try { g = await rdb(`groups/${gid}`); } catch {}
  if ($("gchat").hidden) return;
  if (!g) {
    $("gLog").replaceChildren(empty("This group isn't available any more."));
    rdb(`userGroups/${meId()}/${gid}`, "DELETE").catch(() => {});
    return;
  }
  GR.cur = { id: gid, name: g.name, members: Object.keys(g.members || {}) };
  $("gName").textContent = g.name;
  loadG(true);
  GR.timer = setInterval(() => loadG(false), 2500);
  $("gInput").focus();
}

async function loadG(first) {
  const g = GR.cur;
  if (!g || document.hidden) return;
  let data;
  try { data = (await rdb(`groupMsgs/${g.id}`, "GET", undefined, `&orderBy=${enc('"$key"')}&limitToLast=60`)) || {}; }
  catch { if (first && GR.cur === g) $("gLog").replaceChildren(empty("Couldn't load messages.")); return; }
  if (GR.cur !== g) return;
  const keys = Object.keys(data).sort(), me = meId(), log = $("gLog");
  const sig = keys.length + ":" + (keys[keys.length - 1] || "");
  if (sig !== GR.sig) {
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    const senders = [...new Set(keys.map(k => data[k].from))];
    const profs = await Promise.all(senders.map(getProfile));
    if (GR.cur !== g) return;
    const nameOf = {};
    senders.forEach((u, i) => (nameOf[u] = profs[i].name));
    if (!keys.length) log.replaceChildren(empty("Say hi to the group!"));
    else log.replaceChildren(...keys.map(k => {
      const m = data[k], mine = m.from === me;
      const b = el("div", { className: "bub " + (mine ? "mine" : "theirs") });
      if (!mine) b.append(el("small", { className: "sender", textContent: nameOf[m.from] || "?" }));
      b.append(el("span", { textContent: m.text }), el("small", { textContent: timeText(m.t) }));
      return b;
    }));
    if (first || GR.sig === "" || near) log.scrollTop = log.scrollHeight;
    GR.sig = sig;
  }
  const last = data[keys[keys.length - 1]], e = GR.list[g.id];
  if (last && last.from !== me && (last.t || 0) > ((e && e.seen) || 0)) {   // mark as read
    if (e) e.seen = last.t;
    rdb(`userGroups/${me}/${g.id}`, "PATCH", { seen: last.t }).catch(() => {});
  }
}

async function sendG() {
  const g = GR.cur, input = $("gInput"), text = input.value.trim().slice(0, 300);
  if (!g || !text || GR.sending) return;
  GR.sending = true;
  $("gMsg").textContent = "";
  const me = meId(), prev = text.slice(0, 60);
  const key = Date.now().toString(36).padStart(9, "0") + Math.random().toString(36).slice(2, 6);
  try {
    const gg = await rdb(`groups/${g.id}`);                       // fresh member list (people may have left)
    g.members = Object.keys((gg && gg.members) || {});
    const upd = { [`groupMsgs/${g.id}/${key}`]: { from: me, text, t: SV } };
    g.members.forEach(u => {
      const base = `userGroups/${u}/${g.id}`;
      upd[base + "/name"] = g.name; upd[base + "/t"] = SV; upd[base + "/text"] = prev; upd[base + "/from"] = me;
    });
    upd[`userGroups/${me}/${g.id}/seen`] = SV;
    await rdb("", "PATCH", upd);
    input.value = "";
    GR.sig = "";
    await loadG(true);
    pollGroups();
  } catch { $("gMsg").textContent = "Couldn't send. Are you still in this group?"; }
  GR.sending = false;
}

// ---- members + leave ----
async function openInfo() {
  const g = GR.cur;
  if (!g) return;
  $("gchat").hidden = true; $("ginfo").hidden = false;
  $("giMsg").textContent = ""; $("giTitle").textContent = g.name;
  $("giList").replaceChildren(empty("Loading..."));
  let gg = null;
  try { gg = await rdb(`groups/${g.id}`); } catch {}
  const ids = Object.keys((gg && gg.members) || {});
  g.members = ids;
  const profs = await Promise.all(ids.map(getProfile));
  $("giList").replaceChildren(...ids.map((u, n) => userRow(u, profs[n], u === meId() ? "you" : (profs[n].bio || ""), null, null)));
}

async function leaveGroup() {
  const g = GR.cur;
  if (!g || !confirm("Leave this group?")) return;
  try {
    await rdb("", "PATCH", { [`groups/${g.id}/members/${meId()}`]: null, [`userGroups/${meId()}/${g.id}`]: null });
    delete GR.list[g.id];
    hideViews();
    openPanel("groups");
    pollGroups();
  } catch { $("giMsg").textContent = "Couldn't leave. Try again."; }
}

// ---- hooks ----
{ const _hv = hideViews; hideViews = function () { _hv(); ["gnew", "gchat", "ginfo"].forEach(id => ($(id).hidden = true)); stopG(); }; }
{ const _eg = enterGame; enterGame = function () { _eg(); pollGroups(); }; }
{
  const prev = $("outBtn").onclick;
  $("outBtn").onclick = () => { GR.list = {}; setBadge("bdgGroupsTab", 0); setBadge("bdgGroupsBtn", 0); prev(); };
}
setInterval(pollGroups, 6000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollGroups(); });
buildGroupUI();