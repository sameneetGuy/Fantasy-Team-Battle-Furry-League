function buildRegionalLeagues(teams) {
  const byRegion = {};

  // group teams
  for (const t of teams) {
    if (!byRegion[t.region]) byRegion[t.region] = [];
    byRegion[t.region].push(t);
  }

  const regionLeagues = {};

  for (const region in byRegion) {
    const list = byRegion[region];
    const N = list.length;

    const leaguesCount = Math.min(4, Math.max(1, Math.floor(N / 8)));

    // split into tiers
    const tiers = [];
    let idx = 0;
    for (let l = 0; l < leaguesCount; l++) {

      const teamsInThisTier = Math.ceil((N - idx) / (leaguesCount - l));

      tiers.push(list.slice(idx, idx + teamsInThisTier));
      idx += teamsInThisTier;
    }

    regionLeagues[region] = tiers;
  }

  return regionLeagues;
}

function generateRoundRobinFixtures(teamList) {
  const teams = [...teamList];

  // If odd number of teams, add a dummy
  if (teams.length % 2 === 1) {
    teams.push(null);
  }

  const rounds = [];
  const n = teams.length;
  const half = n / 2;

  for (let r = 0; r < n - 1; r++) {
    const matches = [];

    for (let i = 0; i < half; i++) {
      const t1 = teams[i];
      const t2 = teams[n - 1 - i];
      if (t1 && t2) matches.push([t1, t2]);
    }

    rounds.push(matches);

    // Rotate teams (except first)
    const fixed = teams[0];
    const rotated = teams.splice(1);
    rotated.unshift(rotated.pop());
    teams.splice(1, 0, ...rotated);
  }

  return rounds;
}

function initializeLeagueTable(teamList) {
  const table = {};
  for (const t of teamList) {
    table[t.id] = {
      team: t,
      points: 0,
      played: 0,
      wins: 0,
	  draws: 0,
      losses: 0,
      spFor: 0,
      spAgainst: 0
    };
  }
  return table;
}

function applyMatchToTable(result, teamA, teamB, table) {
  const entryA = table[teamA.id];
  const entryB = table[teamB.id];

  entryA.played++;
  entryB.played++;

  if (result.winner === "A") {
    entryA.wins++;
    entryB.losses++;
    entryA.points += 3;
  } else if (result.winner === "B") {
    entryB.wins++;
    entryA.losses++;
    entryB.points += 3;
  } else if (result.winner === "D") {
    entryA.draws++;
    entryB.draws++;
    // draw: 1 point each
    entryA.points += 1;
    entryB.points += 1;
  }

  // Use winsA/winsB as tie-breaker metric (like "rounds won")
  entryA.spFor     += result.winsA;
  entryA.spAgainst += result.winsB;

  entryB.spFor     += result.winsB;
  entryB.spAgainst += result.winsA;
}

function simulateLeagueMatch(teamA, teamB) {
  const lineupA = pickLineup(teamA);
  const lineupB = pickLineup(teamB);

  markPlayed(lineupA);
  markPlayed(lineupB);

  const result = runLeagueMatch(lineupA, lineupB);

  applyMatchFatigue(teamA);
  applyMatchFatigue(teamB);

  progressInjuries(teamA);
  progressInjuries(teamB);

  return result;
}

function simulateAllLeagues() {
  if (!GLOBAL_LEAGUES) {
    renderLeagueLog(["Leagues not initialized yet."]);
    return;
  }

  const lines = [];
  lines.push("=== Domestic League Simulation ===");
  const results = {};

  for (const region in GLOBAL_LEAGUES) {
    const tiers = GLOBAL_LEAGUES[region];
    if (!tiers || tiers.length === 0) continue;

    results[region] = [];

    lines.push(`\n### Region: ${region} ###`);

    tiers.forEach((tierTeams, tierIndex) => {
      if (!tierTeams || tierTeams.length < 2) {
        lines.push(` Tier ${tierIndex + 1}: Not enough teams to form a league.`);
        return;
      }

      const seasonResult = simulateLeagueSeason(tierTeams); // {fixtures, table}
      results[region][tierIndex] = seasonResult;

      lines.push(` Tier ${tierIndex + 1} Final Table:`);

      seasonResult.table.forEach((row, index) => {
        const diff = row.spFor - row.spAgainst;
        lines.push(
          `  ${index + 1}. ${row.team.name} - ${row.points} pts (W:${row.wins} D:${row.draws} L:${row.losses}) [SP diff: ${diff}]`
        );
      });
    });
  }

  GLOBAL_LEAGUE_RESULTS = results;
  renderLeagueLog(lines);

  // Refresh current table if selectors are set
  renderCurrentLeagueTable();
}

function simulateLeagueSeason(regionTeams) {
  const fixtures = generateRoundRobinFixtures(regionTeams);
  const table = initializeLeagueTable(regionTeams);
  const logLines = [];

  for (let round = 0; round < fixtures.length; round++) {
    logLines.push(`Round ${round + 1}`);

    for (const [teamA, teamB] of fixtures[round]) {
      const result = simulateLeagueMatch(teamA, teamB);

      let line;
      if (result.winner === "D") {
        line = `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (Draw)`;
      } else {
        const winnerName = result.winner === "A" ? teamA.name : teamB.name;
        line = `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (${winnerName} win)`;
      }
      logLines.push(`• ${line}`);

      applyMatchToTable(result, teamA, teamB, table);
    }

    // After each round, recover fatigue for all teams
    for (const t of regionTeams) {
      recoverFatigueBetweenMatches(t);
    }
  }

  // Convert table object to sorted array
  const sorted = Object.values(table).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.spFor - a.spAgainst;
    const diffB = b.spFor - b.spAgainst;
    return diffB - diffA;
  });

  return { fixtures, table: sorted, log: logLines };
}

function progressInjuries(team) {
  for (const f of team.fighters) {
    if (!f.injury) continue;

    f.injury.gamesRemaining -= 1;
    if (f.injury.gamesRemaining <= 0) {
      f.injury = null; // fully recovered
    }
  }
}

function isFighterAvailable(fighter) {
  return !fighter.injury || fighter.injury.gamesRemaining <= 0;
}

function pickLineup(team) {
  // 1 Tank, 1 DPS, 1 Support, all available
  const tank = team.fighters.find(f => f.role === "Tank" && isFighterAvailable(f));
  const dps  = team.fighters.find(f => f.role === "DPS" && isFighterAvailable(f));
  const sup  = team.fighters.find(f => f.role === "Support" && isFighterAvailable(f));

  // you can add more logic if one role is missing, but this is the base
  return [tank, dps, sup].filter(Boolean);
}

function markPlayed(lineup) {
  for (const f of lineup) {
    f.playedThisMatch = true;
  }
}
