let cachedImages = [];

function extractDeckUrl(url) {
  return url.trim();
}

async function loadDeck() {
  const urlInput = document.getElementById('deckUrl');
  const button = document.getElementById('loadBtn');
  const printBtn = document.getElementById('printBtn');
  const loading = document.getElementById('loading');
  const grid = document.getElementById('cardGrid');

  const deckUrl = extractDeckUrl(urlInput.value);
  if (!deckUrl || (!deckUrl.includes("archidekt.com") && !deckUrl.includes("moxfield.com"))) {
    alert("Please enter a valid Archidekt or Moxfield URL.");
    return;
  }

  urlInput.disabled = true;
  button.disabled = true;
  printBtn.disabled = true;
  loading.classList.remove('hidden');
  grid.innerHTML = '';
  cachedImages = [];

  try {
    const res = await fetch(`https://mtg-proxy-api-server.onrender.com/api/deck?url=${encodeURIComponent(deckUrl)}`);
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
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
        }
        body {
          background: white;
          padding: 0;
          margin: 0;
        }
        .sheet {
          display: grid;
          grid-template-columns: repeat(3, 63mm);
          grid-template-rows: repeat(3, 88mm);
          gap: 0;
          justify-content: center;
          align-items: center;
          position: relative;
          width: 210mm;
          height: 297mm;
          margin: auto;
        }
        .sheet img {
          width: 63mm;
          height: 88mm;
          object-fit: cover;
        }
        .cutlines {
          position: absolute;
          top: 0;
          left: 0;
          width: 210mm;
          height: 297mm;
          pointer-events: none;
        }
        .cutlines canvas {
          width: 210mm;
          height: 297mm;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        ${cachedImages.map(card =>
          Array(card.quantity).fill(`<img src="${card.img}" alt="${card.name}"/>`).join('')
        ).join('')}
        <div class="cutlines">
          <canvas width="793" height="1122"></canvas>
        </div>
      </div>
      <script>
        const canvas = document.querySelector('.cutlines canvas');
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 0.5;

        const w = canvas.width;
        const h = canvas.height;

        const mmToPx = mm => mm * 3.78;
        const cardW = mmToPx(63);
        const cardH = mmToPx(88);

        for (let i = 1; i < 3; i++) {
          const x = i * cardW;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }

        for (let i = 1; i < 3; i++) {
          const y = i * cardH;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        window.onload = () => window.print();
      </script>
    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}

// Spinner icon rotation
const spinnerIcon = document.getElementById('spinnerIcon');
const iconPaths = [
  'public/icons/FIN_expansion_symbol.png',
  'public/icons/2_Yu3v3e1Kpp.png',
  'public/icons/3_Yu3v3e1Kpp.png'
];

let currentIconIndex = 0;
setInterval(() => {
  currentIconIndex = (currentIconIndex + 1) % iconPaths.length;
  spinnerIcon.src = iconPaths[currentIconIndex];
}, 5000);
