let cachedImages = [];

async function loadDeck() {
  const urlInput = document.getElementById('deckUrl');
  const button = document.getElementById('loadBtn');
  const printBtn = document.getElementById('printBtn');
  const loading = document.getElementById('loading');
  const grid = document.getElementById('cardGrid');

  const deckUrl = urlInput.value.trim();
  if (!deckUrl.startsWith('http')) {
    alert("Please enter a valid Archidekt or Moxfield deck URL.");
    return;
  }

  urlInput.disabled = true;
  button.disabled = true;
  printBtn.disabled = true;
  loading.classList.remove('hidden');
  grid.innerHTML = '';
  cachedImages = [];

  try {
    const encodedUrl = encodeURIComponent(deckUrl);
    const res = await fetch(`https://mtg-proxy-api-server.onrender.com/api/deck?url=${encodedUrl}`);
    const data = await res.json();

    if (!data.images || data.images.length === 0) {
      throw new Error("No images returned.");
    }

    data.images.forEach(card => {
      for (let i = 0; i < card.quantity; i++) {
        const div = document.createElement('div');
        div.className = 'card';
        const img = document.createElement('img');
        img.src = card.img;
        img.alt = card.name;
        div.appendChild(img);
        grid.appendChild(div);
      }
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
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .page {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-auto-rows: 94mm;
            gap: 5mm;
            padding: 5mm;
            page-break-inside: avoid;
          }
          img {
            width: 63mm;
            height: 88mm;
            object-fit: cover;
          }
        }
        body {
          background: white;
          color: black;
        }
        .page {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-auto-rows: 94mm;
          gap: 5mm;
          padding: 5mm;
        }
        img {
          width: 63mm;
          height: 88mm;
          object-fit: cover;
        }
      </style>
    </head>
    <body>
      <div class="page">
        ${cachedImages.map(card =>
          Array(card.quantity).fill(`<img src="${card.img}" alt="${card.name}" />`).join('')
        ).join('')}
      </div>
      <script>
        window.onload = () => window.print();
      </script>
    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}
