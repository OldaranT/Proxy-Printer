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
  console.log("🌐 Fetching deck from:", apiUrl);

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      alert("Failed to load deck.");
      console.error("❌ Fetch error:", response.status);
      return;
    }

    const data = await response.json();
    console.log("🔎 Deck export data:", data);

    // Flatten all cards from categories that are included in the deck
    const cards = [];
    for (const category of data.categories) {
      if (!category.includedInDeck) continue;
      for (const card of category.cards) {
        cards.push(card);
      }
    }

    console.log("📦 Flattened cards:", cards.length);

    const container = document.getElementById('sheet');
    container.innerHTML = '';

    if (cards.length === 0) {
      console.warn("⚠️ No cards found in deck.");
      return;
    }

    for (const card of cards) {
      const count = card.quantity;
      const name = card.card.name;
      console.log(`🃏 ${name} x${count}`);

      try {
        const scryUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
        console.log("🔍 Fetching from Scryfall:", scryUrl);

        const scryRes = await fetch(scryUrl);
        const cardData = await scryRes.json();

        const imgUrl = cardData.image_uris?.normal || cardData.card_faces?.[0]?.image_uris?.normal;
        console.log("🖼️ Image URL:", imgUrl);

        if (imgUrl) {
          for (let i = 0; i < count; i++) {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.className = 'card';
            container.appendChild(img);
          }
        } else {
          console.warn("⚠️ No image found for:", name);
        }
      } catch (err) {
        console.error("❌ Scryfall error for:", name, err);
      }
    }
  } catch (err) {
    console.error("❌ Deck fetch failed:", err);
    alert("Unexpected error occurred while loading the deck.");
  }
}

// ✅ Attach event listener when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  console.log("📄 DOM ready");
  document.querySelector("button").addEventListener("click", loadDeck);
});
