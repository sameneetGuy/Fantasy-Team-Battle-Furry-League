const MCL_LED_REGION = "LEDpunkElite";
const MCL_REGIONAL_POOL = [
  "CyberpunkUnderground",
  "DieselpunkCold",
  "SteampunkDesert",
  "SolarpunkForest"
];

const MCL_DEFAULT_SPOTS = {
  CyberpunkUnderground: 4,
  DieselpunkCold: 3,
  SteampunkDesert: 3,
  SolarpunkForest: 2
};

function createEmptyCoefficientHistory() {
  const history = {};
  [MCL_LED_REGION, ...MCL_REGIONAL_POOL].forEach(region => {
    history[region] = [];
  });
  return history;
}

function cloneTournamentTeam(team) {
  // Drop the circular "team" references on fighters while cloning
  const clone = JSON.parse(JSON.stringify(team, (key, value) => {
    if (key === "team") {
      return undefined; // omit this property from the cloned structure
    }
    return value;
  }));

  resetTeamForTournament(clone);
  return clone;
}

function resetTeamForTournament(team) {
  team.fighters.forEach(f => {
    f.fatigue = 0;
    f.injury = null;
    f.currentSP = f.maxSP;
    f.playedThisMatch = false;
    f.wasKOdThisMatch = false;
    f.status = { buff: [], debuff: [] };
  });
}

function initializeRegionPoints() {
  const points = {};
  [MCL_LED_REGION, ...MCL_REGIONAL_POOL].forEach(region => {
    points[region] = 0;
  });
  return points;
}

function computeMCLSlotsForSeason(coefficientHistory, seasonNumber) {
  if (seasonNumber <= 1) {
    return { ...MCL_DEFAULT_SPOTS };
  }

  const totals = {};

  MCL_REGIONAL_POOL.forEach(region => {
    const history = coefficientHistory[region] || [];
    let useCount = 3;
    if (seasonNumber === 2) useCount = 1;
    else if (seasonNumber === 3) useCount = 2;

    const relevant = history.slice(0, useCount);
    const sum = relevant.reduce((acc, val) => acc + val, 0);
    totals[region] = sum;
  });

  const ranking = [...MCL_REGIONAL_POOL].sort((a, b) => {
    if (totals[b] !== totals[a]) return totals[b] - totals[a];
    return a.localeCompare(b);
  });

  const allocationOrder = [4, 3, 3, 2];
  const slots = {};
  ranking.forEach((region, idx) => {
    slots[region] = allocationOrder[idx];
  });

  return slots;
}

function pickQualifiersByRegion(teams, slots, domesticStandings) {
  const byRegion = {};
  teams.forEach(team => {
    if (!byRegion[team.region]) byRegion[team.region] = [];
    byRegion[team.region].push(team);
  });

  Object.keys(byRegion).forEach(region => {
    byRegion[region].sort((a, b) => a.name.localeCompare(b.name));
  });

  const qualifiers = [];

  Object.entries(slots).forEach(([region, count]) => {
    const pool = byRegion[region] || [];

    if (domesticStandings && domesticStandings[region]) {
      const ordering = domesticStandings[region]
        .map(id => pool.find(t => t.id === id))
        .filter(Boolean);
      const unordered = pool.filter(t => !domesticStandings[region].includes(t.id));
      pool.length = 0;
      pool.push(...ordering, ...unordered);
    }

    qualifiers.push(...pool.slice(0, count));
  });

  return qualifiers;
}

function initializeConferenceTable(teamList) {
  const table = {};
  teamList.forEach(team => {
    table[team.id] = {
      team,
      points: 0,
      spFor: 0,
      spAgainst: 0
    };
  });
  return table;
}

function recordConferenceResult(result, teamA, teamB, table, regionPoints) {
  const entryA = table[teamA.id];
  const entryB = table[teamB.id];

  if (result.winner === "A") {
    entryA.points += 2;
    regionPoints[teamA.region] += 2;
  } else if (result.winner === "B") {
    entryB.points += 2;
    regionPoints[teamB.region] += 2;
  } else {
    entryA.points += 1;
    entryB.points += 1;
    regionPoints[teamA.region] += 1;
    regionPoints[teamB.region] += 1;
  }

  entryA.spFor += result.winsA;
  entryA.spAgainst += result.winsB;
  entryB.spFor += result.winsB;
  entryB.spAgainst += result.winsA;
}

function sortConferenceTable(table) {
  return Object.values(table).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.spFor - a.spAgainst;
    const diffB = b.spFor - b.spAgainst;
    if (diffB !== diffA) return diffB - diffA;
    if (b.spFor !== a.spFor) return b.spFor - a.spFor;
    return a.team.name.localeCompare(b.team.name);
  });
}

function playBo2Match(teamA, teamB) {
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

function playBo3Series(teamA, teamB) {
  const lineupA = pickLineup(teamA);
  const lineupB = pickLineup(teamB);

  markPlayed(lineupA);
  markPlayed(lineupB);

  const result = runMatch(lineupA, lineupB);

  applyMatchFatigue(teamA);
  applyMatchFatigue(teamB);
  progressInjuries(teamA);
  progressInjuries(teamB);
  recoverFatigueBetweenMatches(teamA);
  recoverFatigueBetweenMatches(teamB);

  return result;
}

function simulateConferencePhase(teamList, regionPoints, label) {
  const fixtures = generateRoundRobinFixtures(teamList);
  const table = initializeConferenceTable(teamList);
  const log = [`=== ${label} Round-Robin ===`];

  fixtures.forEach((roundMatches, roundIdx) => {
    log.push(`Round ${roundIdx + 1}`);
    roundMatches.forEach(([teamA, teamB]) => {
      const result = playBo2Match(teamA, teamB);
      recordConferenceResult(result, teamA, teamB, table, regionPoints);

      const desc =
        result.winner === "D"
          ? `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (Draw)`
          : `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (${result.winner === "A" ? teamA.name : teamB.name} win)`;
      log.push(` • ${desc}`);
    });

    teamList.forEach(team => recoverFatigueBetweenMatches(team));
  });

  return { table: sortConferenceTable(table), log };
}

function awardBonusForTopThree(table, regionPoints) {
  table.slice(0, 3).forEach(row => {
    regionPoints[row.team.region] += 1;
  });
}

function awardMatchOutcomePoints(seriesResult, teamA, teamB, regionPoints) {
  if (seriesResult.winner === "A") {
    regionPoints[teamA.region] += 2;
  } else if (seriesResult.winner === "B") {
    regionPoints[teamB.region] += 2;
  }
}

function updateCoefficientHistory(coefficientHistory, seasonalScores) {
  const updated = { ...coefficientHistory };
  [MCL_LED_REGION, ...MCL_REGIONAL_POOL].forEach(region => {
    const history = updated[region] ? [...updated[region]] : [];
    history.unshift(seasonalScores[region] || 0);
    updated[region] = history.slice(0, 3);
  });
  return updated;
}

function calculateSeasonalScores(regionPoints, teamCounts) {
  const scores = {};
  Object.entries(regionPoints).forEach(([region, pts]) => {
    const teams = teamCounts[region] || 0;
    scores[region] = teams > 0 ? pts / teams : 0;
  });
  return scores;
}

function simulateMCLSeason({
  seasonNumber = 1,
  teams = [],
  eliteTeams = [],
  coefficientHistory = createEmptyCoefficientHistory(),
  domesticStandings = null
}) {
  const slots = computeMCLSlotsForSeason(coefficientHistory, seasonNumber);
  const qualifiers = pickQualifiersByRegion(teams, slots, domesticStandings);

  const ledConferenceTeams = eliteTeams.map(cloneTournamentTeam);
  const continentalTeams = qualifiers.map(cloneTournamentTeam);

  const regionPoints = initializeRegionPoints();
  const teamCounts = { ...initializeRegionPoints() };
  ledConferenceTeams.forEach(t => teamCounts[t.region] = (teamCounts[t.region] || 0) + 1);
  continentalTeams.forEach(t => teamCounts[t.region] = (teamCounts[t.region] || 0) + 1);

  const ledPhase = simulateConferencePhase(ledConferenceTeams, regionPoints, "LED Conference");
  const continentalPhase = simulateConferencePhase(continentalTeams, regionPoints, "Continental Conference");

  awardBonusForTopThree(ledPhase.table, regionPoints);
  awardBonusForTopThree(continentalPhase.table, regionPoints);

  ledConferenceTeams.forEach(t => recoverFatigueBetweenMatches(t));
  continentalTeams.forEach(t => recoverFatigueBetweenMatches(t));

  const ledChampion = ledPhase.table[0].team;
  const led2 = ledPhase.table[1].team;
  const led3 = ledPhase.table[2].team;

  const contChampion = continentalPhase.table[0].team;
  const cont2 = continentalPhase.table[1].team;
  const cont3 = continentalPhase.table[2].team;

  const wildcardLed = playBo3Series(led2, led3);
  awardMatchOutcomePoints(wildcardLed, led2, led3, regionPoints);
  const ledWildcardWinner = wildcardLed.winner === "A" ? led2 : led3;

  const wildcardContinental = playBo3Series(cont2, cont3);
  awardMatchOutcomePoints(wildcardContinental, cont2, cont3, regionPoints);
  const continentalWildcardWinner = wildcardContinental.winner === "A" ? cont2 : cont3;

  const semifinalists = [ledChampion, contChampion, ledWildcardWinner, continentalWildcardWinner];
  semifinalists.forEach(team => regionPoints[team.region] += 2);

  const semifinal1 = playBo3Series(ledChampion, continentalWildcardWinner);
  awardMatchOutcomePoints(semifinal1, ledChampion, continentalWildcardWinner, regionPoints);
  const semi1Winner = semifinal1.winner === "A" ? ledChampion : continentalWildcardWinner;

  const semifinal2 = playBo3Series(contChampion, ledWildcardWinner);
  awardMatchOutcomePoints(semifinal2, contChampion, ledWildcardWinner, regionPoints);
  const semi2Winner = semifinal2.winner === "A" ? contChampion : ledWildcardWinner;

  regionPoints[semi1Winner.region] += 3;
  regionPoints[semi2Winner.region] += 3;

  const grandFinal = playBo3Series(semi1Winner, semi2Winner);
  awardMatchOutcomePoints(grandFinal, semi1Winner, semi2Winner, regionPoints);
  const champion = grandFinal.winner === "A" ? semi1Winner : semi2Winner;
  regionPoints[champion.region] += 5;

  const seasonalScores = calculateSeasonalScores(regionPoints, teamCounts);
  const updatedHistory = updateCoefficientHistory(coefficientHistory, seasonalScores);
  const nextSeasonSlots = computeMCLSlotsForSeason(updatedHistory, seasonNumber + 1);

  return {
    seasonNumber,
    slotsUsed: slots,
    ledConference: ledPhase,
    continentalConference: continentalPhase,
    wildcard: {
      led: { series: wildcardLed, winner: ledWildcardWinner },
      continental: { series: wildcardContinental, winner: continentalWildcardWinner }
    },
    semifinals: {
      semifinal1: { series: semifinal1, pairing: [ledChampion, continentalWildcardWinner] },
      semifinal2: { series: semifinal2, pairing: [contChampion, ledWildcardWinner] },
      finalists: [semi1Winner, semi2Winner]
    },
    grandFinal: { series: grandFinal, champion },
    regionPoints,
    seasonalScores,
    coefficientHistory: updatedHistory,
    nextSeasonSlots
  };
}

// ---------------------------------------
// MCL DAY-BY-DAY STATE + STEP SIMULATION
// ---------------------------------------

/**
 * Build a state object that lets us advance the MCL in small steps
 * (conference round by conference round, then wildcards, semifinals, final).
 */
function createMCLSimulationState({
  seasonNumber = 1,
  teams = [],
  eliteTeams = [],
  coefficientHistory = createEmptyCoefficientHistory(),
  domesticStandings = null
}) {
  // Compute slots + qualifiers exactly like the full-season helper
  const slots = computeMCLSlotsForSeason(coefficientHistory, seasonNumber);
  const qualifiers = pickQualifiersByRegion(teams, slots, domesticStandings);

  // Clone tournament teams so they don't share circular refs with league squads
  const ledConferenceTeams = eliteTeams.map(cloneTournamentTeam);
  const continentalTeams = qualifiers.map(cloneTournamentTeam);

  const regionPoints = initializeRegionPoints();
  const teamCounts = { ...initializeRegionPoints() };
  ledConferenceTeams.forEach(t => { teamCounts[t.region] = (teamCounts[t.region] || 0) + 1; });
  continentalTeams.forEach(t => { teamCounts[t.region] = (teamCounts[t.region] || 0) + 1; });

  // Round-robin fixtures + tables
  const ledFixtures = generateRoundRobinFixtures(ledConferenceTeams);
  const contFixtures = generateRoundRobinFixtures(continentalTeams);

  const ledTableObj = initializeConferenceTable(ledConferenceTeams);
  const contTableObj = initializeConferenceTable(continentalTeams);

  return {
    seasonNumber,
    slotsUsed: slots,
    coefficientHistoryIn: coefficientHistory,
    led: {
      teams: ledConferenceTeams,
      fixtures: ledFixtures,
      tableObj: ledTableObj,
      tableSorted: [],
      roundIndex: 0,
      completed: ledFixtures.length === 0
    },
    continental: {
      teams: continentalTeams,
      fixtures: contFixtures,
      tableObj: contTableObj,
      tableSorted: [],
      roundIndex: 0,
      completed: contFixtures.length === 0
    },
    regionPoints,
    teamCounts,
    bonusesAwarded: false,            // top 3 conference bonuses
    semifinalistsAwarded: false,      // +2 for 4 semifinalists
    wildcards: {
      stage: 0,                       // 0 = none, 1 = LED done, 2 = both done, 3 = finished
      ledSeries: null,
      contSeries: null,
      ledWinner: null,
      contWinner: null
    },
    semifinals: {
      stage: 0,                       // 0 = none, 1 = semi1 done, 2 = semi2 done
      semifinal1: null,
      semifinal2: null,
      finalist1: null,
      finalist2: null
    },
    final: {
      played: false,
      series: null,
      champion: null
    },
    completed: false,
    result: null
  };
}

/**
 * Advance the current MCL simulation state by ONE logical step.
 * Returns { lines, completed, result? }.
 */
function runNextMCLStep(state) {
  if (!state) {
    return { lines: ["MCL state not initialized."], completed: true, result: null };
  }

  const lines = [];

  if (state.completed) {
    lines.push("MCL season already completed.");
    return { lines, completed: true, result: state.result };
  }

  // -----------------------------
  // 1) LED CONFERENCE ROUND-ROBIN
  // -----------------------------
  if (!state.led.completed) {
    const roundIdx = state.led.roundIndex;
    const fixtures = state.led.fixtures;

    if (!fixtures || fixtures.length === 0) {
      state.led.completed = true;
    } else if (roundIdx < fixtures.length) {
      lines.push("=== MCL LED Conference ===");
      lines.push(`Round ${roundIdx + 1}`);

      const matches = fixtures[roundIdx] || [];
      matches.forEach(([teamA, teamB]) => {
        const result = playBo2Match(teamA, teamB);
        recordConferenceResult(result, teamA, teamB, state.led.tableObj, state.regionPoints);

        const desc =
          result.winner === "D"
            ? `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (Draw)`
            : `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (${result.winner === "A" ? teamA.name : teamB.name} win)`;
        lines.push(`  ${desc}`);
      });

      state.led.teams.forEach(team => recoverFatigueBetweenMatches(team));

      state.led.roundIndex += 1;
      if (state.led.roundIndex >= fixtures.length) {
        state.led.completed = true;
        state.led.tableSorted = sortConferenceTable(state.led.tableObj);
        const leader = state.led.tableSorted[0];
        if (leader) {
          lines.push(`LED Conference complete. Top team: ${leader.team.name} (${leader.points} pts).`);
        }
      }

      return { lines, completed: false, result: null };
    } else {
      state.led.completed = true;
    }
  }

  // --------------------------------
  // 2) CONTINENTAL CONFERENCE ROUNDS
  // --------------------------------
  if (!state.continental.completed) {
    const roundIdx = state.continental.roundIndex;
    const fixtures = state.continental.fixtures;

    if (!fixtures || fixtures.length === 0) {
      state.continental.completed = true;
    } else if (roundIdx < fixtures.length) {
      lines.push("=== MCL Continental Conference ===");
      lines.push(`Round ${roundIdx + 1}`);

      const matches = fixtures[roundIdx] || [];
      matches.forEach(([teamA, teamB]) => {
        const result = playBo2Match(teamA, teamB);
        recordConferenceResult(result, teamA, teamB, state.continental.tableObj, state.regionPoints);

        const desc =
          result.winner === "D"
            ? `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (Draw)`
            : `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (${result.winner === "A" ? teamA.name : teamB.name} win)`;
        lines.push(`  ${desc}`);
      });

      state.continental.teams.forEach(team => recoverFatigueBetweenMatches(team));

      state.continental.roundIndex += 1;
      if (state.continental.roundIndex >= fixtures.length) {
        state.continental.completed = true;
        state.continental.tableSorted = sortConferenceTable(state.continental.tableObj);
        const leader = state.continental.tableSorted[0];
        if (leader) {
          lines.push(`Continental Conference complete. Top team: ${leader.team.name} (${leader.points} pts).`);
        }
      }

      return { lines, completed: false, result: null };
    } else {
      state.continental.completed = true;
    }
  }

  // At this point both conferences are complete.
  // Ensure sorted tables exist.
  if (!state.led.tableSorted || state.led.tableSorted.length === 0) {
    state.led.tableSorted = sortConferenceTable(state.led.tableObj);
  }
  if (!state.continental.tableSorted || state.continental.tableSorted.length === 0) {
    state.continental.tableSorted = sortConferenceTable(state.continental.tableObj);
  }

  const ledTable = state.led.tableSorted;
  const contTable = state.continental.tableSorted;

  // ---------------------------------------
  // 3) AWARD +1 BONUS FOR TOP 3 IN EACH
  // ---------------------------------------
  if (!state.bonusesAwarded) {
    awardBonusForTopThree(ledTable, state.regionPoints);
    awardBonusForTopThree(contTable, state.regionPoints);
    state.bonusesAwarded = true;
    lines.push("Awarded regional bonuses for top 3 clubs in each conference.");
    return { lines, completed: false, result: null };
  }

  // -----------------
  // 4) WILDCARD STAGE
  // -----------------
  const w = state.wildcards;

  if (w.stage === 0) {
    // LED Wildcard: 2nd vs 3rd
    lines.push("=== MCL Wildcards ===");

    const led2 = ledTable[1].team;
    const led3 = ledTable[2].team;
    const series = playBo3Series(led2, led3);
    awardMatchOutcomePoints(series, led2, led3, state.regionPoints);

    const winner = series.winner === "A" ? led2 : led3;
    w.ledSeries = series;
    w.ledWinner = winner;
    w.stage = 1;

    lines.push(`${led2.name} ${series.winsA}-${series.winsB} ${led3.name} (${winner.name} wins)`);
    return { lines, completed: false, result: null };
  }

  if (w.stage === 1) {
    // Continental Wildcard: 2nd vs 3rd
    lines.push("=== MCL Wildcards ===");

    const cont2 = contTable[1].team;
    const cont3 = contTable[2].team;
    const series = playBo3Series(cont2, cont3);
    awardMatchOutcomePoints(series, cont2, cont3, state.regionPoints);

    const winner = series.winner === "A" ? cont2 : cont3;
    w.contSeries = series;
    w.contWinner = winner;
    w.stage = 2;

    lines.push(`${cont2.name} ${series.winsA}-${series.winsB} ${cont3.name} (${winner.name} wins)`);
    return { lines, completed: false, result: null };
  }

  if (w.stage < 3) {
    w.stage = 3;
  }

  // ---------------
  // 5) SEMIFINALS
  // ---------------
  const s = state.semifinals;

  const ledChampion = ledTable[0].team;
  const contChampion = contTable[0].team;
  const ledWildcardWinner = w.ledWinner;
  const contWildcardWinner = w.contWinner;

  // +2 for reaching the semifinals (all 4 teams), once
  if (!state.semifinalistsAwarded) {
    [ledChampion, contChampion, ledWildcardWinner, contWildcardWinner].forEach(team => {
      if (team) state.regionPoints[team.region] += 2;
    });
    state.semifinalistsAwarded = true;
  }

  if (s.stage === 0) {
    // Semifinal 1: LED champion vs Continental wildcard winner
    lines.push("=== MCL Semifinals ===");

    const series = playBo3Series(ledChampion, contWildcardWinner);
    awardMatchOutcomePoints(series, ledChampion, contWildcardWinner, state.regionPoints);

    s.semifinal1 = { series, pairing: [ledChampion, contWildcardWinner] };
    const semi1Winner = series.winner === "A" ? ledChampion : contWildcardWinner;
    s.finalist1 = semi1Winner;
    s.stage = 1;

    // +3 bonus for making the final
    state.regionPoints[semi1Winner.region] += 3;

    lines.push(`${ledChampion.name} ${series.winsA}-${series.winsB} ${contWildcardWinner.name} (${semi1Winner.name} wins)`);
    return { lines, completed: false, result: null };
  }

  if (s.stage === 1) {
    // Semifinal 2: Continental champion vs LED wildcard winner
    lines.push("=== MCL Semifinals ===");

    const series = playBo3Series(contChampion, ledWildcardWinner);
    awardMatchOutcomePoints(series, contChampion, ledWildcardWinner, state.regionPoints);

    s.semifinal2 = { series, pairing: [contChampion, ledWildcardWinner] };
    const semi2Winner = series.winner === "A" ? contChampion : ledWildcardWinner;
    s.finalist2 = semi2Winner;
    s.stage = 2;

    // +3 bonus for making the final
    state.regionPoints[semi2Winner.region] += 3;

    lines.push(`${contChampion.name} ${series.winsA}-${series.winsB} ${ledWildcardWinner.name} (${semi2Winner.name} wins)`);
    return { lines, completed: false, result: null };
  }

  // -----------------
  // 6) GRAND FINAL
  // -----------------
  const f = state.final;

  if (!f.played) {
    lines.push("=== MCL Grand Final ===");

    const finalist1 = s.finalist1;
    const finalist2 = s.finalist2;

    const series = playBo3Series(finalist1, finalist2);
    awardMatchOutcomePoints(series, finalist1, finalist2, state.regionPoints);

    const champion = series.winner === "A" ? finalist1 : finalist2;
    // Champion bonus
    state.regionPoints[champion.region] += 5;

    f.series = series;
    f.champion = champion;
    f.played = true;

    // Season scoring + coefficient history
    const seasonalScores = calculateSeasonalScores(state.regionPoints, state.teamCounts);
    const updatedHistory = updateCoefficientHistory(state.coefficientHistoryIn, seasonalScores);
    const nextSeasonSlots = computeMCLSlotsForSeason(updatedHistory, state.seasonNumber + 1);

    const fullResult = {
      seasonNumber: state.seasonNumber,
      slotsUsed: state.slotsUsed,
      ledConference: { table: ledTable, log: [] },
      continentalConference: { table: contTable, log: [] },
      wildcard: {
        led: { series: state.wildcards.ledSeries, winner: state.wildcards.ledWinner },
        continental: { series: state.wildcards.contSeries, winner: state.wildcards.contWinner }
      },
      semifinals: {
        semifinal1: state.semifinals.semifinal1,
        semifinal2: state.semifinals.semifinal2,
        finalists: [state.semifinals.finalist1, state.semifinals.finalist2]
      },
      grandFinal: { series: state.final.series, champion },
      regionPoints: state.regionPoints,
      seasonalScores,
      coefficientHistory: updatedHistory,
      nextSeasonSlots
    };

    state.completed = true;
    state.result = fullResult;

    lines.push(`${finalist1.name} ${series.winsA}-${series.winsB} ${finalist2.name} (${champion.name} wins)`);
    lines.push(`Champion: ${champion.name}.`);

    return { lines, completed: true, result: fullResult };
  }

  // Safety fallback
  state.completed = true;
  return { lines, completed: true, result: state.result };
}
