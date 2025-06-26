console.log("✅ script.js loaded");

async function loadDeck() {
  console.log("🚀 Load Deck clicked");

  const url = document.getElementById('deckUrl').value.trim();
  const match = url.match(/\/decks\/(\d+)/);

  if (!match) {
    alert("❌ Please enter a valid Archidekt deck URL.");
    return;
  }

  const deckId = match[1];
  const apiUrl = `https://mtg-proxy-api-server.onrender.com/api/archidekt/${deckId}`;
  console.log(`🌐 Fetching deck from: ${apiUrl}`);

  const spinner = document.getElementById('spinner');
  const container = document.getElementById('sheet');
  container.innerHTML = '';
  spinner.style.display = 'block';

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const cards = data.images || [];

    console.log(`📦 Received ${cards.length} card(s)`);

    for (const card of cards) {
      for (let i = 0; i < card.quantity; i++) {
        const img = document.createElement('img');
        img.src = card.img;
        img.alt = `${card.name} (${card.set} ${card.collectorNumber})`;
        img.className = 'card';
        container.appendChild(img);
      }
    }
  } catch (err) {
    console.error("❌ Deck load failed:", err);
    alert("Failed to load deck. Check console for details.");
  } finally {
    spinner.style.display = 'none';
  }
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("📄 DOM ready");
  document.querySelector("button").addEventListener("click", loadDeck);
});
