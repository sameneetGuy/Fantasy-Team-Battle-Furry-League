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
  const clone = JSON.parse(JSON.stringify(team));
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
    regionalPoints,
    seasonalScores,
    coefficientHistory: updatedHistory,
    nextSeasonSlots
  };
}
