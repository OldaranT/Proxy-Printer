async function loadDeck() {
  console.log("Load Deck clicked");

  const url = document.getElementById('deckUrl').value;
  const match = url.match(/\/decks\/(\d+)/);
  if (!match) {
    alert("Invalid Archidekt URL");
    return;
  }

  const deckId = match[1];
  const proxyBase = "https://mtg-proxy-api-server.onrender.com";
  const apiUrl = `${proxyBase}/api/archidekt/${deckId}`;

  const response = await fetch(apiUrl);
  if (!response.ok) {
    alert("Failed to load deck.");
    return;
  }

  const data = await response.json();
  const cards = data.cards;

  const container = document.getElementById('sheet');
  container.innerHTML = '';

  for (const entry of cards) {
    const count = entry.quantity;
    const name = entry.card.oracleCard.name;

    try {
      const scryUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
      const scryRes = await fetch(scryUrl);
      const cardData = await scryRes.json();
      const imgUrl = cardData.image_uris?.normal || cardData.card_faces?.[0]?.image_uris?.normal;

      if (imgUrl) {
        for (let i = 0; i < count; i++) {
          const img = document.createElement('img');
          img.src = imgUrl;
          img.className = 'card';
          container.appendChild(img);
        }
      } else {
        console.warn("No image found for:", name);
      }
    } catch (err) {
      console.error("Error loading image for:", name);
    }
  }
}

// ✅ Attach event listener when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("button").addEventListener("click", loadDeck);
});
