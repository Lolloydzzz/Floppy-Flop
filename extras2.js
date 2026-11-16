// extras2.js - sounds for the new traps + emoji reactions on chat messages
// Load this AFTER robot.js (it needs extras.js, social2.js and groups.js to be loaded first).

// ---------- 1. Sounds for the new traps ----------
SFX.level = () => [523, 784].forEach((f, i) => tone(f, 0.14, "triangle", 0.16, 0, i * 0.09));
SFX.warn  = () => { tone(880, 0.07, "square", 0.05); tone(880, 0.07, "square", 0.05, 0, 0.12); };
SFX.zap   = () => tone(1800, 0.4, "sawtooth", 0.08, 160);
SFX.boom  = () => { noise(0.3, 0.3); tone(90, 0.3, "sawtooth", 0.15, 40); };
TOAST_SFX.push(["LEVEL", "level"], ["PHASE", "level"]);

// ---------- 2. Reactions on messages ----------
// HOLD a message to react (and to see who reacted). Tap a reaction under a message to see who reacted too.
// To remove your reaction, hold the message and tap your emoji again.
const REACTS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

document.head.appendChild(el("style", { textContent: `
.msgwrap { display: flex; flex-direction: column; max-width: 78%; }
.msgwrap.mine { align-self: flex-end; align-items: flex-end; }
.msgwrap.theirs { align-self: flex-start; align-items: flex-start; }
.msgwrap .bub { max-width: 100%; align-self: auto; cursor: pointer; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.ov .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.ov .chips .chip { padding: 1px 8px; font-size: 12px; font-weight: normal; line-height: 18px; border: 0; border-radius: 10px; background: #2c445c; color: #fff; cursor: pointer; }
.ov .chips .chip.me { background: #ffd23f; color: #1d2b3a; }
.ov .rbar { display: flex; gap: 2px; margin-top: 4px; padding: 3px 6px; background: #0b141d; border: 1px solid #3d5a78; border-radius: 16px; }
.ov .rbar button { padding: 2px 4px; font-size: 18px; font-weight: normal; line-height: 1.2; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
.ov .rbar button.on { background: #2c445c; }
.ov .who { margin-top: 4px; padding: 6px 9px; max-width: 100%; background: #0b141d; border: 1px solid #3d5a78; border-radius: 10px; font-size: 12px; text-align: left; }
.ov .who .whorow { display: flex; gap: 6px; align-items: baseline; margin: 2px 0; }
.ov .who .we { font-size: 15px; }
.ov .who .chip { margin-top: 4px; }
` }));

// one message bubble with its reaction chips and the emoji picker
function msgBubble(m, mid, mine, rmap, target, sender) {
  const me = meId();
  rmap = rmap || {};
  const mineR = typeof rmap[me] === "string" ? rmap[me] : "";
  const wrap = el("div", { className: "msgwrap " + (mine ? "mine" : "theirs") });
  const b = el("div", { className: "bub " + (mine ? "mine" : "theirs"), title: "Hold to react" });
  if (sender) b.append(el("small", { className: "sender", textContent: sender }));
  b.append(el("span", { textContent: m.text }), el("small", { textContent: timeText(m.t) }));
  wrap.append(b);

  const counts = {};
  Object.values(rmap).forEach(e => { if (REACTS.includes(e)) counts[e] = (counts[e] || 0) + 1; });
  const used = Object.keys(counts);
  if (used.length) {
    const chips = el("div", { className: "chips" });
    used.forEach(e => {
      const c = el("button", { className: "chip" + (mineR === e ? " me" : ""), title: "Tap to see who reacted", textContent: counts[e] > 1 ? e + " " + counts[e] : e });
      c.onclick = ev => { ev.stopPropagation(); toggleWho(wrap, rmap, target, mid, mineR); };
      chips.append(c);
    });
    wrap.append(chips);
  }

  // hold the message (about half a second) to react
  let timer = null, sx = 0, sy = 0, held = false;
  const stop = () => clearTimeout(timer);
  b.addEventListener("pointerdown", e => {
    held = false; sx = e.clientX; sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { held = true; try { navigator.vibrate && navigator.vibrate(15); } catch {} openMenu(wrap, rmap, target, mid, mineR); }, 450);
  });
  b.addEventListener("pointermove", e => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) stop(); });   // scrolling
  ["pointerup", "pointerleave", "pointercancel"].forEach(t => b.addEventListener(t, stop));
  b.addEventListener("contextmenu", e => { e.preventDefault(); stop(); held = true; openMenu(wrap, rmap, target, mid, mineR); });   // right-click on a computer
  b.onclick = () => { if (held) { held = false; return; } closePanels(); };   // a plain tap just closes any open menu
  return wrap;
}

function closePanels() { document.querySelectorAll(".rbar, .who").forEach(x => x.remove()); }

// the list of who reacted with what
async function fillWho(wrap, rmap, target, mid, mineR) {
  const box = el("div", { className: "who" }, el("small", { textContent: "Loading..." }));
  wrap.append(box);
  const uids = Object.keys(rmap).filter(u => REACTS.includes(rmap[u]));
  const profs = await Promise.all(uids.map(getProfile));
  if (!box.isConnected) return;                       // the chat was redrawn meanwhile
  const byEmoji = {};
  uids.forEach((u, i) => { (byEmoji[rmap[u]] = byEmoji[rmap[u]] || []).push(u === meId() ? "You" : profs[i].name); });
  const rows = Object.entries(byEmoji).map(([e, names]) =>
    el("div", { className: "whorow" }, el("span", { className: "we", textContent: e }), el("span", { textContent: names.join(", ") })));
  box.replaceChildren(...rows);
  if (mineR) {
    const rm = el("button", { className: "chip", textContent: "Remove my " + mineR });
    rm.onclick = ev => { ev.stopPropagation(); react(target, mid, mineR, mineR); };
    box.append(rm);
  }
}

// tap a reaction under a message: see who reacted (tap again to close)
function toggleWho(wrap, rmap, target, mid, mineR) {
  const was = wrap.querySelector(".who");
  closePanels();
  if (!was) fillWho(wrap, rmap, target, mid, mineR);
}

// holding a message: emoji picker + who reacted
function openMenu(wrap, rmap, target, mid, mineR) {
  const had = wrap.querySelector(".rbar");
  closePanels();
  if (had) return;
  const bar = el("div", { className: "rbar" });
  REACTS.forEach(e => {
    const x = el("button", { className: mineR === e ? "on" : "", textContent: e });
    x.onclick = ev => { ev.stopPropagation(); react(target, mid, e, mineR); };
    bar.append(x);
  });
  wrap.append(bar);
  if (Object.values(rmap).some(e => REACTS.includes(e))) fillWho(wrap, rmap, target, mid, mineR);
}

async function react(target, mid, emoji, current) {
  const base = target.kind === "dm" ? `reactions/${target.id}` : `groupReactions/${target.id}`;
  const path = `${base}/${mid}/${meId()}`;
  const note = target.kind === "dm" ? $("chatMsg") : $("gMsg");
  try {
    if (current === emoji) await rdb(path, "DELETE");     // tap your emoji again to remove it
    else await rdb(path, "PUT", emoji);
    note.textContent = "";
  } catch {
    note.textContent = "Couldn't react. Are the new rules published?";
  }
  if (target.kind === "dm") { Soc2.chatSig = "~"; loadMessages(false); }   // "~" = redraw but don't jump to the bottom
  else { GR.sig = "~"; loadG(false); }
}

const reactQuery = `&orderBy=${enc('"$key"')}&limitToLast=60`;

// friend chat: same as before, but with reactions
loadMessages = async function (first) {
  const them = Soc2.chatWith;
  if (!them || !Social.user || document.hidden) return;
  const me = meId(), cid = chatId(me, them);
  let data;
  try {
    data = await rdb(`chats/${cid}/messages`, "GET", undefined, reactQuery);
  } catch {
    if (first && Soc2.chatWith === them) $("chatLog").replaceChildren(empty("Couldn't load messages."));
    return;
  }
  let reacts = {};
  try { reacts = (await rdb(`reactions/${cid}`, "GET", undefined, reactQuery)) || {}; } catch {}
  if (Soc2.chatWith !== them) return;
  data = data || {};
  const keys = Object.keys(data).sort();
  const sig = keys.length + ":" + (keys[keys.length - 1] || "") + ":" + JSON.stringify(reacts);
  const log = $("chatLog");

  if (sig !== Soc2.chatSig) {
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    if (!keys.length) log.replaceChildren(empty("Say hi! Hold a message to react."));
    else log.replaceChildren(...keys.map(k => msgBubble(data[k], k, data[k].from === me, reacts[k], { kind: "dm", id: cid }, null)));
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
};

// group chat: same as before, but with reactions
loadG = async function (first) {
  const g = GR.cur;
  if (!g || document.hidden) return;
  let data;
  try { data = (await rdb(`groupMsgs/${g.id}`, "GET", undefined, reactQuery)) || {}; }
  catch { if (first && GR.cur === g) $("gLog").replaceChildren(empty("Couldn't load messages.")); return; }
  let reacts = {};
  try { reacts = (await rdb(`groupReactions/${g.id}`, "GET", undefined, reactQuery)) || {}; } catch {}
  if (GR.cur !== g) return;
  const keys = Object.keys(data).sort(), me = meId(), log = $("gLog");
  const sig = keys.length + ":" + (keys[keys.length - 1] || "") + ":" + JSON.stringify(reacts);

  if (sig !== GR.sig) {
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    const senders = [...new Set(keys.map(k => data[k].from))];
    const profs = await Promise.all(senders.map(getProfile));
    if (GR.cur !== g) return;
    const nameOf = {};
    senders.forEach((u, i) => (nameOf[u] = profs[i].name));
    if (!keys.length) log.replaceChildren(empty("Say hi to the group! Hold a message to react."));
    else log.replaceChildren(...keys.map(k => {
      const m = data[k], mine = m.from === me;
      return msgBubble(m, k, mine, reacts[k], { kind: "group", id: g.id }, mine ? null : (nameOf[m.from] || "?"));
    }));
    if (first || GR.sig === "" || near) log.scrollTop = log.scrollHeight;
    GR.sig = sig;
  }

  const last = data[keys[keys.length - 1]], e = GR.list[g.id];
  if (last && last.from !== me && (last.t || 0) > ((e && e.seen) || 0)) {   // mark as read
    if (e) e.seen = last.t;
    rdb(`userGroups/${me}/${g.id}`, "PATCH", { seen: last.t }).catch(() => {});
  }
};
