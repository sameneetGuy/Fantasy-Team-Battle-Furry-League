// -----------------------------
// POSITION / ADJACENCY
// -----------------------------
function areAdjacent(posA, posB) {
  if (posA === "C" && (posB === "L" || posB === "R")) return true;
  if (posB === "C" && (posA === "L" || posA === "R")) return true;
  return false;
}

// -----------------------------
// TARGET VALIDATION
// -----------------------------
function canTarget(attacker, defender, rangeType) {
  if (rangeType === "projectile") return true;
  if (rangeType === "close") return areAdjacent(attacker.position, defender.position);
  return false;
}

// -----------------------------
// CONTEST ROLLS
// -----------------------------
function rollContest(attacker, defender, ability) {
  if (ability.rollType === "attack_vs_defense") {
    const a = d20() + getModifiedStat(attacker, "attack");
    let d = d20() + getModifiedStat(defender, "defense");

    if (ability.rangeType === "projectile" &&
        defender.speed >= attacker.speed + 3) {
      d += 2;
    }

    return (a > d) ? "hit" : "blocked";
  }

  if (ability.rollType === "speed_vs_speed") {
    const a = d20() + getModifiedStat(attacker, "speed");
    const d = d20() + getModifiedStat(defender, "speed");
    return (a > d) ? "success" : "fail";
  }

  return "fail";
}

// -----------------------------
// KNOCKBACK EFFECT
// -----------------------------
function applyKnockback(target, allyPositions) {
  if (target.position === "C") {
    // choose random L or R ally, if present
    const options = [];
    if (allyPositions.L) options.push("L");
    if (allyPositions.R) options.push("R");
    if (options.length === 0) return;
    const swapPos = options[Math.floor(Math.random() * options.length)];

    const other = allyPositions[swapPos];
    const old = target.position;

    target.position = swapPos;
    other.position = old;

  } else {
    // move L/R to C
    target.position = "C";
  }
}

// -----------------------------
// COVER LOGIC
// -----------------------------
function tryCover(defender, attacker, teamAllies) {
  const tank = teamAllies.find(a => a.role === "Tank" && a.currentSP > 0);
  if (!tank) return defender;

  // Tank must be adjacent
  if (!areAdjacent(tank.position, defender.position)) return defender;

  // Tank must not have used cover
  if (tank.coverUsedThisRound) return defender;

  // Projectile only
  if (attacker.rangeType !== "projectile") return defender;

  // Tank intercepts!
  tank.coverUsedThisRound = true;
  return tank;
}

// -----------------------------
// Injury LOGIC
// -----------------------------
const INJURY_CHANCES = {
  minor:    0.12, // 12% chance
  moderate: 0.06, // 6%
  major:    0.02  // 2%
};

function maybeInflictInjury(fighter) {
  // don’t re-injure if already injured
  if (fighter.injury && fighter.injury.gamesRemaining > 0) return;

  const roll = Math.random();

  if (roll < INJURY_CHANCES.major) {
    fighter.injury = { severity: "major", gamesRemaining: 6 };
  } else if (roll < INJURY_CHANCES.major + INJURY_CHANCES.moderate) {
    fighter.injury = { severity: "moderate", gamesRemaining: 3 };
  } else if (roll < INJURY_CHANCES.major + INJURY_CHANCES.moderate + INJURY_CHANCES.minor) {
    fighter.injury = { severity: "minor", gamesRemaining: 1 };
  }
}

// -----------------------------
// APPLY SP DAMAGE
// -----------------------------
function dealSP(target, amount) {
  const oldSP = target.currentSP;
  target.currentSP -= amount;
  if (target.currentSP < 0) target.currentSP = 0;

  if (oldSP > 0 && target.currentSP === 0) {
    // Knocked out
    target.wasKOdThisMatch = true;
    maybeInflictInjury(target);
  }
}

// -----------------------------
// ACTION RESOLUTION
// -----------------------------
function performAction(attacker, ability, teamA, teamB, log) {
  const targets = selectTargets(attacker, ability, teamA, teamB);

  if (targets.length === 0) {
    log.push(`${attacker.name} has no valid targets for ${ability.name}.`);
    return;
  }

  for (let defender of targets) {

    // COVER only for projectile abilities targeting enemies
    if (ability.rangeType === "projectile" && ability.targetType !== "self") {
      const allies = attacker.team === teamA ? teamA : teamB;
      const originalDefender = defender;
      defender = tryCover(defender, attacker, allies);

      if (defender !== originalDefender) {
        log.push(`${defender.name} intercepts the attack to protect ${originalDefender.name}!`);
      }
    }

    let result = "success";
    if (ability.rollType !== "none") {
      result = rollContest(attacker, defender, ability);
    }

    if (result === "hit" || result === "success") {
      log.push(`${attacker.name} uses ${ability.name} on ${defender.name} – HIT.`);

      const beforeSP = defender.currentSP;

      if (ability.spOnHit) {
        dealSP(defender, ability.spOnHit);
        const lost = beforeSP - defender.currentSP;
        if (lost > 0) {
          log.push(`  ${defender.name} loses ${lost} SP (now ${defender.currentSP}/${defender.maxSP}).`);
        }
      }

      applyStatus(defender, ability);

      if (defender.currentSP === 0) {
        log.push(`  ${defender.name} is KO'd!`);
        if (defender.injury) {
          log.push(`  ${defender.name} suffered a ${defender.injury.severity} injury (out for ${defender.injury.gamesRemaining} game(s)).`);
        }
      }

      if (ability.tags?.includes("knockback")) {
        const enemyTeam = attacker.team === teamA ? teamB : teamA;
        const allies = enemyTeam.reduce((o, f) => { o[f.position] = f; return o; }, {});
        applyKnockback(defender, allies);
        log.push(`  ${defender.name} is knocked into a new position (${defender.position}).`);
      }
    } else {
      log.push(`${attacker.name} uses ${ability.name} on ${defender.name} – MISSED.`);
    }
  }
}

function applyStatus(target, ability) {
  if (ability.buff) {
    target.status.buff.push({
      stat: ability.buff.stat,
      amount: ability.buff.amount,
      duration: ability.buff.duration
    });
  }

  if (ability.debuff) {
    target.status.debuff.push({
      stat: ability.debuff.stat,
      amount: ability.debuff.amount,
      duration: ability.debuff.duration
    });
  }
}

function tickStatuses(fighter) {
  fighter.status.buff = fighter.status.buff.filter(s => --s.duration > 0);
  fighter.status.debuff = fighter.status.debuff.filter(s => --s.duration > 0);
}

function selectTargets(attacker, ability, teamA, teamB) {

  const enemies = attacker.team === teamA ? teamB : teamA;
  const allies  = attacker.team === teamA ? teamA : teamB;

  const aliveEnemies = enemies.filter(f => f.currentSP > 0);
  const aliveAllies  = allies.filter(f => f.currentSP > 0);

  switch (ability.targetType) {

    case "self":
      return [attacker];

    case "single":
      // Pick lowest SP enemy (focus fire)
      return [ aliveEnemies.sort((a,b)=>a.currentSP-b.currentSP)[0] ];

    case "aoe_2":
      return aliveEnemies
        .sort((a,b)=>a.currentSP-b.currentSP)
        .slice(0, 2);

    case "aoe_all_enemies":
      return aliveEnemies;

    case "aoe_all_allies":
      return aliveAllies;

    case "aoe_self_allies":
      // Self + allies
      return aliveAllies;

    default:
      return [];
  }
}

function getModifiedStat(fighter, stat) {
  let base = fighter[stat];

  // buffs
  for (const b of fighter.status.buff) {
    if (b.stat === stat) base += b.amount;
  }

  // debuffs
  for (const d of fighter.status.debuff) {
    if (d.stat === stat) base += d.amount;
  }

  // FATIGUE PENALTY
  // fatigueScaled = fatigue compared to stamina
  const fatigueRatio = fighter.stamina > 0 ? fighter.fatigue / fighter.stamina : fighter.fatigue;
  const fatiguePenalty = Math.floor(fatigueRatio * 2); // tweak multiplier if you want it harsher/softer

  base -= fatiguePenalty;

  return Math.max(1, base);
}

function applyMatchFatigue(team, { extraForKO = 1, baseFatigue = 2 } = {}) {
  for (const f of team.fighters) {
    if (!f.playedThisMatch) continue; // you’ll mark this before/after match for starters

    let gain = baseFatigue;
    if (f.wasKOdThisMatch) gain += extraForKO;

    f.fatigue += gain;
  }
}

function recoverFatigueBetweenMatches(team) {
  for (const f of team.fighters) {
    const restGain = f.playedThisMatch ? 1 : 2; // amount to recover
    f.fatigue = Math.max(0, f.fatigue - restGain);

    // Reset match flags
    f.playedThisMatch = false;
    f.wasKOdThisMatch = false;
  }
}

function chooseAbility(attacker) {
  const a = attacker.abilities;

  // Priority 1: single-target finisher
  const killshot = a.find(x => x.spOnHit >= 1 && x.targetType === "single");
  if (killshot) return killshot;

  // Priority 2: any AoE you have
  const aoe = a.find(x =>
    x.targetType === "aoe_2" ||
    x.targetType === "aoe_all_enemies"
  );
  if (aoe) return aoe;

  // Priority 3: self-buffs if low SP
  if (attacker.currentSP <= 1) {
    const buff = a.find(x => x.targetType === "self" || x.targetType === "aoe_self_allies");
    if (buff) return buff;
  }

  // Priority 4: default ability or basic strike
  return a[0] || attacker.basicStrike;
}

// -----------------------------
// FULL ROUND
// -----------------------------
function runRound(teamA, teamB, log) {
  // Reset SP and per-round flags
  for (const f of [...teamA, ...teamB]) {
    f.currentSP = f.maxSP;
    f.coverUsedThisRound = false;
    f.status.buff = [];
    f.status.debuff = [];
  }

  const positions = ["L", "C", "R"];
  teamA.forEach((f, i) => f.position = positions[i]);
  teamB.forEach((f, i) => f.position = positions[i]);

  let fighters = [...teamA, ...teamB].filter(f => f.currentSP > 0);
  fighters.forEach(f => f.init = d20() + getModifiedStat(f, "speed"));
  fighters.sort((a, b) => b.init - a.init);

  log.push("=== New Round Begins ===");
  log.push(`Turn order: ${fighters.map(f => f.name).join(", ")}`);

  while (teamA.some(f => f.currentSP > 0) && teamB.some(f => f.currentSP > 0)) {
    for (const f of fighters) {
      if (f.currentSP <= 0) continue;

      const enemies = (f.team === teamA ? teamB : teamA).filter(e => e.currentSP > 0);
      if (enemies.length === 0) break;

      tickStatuses(f);

      const ability = chooseAbility(f);
      log.push(`${f.name}'s turn. (${f.role}) uses ${ability.name}.`);

      performAction(f, ability, teamA, teamB, log);

      if (!teamA.some(x => x.currentSP > 0) || !teamB.some(x => x.currentSP > 0)) break;
    }
  }

  const winner = teamA.some(f => f.currentSP > 0) ? "A" : "B";
  log.push(`=== Round ends. Winner: Team ${winner} ===`);
  return winner;
}

// -----------------------------
// FULL MATCH (BEST OF 3)
// -----------------------------
function runMatch(teamA, teamB) {
  let winsA = 0, winsB = 0;
  const log = [];

  teamA.forEach(f => { f.team = teamA; });
  teamB.forEach(f => { f.team = teamB; });

  let roundNumber = 1;

  while (winsA < 2 && winsB < 2) {
    log.push(`\n##### ROUND ${roundNumber} #####`);

    const winner = runRound(teamA, teamB, log);

    if (winner === "A") {
      winsA++;
      log.push(`Team A wins round ${roundNumber} (total: ${winsA}-${winsB}).`);
    } else {
      winsB++;
      log.push(`Team B wins round ${roundNumber} (total: ${winsA}-${winsB}).`);
    }

    roundNumber++;
  }

  const matchWinner = (winsA > winsB) ? "A" : "B";
  log.push(`\n===== MATCH OVER: Team ${matchWinner} wins ${winsA}-${winsB} =====`);

  return { winner: matchWinner, winsA, winsB, log };
}

// -----------------------------
// LEAGUE MATCH: BEST OF 2 (DRAWS POSSIBLE)
// -----------------------------
function runLeagueMatch(teamA, teamB) {
  let winsA = 0, winsB = 0;
  const log = [];

  // Attach team references (same as runMatch)
  teamA.forEach(f => { f.team = teamA; });
  teamB.forEach(f => { f.team = teamB; });

  for (let roundNumber = 1; roundNumber <= 2; roundNumber++) {
    log.push(`\n##### LEAGUE ROUND ${roundNumber} #####`);

    const winner = runRound(teamA, teamB, log);

    if (winner === "A") {
      winsA++;
      log.push(`Team A wins round ${roundNumber} (total: ${winsA}-${winsB}).`);
    } else {
      winsB++;
      log.push(`Team B wins round ${roundNumber} (total: ${winsA}-${winsB}).`);
    }
  }

  let matchWinner;
  if (winsA > winsB) matchWinner = "A";
  else if (winsB > winsA) matchWinner = "B";
  else matchWinner = "D"; // draw

  log.push(`\n===== LEAGUE MATCH OVER: ${winsA}-${winsB} (${matchWinner === "D" ? "DRAW" : "Team " + matchWinner + " wins"}) =====`);

  return { winner: matchWinner, winsA, winsB, log };
}
