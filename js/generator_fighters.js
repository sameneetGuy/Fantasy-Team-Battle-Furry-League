const ROLE_TEMPLATES = {
  Tank:    { attack: 3, defense: 6, speed: 2, baseSP: 4 },
  DPS:     { attack: 6, defense: 3, speed: 4, baseSP: 3 },
  Support: { attack: 3, defense: 3, speed: 6, baseSP: 3 }
};

const RACE_MODS = {
  Canine:   { attack: 0, defense: 1, speed: 0 },
  Feline:   { attack: 0, defense: 0, speed: 1 },
  Ursine:   { attack: 0, defense: 1, speed: -1 },
  Hyena:    { attack: 1, defense: 0, speed: 0 },
  Mustelid: { attack: 0, defense: -1, speed: 1 }
};

function buildFighter(fStub, region, ALL_ABILITIES) {

  // 1) BASE STATS: Role + Race
  const roleBase = ROLE_TEMPLATES[fStub.role];
  const raceMods = RACE_MODS[fStub.race] || { attack:0, defense:0, speed:0 };

  const attack  = Math.max(1, roleBase.attack  + raceMods.attack);
  const defense = Math.max(1, roleBase.defense + raceMods.defense);
  const speed   = Math.max(1, roleBase.speed   + raceMods.speed);
  const maxSP   = roleBase.baseSP;

  // Simple stamina model: roles have different stamina baselines
  const ROLE_STAMINA = {
    Tank:    6,
    DPS:     5,
    Support: 7
  };
  const stamina = ROLE_STAMINA[fStub.role] || 6;

  // 2) PICK ABILITIES
  const pool = ALL_ABILITIES.filter(a =>
    a.role === fStub.role &&
    (!a.allowedRaces   || a.allowedRaces.includes(fStub.race)) &&
    (!a.allowedRegions || a.allowedRegions.includes(region))
  );

  const chosenAbilities = pickRandom(pool, 3);

  // 3) CREATE FIGHTER OBJECT
  const fighter = {
    id: fStub.id,
    name: fStub.name,
    race: fStub.race,
    role: fStub.role,
    region,

    attack,
    defense,
    speed,

    maxSP,
    currentSP: maxSP,

    stamina,        // how much fatigue they can carry “comfortably”
    fatigue: 0,     // starts fresh

    injury: null,   // { severity, gamesRemaining } when injured

    abilities: chosenAbilities,

    status: {
      buff: [],
      debuff: []
    },

    position: "C",

    // for tracking during matches if you want later:
    wasKOdThisMatch: false
  };

  // 4) DEFAULT BASIC STRIKE
  fighter.basicStrike = {
    id: "basic_strike",
    name: "Strike",
    role: fighter.role,
    rangeType: fighter.role === "DPS" ? "projectile" : "close",
    rollType: "attack_vs_defense",
    targetType: "single",
    spOnHit: 1,
    tags: []
  };

  return fighter;
}

function buildTeam(teamStub, ALL_ABILITIES) {
  return {
    id: teamStub.id,
    name: teamStub.name,
    region: teamStub.region,
    fighters: teamStub.fighters.map(f => buildFighter(f, teamStub.region, ALL_ABILITIES)),
    currentLineupIds: []  // filled when selecting lineup
  };
}
