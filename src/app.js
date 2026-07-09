function initApp() {
  const app = document.getElementById('app');
  const { players, history } = window.__WC;
  app.textContent = `${players.length} joueurs • ${Object.keys(history).length} journées`;
}
