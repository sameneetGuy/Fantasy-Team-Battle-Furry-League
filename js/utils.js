function d20() {
  return Math.floor(Math.random() * 20) + 1;
}

function pickRandom(list, count = 1) {
  const copy = [...list];
  const chosen = [];
  while (count-- > 0 && copy.length > 0) {
    const i = Math.floor(Math.random() * copy.length);
    chosen.push(copy.splice(i, 1)[0]);
  }
  return chosen;
}
