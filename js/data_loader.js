async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

async function loadGameData() {
  const teams = await loadJSON("data/teams.json");
  const abilities = await loadJSON("data/abilities.json");
  return { teams, abilities };
}
