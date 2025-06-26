let cachedImages = [];

function extractDeckId(url) {
  const match = url.match(/\/decks\/(\d+)/);
  return match ? match[1] : null;
}

async function loadDeck() {
  const urlInput = document.getElementById('deckUrl');
  const button = document.getElementById('loadBtn');
  const printBtn = document.getElementById('printBtn');
  const loading = document.getElementById('loading');
  const grid = document.getElementById('cardGrid');

  const deckId = extractDeckId(urlInput.value);
  if (!deckId) {
    alert("Invalid Archidekt URL!");
    return;
  }

  urlInput.disabled = true;
  button.disabled = true;
  printBtn.disabled = true;
  loading.classList.remove('hidden');
  grid.innerHTML = '';
  cachedImages = [];

  try {
    const res = await fetch(`https://mtg-proxy-api-server.onrender.com/api/archidekt/${deckId}`);
    const data = await res.json();

    if (!data.images || data.images.length === 0) {
      throw new Error("No images returned.");
    }

    data.images.forEach(card => {
      const div = document.createElement('div');
      div.className = 'card';
      const img = document.createElement('img');
      img.src = card.img;
      img.alt = card.name;
      div.appendChild(img);
      grid.appendChild(div);
    });

    cachedImages = data.images;
    printBtn.disabled = false;

  } catch (err) {
    console.error("❌ Deck load failed:", err);
    alert("Failed to load deck.");
  }

  loading.classList.add('hidden');
  urlInput.disabled = false;
  button.disabled = false;
}

function openPrintView() {
  if (!cachedImages.length) return;

  const win = window.open('', '_blank');
  const html = `
    <html>
    <head>
      <title>Print Template</title>
      <style>
        body {
          background: white;
          color: black;
          padding: 0;
          margin: 0;
        }
        .page {
          display: flex;
          flex-wrap: wrap;
          padding: 10mm;
          gap: 5mm;
        }
        img {
          width: 63mm;
          height: 88mm;
          object-fit: cover;
          box-shadow: 0 0 2mm rgba(0,0,0,0.3);
        }
      </style>
    </head>
    <body>
      <div class="page">
        ${cachedImages.map(card => Array(card.quantity).fill(`<img src="${card.img}" alt="${card.name}" />`).join('')).join('')}
      </div>
      <script>window.print();</script>
    </body>
    </html>
  `;
  win.document.write(html);
  win.document.close();
}
