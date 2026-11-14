// social.js - accounts, login and profiles (phase 1)
// Load this AFTER game.js. It uses Firebase Authentication over REST.
 
const API_KEY = "AIzaSyAX4LYMj9TvP1i5ud7qcaZE718s2s7td-A";   // Firebase console > Project settings > Web API Key
const AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const Social = { user: null }; // { uid, name, bio, pfp, idToken, refreshToken, expires }
 
const AUTH_ERRORS = {
  EMAIL_EXISTS: "That username is already taken.",
  INVALID_LOGIN_CREDENTIALS: "Wrong username or password.",
  EMAIL_NOT_FOUND: "Wrong username or password.",
  INVALID_PASSWORD: "Wrong username or password.",
  WEAK_PASSWORD: "Password needs at least 6 characters.",
  OPERATION_NOT_ALLOWED: "Email/Password sign-in is not turned on in Firebase yet.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many tries. Wait a bit and try again.",
};
 
// Users log in with a username; Firebase needs an email, so we build a fake one.
const emailFor = name => name.toLowerCase() + "@floppyflop.app";
const validName = name => /^[A-Za-z0-9_]{3,12}$/.test(name);
 
// ---- Talking to Firebase ----
async function authCall(action, body) {
  if (API_KEY.startsWith("PASTE")) throw new Error("The Firebase Web API key is missing in social.js.");
  let res, data;
  try {
    res = await fetchTimeout(`${AUTH_URL}:${action}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, returnSecureToken: true }),
    });
    data = await res.json();
  } catch {
    throw new Error("Can't connect. Check your internet.");
  }
  if (!res.ok) {
    const code = ((data.error && data.error.message) || "").split(/[ :]/)[0];
    throw new Error(AUTH_ERRORS[code] || "Something went wrong (" + code + ").");
  }
  return data;
}
 
function setTokens(d) {
  const u = Social.user;
  u.idToken = d.idToken || d.id_token;
  u.refreshToken = d.refreshToken || d.refresh_token;
  u.expires = Date.now() + (Number(d.expiresIn || d.expires_in) - 60) * 1000;
  try { localStorage.setItem("ff_session", JSON.stringify({ uid: u.uid, name: u.name, refreshToken: u.refreshToken })); } catch {}
}
 
async function token() {            // always returns a fresh login token
  const u = Social.user;
  if (Date.now() > u.expires) {
    const res = await fetchTimeout(`${TOKEN_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(u.refreshToken),
    });
    const d = await res.json();
    if (!res.ok) throw new Error("Session expired");
    setTokens(d);
  }
  return u.idToken;
}
 
async function dbCall(path, method = "GET", body) {   // database call as the logged-in user
  const t = await token();
  const res = await fetchTimeout(`${DB_URL}/${path}.json?auth=${t}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Database error " + res.status);
  return res.json();
}
 
// ---- Account actions ----
async function loadProfile() {
  const u = Social.user;
  let p = null;
  try { p = await dbCall(`users/${u.uid}`); } catch {}
  if (!p) {   // profile missing (e.g. first save failed) -> create it
    p = { name: u.name, bio: "", pfp: "skin:xyruz" };
    try { await dbCall(`usernames/${u.name.toLowerCase()}`, "PUT", u.uid); } catch {}
    try { await dbCall(`users/${u.uid}`, "PUT", p); } catch {}
  }
  u.name = p.name; u.bio = p.bio || ""; u.pfp = p.pfp || "skin:xyruz";
}
 
async function signUp(name, pass) {
  const d = await authCall("signUp", { email: emailFor(name), password: pass });
  Social.user = { uid: d.localId, name, bio: "", pfp: "skin:" + selected.id };
  setTokens(d);
  await dbCall(`usernames/${name.toLowerCase()}`, "PUT", Social.user.uid);
  await dbCall(`users/${Social.user.uid}`, "PUT", { name, bio: "", pfp: Social.user.pfp });
}
 
async function logIn(name, pass) {
  const d = await authCall("signInWithPassword", { email: emailFor(name), password: pass });
  Social.user = { uid: d.localId, name };
  setTokens(d);
  await loadProfile();
}
 
async function autoLogin() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem("ff_session")); } catch {}
  if (!s) return false;
  Social.user = { uid: s.uid, name: s.name, refreshToken: s.refreshToken, expires: 0 };
  try { await token(); await loadProfile(); return true; }
  catch { Social.user = null; return false; }
}
 
function logOut() {
  try { localStorage.removeItem("ff_session"); } catch {}
  Social.user = null;
  $("authPass").value = "";
  showAuth();
}
 
// ---- Profile pictures ----
function pfpSrc(p) {   // only trust our own two formats
  if (typeof p === "string" && p.startsWith("skin:")) return (SKINS.find(s => s.id === p.slice(5)) || SKINS[0]).src;
  if (typeof p === "string" && p.startsWith("data:image/jpeg;base64,")) return p;
  return SKINS[0].src;
}
 
function resizeImage(file) {   // square-crop to 96x96 so it stays tiny
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 96;
      const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}
 
// ---- Screens ----
const $ = id => document.getElementById(id);
let draftPfp = "";
 
function buildUI() {
  const stage = $("stage");
 
  const auth = document.createElement("div");
  auth.id = "auth"; auth.className = "ov";
  auth.innerHTML =
    `<h1>Flappy Squad</h1><p class="sub">Log in or create an account</p>
     <input id="authName" placeholder="Username (3-12 letters or numbers)" maxlength="12" autocomplete="username">
     <input id="authPass" type="password" placeholder="Password (6+ characters)" autocomplete="current-password">
     <p id="authMsg" class="msg"></p>
     <div class="row"><button id="loginBtn">Log in</button><button id="signupBtn" class="alt">Sign up</button></div>
     <p class="sub small">Keep your password safe. There is no email, so it can't be reset.</p>`;
  stage.appendChild(auth);
 
  const prof = document.createElement("div");
  prof.id = "prof"; prof.className = "ov"; prof.hidden = true;
  prof.innerHTML =
    `<h2>Your profile</h2>
     <img id="profPfp" class="big" alt="">
     <p class="sub">Pick a character face or upload your own photo</p>
     <div id="profFaces"></div>
     <label class="upload">Upload photo<input id="profFile" type="file" accept="image/*" hidden></label>
     <textarea id="profBio" maxlength="120" placeholder="Write something about you..."></textarea>
     <p id="profMsg" class="msg"></p>
     <div class="row"><button id="profSave">Save</button><button id="profClose" class="alt">Close</button></div>`;
  stage.appendChild(prof);
 
  const bar = document.createElement("div");
  bar.id = "acct";
  bar.innerHTML =
    `<img id="acctPfp" alt=""><div class="who"><b id="acctName"></b><small id="acctBio"></small></div>
     <button id="profBtn" class="alt">Profile</button><button id="outBtn" class="alt">Log out</button>`;
  menu.prepend(bar);
 
  SKINS.forEach(s => {
    const b = document.createElement("button");
    b.className = "face";
    b.innerHTML = `<img src="${s.src}" alt="${s.name}">`;
    b.onclick = () => { draftPfp = "skin:" + s.id; $("profPfp").src = s.src; };
    $("profFaces").appendChild(b);
  });
 
  const submit = fn => async () => {
    const name = $("authName").value.trim(), pass = $("authPass").value;
    if (!validName(name)) { $("authMsg").textContent = "Username: 3-12 letters, numbers or _ only."; return; }
    if (pass.length < 6) { $("authMsg").textContent = "Password needs at least 6 characters."; return; }
    $("authMsg").textContent = "Please wait...";
    try { await fn(name, pass); enterGame(); }
    catch (e) { $("authMsg").textContent = e.message; }
  };
  $("loginBtn").onclick = submit(logIn);
  $("signupBtn").onclick = submit(signUp);
  $("authPass").addEventListener("keydown", e => { if (e.key === "Enter") $("loginBtn").click(); });
 
  $("outBtn").onclick = logOut;
  $("profBtn").onclick = openProfile;
  $("profClose").onclick = () => { $("prof").hidden = true; };
  $("profFile").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { draftPfp = await resizeImage(f); $("profPfp").src = draftPfp; $("profMsg").textContent = ""; }
    catch { $("profMsg").textContent = "Couldn't read that picture."; }
  };
  $("profSave").onclick = async () => {
    const u = Social.user, bio = $("profBio").value.trim().slice(0, 120);
    $("profMsg").textContent = "Saving...";
    try {
      await dbCall(`users/${u.uid}`, "PATCH", { bio, pfp: draftPfp || u.pfp });
      u.bio = bio; u.pfp = draftPfp || u.pfp;
      refreshAcct();
      $("prof").hidden = true;
    } catch { $("profMsg").textContent = "Couldn't save. Try again."; }
  };
}
 
function showAuth() { $("authMsg").textContent = ""; $("prof").hidden = true; $("auth").hidden = false; }
 
function openProfile() {
  const u = Social.user;
  draftPfp = u.pfp;
  $("profPfp").src = pfpSrc(u.pfp);
  $("profBio").value = u.bio;
  $("profMsg").textContent = "";
  $("prof").hidden = false;
}
 
function refreshAcct() {
  const u = Social.user;
  $("acctPfp").src = pfpSrc(u.pfp);
  $("acctName").textContent = u.name;
  $("acctBio").textContent = u.bio || "No bio yet";
}
 
function enterGame() {
  $("auth").hidden = true;
  refreshAcct();
}
 
// ---- Hook into the game (game.js stays untouched) ----
nameInput.style.display = "none";   // the old username box isn't needed anymore
 
playBtn.onclick = () => {
  if (!Social.user) { showAuth(); return; }
  player = Social.user.name;
  playBtn.blur();
  menu.hidden = true;
  resetGame();
};
 
saveScore = async function (name, skinId, pts) {   // scores are now saved per account
  if (pts <= 0 || !Social.user) return;
  try {
    const path = `scores/${Social.user.uid}`;
    const mine = await dbCall(path);
    if (mine && mine.score >= pts) return;
    await dbCall(path, "PUT", { name: Social.user.name, skin: skinId, score: pts });
  } catch {}
};
 
buildUI();
autoLogin().then(ok => { if (ok) enterGame(); else showAuth(); });
