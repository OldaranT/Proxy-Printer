console.log("✅ script.js loaded");

async function loadDeck() {
  const button = document.querySelector("button");
  const container = document.getElementById('sheet');
  const url = document.getElementById('deckUrl').value;

  // UI feedback: disable button + show spinner
  button.disabled = true;
  button.textContent = "Loading...";
  container.innerHTML = `
    <div class="center">
      <div class="spinner"></div>
      <p>Fetching deck data...</p>
    </div>
  `;

  const match = url.match(/\/decks\/(\d+)/);
  if (!match) {
    alert("❌ Invalid Archidekt URL");
    resetUI();
    return;
  }

  const deckId = match[1];
  const proxyBase = "https://mtg-proxy-api-server.onrender.com";
  const apiUrl = `${proxyBase}/api/archidekt/${deckId}`;
  console.log("🌐 Fetching from:", apiUrl);

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error("❌ API error:", response.status);
      container.innerHTML = "<p>❌ Failed to load deck data.</p>";
      resetUI();
      return;
    }

    const data = await response.json();
    const cards = data.images || [];

    console.log("📦 Cards received:", cards.length);
    container.innerHTML = '';

    if (cards.length === 0) {
      container.innerHTML = "<p>⚠️ No cards found.</p>";
    }

    for (const card of cards) {
      const { name, img, quantity } = card;
      console.log(`🃏 ${name} x${quantity}`);

      for (let i = 0; i < quantity; i++) {
        const imgEl = document.createElement('img');
        imgEl.src = img;
        imgEl.alt = name;
        imgEl.className = 'card';
        container.appendChild(imgEl);
      }
    }
  } catch (err) {
    console.error("❌ Deck load failed:", err);
    container.innerHTML = "<p>❌ Unexpected error occurred while loading the deck.</p>";
  }

  resetUI();

  function resetUI() {
    button.disabled = false;
    button.textContent = "Load Deck";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("📄 DOM ready");
  document.querySelector("button").addEventListener("click", loadDeck);
});
