console.log("✅ script.js loaded");

async function loadDeck() {
  console.log("🚀 Load Deck clicked");

  const url = document.getElementById('deckUrl').value;
  const match = url.match(/\/decks\/(\d+)/);
  if (!match) {
    alert("Invalid Archidekt URL");
    return;
  }

  const deckId = match[1];
  const proxyBase = "https://mtg-proxy-api-server.onrender.com";
  const apiUrl = `${proxyBase}/api/archidekt/${deckId}`;
  console.log("🌐 Fetching from:", apiUrl);

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      alert("Failed to load deck.");
      console.error("❌ API error:", response.status);
      return;
    }

    const data = await response.json();
    const cards = data.images || [];

    console.log("📦 Cards received:", cards.length);

    const container = document.getElementById('sheet');
    container.innerHTML = '';

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
    alert("Unexpected error occurred.");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("📄 DOM ready");
  document.querySelector("button").addEventListener("click", loadDeck);
});
