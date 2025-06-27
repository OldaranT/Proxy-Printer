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

        html, body {
          background: white;
          padding: 0;
          margin: 0;
          width: 210mm;
          height: 297mm;
        }

        .sheet {
          position: absolute;
          top: 16.5mm;
          left: 10.5mm;
          display: grid;
          grid-template-columns: repeat(3, 63mm);
          grid-template-rows: repeat(3, 88mm);
          gap: 0;
          width: calc(63mm * 3);
          height: calc(88mm * 3);
        }

        .sheet img {
          width: 63mm;
          height: 88mm;
          object-fit: cover;
          position: relative;
          z-index: 2;
        }

        .cutlines {
          position: absolute;
          top: 16.5mm;
          left: 10.5mm;
          width: calc(63mm * 3);
          height: calc(88mm * 3);
          pointer-events: none;
          z-index: 1;
        }

        .cutlines canvas {
          width: 100%;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <div class="sheet" id="sheet"></div>
      <div class="cutlines">
        <canvas width="567" height="999"></canvas>
      </div>

      <script>
        const cards = ${JSON.stringify(cachedImages)};
        const sheet = document.getElementById('sheet');

        cards.forEach(card => {
          for (let i = 0; i < card.quantity; i++) {
            const img = document.createElement('img');
            img.src = card.img;
            img.alt = card.name;
            sheet.appendChild(img);
          }
        });

        const canvas = document.querySelector('.cutlines canvas');
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 0.5;

        const mmToPx = mm => mm * (canvas.width / (63 * 3));
        const cardW = mmToPx(63);
        const cardH = mmToPx(88);

        for (let i = 1; i < 3; i++) {
          const x = i * cardW;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }

        for (let i = 1; i < 3; i++) {
          const y = i * cardH;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }

        setTimeout(() => {
          window.print();
        }, 500);
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
