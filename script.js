document.getElementById('loadDeck').addEventListener('click', loadDeck);

async function loadDeck() {
  const deckId = document.getElementById('deckId').value.trim();
  if (!deckId) return;

  const loading = document.getElementById('loading');
  const cardContainer = document.getElementById('cardContainer');
  loading.classList.remove('hidden');
  cardContainer.innerHTML = '';

  try {
    const response = await fetch(`https://mtg-proxy-api-server.onrender.com/api/archidekt/${deckId}`);
    const data = await response.json();

    if (!data.images || data.images.length === 0) {
      loading.textContent = "❌ No cards found or error scraping deck.";
      return;
    }

    data.images.forEach(card => {
      for (let i = 0; i < card.quantity; i++) {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<img src="${card.img}" alt="${card.name}"><p>${card.name}</p>`;
        cardContainer.appendChild(div);
      }
    });

    loading.classList.add('hidden');
  } catch (err) {
    console.error("❌ Deck load failed:", err);
    loading.textContent = "❌ Error loading deck.";
  }
}
