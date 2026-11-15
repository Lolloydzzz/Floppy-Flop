// reactions.js - emoji reactions + replies for friend chats AND group chats. Load AFTER groups.js.
// Tap a message to react or reply. Needs the new "chatReacts" / "groupReacts" rules and the "reply" rule.

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const RX = { open: null, reply: { dm: null, g: null }, dm: null, g: null, bars: {} };

// ---- drawing the messages ----
function bubble(scope, mid, m, names, reacts) {
  const me = meId(), mine = m.from === me;
  const b = el("div", { className: "bub " + (mine ? "mine" : "theirs") });
  if (scope === "g" && !mine) b.append(el("small", { className: "sender", textContent: names[m.from] || "?" }));
  if (m.reply) b.append(el("div", { className: "quote" }, el("b", { textContent: m.reply.name }), el("span", { textContent: m.reply.text })));
  b.append(el("span", { textContent: m.text }), el("small", { textContent: timeText(m.t) }));

  const counts = {};
  Object.entries(reacts || {}).forEach(([u, e]) => { (counts[e] = counts[e] || []).push(u); });
  const used = Object.keys(counts);
  if (used.length) {
    const row = el("div", { className: "rx" });
    used.forEach(e => {
      const chip = el("button", { className: "chip" + (counts[e].includes(me) ? " mine" : ""), textContent: e + " " + counts[e].length });
      chip.onclick = ev => { ev.stopPropagation(); react(scope, mid, e); };
      row.append(chip);
    });
    b.append(row);
  }
  if (RX.open === scope + mid) {
    const bar = el("div", { className: "acts" });
    EMOJIS.forEach(e => {
      const x = el("button", { textContent: e });
      x.onclick = ev => { ev.stopPropagation(); RX.open = null; react(scope, mid, e); };
      bar.append(x);
    });
    const rep = el("button", { className: "rep", textContent: "↩ Reply" });
    rep.onclick = ev => { ev.stopPropagation(); RX.open = null; startReply(scope, m, names); paint(scope, false); };
    bar.append(rep);
    b.append(bar);
  }
  b.onclick = () => { RX.open = RX.open === scope + mid ? null : scope + mid; paint(scope, false); };
  return b;
}

function paint(scope, first) {
  const S = RX[scope];
  if (!S) return;
  const log = $(scope === "dm" ? "chatLog" : "gLog");
  const keys = Object.keys(S.data).sort();
  const sig = keys.length + ":" + (keys[keys.length - 1] || "") + ":" + JSON.stringify(S.reacts) + ":" + RX.open;
  if (!first && sig === S.sig) return;
  S.sig = sig;
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 70, top = log.scrollTop;
  log.replaceChildren(...(keys.length
    ? keys.map(k => bubble(scope, k, S.data[k], S.names, S.reacts[k]))
    : [empty(scope === "dm" ? "Say hi!" : "Say hi to the group!")]));
  log.scrollTop = first || near ? log.scrollHeight : top;
}

// ---- reactions ----
async function react(scope, mid, emoji) {
  const S = RX[scope], me = meId();
  if (!S) return;
  const path = (scope === "dm" ? `chatReacts/${S.cid}/` : `groupReacts/${S.gid}/`) + `${mid}/${me}`;
  const had = (S.reacts[mid] || {})[me];
  S.reacts[mid] = { ...(S.reacts[mid] || {}) };
  if (had === emoji) delete S.reacts[mid][me]; else S.reacts[mid][me] = emoji;   // show it right away
  paint(scope, false);
  try { await (had === emoji ? rdb(path, "DELETE") : rdb(path, "PUT", emoji)); }
  catch { (scope === "dm" ? loadMessages : loadG)(false); }
}

// ---- replies ----
function showBar(scope) {
  const bar = RX.bars[scope], r = RX.reply[scope];
  bar.hidden = !r;
  if (!r) return;
  const x = el("button", { className: "alt", textContent: "✕" });
  x.onclick = () => { RX.reply[scope] = null; showBar(scope); };
  bar.replaceChildren(el("span", { textContent: "↩ Replying to " + r.name + ": " + r.text }), x);
}
function startReply(scope, m, names) {
  RX.reply[scope] = { id: String(m.t || "") + "", name: names[m.from] || "?", text: (m.text || "").slice(0, 60) };
  showBar(scope);
  $(scope === "dm" ? "chatInput" : "gInput").focus();
}
RX.bars.dm = el("div", { className: "rbar", hidden: true });
RX.bars.g = el("div", { className: "rbar", hidden: true });
$("chat").querySelector(".crow").before(RX.bars.dm);
$("gchat").querySelector(".crow").before(RX.bars.g);

// ---- friend chat: load + send (replaces the versions in social2.js) ----
async function loadMessages(first) {
  const them = Soc2.chatWith;
  if (!them || !Social.user || document.hidden) return;
  const me = meId(), cid = chatId(me, them);
  let data, reacts;
  try {
    [data, reacts] = await Promise.all([
      rdb(`chats/${cid}/messages`, "GET", undefined, `&orderBy=${enc('"$key"')}&limitToLast=60`),
      rdb(`chatReacts/${cid}`).catch(() => null),
    ]);
  } catch {
    if (first && Soc2.chatWith === them) $("chatLog").replaceChildren(empty("Couldn't load messages."));
    return;
  }
  const tp = await getProfile(them);
  if (Soc2.chatWith !== them) return;
  data = data || {};
  RX.dm = { data, reacts: reacts || {}, cid, names: { [me]: Social.user.name, [them]: tp.name }, sig: RX.dm && RX.dm.cid === cid ? RX.dm.sig : "" };
  paint("dm", first);

  const keys = Object.keys(data).sort(), last = data[keys[keys.length - 1]];
  const seen = (Soc2.inbox[them] && Soc2.inbox[them].seen) || 0;
  if (last && last.from === them && (last.t || 0) > seen && Soc2.inbox[them]) {   // mark as read
    Soc2.inbox[them].seen = last.t;
    updateBadges();
    try { await rdb(`inbox/${me}/${them}`, "PATCH", { seen: last.t }); } catch {}
  }
}

async function sendMsg() {
  const them = Soc2.chatWith, input = $("chatInput"), text = input.value.trim().slice(0, 300);
  if (!them || !text || Soc2.sending) return;
  Soc2.sending = true;
  $("chatMsg").textContent = "";
  const me = meId(), preview = text.slice(0, 60), reply = RX.reply.dm;
  const key = Date.now().toString(36).padStart(9, "0") + Math.random().toString(36).slice(2, 6);
  try {
    await rdb("", "PATCH", {
      [`chats/${chatId(me, them)}/messages/${key}`]: { from: me, text, t: SV, ...(reply ? { reply } : {}) },
      [`inbox/${me}/${them}/t`]: SV, [`inbox/${me}/${them}/text`]: preview, [`inbox/${me}/${them}/from`]: me, [`inbox/${me}/${them}/seen`]: SV,
      [`inbox/${them}/${me}/t`]: SV, [`inbox/${them}/${me}/text`]: preview, [`inbox/${them}/${me}/from`]: me,
    });
    input.value = "";
    RX.reply.dm = null; showBar("dm");
    await loadMessages(true);
    refreshSocial();
  } catch { $("chatMsg").textContent = "Couldn't send. Are you still friends?"; }
  Soc2.sending = false;
}

// ---- group chat: load + send (replaces the versions in groups.js) ----
async function loadG(first) {
  const g = GR.cur;
  if (!g || document.hidden) return;
  let data, reacts;
  try {
    [data, reacts] = await Promise.all([
      rdb(`groupMsgs/${g.id}`, "GET", undefined, `&orderBy=${enc('"$key"')}&limitToLast=60`),
      rdb(`groupReacts/${g.id}`).catch(() => null),
    ]);
  } catch { if (first && GR.cur === g) $("gLog").replaceChildren(empty("Couldn't load messages.")); return; }
  if (GR.cur !== g) return;
  data = data || {};
  const keys = Object.keys(data).sort(), me = meId();
  const senders = [...new Set(keys.map(k => data[k].from))];
  const profs = await Promise.all(senders.map(getProfile));
  if (GR.cur !== g) return;
  const names = { [me]: Social.user.name };
  senders.forEach((u, i) => (names[u] = profs[i].name));
  RX.g = { data, reacts: reacts || {}, gid: g.id, names, sig: RX.g && RX.g.gid === g.id ? RX.g.sig : "" };
  paint("g", first);

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
  const me = meId(), prev = text.slice(0, 60), reply = RX.reply.g;
  const key = Date.now().toString(36).padStart(9, "0") + Math.random().toString(36).slice(2, 6);
  try {
    const gg = await rdb(`groups/${g.id}`);
    g.members = Object.keys((gg && gg.members) || {});
    const upd = { [`groupMsgs/${g.id}/${key}`]: { from: me, text, t: SV, ...(reply ? { reply } : {}) } };
    g.members.forEach(u => {
      const base = `userGroups/${u}/${g.id}`;
      upd[base + "/name"] = g.name; upd[base + "/t"] = SV; upd[base + "/text"] = prev; upd[base + "/from"] = me;
    });
    upd[`userGroups/${me}/${g.id}/seen`] = SV;
    await rdb("", "PATCH", upd);
    input.value = "";
    RX.reply.g = null; showBar("g");
    await loadG(true);
    pollGroups();
  } catch { $("gMsg").textContent = "Couldn't send. Are you still in this group?"; }
  GR.sending = false;
}

// the Send buttons were wired to the old functions, so wire them again
$("chatSend").onclick = sendMsg;
$("gSend").onclick = sendG;

// leaving a chat clears any half-finished reply
{ const _hv = hideViews; hideViews = function () { _hv(); RX.reply.dm = RX.reply.g = null; RX.open = null; showBar("dm"); showBar("g"); }; }