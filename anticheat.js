// anticheat.js - a "run timer" so the database can reject impossible scores.
// Every time a game starts, we ask the SERVER to write the start time. When a score is saved, the database rules
// check that the score is possible for the time that has really passed (a cheater can't claim 3000 points in 10 seconds).
// Load this AFTER extras.js / groups.js (anywhere near the end is fine). Needs the "runs" rule and the new "scores" rule.

{
  const _reset = resetGame;
  resetGame = function () {
    _reset();
    if (typeof Social !== "undefined" && Social.user) {
      rdb(`runs/${Social.user.uid}`, "PUT", { start: SV }).catch(() => {});
    }
  };
}