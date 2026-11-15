// robot.js - replaces the boss face with a scary sphere robot that retreats when beaten.
// Load AFTER game.js (and the other scripts). It overrides the boss drawing and the boss "death".

BOSS_MOUTH.x = -96;   // the cannon tip, so shots come out of the barrel
BOSS_MOUTH.y = 38;

// When his ammo runs out he doesn't die: he flies away and you still get the reward.
startBossDeath = function () {
  boss.phase = "fleeing";
  boss.popped = true;      // hides the health bar
  boss.fleeT = 0;
  bullets.forEach(q => burst(q.x, q.y, "#ff6b6b", 8, 3));
  bullets = [];
  score += BOSS_REWARD;
  ring(boss.x, boss.y, "#ffffff", 200);
  ring(boss.x, boss.y, "#ff5252", 140);
  burst(boss.x, boss.y, "#ffd23f", 22, 8);
  burst(boss.x, boss.y, "#9aa3b2", 18, 6);
  floatText(boss.x - 30, boss.y - 100, "+" + BOSS_REWARD, "#ffd23f", 44, 1.4);
  shake = 14;
  toast("BOSS DEFEATED! It ran away! +" + BOSS_REWARD);
};

{
  const _ub = updateBoss;
  updateBoss = function (sec) {
    _ub(sec);
    if (!boss) return;
    if (boss.phase === "fight" && boss.hp <= boss.maxHp / 2 && tick % 7 === 0) {   // smoking and sparking when hurt
      addParticle({ type: "circle", x: boss.x + (Math.random() - 0.5) * 60, y: boss.y + (Math.random() - 0.5) * 60,
        vx: 0.5, vy: -0.8, g: 0, life: 0.5, max: 0.5, s: 4 + Math.random() * 4, color: Math.random() < 0.5 ? "#555c66" : "#ff9a2f" });
    }
    if (boss.phase === "fleeing") {
      boss.fleeT += sec;
      boss.x += (2 + boss.fleeT * 9) * dt;           // speeds up as he escapes
      if (tick % 2 === 0) addParticle({ type: "circle", x: boss.x + BOSS_R, y: boss.y + (Math.random() - 0.5) * 40,
        vx: 1 + Math.random(), vy: (Math.random() - 0.5), g: 0, life: 0.5, max: 0.5, s: 6 + Math.random() * 6, color: Math.random() < 0.5 ? "#ff9a2f" : "#7a7f88" });
      if (boss.x > canvas.width + BOSS_R + 80) boss = null;   // gone: normal pipes come back
    }
  };
}

drawBoss = function () {
  if (!boss || boss.phase === "incoming") return;
  const fleeing = boss.phase === "fleeing", R = BOSS_R, t = boss.t, flash = boss.flash > 0;
  ctx.save();
  ctx.translate(boss.x, boss.y);
  const sc = 1 + boss.kick * 0.07;
  ctx.scale(sc, sc);
  if (fleeing) ctx.rotate(Math.sin(t * 18) * 0.08);

  if (fleeing) {   // thruster flame (he flies away to the right)
    const f = 30 + Math.random() * 25;
    ctx.fillStyle = "#ff9a2f"; ctx.beginPath(); ctx.moveTo(R - 6, -18); ctx.lineTo(R + f, 0); ctx.lineTo(R - 6, 18); ctx.fill();
    ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.moveTo(R - 6, -9); ctx.lineTo(R + f * 0.6, 0); ctx.lineTo(R - 6, 9); ctx.fill();
  }

  // antenna with a blinking red light
  ctx.strokeStyle = "#2a2f38"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(14, -R + 4); ctx.lineTo(24, -R - 26); ctx.stroke();
  ctx.fillStyle = Math.floor(t * 4) % 2 === 0 ? "#ff3b3b" : "#7a1c1c";
  ctx.beginPath(); ctx.arc(24, -R - 28, 7, 0, 7); ctx.fill();

  // metal sphere with a red glow
  ctx.shadowColor = "#ff2a2a"; ctx.shadowBlur = fleeing ? 12 : 30;
  const g = ctx.createRadialGradient(-28, -32, 8, 0, 0, R);
  g.addColorStop(0, "#9aa6b6"); g.addColorStop(0.45, "#505b6a"); g.addColorStop(1, "#14181f");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();   // everything below stays inside the sphere
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = "#0b0e13"; ctx.lineWidth = 3;   // panel seams
  ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.28, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, R * 0.32, R, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = "#1c222b";                         // rivets
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, 3.2, 0, 7); ctx.fill(); }
  if (boss.hp <= boss.maxHp / 2) {                   // cracks when hurt
    ctx.strokeStyle = "#ff5a3a"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(30, -60); ctx.lineTo(18, -30); ctx.lineTo(34, -8); ctx.lineTo(22, 18);
    ctx.moveTo(-50, 30); ctx.lineTo(-30, 44); ctx.lineTo(-38, 64); ctx.stroke();
  }
  ctx.fillStyle = "#07090c"; ctx.beginPath(); ctx.arc(-14, -10, 34, 0, 7); ctx.fill();   // eye socket
  const eg = ctx.createRadialGradient(-18, -12, 2, -14, -10, 28);
  eg.addColorStop(0, "#fff1a8"); eg.addColorStop(0.3, "#ff5a3a"); eg.addColorStop(1, "#8a0000");
  ctx.globalAlpha = fleeing ? 0.35 : 0.8 + 0.2 * Math.sin(t * 6);
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(-14, -10, 26, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#050607"; ctx.beginPath(); ctx.ellipse(-20, -10, 5, 22, 0, 0, 7); ctx.fill();   // slit pupil
  ctx.fillStyle = "#0d1015"; ctx.beginPath();                                                    // angry brow
  ctx.moveTo(-58, -44); ctx.lineTo(22, -14); ctx.lineTo(22, -30); ctx.lineTo(-52, -62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#07090c"; ctx.fillRect(-36, 44, 74, 22);                                      // teeth grille
  ctx.fillStyle = "#c9d1dc";
  for (let i = 0; i < 8; i++) {
    const x = -34 + i * 9.4;
    ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x + 4.7, 56); ctx.lineTo(x + 9.4, 44); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 2, 66); ctx.lineTo(x + 6.7, 55); ctx.lineTo(x + 11.4, 66); ctx.fill();
  }
  if (flash) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(-R, -R, R * 2, R * 2); }
  ctx.restore();

  ctx.lineWidth = 5; ctx.strokeStyle = flash ? "#ffffff" : "#1a1f27";
  ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();

  // the cannon that fires the shots
  ctx.fillStyle = "#222831"; ctx.fillRect(BOSS_MOUTH.x, BOSS_MOUTH.y - 9, 40, 18);
  ctx.fillStyle = "#0b0e13"; ctx.fillRect(BOSS_MOUTH.x - 4, BOSS_MOUTH.y - 12, 9, 24);
  if (boss.phase === "fight" && boss.shootT < 0.4) {   // muzzle charges up before each shot
    const k = 1 - boss.shootT / 0.4;
    ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 20; ctx.fillStyle = "#ff5252";
    ctx.beginPath(); ctx.arc(BOSS_MOUTH.x - 2, BOSS_MOUTH.y, 4 + 10 * k, 0, 7); ctx.fill();
  }
  ctx.restore();
};
