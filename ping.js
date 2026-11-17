// ping.js - shows your connection speed (ping), so you can see when your signal is weak.
// Load it near the end of index.html (after extras.js, so the bar under the game exists).
//
// How it works: every 3 seconds it asks your Firebase database for a tiny public node and times the answer.
// Nothing is saved. The result shows up in two places:
//   1. a badge under the game:  [signal bars] 42 ms - Good
//   2. a small pill in the corner while you play (turns red and flashes "WEAK SIGNAL" when the connection is bad)

(function () {
  "use strict";
  if (window.FFPing) return;

  const EVERY = 3000;      // ms between pings
  const TIMEOUT = 4000;    // no answer after 4s = a lost ping
  const KEEP = 8;          // how many recent pings we look at

  const COLORS = { good: "#4caf50", fair: "#ffd23f", weak: "#ff7a3d", none: "#ff3b3b", wait: "#8fa9c2" };
  const LABELS = { good: "Good", fair: "Fair", weak: "Weak signal", none: "No signal", wait: "Checking..." };

  const S = { samples: [], level: "wait", ms: null, loss: 0, bars: 0, warmup: true };

  // ---------- the numbers ----------
  function judge() {
    const ok = S.samples.filter(v => v != null).sort((a, b) => a - b);
    const lost = S.samples.filter(v => v == null).length;
    S.loss = S.samples.length ? Math.round(100 * lost / S.samples.length) : 0;
    const lastTwo = S.samples.slice(-2);
    if (!S.samples.length) { S.level = "wait"; S.ms = null; S.bars = 0; return; }
    if (!ok.length || (lastTwo.length === 2 && lastTwo.every(v => v == null))) { S.level = "none"; S.ms = null; S.bars = 0; return; }
    S.ms = ok[Math.floor(ok.length / 2)];                      // the median ignores one-off spikes
    if (S.loss >= 30 || S.ms > 400) { S.level = "weak"; S.bars = 1; }
    else if (S.ms > 150 || S.loss >= 15) { S.level = "fair"; S.bars = 2; }
    else { S.level = "good"; S.bars = S.ms < 80 ? 4 : 3; }
  }

  function push(v) {
    if (S.warmup && v != null) { S.warmup = false; return; }   // the very first answer includes the connection set-up time, skip it
    S.samples.push(v);
    if (S.samples.length > KEEP) S.samples.shift();
    judge();
    draw();
  }

  async function pingOnce() {
    if (document.hidden) return;
    const ctl = new AbortController(), t0 = performance.now();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(`${DB_URL}/gens/__ping.json?x=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
      await res.text();
      push(Math.round(performance.now() - t0));
    } catch {
      push(null);
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- what you see ----------
  const css = document.createElement("style");
  css.textContent = `
#pingBadge { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 20px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); color: #cfe3f5; font-size: 13px; font-weight: 700; }
#pingBadge .t { color: #cfe3f5; }
.pbars { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
.pbars i { display: block; width: 3px; border-radius: 1px; background: currentColor; opacity: 0.2; }
.pbars i:nth-child(1) { height: 4px; } .pbars i:nth-child(2) { height: 7px; } .pbars i:nth-child(3) { height: 10px; } .pbars i:nth-child(4) { height: 14px; }
.pbars i.on { opacity: 1; }
#pingGame { position: absolute; top: 6.6%; right: 2.4%; z-index: 6; display: none; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 12px; background: rgba(8,16,26,0.55); color: #fff; font: 700 12px system-ui, sans-serif; pointer-events: none; }
#pingGame.show { display: inline-flex; }
#pingGame.alert { background: rgba(214,40,40,0.88); animation: pingBlink 0.9s ease-in-out infinite; }
@keyframes pingBlink { 50% { opacity: 0.55; } }
`;
  document.head.appendChild(css);

  const bars = () => '<span class="pbars"><i></i><i></i><i></i><i></i></span>';
  const badge = document.createElement("span");
  badge.id = "pingBadge";
  badge.innerHTML = bars() + '<span class="t"></span>';
  const tools = document.getElementById("tools");
  if (tools) tools.prepend(badge);
  else { const h = document.querySelector(".hint"); if (h) h.after(badge); else document.body.appendChild(badge); }

  const pill = document.createElement("div");
  pill.id = "pingGame";
  pill.innerHTML = bars() + '<span class="t"></span>';
  const stage = document.getElementById("stage");
  if (stage) stage.appendChild(pill);

  function paintBars(host) {
    const color = COLORS[S.level];
    host.querySelector(".pbars").style.color = color;
    host.querySelectorAll(".pbars i").forEach((b, n) => b.classList.toggle("on", n < S.bars));
  }

  function details() {
    const c = navigator.connection || {};
    const parts = [];
    parts.push(S.ms != null ? "Ping " + S.ms + " ms" : "No answer from the server");
    parts.push("lost " + S.loss + "%");
    if (c.effectiveType) parts.push(c.effectiveType);
    if (c.downlink) parts.push(c.downlink + " Mbps");
    return parts.join(" - ");
  }

  function draw() {
    const color = COLORS[S.level];
    paintBars(badge);
    badge.querySelector(".t").textContent = (S.ms != null ? S.ms + " ms - " : "") + LABELS[S.level];
    badge.querySelector(".t").style.color = S.level === "wait" || S.level === "good" ? "#cfe3f5" : color;
    badge.title = details();

    paintBars(pill);
    const bad = S.level === "weak" || S.level === "none";
    pill.classList.toggle("alert", bad);
    pill.querySelector(".t").textContent = bad ? (S.level === "none" ? "NO SIGNAL" : "WEAK SIGNAL" + (S.ms != null ? " " + S.ms + " ms" : ""))
                                               : (S.ms != null ? S.ms + " ms" : "...");
    pill.querySelector(".pbars").style.color = bad ? "#fff" : color;
    pill.title = details();
    syncVisibility();
  }

  // the corner pill only shows while you are in the game, not in the menu
  function syncVisibility() {
    const inGame = typeof menu !== "undefined" && menu.hidden;
    pill.classList.toggle("show", inGame);
  }

  // ---------- go ----------
  draw();
  pingOnce(); setTimeout(pingOnce, 500);
  setInterval(pingOnce, EVERY);
  setInterval(syncVisibility, 400);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pingOnce(); });
  window.addEventListener("offline", () => { push(null); push(null); });
  window.addEventListener("online", () => { S.samples = []; S.warmup = true; pingOnce(); setTimeout(pingOnce, 400); });

  window.FFPing = { state: S, measure: pingOnce };
})();
