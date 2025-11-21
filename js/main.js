let GLOBAL_TEAMS = [];
let GLOBAL_ELITE_TEAMS = [];
let GLOBAL_LEAGUES = null;          // from buildRegionalLeagues
let GLOBAL_LEAGUE_RESULTS = {};     // filled after simulateAllLeagues
let GLOBAL_MCL_COEFFICIENTS = createEmptyCoefficientHistory();
let GLOBAL_MCL_SEASON = 1;
let GLOBAL_MCL_LAST_RESULT = null;

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

  console.log("Teams:", GLOBAL_TEAMS);
  console.log("LED Elite Teams:", GLOBAL_ELITE_TEAMS);
  console.log("Regional Leagues:", GLOBAL_LEAGUES);

  initLeagueSelectors();
  renderMCLPlaceholder();
}

function renderMatchLog(logLines) {
  const pre = document.getElementById("match-log");
  pre.textContent = logLines.join("\n");
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
    const btnMCL = document.getElementById("run-mcl");
    if (btnMCL) {
      btnMCL.addEventListener("click", simulateMCLAndRender);
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
