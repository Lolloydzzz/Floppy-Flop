// Cute cartoon profile pictures (SVG). Used only in the profile picker.
const svg = body =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${body}</svg>`);

// shared face parts
const eyes = (y = 64, c = "#2b2b2b") =>
  `<circle cx="46" cy="${y}" r="7.5" fill="${c}"/><circle cx="82" cy="${y}" r="7.5" fill="${c}"/>` +
  `<circle cx="48.5" cy="${y - 3}" r="2.8" fill="#fff"/><circle cx="84.5" cy="${y - 3}" r="2.8" fill="#fff"/>`;
const blush = (y = 82) =>
  `<ellipse cx="32" cy="${y}" rx="8" ry="5" fill="#ff8fa3" opacity=".6"/>` +
  `<ellipse cx="96" cy="${y}" rx="8" ry="5" fill="#ff8fa3" opacity=".6"/>`;
const smile = (y = 84) =>
  `<path d="M54 ${y} Q64 ${y + 10} 74 ${y}" fill="none" stroke="#2b2b2b" stroke-width="3.5" stroke-linecap="round"/>`;

const AVATAR_DATA = {
  // Xyruz: orange kitty
  xyruz: svg(
    `<rect width="128" height="128" fill="#ffe3b3"/>` +
    `<polygon points="22,48 28,10 58,30" fill="#f4a259"/><polygon points="106,48 100,10 70,30" fill="#f4a259"/>` +
    `<polygon points="30,38 32,20 46,30" fill="#ffb3c1"/><polygon points="98,38 96,20 82,30" fill="#ffb3c1"/>` +
    `<circle cx="64" cy="70" r="44" fill="#f4a259"/>` +
    `<path d="M64 26 L58 40 M64 26 L70 40" stroke="#d9822b" stroke-width="4" stroke-linecap="round"/>` +
    `<ellipse cx="64" cy="86" rx="22" ry="16" fill="#fff3e0"/>` +
    eyes(64) + blush(80) +
    `<polygon points="59,76 69,76 64,83" fill="#ff7b9c"/>` +
    `<path d="M64 83 Q56 92 50 86 M64 83 Q72 92 78 86" fill="none" stroke="#2b2b2b" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M16 76 L38 80 M16 90 L38 86 M112 76 L90 80 M112 90 L90 86" stroke="#7a4a1a" stroke-width="2.5" stroke-linecap="round"/>`
  ),

  // Nogz: teddy bear
  nogz: svg(
    `<rect width="128" height="128" fill="#cfe8ff"/>` +
    `<circle cx="28" cy="32" r="18" fill="#a47148"/><circle cx="100" cy="32" r="18" fill="#a47148"/>` +
    `<circle cx="28" cy="32" r="9" fill="#e0b48a"/><circle cx="100" cy="32" r="9" fill="#e0b48a"/>` +
    `<circle cx="64" cy="70" r="44" fill="#a47148"/>` +
    `<ellipse cx="64" cy="84" rx="20" ry="15" fill="#ecd0ac"/>` +
    eyes(62) + blush(80) +
    `<ellipse cx="64" cy="77" rx="7" ry="5" fill="#3b2314"/>` +
    `<path d="M64 82 L64 88 M64 88 Q57 95 52 89 M64 88 Q71 95 76 89" fill="none" stroke="#3b2314" stroke-width="3" stroke-linecap="round"/>`
  ),

  // Penerz: pink-eared bunny
  penerz: svg(
    `<rect width="128" height="128" fill="#ffd6e8"/>` +
    `<ellipse cx="44" cy="30" rx="12" ry="30" fill="#fff" transform="rotate(-10 44 30)"/>` +
    `<ellipse cx="84" cy="30" rx="12" ry="30" fill="#fff" transform="rotate(10 84 30)"/>` +
    `<ellipse cx="44" cy="32" rx="6" ry="22" fill="#ffb3c9" transform="rotate(-10 44 32)"/>` +
    `<ellipse cx="84" cy="32" rx="6" ry="22" fill="#ffb3c9" transform="rotate(10 84 32)"/>` +
    `<circle cx="64" cy="78" r="40" fill="#fff"/>` +
    eyes(72, "#3a2b4d") + blush(88) +
    `<ellipse cx="64" cy="82" rx="5" ry="3.5" fill="#ff7b9c"/>` +
    `<path d="M64 85 Q58 94 53 89 M64 85 Q70 94 75 89" fill="none" stroke="#3a2b4d" stroke-width="3" stroke-linecap="round"/>` +
    `<rect x="60" y="92" width="8" height="9" rx="2" fill="#fff" stroke="#e5c3d3" stroke-width="1.5"/>`
  ),

  // Renxu: fox
  renxu: svg(
    `<rect width="128" height="128" fill="#fff0c2"/>` +
    `<polygon points="14,56 22,8 58,32" fill="#ff8a3d"/><polygon points="114,56 106,8 70,32" fill="#ff8a3d"/>` +
    `<polygon points="24,44 27,22 42,32" fill="#3b2314"/><polygon points="104,44 101,22 86,32" fill="#3b2314"/>` +
    `<circle cx="64" cy="68" r="44" fill="#ff8a3d"/>` +
    `<path d="M20 78 Q40 70 64 100 Q88 70 108 78 Q104 108 64 114 Q24 108 20 78Z" fill="#fff"/>` +
    eyes(62, "#2b1a12") +
    `<ellipse cx="64" cy="92" rx="6" ry="4.5" fill="#2b1a12"/>` +
    `<path d="M64 96 Q58 103 53 98 M64 96 Q70 103 75 98" fill="none" stroke="#2b1a12" stroke-width="3" stroke-linecap="round"/>`
  ),

  // Ven: panda
  ven: svg(
    `<rect width="128" height="128" fill="#d8f5d0"/>` +
    `<circle cx="26" cy="30" r="17" fill="#2b2b2b"/><circle cx="102" cy="30" r="17" fill="#2b2b2b"/>` +
    `<circle cx="64" cy="70" r="44" fill="#fff"/>` +
    `<ellipse cx="44" cy="64" rx="13" ry="16" fill="#2b2b2b" transform="rotate(20 44 64)"/>` +
    `<ellipse cx="84" cy="64" rx="13" ry="16" fill="#2b2b2b" transform="rotate(-20 84 64)"/>` +
    `<circle cx="45" cy="63" r="6" fill="#fff"/><circle cx="83" cy="63" r="6" fill="#fff"/>` +
    `<circle cx="46" cy="64" r="3.2" fill="#2b2b2b"/><circle cx="82" cy="64" r="3.2" fill="#2b2b2b"/>` +
    `<ellipse cx="64" cy="82" rx="7" ry="5" fill="#2b2b2b"/>` +
    `<path d="M64 86 Q57 95 52 89 M64 86 Q71 95 76 89" fill="none" stroke="#2b2b2b" stroke-width="3" stroke-linecap="round"/>` +
    blush(90)
  ),

  // Zigvin: happy frog
  zigvin: svg(
    `<rect width="128" height="128" fill="#e0f7fa"/>` +
    `<ellipse cx="64" cy="78" rx="48" ry="40" fill="#6fcf6f"/>` +
    `<circle cx="38" cy="42" r="19" fill="#6fcf6f"/><circle cx="90" cy="42" r="19" fill="#6fcf6f"/>` +
    `<circle cx="38" cy="42" r="14" fill="#fff"/><circle cx="90" cy="42" r="14" fill="#fff"/>` +
    `<circle cx="40" cy="44" r="7" fill="#2b2b2b"/><circle cx="88" cy="44" r="7" fill="#2b2b2b"/>` +
    `<circle cx="42" cy="41" r="2.5" fill="#fff"/><circle cx="90" cy="41" r="2.5" fill="#fff"/>` +
    `<path d="M32 82 Q64 114 96 82" fill="#d9534f" stroke="#2b5d2b" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M44 94 Q64 106 84 94 Q64 100 44 94Z" fill="#ff9aa8"/>` +
    `<circle cx="56" cy="70" r="2.5" fill="#2b5d2b"/><circle cx="72" cy="70" r="2.5" fill="#2b5d2b"/>` +
    `<ellipse cx="24" cy="80" rx="7" ry="4.5" fill="#ff8fa3" opacity=".6"/><ellipse cx="104" cy="80" rx="7" ry="4.5" fill="#ff8fa3" opacity=".6"/>`
  ),

  // Emanski: penguin
  emanski: svg(
    `<rect width="128" height="128" fill="#d6f0ff"/>` +
    `<circle cx="64" cy="68" r="46" fill="#2d3e63"/>` +
    `<path d="M64 38 C34 38 28 66 40 88 C48 102 80 102 88 88 C100 66 94 38 64 38Z" fill="#fff"/>` +
    `<circle cx="48" cy="64" r="7.5" fill="#2b2b2b"/><circle cx="80" cy="64" r="7.5" fill="#2b2b2b"/>` +
    `<circle cx="50.5" cy="61" r="2.8" fill="#fff"/><circle cx="82.5" cy="61" r="2.8" fill="#fff"/>` +
    `<polygon points="54,76 74,76 64,90" fill="#ff9f1c"/>` +
    `<ellipse cx="36" cy="78" rx="7" ry="4.5" fill="#ff8fa3" opacity=".6"/><ellipse cx="92" cy="78" rx="7" ry="4.5" fill="#ff8fa3" opacity=".6"/>` +
    `<path d="M50 24 Q64 12 78 24" fill="none" stroke="#7ee8f5" stroke-width="4" stroke-linecap="round"/>`
  ),

  // Lloydie: baby dino
  lloydie: svg(
    `<rect width="128" height="128" fill="#e8dcff"/>` +
    `<polygon points="40,34 48,10 58,32" fill="#9b6dff"/><polygon points="56,28 64,4 74,28" fill="#9b6dff"/>` +
    `<polygon points="70,32 80,10 88,34" fill="#9b6dff"/>` +
    `<circle cx="64" cy="70" r="44" fill="#5ad1b3"/>` +
    `<circle cx="34" cy="52" r="5" fill="#3fb596"/><circle cx="96" cy="56" r="6" fill="#3fb596"/><circle cx="90" cy="42" r="3.5" fill="#3fb596"/>` +
    `<ellipse cx="64" cy="88" rx="26" ry="16" fill="#b7f0de"/>` +
    eyes(64, "#2b2b2b") + blush(82) +
    `<circle cx="57" cy="82" r="2.2" fill="#2f8f77"/><circle cx="71" cy="82" r="2.2" fill="#2f8f77"/>` +
    `<path d="M54 92 Q64 100 74 92" fill="none" stroke="#2b2b2b" stroke-width="3.5" stroke-linecap="round"/>`
  ),
};


const AVATARS = Object.keys(AVATAR_DATA).map(id => ({ id, name: id, src: AVATAR_DATA[id] }));