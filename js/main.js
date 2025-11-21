let GLOBAL_TEAMS = [];
let GLOBAL_LEAGUES = null;          // from buildRegionalLeagues
let GLOBAL_LEAGUE_RESULTS = {};     // filled after simulateAllLeagues

async function startNewGame() {
  const { teams: teamData, abilities: abilityData } = await loadGameData();

  const ALL_ABILITIES = abilityData.abilities;
  const rawTeams = teamData.teams;

  const teams = rawTeams
    .map(t => buildTeam(t, ALL_ABILITIES))
    .filter(Boolean);

  GLOBAL_TEAMS = teams;
  GLOBAL_LEAGUES = buildRegionalLeagues(teams);

  console.log("Teams:", GLOBAL_TEAMS);
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

function renderCurrentLeagueTable() {
  const regionSelect = document.getElementById("league-region");
  const tierSelect = document.getElementById("league-tier");
  const tbody = document.querySelector("#league-table tbody");
  const noteEl = document.getElementById("league-note");

  if (!regionSelect || !tierSelect || !tbody || !noteEl) return;

  const region = regionSelect.value;
  const tierIndex = parseInt(tierSelect.value || "0", 10);

  tbody.innerHTML = "";

  if (!GLOBAL_LEAGUE_RESULTS ||
      !GLOBAL_LEAGUE_RESULTS[region] ||
      !GLOBAL_LEAGUE_RESULTS[region][tierIndex]) {
    noteEl.textContent = "No season simulation found for this region/tier. Click \"Simulate Leagues\" first.";
    return;
  }

  const seasonResult = GLOBAL_LEAGUE_RESULTS[region][tierIndex];
  const rows = seasonResult.table; // array of { team, points, wins, draws, losses, spFor, spAgainst }

  const tierCount = GLOBAL_LEAGUES[region].length;
  const teamCount = rows.length;

  // Determine promotion / relegation slots
  let promotionCount = 0;
  let relegationCount = 0;

  if (tierCount > 1) {
    if (tierIndex === 0) {
      // Top tier: only relegation (bottom 2)
      relegationCount = Math.min(2, teamCount);
    } else if (tierIndex === tierCount - 1) {
      // Bottom tier: only promotion (top 2)
      promotionCount = Math.min(2, teamCount);
    } else {
      // Middle tiers: promotion (top 2) and relegation (bottom 2)
      promotionCount = Math.min(2, teamCount);
      relegationCount = Math.min(2, teamCount - promotionCount);
    }
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");

    if (promotionCount > 0 && index < promotionCount) {
      tr.classList.add("promotion");
    } else if (relegationCount > 0 && index >= teamCount - relegationCount) {
      tr.classList.add("relegation");
    }

    const diff = row.spFor - row.spAgainst;

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${row.team.name}</td>
      <td>${row.points}</td>
      <td>${row.wins}</td>
      <td>${row.draws}</td>
      <td>${row.losses}</td>
      <td>${row.spFor}</td>
      <td>${row.spAgainst}</td>
      <td>${diff}</td>
    `;

    tbody.appendChild(tr);
  });

  // Note explaining formatting
  if (tierCount > 1) {
    if (tierIndex === 0) {
      noteEl.textContent = "Top tier: red rows are in the relegation zone.";
    } else if (tierIndex === tierCount - 1) {
      noteEl.textContent = "Bottom tier: green rows are in the promotion zone.";
    } else {
      noteEl.textContent = "Middle tier: green rows are promoted, red rows are relegated.";
    }
  } else {
    noteEl.textContent = "Single-tier region: no promotion or relegation.";
  }
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

  for (const region in GLOBAL_LEAGUES) {
    const tiers = GLOBAL_LEAGUES[region];
    if (!tiers || tiers.length === 0) continue;

    const tier1Teams = tiers[0];
    if (!tier1Teams || tier1Teams.length < 2) {
      lines.push(`\nRegion ${region}: Not enough teams to form a league.`);
      continue;
    }

    lines.push(`\n### Region: ${region} ###`);

    const { fixtures, table } = simulateLeagueSeason(tier1Teams);

    table.forEach((row, index) => {
      const diff = row.spFor - row.spAgainst;
      lines.push(
        `${index + 1}. ${row.team.name} - ${row.points} pts (W:${row.wins}  D:${row.draws} L:${row.losses}, SP diff: ${diff})`
      );
    });
  }

  renderLeagueLog(lines);
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
