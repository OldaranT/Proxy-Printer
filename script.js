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
          .sheet {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            position: relative;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 63mm);
            grid-template-rows: repeat(3, 88mm);
            position: absolute;
            top: 16.5mm;
            left: 6mm;
          }
          .cell {
            width: 63mm;
            height: 88mm;
            position: relative;
            box-sizing: border-box;
          }
          .cell img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .cut-line {
            position: absolute;
            border: 0.1mm dashed black;
            pointer-events: none;
          }
          .cut-line.h {
            width: 210mm;
            height: 0;
            top: calc(var(--y) * 88mm + 16.5mm);
            left: 0;
            border-top: 0.1mm dashed black;
          }
          .cut-line.v {
            height: 297mm;
            width: 0;
            left: calc(var(--x) * 63mm + 6mm);
            top: 0;
            border-left: 0.1mm dashed black;
          }
        }
      </style>
    </head>
    <body>
      ${(() => {
        const pages = [];
        let index = 0;
        while (index < cachedImages.length) {
          const cards = cachedImages.slice(index, index + 9);
          index += 9;
          pages.push(`
            <div class="sheet">
              <div class="grid">
                ${cards.map(card => `<div class="cell"><img src="${card.img}" alt="${card.name}"></div>`).join('')}
              </div>
              ${[1, 2].map(y => `<div class="cut-line h" style="--y:${y}"></div>`).join('')}
              ${[1, 2].map(x => `<div class="cut-line v" style="--x:${x}"></div>`).join('')}
            </div>
          `);
        }
        return pages.join('');
      })()}
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}

