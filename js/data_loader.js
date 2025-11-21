async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

async function loadEliteTeams() {
  return await loadJSON("data/elite_teams.json");
}

async function loadGameData() {
  const teams = await loadJSON("data/teams.json");
  const abilities = await loadJSON("data/abilities.json");
  const elite = await loadEliteTeams();
  return { teams, abilities, elite };
}
