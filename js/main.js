let GLOBAL_TEAMS = [];
let GLOBAL_ELITE_TEAMS = [];
let GLOBAL_LEAGUES = null;          // from buildRegionalLeagues
let GLOBAL_LEAGUE_RESULTS = {};     // filled after simulateAllLeagues
let GLOBAL_MCL_COEFFICIENTS = createEmptyCoefficientHistory();
let GLOBAL_MCL_SEASON = 1;
let GLOBAL_MCL_LAST_RESULT = null;
let GLOBAL_LEAGUE_SIM_STATE = null;
let GLOBAL_MCL_SIM_STATE = null;
let GLOBAL_CURRENT_DAY = 1;
let GLOBAL_DAY_LOG_LINES = [];

async function startNewGame() {
  const { teams: teamData, abilities: abilityData, elite: eliteData } = await loadGameData();

  const ALL_ABILITIES = abilityData.abilities;
  const rawTeams = teamData.teams;

  const teams = rawTeams
    .map(t => buildTeam(t, ALL_ABILITIES))
    .filter(Boolean);

  const eliteTeams = eliteData.teams
    .map(t => buildTeam(t, ALL_ABILITIES))
    .filter(Boolean);

  GLOBAL_TEAMS = teams;
  GLOBAL_ELITE_TEAMS = eliteTeams;
  GLOBAL_LEAGUES = buildRegionalLeagues(teams);
  GLOBAL_MCL_COEFFICIENTS = createEmptyCoefficientHistory();
  GLOBAL_MCL_SEASON = 1;
  GLOBAL_MCL_LAST_RESULT = null;
  GLOBAL_LEAGUE_SIM_STATE = createLeagueSimulationState(GLOBAL_LEAGUES);
  GLOBAL_MCL_SIM_STATE = null;
  GLOBAL_CURRENT_DAY = 1;
  GLOBAL_DAY_LOG_LINES = [];
  GLOBAL_LEAGUE_RESULTS = buildLeagueResultsFromState(GLOBAL_LEAGUE_SIM_STATE);

  renderLeagueLog([]);

  console.log("Teams:", GLOBAL_TEAMS);
  console.log("LED Elite Teams:", GLOBAL_ELITE_TEAMS);
  console.log("Regional Leagues:", GLOBAL_LEAGUES);

  initLeagueSelectors();
  renderMCLPlaceholder();
}

function renderMCLPlaceholder() {
  const seasonLabel = document.getElementById("mcl-season-label");
  const championLabel = document.getElementById("mcl-champion-label");
  const slotSummary = document.getElementById("mcl-slot-summary");
  const conferences = document.getElementById("mcl-conferences");
  const playoffs = document.getElementById("mcl-playoffs");
  const coeffs = document.getElementById("mcl-coefficients");

  if (seasonLabel) seasonLabel.textContent = "No MCL season simulated yet.";
  if (championLabel) championLabel.textContent = "Champion: —";
  if (slotSummary) slotSummary.innerHTML = "<span class=\"pill subtle\">Season 1 allocation defaults to 4/3/3/2.</span>";

  const placeholder = "<p class=\"muted-compact\">Run an MCL season to view standings and playoff results.</p>";
  if (conferences) conferences.innerHTML = placeholder;
  if (playoffs) playoffs.innerHTML = placeholder;
  if (coeffs) coeffs.innerHTML = placeholder;
}

function renderMCLPlaceholder() {
  const seasonLabel = document.getElementById("mcl-season-label");
  const championLabel = document.getElementById("mcl-champion-label");
  const slotSummary = document.getElementById("mcl-slot-summary");
  const conferences = document.getElementById("mcl-conferences");
  const playoffs = document.getElementById("mcl-playoffs");
  const coeffs = document.getElementById("mcl-coefficients");

  if (seasonLabel) seasonLabel.textContent = "No MCL season simulated yet.";
  if (championLabel) championLabel.textContent = "Champion: —";
  if (slotSummary) slotSummary.innerHTML = "<span class=\"pill subtle\">Season 1 allocation defaults to 4/3/3/2.</span>";

  const placeholder = "<p class=\"muted-compact\">Run an MCL season to view standings and playoff results.</p>";
  if (conferences) conferences.innerHTML = placeholder;
  if (playoffs) playoffs.innerHTML = placeholder;
  if (coeffs) coeffs.innerHTML = placeholder;
}

function initLeagueSelectors() {
  const regionSelect = document.getElementById("league-region");
  const tierSelect = document.getElementById("league-tier");

  if (!GLOBAL_LEAGUES || !regionSelect || !tierSelect) return;

  // Populate region options
  regionSelect.innerHTML = "";
  Object.keys(GLOBAL_LEAGUES).forEach(region => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region;
    regionSelect.appendChild(opt);
  });

  regionSelect.addEventListener("change", () => {
    updateTierSelector();
    renderCurrentLeagueTable();
  });

  tierSelect.addEventListener("change", () => {
    renderCurrentLeagueTable();
  });

  // Initialize tier options for the first region
  updateTierSelector();
}

function updateTierSelector() {
  const regionSelect = document.getElementById("league-region");
  const tierSelect = document.getElementById("league-tier");

  if (!regionSelect || !tierSelect) return;

  const region = regionSelect.value;
  const tiers = GLOBAL_LEAGUES && GLOBAL_LEAGUES[region] ? GLOBAL_LEAGUES[region] : [];

  tierSelect.innerHTML = "";
  tiers.forEach((_, index) => {
    const opt = document.createElement("option");
    opt.value = String(index);
    opt.textContent = `Tier ${index + 1}`;
    tierSelect.appendChild(opt);
  });

  if (tiers.length > 0) {
    tierSelect.value = "0";
  }
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
  return text.replace(/[&<>]/g, m => map[m]);
}

function highlightLeagueLine(line) {
  let html = escapeHtml(line);

  const replacements = [
    { regex: /(===.*?===)/g, cls: "token-heading" },
    { regex: /(Region:\s*[^:]+)/g, cls: "token-keyword" },
    { regex: /(Tier\s+\d+)/g, cls: "token-tier" },
    { regex: /(Champion|Result|wins)/gi, cls: "token-accent" },
    { regex: /(\b\d+\b)/g, cls: "token-number" }
  ];

  replacements.forEach(({ regex, cls }) => {
    html = html.replace(regex, `<span class="${cls}">$1</span>`);
  });

  return html;
}

function createCodeLine(text) {
  const line = document.createElement("div");
  line.className = "code-line";
  line.innerHTML = highlightLeagueLine(text);
  return line;
}

function buildLeagueLogTree(lines) {
  const tree = { intro: [], regions: [] };
  let currentRegion = null;
  let currentTier = null;

  lines.forEach(line => {
    if (/^\s*$/.test(line)) return;

    if (line.startsWith("Region:")) {
      if (currentRegion) tree.regions.push(currentRegion);
      currentRegion = { title: line.trim(), tiers: [], extra: [] };
      currentTier = null;
      return;
    }

    if (/^\s*Tier\s+\d+/.test(line) && currentRegion) {
      if (currentTier) currentRegion.tiers.push(currentTier);
      currentTier = { title: line.trim(), lines: [] };
      return;
    }

    if (currentTier) {
      currentTier.lines.push(line);
    } else if (currentRegion) {
      currentRegion.extra.push(line);
    } else {
      tree.intro.push(line);
    }
  });

  if (currentTier && currentRegion) currentRegion.tiers.push(currentTier);
  if (currentRegion) tree.regions.push(currentRegion);
  return tree;
}

function renderRegionBlock(region) {
  const details = document.createElement("details");
  details.className = "code-fold";
  details.open = true;

  const summary = document.createElement("summary");
  summary.innerHTML = highlightLeagueLine(region.title);
  details.appendChild(summary);

  region.extra.forEach(line => {
    details.appendChild(createCodeLine(line));
  });

  region.tiers.forEach(tier => {
    const tierDetails = document.createElement("details");
    tierDetails.className = "code-fold";
    tierDetails.open = true;

    const tierSummary = document.createElement("summary");
    tierSummary.innerHTML = highlightLeagueLine(tier.title);
    tierDetails.appendChild(tierSummary);

    tier.lines.forEach(line => tierDetails.appendChild(createCodeLine(line)));
    details.appendChild(tierDetails);
  });

  return details;
}

function renderLeagueLog(lines) {
  const viewer = document.getElementById("league-log-viewer");
  if (!viewer) return;

  viewer.innerHTML = "";

  if (!lines || lines.length === 0) {
    viewer.appendChild(createCodeLine("(no league simulations run yet)"));
    return;
  }

  const tree = buildLeagueLogTree(lines);
  const fragment = document.createDocumentFragment();

  tree.intro.forEach(line => fragment.appendChild(createCodeLine(line)));
  tree.regions.forEach(region => fragment.appendChild(renderRegionBlock(region)));

  viewer.appendChild(fragment);
}

function appendToLeagueLog(lines) {
  GLOBAL_DAY_LOG_LINES.push(...lines);
  renderLeagueLog(GLOBAL_DAY_LOG_LINES);
}

function simulateCurrentMCLSeason(domesticStandings = null) {
  if (!GLOBAL_TEAMS || GLOBAL_TEAMS.length === 0 || !GLOBAL_ELITE_TEAMS || GLOBAL_ELITE_TEAMS.length === 0) {
    console.warn("MCL cannot run until teams are loaded.");
    return null;
  }

  const result = simulateMCLSeason({
    seasonNumber: GLOBAL_MCL_SEASON,
    teams: GLOBAL_TEAMS,
    eliteTeams: GLOBAL_ELITE_TEAMS,
    coefficientHistory: GLOBAL_MCL_COEFFICIENTS,
    domesticStandings
  });

  GLOBAL_MCL_COEFFICIENTS = result.coefficientHistory;
  GLOBAL_MCL_SEASON += 1;

  console.log(`MCL Season ${result.seasonNumber} complete. Champion: ${result.grandFinal.champion.name}`);
  console.log("Next season slots:", result.nextSeasonSlots);
  return result;
}

function formatRegion(region) {
  return region.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function describeSlots(slots) {
  return MCL_REGIONAL_POOL
    .map(region => `${formatRegion(region)} ${slots[region] || 0}`)
    .join(" • ");
}

function buildConferenceTableElement(title, tableRows) {
  const wrapper = document.createElement("div");
  const table = document.createElement("table");
  table.className = "mini-table";

  const caption = document.createElement("caption");
  caption.textContent = title;
  table.appendChild(caption);

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>#</th>
      <th>Team</th>
      <th>Pts</th>
      <th>SP For</th>
      <th>SP Against</th>
      <th>SP Diff</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  tableRows.forEach((row, idx) => {
    const diff = row.spFor - row.spAgainst;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${row.team.name}</td>
      <td>${row.points}</td>
      <td>${row.spFor}</td>
      <td>${row.spAgainst}</td>
      <td>${diff}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function formatSeriesLine(series, teamA, teamB) {
  const winnerName = series.winner === "A" ? teamA.name : teamB.name;
  return `${teamA.name} ${series.winsA}-${series.winsB} ${teamB.name} (${winnerName})`;
}

function addBracketBox(container, title, lines) {
  const box = document.createElement("div");
  box.className = "bracket-box";

  const heading = document.createElement("h4");
  heading.textContent = title;
  box.appendChild(heading);

  lines.forEach(text => {
    const p = document.createElement("div");
    p.className = "bracket-line";
    p.textContent = text;
    box.appendChild(p);
  });

  container.appendChild(box);
}

function renderMCLPlayoffs(result) {
  const playoffs = document.getElementById("mcl-playoffs");
  if (!playoffs) return;
  playoffs.innerHTML = "";

  const led2 = result.ledConference.table[1].team;
  const led3 = result.ledConference.table[2].team;
  const cont2 = result.continentalConference.table[1].team;
  const cont3 = result.continentalConference.table[2].team;

  addBracketBox(playoffs, "Wildcards", [
    formatSeriesLine(result.wildcard.led.series, led2, led3),
    formatSeriesLine(result.wildcard.continental.series, cont2, cont3)
  ]);

  const [semi1A, semi1B] = result.semifinals.semifinal1.pairing;
  const [semi2A, semi2B] = result.semifinals.semifinal2.pairing;

  addBracketBox(playoffs, "Semifinals", [
    formatSeriesLine(result.semifinals.semifinal1.series, semi1A, semi1B),
    formatSeriesLine(result.semifinals.semifinal2.series, semi2A, semi2B)
  ]);

  const [finalA, finalB] = result.semifinals.finalists;
  addBracketBox(playoffs, "Grand Final", [
    formatSeriesLine(result.grandFinal.series, finalA, finalB),
    `Champion: ${result.grandFinal.champion.name}`
  ]);
}

function renderMCLCoefficients(result) {
  const coeffs = document.getElementById("mcl-coefficients");
  if (!coeffs) return;
  coeffs.innerHTML = "";

  const table = document.createElement("table");
  table.className = "mini-table";

  const caption = document.createElement("caption");
  caption.textContent = "Regional Coefficients";
  table.appendChild(caption);

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Region</th>
      <th>Season Score</th>
      <th>Last 3 Seasons</th>
      <th>Next Slots</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  [MCL_LED_REGION, ...MCL_REGIONAL_POOL].forEach(region => {
    const tr = document.createElement("tr");
    const seasonal = (result.seasonalScores[region] || 0).toFixed(2);
    const history = result.coefficientHistory[region] || [];
    const historyText = history.length > 0 ? history.join(", ") : "-";
    const nextSlots = region === MCL_LED_REGION
      ? "12 (permanent)"
      : `${result.nextSeasonSlots[region] || 0}`;

    tr.innerHTML = `
      <td>${formatRegion(region)}</td>
      <td>${seasonal}</td>
      <td>${historyText}</td>
      <td>${nextSlots}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  coeffs.appendChild(table);
}

function renderMCLConferences(result) {
  const conferences = document.getElementById("mcl-conferences");
  if (!conferences) return;
  conferences.innerHTML = "";

  const ledTable = buildConferenceTableElement("LED Conference", result.ledConference.table);
  const continentalTable = buildConferenceTableElement("Continental Conference", result.continentalConference.table);

  conferences.appendChild(ledTable);
  conferences.appendChild(continentalTable);
}

function renderMCLSlots(result) {
  const slotSummary = document.getElementById("mcl-slot-summary");
  if (!slotSummary) return;
  slotSummary.innerHTML = "";

  const current = document.createElement("span");
  current.className = "pill";
  current.textContent = `Season ${result.seasonNumber} slots: ${describeSlots(result.slotsUsed)}`;

  const next = document.createElement("span");
  next.className = "pill subtle";
  next.textContent = `Next season preview: ${describeSlots(result.nextSeasonSlots)}`;

  slotSummary.appendChild(current);
  slotSummary.appendChild(next);
}

function renderMCLResult(result) {
  const seasonLabel = document.getElementById("mcl-season-label");
  const championLabel = document.getElementById("mcl-champion-label");

  if (seasonLabel) seasonLabel.textContent = `MCL Season ${result.seasonNumber}`;
  if (championLabel) championLabel.textContent = `Champion: ${result.grandFinal.champion.name}`;

  renderMCLSlots(result);
  renderMCLConferences(result);
  renderMCLPlayoffs(result);
  renderMCLCoefficients(result);
}

function createLeagueSimulationState(leagues) {
  const state = { regions: {}, completed: false };
  if (!leagues) return state;

  Object.entries(leagues).forEach(([region, tiers]) => {
    state.regions[region] = tiers.map(teamList => ({
      teams: teamList,
      fixtures: generateRoundRobinFixtures(teamList),
      currentRound: 0,
      table: initializeLeagueTable(teamList)
    }));
  });

  return state;
}

function buildLeagueResultsFromState(state) {
  const results = {};
  if (!state || !state.regions) return results;

  Object.entries(state.regions).forEach(([region, tiers]) => {
    results[region] = tiers.map(tierState => {
      const sorted = Object.values(tierState.table).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.spFor - a.spAgainst;
        const diffB = b.spFor - b.spAgainst;
        return diffB - diffA;
      });
      return { table: sorted };
    });
  });

  return results;
}

function runNextLeagueDay(state) {
  const lines = [`Day ${GLOBAL_CURRENT_DAY}: Domestic Leagues`];
  let anyMatches = false;

  Object.entries(state.regions).forEach(([region, tiers]) => {
    tiers.forEach((tierState, tierIndex) => {
      if (!tierState.fixtures || tierState.currentRound >= tierState.fixtures.length) return;
      anyMatches = true;

      lines.push(` Region ${region} - Tier ${tierIndex + 1} (Round ${tierState.currentRound + 1})`);
      tierState.fixtures[tierState.currentRound].forEach(([teamA, teamB]) => {
        const result = simulateLeagueMatch(teamA, teamB);
        applyMatchToTable(result, teamA, teamB, tierState.table);

        const winnerName =
          result.winner === "D"
            ? "Draw"
            : (result.winner === "A" ? teamA.name : teamB.name);

        const line = result.winner === "D"
          ? `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (Draw)`
          : `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (${winnerName})`;
        lines.push(`  • ${line}`);
      });

      tierState.currentRound += 1;
      tierState.teams.forEach(t => recoverFatigueBetweenMatches(t));
    });
  });

  state.completed = Object.values(state.regions).every(tiers =>
    tiers.every(tierState => !tierState.fixtures || tierState.currentRound >= tierState.fixtures.length)
  );

  return { lines, anyMatches };
}

function ensureMCLSeasonState() {
  if (GLOBAL_MCL_SIM_STATE && !GLOBAL_MCL_SIM_STATE.completed) return;

  const domesticOrdering = buildDomesticOrderingFromResults();
  GLOBAL_MCL_SIM_STATE = createMCLSeasonState({
    seasonNumber: GLOBAL_MCL_SEASON,
    teams: GLOBAL_TEAMS,
    eliteTeams: GLOBAL_ELITE_TEAMS,
    coefficientHistory: GLOBAL_MCL_COEFFICIENTS,
    domesticStandings: domesticOrdering
  });
}

function createMCLSeasonState({ seasonNumber, teams, eliteTeams, coefficientHistory, domesticStandings }) {
  const slots = computeMCLSlotsForSeason(coefficientHistory, seasonNumber);
  const qualifiers = pickQualifiersByRegion(teams, slots, domesticStandings);

  const ledConferenceTeams = eliteTeams.map(cloneTournamentTeam);
  const continentalTeams = qualifiers.map(cloneTournamentTeam);

  const regionPoints = initializeRegionPoints();
  const teamCounts = { ...initializeRegionPoints() };
  ledConferenceTeams.forEach(t => teamCounts[t.region] = (teamCounts[t.region] || 0) + 1);
  continentalTeams.forEach(t => teamCounts[t.region] = (teamCounts[t.region] || 0) + 1);

  return {
    seasonNumber,
    slotsUsed: slots,
    led: {
      teams: ledConferenceTeams,
      fixtures: generateRoundRobinFixtures(ledConferenceTeams),
      currentRound: 0,
      table: initializeConferenceTable(ledConferenceTeams),
      log: []
    },
    continental: {
      teams: continentalTeams,
      fixtures: generateRoundRobinFixtures(continentalTeams),
      currentRound: 0,
      table: initializeConferenceTable(continentalTeams),
      log: []
    },
    wildcard: null,
    semifinals: null,
    grandFinal: null,
    stage: "conferences",
    regionPoints,
    teamCounts,
    coefficientHistory,
    nextSeasonSlots: null,
    completed: false
  };
}

function getConferenceTable(state) {
  return sortConferenceTable(state.table);
}

function simulateMCLConferenceRound(state) {
  const lines = [`Day ${GLOBAL_CURRENT_DAY}: MCL Conference Round ${state.led.currentRound + 1}`];

  const runRound = (confState, label) => {
    if (confState.currentRound >= confState.fixtures.length) return;
    lines.push(` ${label}`);
    confState.fixtures[confState.currentRound].forEach(([teamA, teamB]) => {
      const result = playBo2Match(teamA, teamB);
      recordConferenceResult(result, teamA, teamB, confState.table, state.regionPoints);

      const desc = result.winner === "D"
        ? `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (Draw)`
        : `${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (${result.winner === "A" ? teamA.name : teamB.name} win)`;
      lines.push(`  • ${desc}`);
      confState.log.push(desc);
    });
    confState.currentRound += 1;
    confState.teams.forEach(team => recoverFatigueBetweenMatches(team));
  };

  runRound(state.led, "LED Conference");
  runRound(state.continental, "Continental Conference");

  const ledDone = state.led.currentRound >= state.led.fixtures.length;
  const continentalDone = state.continental.currentRound >= state.continental.fixtures.length;

  if (ledDone && continentalDone) {
    lines.push(" Conferences completed. Moving to Wildcards.");
    state.stage = "wildcards";
    state.led.tableSorted = getConferenceTable(state.led);
    state.continental.tableSorted = getConferenceTable(state.continental);
    awardBonusForTopThree(state.led.tableSorted, state.regionPoints);
    awardBonusForTopThree(state.continental.tableSorted, state.regionPoints);
    state.led.teams.forEach(t => recoverFatigueBetweenMatches(t));
    state.continental.teams.forEach(t => recoverFatigueBetweenMatches(t));
  }

  return lines;
}

function simulateMCLWildcards(state) {
  const lines = [`Day ${GLOBAL_CURRENT_DAY}: MCL Wildcards`];
  const led2 = state.led.tableSorted[1].team;
  const led3 = state.led.tableSorted[2].team;
  const cont2 = state.continental.tableSorted[1].team;
  const cont3 = state.continental.tableSorted[2].team;

  const wildcardLed = playBo3Series(led2, led3);
  awardMatchOutcomePoints(wildcardLed, led2, led3, state.regionPoints);
  const ledWildcardWinner = wildcardLed.winner === "A" ? led2 : led3;

  const wildcardContinental = playBo3Series(cont2, cont3);
  awardMatchOutcomePoints(wildcardContinental, cont2, cont3, state.regionPoints);
  const continentalWildcardWinner = wildcardContinental.winner === "A" ? cont2 : cont3;

  state.wildcard = {
    led: { series: wildcardLed, winner: ledWildcardWinner },
    continental: { series: wildcardContinental, winner: continentalWildcardWinner }
  };

  state.stage = "semifinals";
  lines.push(formatSeriesLine(wildcardLed, led2, led3));
  lines.push(formatSeriesLine(wildcardContinental, cont2, cont3));
  return lines;
}

function simulateMCLSemifinals(state) {
  const lines = [`Day ${GLOBAL_CURRENT_DAY}: MCL Semifinals`];

  const ledChampion = state.led.tableSorted[0].team;
  const contChampion = state.continental.tableSorted[0].team;
  const ledWildcardWinner = state.wildcard.led.winner;
  const continentalWildcardWinner = state.wildcard.continental.winner;

  const semifinalists = [ledChampion, contChampion, ledWildcardWinner, continentalWildcardWinner];
  semifinalists.forEach(team => state.regionPoints[team.region] += 2);

  const semifinal1 = playBo3Series(ledChampion, continentalWildcardWinner);
  awardMatchOutcomePoints(semifinal1, ledChampion, continentalWildcardWinner, state.regionPoints);
  const semi1Winner = semifinal1.winner === "A" ? ledChampion : continentalWildcardWinner;

  const semifinal2 = playBo3Series(contChampion, ledWildcardWinner);
  awardMatchOutcomePoints(semifinal2, contChampion, ledWildcardWinner, state.regionPoints);
  const semi2Winner = semifinal2.winner === "A" ? contChampion : ledWildcardWinner;

  state.regionPoints[semi1Winner.region] += 3;
  state.regionPoints[semi2Winner.region] += 3;

  state.semifinals = {
    semifinal1: { series: semifinal1, pairing: [ledChampion, continentalWildcardWinner] },
    semifinal2: { series: semifinal2, pairing: [contChampion, ledWildcardWinner] },
    finalists: [semi1Winner, semi2Winner]
  };

  state.stage = "grandFinal";
  lines.push(formatSeriesLine(semifinal1, ledChampion, continentalWildcardWinner));
  lines.push(formatSeriesLine(semifinal2, contChampion, ledWildcardWinner));
  return lines;
}

function simulateMCLGrandFinal(state) {
  const lines = [`Day ${GLOBAL_CURRENT_DAY}: MCL Grand Final`];

  const [finalA, finalB] = state.semifinals.finalists;
  const grandFinal = playBo3Series(finalA, finalB);
  awardMatchOutcomePoints(grandFinal, finalA, finalB, state.regionPoints);
  const champion = grandFinal.winner === "A" ? finalA : finalB;
  state.regionPoints[champion.region] += 5;

  state.grandFinal = { series: grandFinal, champion };
  state.stage = "complete";

  const seasonalScores = calculateSeasonalScores(state.regionPoints, state.teamCounts);
  const updatedHistory = updateCoefficientHistory(state.coefficientHistory, seasonalScores);
  const nextSeasonSlots = computeMCLSlotsForSeason(updatedHistory, state.seasonNumber + 1);

  state.completed = true;
  state.nextSeasonSlots = nextSeasonSlots;
  state.coefficientHistory = updatedHistory;

  lines.push(formatSeriesLine(grandFinal, finalA, finalB));
  lines.push(`Champion: ${champion.name}`);
  return lines;
}

function buildMCLResultFromState(state) {
  return {
    seasonNumber: state.seasonNumber,
    slotsUsed: state.slotsUsed,
    ledConference: { table: state.led.tableSorted, log: state.led.log },
    continentalConference: { table: state.continental.tableSorted, log: state.continental.log },
    wildcard: state.wildcard,
    semifinals: state.semifinals,
    grandFinal: state.grandFinal,
    regionPoints: state.regionPoints,
    seasonalScores: calculateSeasonalScores(state.regionPoints, state.teamCounts),
    coefficientHistory: state.coefficientHistory,
    nextSeasonSlots: state.nextSeasonSlots
  };
}

function simulateMCLDay() {
  ensureMCLSeasonState();
  if (!GLOBAL_MCL_SIM_STATE) return;

  const state = GLOBAL_MCL_SIM_STATE;
  let lines = [];

  if (state.stage === "conferences") {
    lines = simulateMCLConferenceRound(state);
  } else if (state.stage === "wildcards") {
    lines = simulateMCLWildcards(state);
  } else if (state.stage === "semifinals") {
    lines = simulateMCLSemifinals(state);
  } else if (state.stage === "grandFinal") {
    lines = simulateMCLGrandFinal(state);
  }

  if (state.stage === "complete" && state.completed) {
    GLOBAL_MCL_COEFFICIENTS = state.coefficientHistory;
    GLOBAL_MCL_SEASON += 1;
    GLOBAL_MCL_LAST_RESULT = buildMCLResultFromState(state);
    renderMCLResult(GLOBAL_MCL_LAST_RESULT);
  }

  appendToLeagueLog(lines);
}

function buildDomesticOrderingFromResults() {
  if (!GLOBAL_LEAGUE_RESULTS) return null;
  const ordering = {};
  Object.entries(GLOBAL_LEAGUE_RESULTS).forEach(([region, tiers]) => {
    if (tiers && tiers[0] && tiers[0].table) {
      ordering[region] = tiers[0].table.map(row => row.team.id);
    }
  });
  return Object.keys(ordering).length > 0 ? ordering : null;
}

function simulateMCLAndRender() {
  const domesticOrdering = buildDomesticOrderingFromResults();
  const result = simulateCurrentMCLSeason(domesticOrdering);
  if (!result) return;
  GLOBAL_MCL_LAST_RESULT = result;
  renderMCLResult(result);
}

function simulateMCLSeasonButtonHandler() {
  simulateAllLeagues();
  renderCurrentLeagueTable();
  simulateMCLAndRender();
}

function simulateCurrentMCLSeason(domesticStandings = null) {
  if (!GLOBAL_TEAMS || GLOBAL_TEAMS.length === 0 || !GLOBAL_ELITE_TEAMS || GLOBAL_ELITE_TEAMS.length === 0) {
    console.warn("MCL cannot run until teams are loaded.");
    return null;
  }

  const result = simulateMCLSeason({
    seasonNumber: GLOBAL_MCL_SEASON,
    teams: GLOBAL_TEAMS,
    eliteTeams: GLOBAL_ELITE_TEAMS,
    coefficientHistory: GLOBAL_MCL_COEFFICIENTS,
    domesticStandings
  });

  GLOBAL_MCL_COEFFICIENTS = result.coefficientHistory;
  GLOBAL_MCL_SEASON += 1;

  console.log(`MCL Season ${result.seasonNumber} complete. Champion: ${result.grandFinal.champion.name}`);
  console.log("Next season slots:", result.nextSeasonSlots);
  return result;
}

function formatRegion(region) {
  return region.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function describeSlots(slots) {
  return MCL_REGIONAL_POOL
    .map(region => `${formatRegion(region)} ${slots[region] || 0}`)
    .join(" • ");
}

function buildConferenceTableElement(title, tableRows) {
  const wrapper = document.createElement("div");
  const table = document.createElement("table");
  table.className = "mini-table";

  const caption = document.createElement("caption");
  caption.textContent = title;
  table.appendChild(caption);

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>#</th>
      <th>Team</th>
      <th>Pts</th>
      <th>SP For</th>
      <th>SP Against</th>
      <th>SP Diff</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  tableRows.forEach((row, idx) => {
    const diff = row.spFor - row.spAgainst;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${row.team.name}</td>
      <td>${row.points}</td>
      <td>${row.spFor}</td>
      <td>${row.spAgainst}</td>
      <td>${diff}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function formatSeriesLine(series, teamA, teamB) {
  const winnerName = series.winner === "A" ? teamA.name : teamB.name;
  return `${teamA.name} ${series.winsA}-${series.winsB} ${teamB.name} (${winnerName})`;
}

function addBracketBox(container, title, lines) {
  const box = document.createElement("div");
  box.className = "bracket-box";

  const heading = document.createElement("h4");
  heading.textContent = title;
  box.appendChild(heading);

  lines.forEach(text => {
    const p = document.createElement("div");
    p.className = "bracket-line";
    p.textContent = text;
    box.appendChild(p);
  });

  container.appendChild(box);
}

function renderMCLPlayoffs(result) {
  const playoffs = document.getElementById("mcl-playoffs");
  if (!playoffs) return;
  playoffs.innerHTML = "";

  const led2 = result.ledConference.table[1].team;
  const led3 = result.ledConference.table[2].team;
  const cont2 = result.continentalConference.table[1].team;
  const cont3 = result.continentalConference.table[2].team;

  addBracketBox(playoffs, "Wildcards", [
    formatSeriesLine(result.wildcard.led.series, led2, led3),
    formatSeriesLine(result.wildcard.continental.series, cont2, cont3)
  ]);

  const [semi1A, semi1B] = result.semifinals.semifinal1.pairing;
  const [semi2A, semi2B] = result.semifinals.semifinal2.pairing;

  addBracketBox(playoffs, "Semifinals", [
    formatSeriesLine(result.semifinals.semifinal1.series, semi1A, semi1B),
    formatSeriesLine(result.semifinals.semifinal2.series, semi2A, semi2B)
  ]);

  const [finalA, finalB] = result.semifinals.finalists;
  addBracketBox(playoffs, "Grand Final", [
    formatSeriesLine(result.grandFinal.series, finalA, finalB),
    `Champion: ${result.grandFinal.champion.name}`
  ]);
}

function renderMCLCoefficients(result) {
  const coeffs = document.getElementById("mcl-coefficients");
  if (!coeffs) return;
  coeffs.innerHTML = "";

  const table = document.createElement("table");
  table.className = "mini-table";

  const caption = document.createElement("caption");
  caption.textContent = "Regional Coefficients";
  table.appendChild(caption);

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Region</th>
      <th>Season Score</th>
      <th>Last 3 Seasons</th>
      <th>Next Slots</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  [MCL_LED_REGION, ...MCL_REGIONAL_POOL].forEach(region => {
    const tr = document.createElement("tr");
    const seasonal = (result.seasonalScores[region] || 0).toFixed(2);
    const history = result.coefficientHistory[region] || [];
    const historyText = history.length > 0 ? history.join(", ") : "-";
    const nextSlots = region === MCL_LED_REGION
      ? "12 (permanent)"
      : `${result.nextSeasonSlots[region] || 0}`;

    tr.innerHTML = `
      <td>${formatRegion(region)}</td>
      <td>${seasonal}</td>
      <td>${historyText}</td>
      <td>${nextSlots}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  coeffs.appendChild(table);
}

function renderMCLConferences(result) {
  const conferences = document.getElementById("mcl-conferences");
  if (!conferences) return;
  conferences.innerHTML = "";

  const ledTable = buildConferenceTableElement("LED Conference", result.ledConference.table);
  const continentalTable = buildConferenceTableElement("Continental Conference", result.continentalConference.table);

  conferences.appendChild(ledTable);
  conferences.appendChild(continentalTable);
}

function renderMCLSlots(result) {
  const slotSummary = document.getElementById("mcl-slot-summary");
  if (!slotSummary) return;
  slotSummary.innerHTML = "";

  const current = document.createElement("span");
  current.className = "pill";
  current.textContent = `Season ${result.seasonNumber} slots: ${describeSlots(result.slotsUsed)}`;

  const next = document.createElement("span");
  next.className = "pill subtle";
  next.textContent = `Next season preview: ${describeSlots(result.nextSeasonSlots)}`;

  slotSummary.appendChild(current);
  slotSummary.appendChild(next);
}

function renderMCLResult(result) {
  const seasonLabel = document.getElementById("mcl-season-label");
  const championLabel = document.getElementById("mcl-champion-label");

  if (seasonLabel) seasonLabel.textContent = `MCL Season ${result.seasonNumber}`;
  if (championLabel) championLabel.textContent = `Champion: ${result.grandFinal.champion.name}`;

  renderMCLSlots(result);
  renderMCLConferences(result);
  renderMCLPlayoffs(result);
  renderMCLCoefficients(result);
}

function buildDomesticOrderingFromResults() {
  if (!GLOBAL_LEAGUE_RESULTS) return null;
  const ordering = {};
  Object.entries(GLOBAL_LEAGUE_RESULTS).forEach(([region, tiers]) => {
    if (tiers && tiers[0] && tiers[0].table) {
      ordering[region] = tiers[0].table.map(row => row.team.id);
    }
  });
  return Object.keys(ordering).length > 0 ? ordering : null;
}

function simulateMCLAndRender() {
  const domesticOrdering = buildDomesticOrderingFromResults();
  const result = simulateCurrentMCLSeason(domesticOrdering);
  if (!result) return;
  GLOBAL_MCL_LAST_RESULT = result;
  renderMCLResult(result);
}

function renderCurrentLeagueTable() {
  const regionSelect = document.getElementById("league-region");
  const tierSelect = document.getElementById("league-tier");
  const tbody = document.querySelector("#league-table tbody");
  const noteEl = document.getElementById("league-note");

  if (!regionSelect || !tierSelect || !tbody || !noteEl) return;

  const region = regionSelect.value;
  const tierIndex = parseInt(tierSelect.value || "0", 10);

  tbody.innerHTML = "";

  if (!GLOBAL_LEAGUE_RESULTS[region] ||
      !GLOBAL_LEAGUE_RESULTS[region][tierIndex]) {
    noteEl.textContent = "No simulation yet. Run Simulate Leagues.";
    return;
  }

  const season = GLOBAL_LEAGUE_RESULTS[region][tierIndex];
  const rows = season.table;

  const tiers = GLOBAL_LEAGUES[region].length;
  const n = rows.length;

  let promotion = 0, relegation = 0;
  if (tiers > 1) {
    if (tierIndex === 0) 
      relegation = Math.min(2, n);
    else if (tierIndex === tiers - 1) 
      promotion = Math.min(2, n);
    else {
      promotion = Math.min(2, n);
      relegation = Math.min(2, n - promotion);
    }
  }

  rows.forEach((r, i) => {
    const tr = document.createElement("tr");

    if (promotion > 0 && i < promotion) tr.classList.add("promotion");
    if (relegation > 0 && i >= n - relegation) tr.classList.add("relegation");

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${r.team.name}</td>
      <td>${r.points}</td>
      <td>${r.wins}</td>
      <td>${r.draws}</td>
      <td>${r.losses}</td>
      <td>${r.spFor}</td>
      <td>${r.spAgainst}</td>
      <td>${r.spFor - r.spAgainst}</td>
    `;
    tbody.appendChild(tr);
  });

  noteEl.textContent =
    (tiers === 1)
      ? "Single-tier region."
      : (tierIndex === 0
          ? "Red rows = relegation zone."
          : tierIndex === tiers - 1
            ? "Green rows = promotion zone."
            : "Green rows = promotion, Red rows = relegation");
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

    lines.push(`\nRegion: ${region}`);

    tiers.forEach((tierTeams, tierIndex) => {
      if (!tierTeams || tierTeams.length < 2) {
        lines.push(` Tier ${tierIndex + 1}: Not enough teams to form a league.`);
        return;
      }

      // simulate one full season for this tier
      const seasonResult = simulateLeagueSeason(tierTeams); // { fixtures, table, log }
      results[region][tierIndex] = seasonResult;

      lines.push(` Tier ${tierIndex + 1} Results:`);
      seasonResult.log.forEach(line => lines.push(`  ${line}`));
    });
  }

  // store for the League Tables UI
  GLOBAL_LEAGUE_RESULTS = results;
  GLOBAL_DAY_LOG_LINES = [...lines];

  // show text summary in the log
  renderLeagueLog(lines);

  // refresh the League Tables panel using the latest results
  renderCurrentLeagueTable();
}

function shouldRunLeagueDay(leagueReady, mclReady) {
  if (leagueReady && !mclReady) return true;
  if (!leagueReady && mclReady) return false;
  return GLOBAL_CURRENT_DAY % 2 === 1;
}

function advanceDay() {
  if (!GLOBAL_LEAGUES) {
    appendToLeagueLog(["Leagues not initialized yet. Start a new game first."]);
    return;
  }

  const leagueReady = GLOBAL_LEAGUE_SIM_STATE && !GLOBAL_LEAGUE_SIM_STATE.completed;
  const mclReady = GLOBAL_MCL_SIM_STATE && !GLOBAL_MCL_SIM_STATE.completed;

  if (!leagueReady && !mclReady) {
    appendToLeagueLog([`Day ${GLOBAL_CURRENT_DAY}: No competitions left to simulate.`]);
    return;
  }

  const runLeague = shouldRunLeagueDay(leagueReady, mclReady);

  if (runLeague) {
    const { lines, anyMatches } = runNextLeagueDay(GLOBAL_LEAGUE_SIM_STATE);
    GLOBAL_LEAGUE_RESULTS = buildLeagueResultsFromState(GLOBAL_LEAGUE_SIM_STATE);
    renderCurrentLeagueTable();
    appendToLeagueLog(lines);

    if (!anyMatches && !mclReady) {
      appendToLeagueLog([`Day ${GLOBAL_CURRENT_DAY}: Domestic leagues already complete.`]);
    }
  } else {
    simulateMCLDay();
  }

  GLOBAL_CURRENT_DAY += 1;
}

window.onload = () => {
  startNewGame().then(() => {
    const btnLeagues = document.getElementById("run-leagues");
    if (btnLeagues) {
      btnLeagues.addEventListener("click", simulateAllLeagues);
    }
    const btnAdvanceDay = document.getElementById("advance-day");
    if (btnAdvanceDay) {
      btnAdvanceDay.addEventListener("click", advanceDay);
    }
    const btnMCL = document.getElementById("simulate-mcl-season");
    if (btnMCL) {
      btnMCL.addEventListener("click", simulateMCLSeasonButtonHandler);
    }
    const btnMCLSecondary = document.getElementById("run-mcl-secondary");
    if (btnMCLSecondary) {
      btnMCLSecondary.addEventListener("click", simulateMCLAndRender);
    }
        initLeagueSelectors();
    renderCurrentLeagueTable();
    renderMCLPlaceholder();
  });
};
