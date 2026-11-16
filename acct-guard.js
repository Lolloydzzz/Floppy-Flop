// acct-guard.js - keeps the account bar correct (photo + name + bio + buttons).
// Load it LAST in index.html (after every other script).
// Repairs the bar whenever anything removes, empties or breaks the name/bio,
// so the username can no longer disappear after opening a panel and coming back.

(function () {
  "use strict";
  if (window.__acctGuard) return;
  window.__acctGuard = true;

  var DEBUG = true;      // true = print a warning + stack trace when the bar is emptied
  var painting = false;  // true while WE are the ones writing into the bar
  var queued = false;
  var last = 0;

  function me() {
    return (typeof Social !== "undefined" && Social.user) || null;
  }
  function byId(id) { return document.getElementById(id); }

  // ---------- rebuild the pieces if a script deleted them ----------
  function ensureBar() {
    var bar = byId("acct");
    if (bar) return bar;
    var menu = byId("menu");
    if (!menu) return null;

    bar = document.createElement("div");
    bar.id = "acct";
    bar.innerHTML =
      '<img id="acctPfp" alt="">' +
      '<div class="who"><b id="acctName"></b><small id="acctBio"></small></div>' +
      '<button id="profBtn" class="alt">Profile</button>' +
      '<button id="outBtn" class="alt">Log out</button>';
    menu.prepend(bar);

    var p = byId("profBtn");
    if (p) p.onclick = function () { if (typeof openProfile === "function") openProfile(); };
    var o = byId("outBtn");
    if (o) o.onclick = function () {
      try { if (typeof closeAdmin === "function") closeAdmin(); } catch (e) {}
      try { if (typeof resetSocial === "function") resetSocial(); } catch (e) {}
      try { if (typeof logOut === "function") logOut(); } catch (e) {}
    };
    if (DEBUG) console.warn("[acct-guard] the whole account bar was missing - rebuilt it");
    return bar;
  }

  function ensureWho(bar) {
    var who = bar.querySelector(".who");
    if (!who) {
      who = document.createElement("div");
      who.className = "who";
      bar.insertBefore(who, bar.querySelector("button") || null);
      if (DEBUG) console.warn("[acct-guard] the name block (.who) was missing - rebuilt it");
    }
    // inline styles: the bar must look right even if social.css is an older copy
    who.style.cssText = "flex:1 1 auto;min-width:0;overflow:hidden;display:flex;flex-direction:column;justify-content:center;";

    var name = who.querySelector("#acctName") || who.querySelector("b");
    if (!name) {
      name = document.createElement("b");
      who.insertBefore(name, who.firstChild);
    }
    name.id = "acctName";
    name.style.cssText = "display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;line-height:1.25;";

    var bio = who.querySelector("#acctBio") || who.querySelector("small");
    if (!bio) {
      bio = document.createElement("small");
      who.appendChild(bio);
    }
    bio.id = "acctBio";
    bio.style.cssText = "display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:1.25;opacity:.72;";

    deepWatch(name);
    deepWatch(bio);
    return { name: name, bio: bio };
  }

  // ---------- the repair ----------
  function paint() {
    queued = false;
    last = Date.now();
    var u = me();
    if (!u) return;
    var bar = ensureBar();
    if (!bar) return;
    var f = ensureWho(bar);

    var wantName = u.name || "Player";
    var wantBio = u.bio || "No bio yet";

    painting = true;
    try {
      if (f.name.textContent !== wantName) f.name.textContent = wantName;
      if (f.bio.textContent !== wantBio) f.bio.textContent = wantBio;
      var pic = byId("acctPfp");
      if (pic && typeof pfpSrc === "function") {
        var src = pfpSrc(u.pfp);
        if (pic.getAttribute("src") !== src) pic.src = src;
      }
    } finally { painting = false; }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(paint, Math.max(20, 150 - (Date.now() - last)));   // never thrash
  }

  // ---------- repair after the things that change screens ----------
  function wrap(name) {
    var orig = window[name];
    if (typeof orig !== "function" || orig.__acctGuard) return;
    var w = function () {
      var r = orig.apply(this, arguments);
      schedule();
      return r;
    };
    w.__acctGuard = true;
    window[name] = w;
  }

  ["enterGame", "refreshAcct", "hideViews", "closeAll", "openPanel", "setTab",
   "closeAdmin", "showMenu", "openProfile", "resetSocial", "showAuth"
  ].forEach(wrap);

  // ---------- watch the menu: catch whoever empties it ----------
  var watched = new WeakSet();
  var nativeText = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  function deepWatch(el) {
    if (!DEBUG || !el || watched.has(el) || !nativeText || !nativeText.set) return;
    watched.add(el);
    try {
      Object.defineProperty(el, "textContent", {
        configurable: true,
        get: function () { return nativeText.get.call(el); },
        set: function (v) {
          if (!painting && String(nativeText.get.call(el)).trim() !== "" && String(v).trim() === "") {
            console.warn("[acct-guard] #" + el.id + " was emptied by this code:\n" + new Error().stack);
          }
          nativeText.set.call(el, v);
        }
      });
    } catch (e) { /* ignored */ }
  }

  function watchMenu() {
    var menu = byId("menu");
    if (!menu) { setTimeout(watchMenu, 300); return; }
    new MutationObserver(function (records) {
      if (!me()) return;
      if (DEBUG) {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if (r.type === "childList" && r.removedNodes.length) {
            for (var j = 0; j < r.removedNodes.length; j++) {
              var n = r.removedNodes[j];
              if (n.nodeType === 1 && (n.id === "acctName" || n.id === "acctBio" ||
                  (n.classList && n.classList.contains("who")) || n.id === "acct")) {
                console.warn("[acct-guard] the name block / account bar was removed from the page - putting it back");
              }
            }
          }
          if (r.type === "characterData" && String(r.target.data || "").trim() === "") {
            var p = r.target.parentNode;
            if (p && (p.id === "acctName" || p.id === "acctBio")) {
              console.warn("[acct-guard] #" + p.id + " was set to empty text - putting it back");
            }
          }
        }
      }
      schedule();
    }).observe(menu, { childList: true, subtree: true, characterData: true });
  }

  // ---------- boot ----------
  function boot() {
    watchMenu();
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  setInterval(function () {                     // backstop: once a second while the menu is up
    var m = byId("menu");
    if (m && !m.hidden) paint();
  }, 1000);

  document.addEventListener("click", function () { schedule(); }, true);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) schedule(); });
  window.addEventListener("pageshow", schedule);
})();