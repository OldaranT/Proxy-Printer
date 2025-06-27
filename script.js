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
      @page {
        size: A4 portrait;
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
        width: 210mm;
        height: 297mm;
        background: white;
        overflow: hidden;
        position: relative;
      }
      .cutlines {
        position: absolute;
        top: 0;
        left: 0;
        width: 210mm;
        height: 297mm;
        z-index: 1;
        pointer-events: none;
      }
      canvas {
        display: block;
        width: 210mm;
        height: 297mm;
      }
      .sheet {
        position: absolute;
        top: 16.5mm;
        left: 10.5mm;
        width: 189mm;
        height: 264mm;
        display: grid;
        grid-template-columns: repeat(3, 63mm);
        grid-template-rows: repeat(3, 88mm);
        z-index: 2;
      }
      .sheet img {
        width: 63mm;
        height: 88mm;
        object-fit: cover;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="cutlines">
      <canvas id="cutCanvas" width="794" height="1123"></canvas>
    </div>
    <div class="sheet" id="cardSheet"></div>

    <script>
      const images = ${JSON.stringify(cachedImages)};
      const sheet = document.getElementById('cardSheet');

      images.forEach(card => {
        for (let i = 0; i < card.quantity; i++) {
          const img = document.createElement('img');
          img.src = card.img;
          img.alt = card.name;
          sheet.appendChild(img);
        }
      });

      const canvas = document.getElementById('cutCanvas');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 0.5;

      // Scale
      const pxPerMM = canvas.width / 210;
      const leftMargin = 10.5 * pxPerMM;
      const topMargin = 16.5 * pxPerMM;
      const cardW = 63 * pxPerMM;
      const cardH = 88 * pxPerMM;

      // Draw vertical lines across full page
      for (let i = 0; i <= 3; i++) {
        const x = leftMargin + i * cardW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Draw horizontal lines across full page
      for (let i = 0; i <= 3; i++) {
        const y = topMargin + i * cardH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
        
    </script>
  </body>
  </html>
  `;

  win.document.write(html);
  win.document.close();
}


// Icon rotation
const spinnerIcon = document.getElementById('spinnerIcon');
const iconPaths = [
  'public/icons/FF-ICON-1.png',
  'public/icons/FF-ICON-2.png',
  'public/icons/FF-ICON-3.png'
];
let currentIconIndex = 0;
setInterval(() => {
  currentIconIndex = (currentIconIndex + 1) % iconPaths.length;
  spinnerIcon.src = iconPaths[currentIconIndex];
}, 5000);
