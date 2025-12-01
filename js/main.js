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
let GLOBAL_DOMESTIC_SEASON = 1;
// stores league tables by season: { [seasonNumber]: leagueResultsObject }
let GLOBAL_LEAGUE_SEASON_HISTORY = {};

function buildDomesticOrderingFromResultsObject(results) {
  const ordering = {};

  Object.entries(results || {}).forEach(([region, tiers]) => {
    const orderedIds = [];
    (tiers || []).forEach(tier => {
      if (!tier || !tier.table) return;
      tier.table.forEach(row => orderedIds.push(row.team.id));
    });
    ordering[region] = orderedIds;
  });

  return ordering;
}

// Convenience: keep the old helper name, but have it use GLOBAL_LEAGUE_RESULTS
function buildDomesticOrderingFromResults() {
  return buildDomesticOrderingFromResultsObject(GLOBAL_LEAGUE_RESULTS);
}

function formatSeriesLine(series, teamA, teamB) {
  if (!series || !teamA || !teamB) return "";

  const winnerName = series.winner === "A" ? teamA.name : teamB.name;
  return `${teamA.name} ${series.winsA}-${series.winsB} ${teamB.name} (${winnerName} wins)`;
}

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

  // Apply domestic tier-based power gap AFTER leagues are built
  applyPowerGaps(GLOBAL_LEAGUES);
  
  GLOBAL_MCL_COEFFICIENTS = createEmptyCoefficientHistory();
  GLOBAL_MCL_SEASON = 1;
  GLOBAL_MCL_LAST_RESULT = null;
  GLOBAL_LEAGUE_SIM_STATE = createLeagueSimulationState(GLOBAL_LEAGUES);
  GLOBAL_MCL_SIM_STATE = null;
  GLOBAL_CURRENT_DAY = 1;
  GLOBAL_DAY_LOG_LINES = [];
  GLOBAL_LEAGUE_RESULTS = buildLeagueResultsFromState(GLOBAL_LEAGUE_SIM_STATE);
  
  // NEW: reset season counters + store Season 1’s “starting” results
  GLOBAL_DOMESTIC_SEASON = 1;
  GLOBAL_LEAGUE_SEASON_HISTORY = {};
  GLOBAL_LEAGUE_SEASON_HISTORY[GLOBAL_DOMESTIC_SEASON] = GLOBAL_LEAGUE_RESULTS;

  renderLeagueLog([]);

  console.log("Teams:", GLOBAL_TEAMS);
  console.log("LED Elite Teams:", GLOBAL_ELITE_TEAMS);
  console.log("Regional Leagues:", GLOBAL_LEAGUES);

  initLeagueSelectors();
  renderMCLPlaceholder();
}

function createLeagueSimulationState(leagues) {
  const state = { regions: {}, completed: false };

  Object.entries(leagues || {}).forEach(([region, tiers]) => {
    state.regions[region] = (tiers || []).map(teamList => {
      const fixtures = generateRoundRobinFixtures(teamList);
      const table = initializeLeagueTable(teamList);
      return {
        teams: teamList,
        fixtures,
        roundIndex: 0,
        table,
        completed: teamList.length < 2
      };
    });
  });

  state.completed = Object.values(state.regions)
    .flat()
    .every(t => t.completed);

  return state;
}

function buildLeagueResultsFromState(state) {
  const results = {};
  if (!state || !state.regions) return results;

  Object.entries(state.regions).forEach(([region, tiers]) => {
    results[region] = tiers.map(tier => {
      if (!tier || !tier.table) return null;

      const sorted = Object.values(tier.table).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.spFor - a.spAgainst;
        const diffB = b.spFor - b.spAgainst;
        return diffB - diffA;
      });

      return { fixtures: tier.fixtures, table: sorted };
    });
  });

  return results;
}

function runNextLeagueDay(state) {
  const lines = [`Day ${GLOBAL_CURRENT_DAY}: Domestic fixtures`];
  if (!state || !state.regions) return { lines: ["Leagues not initialized."], anyMatches: false };

  let anyMatches = false;

  Object.entries(state.regions).forEach(([region, tiers]) => {
    let regionHeaderAdded = false;

    tiers.forEach((tierState, idx) => {
      if (tierState.completed) return;

      const { fixtures, roundIndex } = tierState;
      if (roundIndex >= fixtures.length) {
        tierState.completed = true;
        return;
      }

      const matches = fixtures[roundIndex];
      if (!matches || matches.length === 0) {
        tierState.roundIndex += 1;
        return;
      }

      anyMatches = true;
      if (!regionHeaderAdded) {
        lines.push(`Region: ${formatRegion(region)}`);
        regionHeaderAdded = true;
      }

      lines.push(` Tier ${idx + 1}, Round ${roundIndex + 1}:`);

      matches.forEach(([teamA, teamB]) => {
        const result = simulateLeagueMatch(teamA, teamB);
        applyMatchToTable(result, teamA, teamB, tierState.table);

        const winnerName = result.winner === "D"
          ? "Draw"
          : result.winner === "A"
            ? teamA.name
            : teamB.name;

        lines.push(`  ${teamA.name} ${result.winsA}-${result.winsB} ${teamB.name} (${winnerName})`);
      });

      tierState.teams.forEach(team => recoverFatigueBetweenMatches(team));

      tierState.roundIndex += 1;
      if (tierState.roundIndex >= fixtures.length) {
        tierState.completed = true;
      }
    });
  });

  state.completed = Object.values(state.regions)
    .flat()
    .every(t => t.completed);

  return { lines, anyMatches };
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

function createConferenceTable(label, rows) {
  const table = document.createElement("table");
  table.className = "mini-table";

  const caption = document.createElement("caption");
  caption.textContent = label;
  table.appendChild(caption);

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>#</th><th>Team</th><th>Pts</th><th>SP Diff</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    const diff = row.spFor - row.spAgainst;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${row.team.name}</td>
      <td>${row.points}</td>
      <td>${diff}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}

function renderMCLResult(result) {
  if (!result) return;

  const seasonLabel = document.getElementById("mcl-season-label");
  const championLabel = document.getElementById("mcl-champion-label");
  const slotSummary = document.getElementById("mcl-slot-summary");
  const conferences = document.getElementById("mcl-conferences");
  const playoffs = document.getElementById("mcl-playoffs");
  const coeffs = document.getElementById("mcl-coefficients");

  if (seasonLabel) seasonLabel.textContent = `Season ${result.seasonNumber}`;
  if (championLabel) championLabel.textContent = `Champion: ${result.grandFinal.champion.name}`;

  if (slotSummary) {
    slotSummary.innerHTML = "";
    Object.entries(result.nextSeasonSlots).forEach(([region, slots]) => {
      const pill = document.createElement("span");
      pill.className = "pill subtle";
      pill.textContent = `${formatRegion(region)}: ${slots} spots next season`;
      slotSummary.appendChild(pill);
    });
  }

  if (conferences) {
    conferences.innerHTML = "";
    conferences.appendChild(createConferenceTable("LED Conference", result.ledConference.table));
    conferences.appendChild(createConferenceTable("Continental Conference", result.continentalConference.table));
  }

  if (playoffs) {
    const ledTable = result.ledConference.table;
    const continentalTable = result.continentalConference.table;

    const wildcardBox = document.createElement("div");
    wildcardBox.className = "bracket-box";
    wildcardBox.innerHTML = `
      <h4>Wildcards</h4>
      <div class="bracket-line">${formatSeriesLine(result.wildcard.led.series, ledTable[1].team, ledTable[2].team)}</div>
      <div class="bracket-line">${formatSeriesLine(result.wildcard.continental.series, continentalTable[1].team, continentalTable[2].team)}</div>
    `;

    const semifinalBox = document.createElement("div");
    semifinalBox.className = "bracket-box";
    semifinalBox.innerHTML = `
      <h4>Semifinals</h4>
      <div class="bracket-line">${formatSeriesLine(result.semifinals.semifinal1.series, ...result.semifinals.semifinal1.pairing)}</div>
      <div class="bracket-line">${formatSeriesLine(result.semifinals.semifinal2.series, ...result.semifinals.semifinal2.pairing)}</div>
    `;

    const finalBox = document.createElement("div");
    finalBox.className = "bracket-box";
    finalBox.innerHTML = `
      <h4>Grand Final</h4>
      <div class="bracket-line">${formatSeriesLine(result.grandFinal.series, ...result.semifinals.finalists)}</div>
    `;

    playoffs.innerHTML = "";
    playoffs.appendChild(wildcardBox);
    playoffs.appendChild(semifinalBox);
    playoffs.appendChild(finalBox);
  }

  if (coeffs) {
    coeffs.innerHTML = "";
    const table = document.createElement("table");
    table.className = "mini-table";

    const caption = document.createElement("caption");
    caption.textContent = "Coefficient History";
    table.appendChild(caption);

    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Region</th><th>Average (last 3)</th><th>Recent Scores</th></tr>";
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    Object.entries(result.coefficientHistory).forEach(([region, history]) => {
      const values = (history || []).map(v => v.toFixed(2));
      const alt_values = history || [];
      let display = "—";

      if (alt_values.length > 0) {
        const sum = alt_values.reduce((acc, v) => acc + v, 0);
        const avg = sum / alt_values.length;
        // Round to 2 decimal places, e.g. 12.17 instead of 12.1666...
        display = avg.toFixed(2);
      }
      
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatRegion(region)}</td>
        <td>${display}</td>
        <td>${values.join(", ") || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    coeffs.appendChild(table);
  }
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

function formatRegion(region) {
  return region.replace(/([a-z])([A-Z])/g, "$1 $2");
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

function simulateCurrentMCLSeasonWithReset() {
  // Safety check: do we have teams and elite teams?
  if (!GLOBAL_TEAMS || GLOBAL_TEAMS.length === 0 ||
      !GLOBAL_ELITE_TEAMS || GLOBAL_ELITE_TEAMS.length === 0) {
    appendToLeagueLog(["MCL cannot run until teams are loaded."]);
    console.warn("MCL cannot run until teams are loaded.");
    return null;
  }

  // Build ordering from the league results of the *previous* domestic season
  // – i.e., MCL Season N uses Domestic Season N’s standings
  const previousLeagueResults = GLOBAL_LEAGUE_SEASON_HISTORY[GLOBAL_MCL_SEASON] || GLOBAL_LEAGUE_RESULTS;
  const domesticOrdering = buildDomesticOrderingFromResultsObject(previousLeagueResults);

  // Run one full MCL season
  const result = simulateMCLSeason({
    seasonNumber: GLOBAL_MCL_SEASON,
    teams: GLOBAL_TEAMS,
    eliteTeams: GLOBAL_ELITE_TEAMS,
    coefficientHistory: GLOBAL_MCL_COEFFICIENTS,
    domesticStandings: domesticOrdering
  });

  // Advance global MCL state
  GLOBAL_MCL_COEFFICIENTS = result.coefficientHistory;
  GLOBAL_MCL_SEASON += 1;
  GLOBAL_MCL_LAST_RESULT = result;
  GLOBAL_MCL_SIM_STATE = { completed: true, result };

  // Render the nice MCL UI
  renderMCLResult(result);

  // Prepare log summary lines
  const ledLeader = result.ledConference.table[0];
  const continentalLeader = result.continentalConference.table[0];

  const mclLines = [
    "=== Major Continental League ===",
    `Season ${result.seasonNumber} Champion: ${result.grandFinal.champion.name}`,
    `LED Conference winner: ${ledLeader.team.name} (${ledLeader.points} pts)`,
    `Continental Conference winner: ${continentalLeader.team.name} (${continentalLeader.points} pts)`,
    formatSeriesLine(result.wildcard.led.series,
                     result.ledConference.table[1].team,
                     result.ledConference.table[2].team),
    formatSeriesLine(result.wildcard.continental.series,
                     result.continentalConference.table[1].team,
                     result.continentalConference.table[2].team),
    formatSeriesLine(result.grandFinal.series,
                     result.semifinals.finalists[0],
                     result.semifinals.finalists[1])
  ];

  appendToLeagueLog(mclLines);
  return result;
}

// MAIN “simulate MCL season” button (hero button)
function simulateMCLSeasonButtonHandler() {
  // Always reset the per-season MCL state when the button is pressed
  GLOBAL_MCL_SIM_STATE = { completed: false };
  return simulateCurrentMCLSeasonWithReset();
}

// Secondary button inside the MCL card should use the same flow
function simulateMCLAndRender() {
  return simulateMCLSeasonButtonHandler();
}

// Day-by-day: just call the same helper once when it's MCL's turn
function simulateMCLDay() {
  if (GLOBAL_MCL_SIM_STATE && GLOBAL_MCL_SIM_STATE.completed) {
    appendToLeagueLog([`Day ${GLOBAL_CURRENT_DAY}: Major Continental League already completed.`]);
    return;
  }

  // Initialize state if needed
  if (!GLOBAL_MCL_SIM_STATE) {
    GLOBAL_MCL_SIM_STATE = { completed: false };
  }

  const result = simulateCurrentMCLSeasonWithReset();
  if (!result) return;

  // simulateCurrentMCLSeasonWithReset already sets completed + logs
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

    lines.push("");
    lines.push(`Region: ${formatRegion(region)}`);

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

  // mark domestic play as finished so day-by-day flow can move into MCL
  if (GLOBAL_LEAGUE_SIM_STATE) {
    GLOBAL_LEAGUE_SIM_STATE.completed = true;
  } else {
    GLOBAL_LEAGUE_SIM_STATE = { completed: true };
  }
  GLOBAL_MCL_SIM_STATE = { completed: false };

  // show text summary in the log
  renderLeagueLog(lines);

  // refresh the League Tables panel using the latest results
  renderCurrentLeagueTable();

  return lines;
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

  if (GLOBAL_LEAGUE_SIM_STATE && GLOBAL_LEAGUE_SIM_STATE.completed && !GLOBAL_MCL_SIM_STATE) {
    GLOBAL_MCL_SIM_STATE = { completed: false };
  }

  const leagueReady = GLOBAL_LEAGUE_SIM_STATE && !GLOBAL_LEAGUE_SIM_STATE.completed;
  const mclReady = GLOBAL_MCL_SIM_STATE && !GLOBAL_MCL_SIM_STATE.completed;

  if (!leagueReady && !mclReady) {
    appendToLeagueLog([`Day ${GLOBAL_CURRENT_DAY}: No competitions left to simulate.`]);
    return;
  }

  const runLeague = shouldRunLeagueDay(leagueReady, mclReady);

    if (runLeague) {
    const wasCompletedBefore = GLOBAL_LEAGUE_SIM_STATE.completed;

    const { lines, anyMatches } = runNextLeagueDay(GLOBAL_LEAGUE_SIM_STATE);
    GLOBAL_LEAGUE_RESULTS = buildLeagueResultsFromState(GLOBAL_LEAGUE_SIM_STATE);
    renderCurrentLeagueTable();
    appendToLeagueLog(lines);

    // NEW: if the leagues just finished on this day, store this season’s tables
    if (!wasCompletedBefore && GLOBAL_LEAGUE_SIM_STATE.completed) {
      GLOBAL_LEAGUE_SEASON_HISTORY[GLOBAL_DOMESTIC_SEASON] = GLOBAL_LEAGUE_RESULTS;
    }

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
