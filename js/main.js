let GLOBAL_TEAMS = [];
let GLOBAL_ELITE_TEAMS = [];
let GLOBAL_LEAGUES = null;          // from buildRegionalLeagues
let GLOBAL_LEAGUE_RESULTS = {};     // filled after simulateAllLeagues
let GLOBAL_MCL_COEFFICIENTS = createEmptyCoefficientHistory();
let GLOBAL_MCL_SEASON = 1;

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

  console.log("Teams:", GLOBAL_TEAMS);
  console.log("LED Elite Teams:", GLOBAL_ELITE_TEAMS);
  console.log("Regional Leagues:", GLOBAL_LEAGUES);

  initLeagueSelectors();
}

function renderMatchLog(logLines) {
  const pre = document.getElementById("match-log");
  pre.textContent = logLines.join("\n");
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

function renderLeagueLog(lines) {
  const pre = document.getElementById("league-log");
  if (!pre) return;
  pre.textContent = lines.join("\n");
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

  // show text summary in the log
  renderLeagueLog(lines);

  // refresh the League Tables panel using the latest results
  renderCurrentLeagueTable();
}

function runTestMatchAndShowLog() {
  if (!GLOBAL_TEAMS || GLOBAL_TEAMS.length < 2) {
    renderMatchLog(["Not enough teams loaded to run a match."]);
    return;
  }

  const teamA = GLOBAL_TEAMS[0];
  const teamB = GLOBAL_TEAMS[1];

  const lineupA = pickLineup(teamA);
  const lineupB = pickLineup(teamB);

  if (lineupA.length < 3 || lineupB.length < 3) {
    renderMatchLog(["One of the teams cannot field a full 1/1/1 lineup."]);
    return;
  }

  markPlayed(lineupA);
  markPlayed(lineupB);

  const result = runMatch(lineupA, lineupB);

  console.log(`Match result: Team ${result.winner} wins ${result.winsA}-${result.winsB}`);
  renderMatchLog(result.log);

  applyMatchFatigue(teamA);
  applyMatchFatigue(teamB);
  progressInjuries(teamA);
  progressInjuries(teamB);
  recoverFatigueBetweenMatches(teamA);
  recoverFatigueBetweenMatches(teamB);
}

window.onload = () => {
  startNewGame().then(() => {
    const btnMatch = document.getElementById("run-test-match");
    if (btnMatch) {
      btnMatch.addEventListener("click", runTestMatchAndShowLog);
    }
	
    const btnLeagues = document.getElementById("run-leagues");
    if (btnLeagues) {
      btnLeagues.addEventListener("click", simulateAllLeagues);
    }
	initLeagueSelectors();
    renderCurrentLeagueTable();
  });
};
