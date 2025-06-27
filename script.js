let cachedImages = [];
let cachedDeckName = "Deck";

document.addEventListener('DOMContentLoaded', () => {
  const toggleWrapper = document.getElementById('cutlineToggleWrapper');
  const toggleCheckbox = document.getElementById('cutlineToggle');

  toggleWrapper.addEventListener('click', () => {
    toggleCheckbox.checked = !toggleCheckbox.checked;
    toggleWrapper.classList.toggle('active', toggleCheckbox.checked);
  });

  // Ensure initial state is synced
  toggleWrapper.classList.toggle('active', toggleCheckbox.checked);
});


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
  
  const url = urlInput.value.trim();
  const urlParts = url.split('/');
  cachedDeckName = urlParts
    .filter(part => part && !/^\d+$/.test(part)) // filter out numeric segments
    .pop()                                      // last non-numeric part
    ?.replace(/[-_]/g, ' ')                     // convert dashes to spaces
    ?.replace(/[^\w\s]/g, '')                   // remove special chars
    ?.trim() || "Deck";     

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
  
  const deckName = cachedDeckName;
  const showCutlines = document.getElementById('cutlineToggle')?.checked;
  const win = window.open('', '_blank');
  const cards = cachedImages.flatMap(card => Array(card.quantity).fill(card.img));
  const title = `${deckName} ${showCutlines ? '(cutlines)' : '(no cutlines)'}`;

  const html = `
  <html>
  <head>
    <title>Print Template</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
        background: white;
      }
      .page {
        position: relative;
        width: 210mm;
        height: 291mm;
        page-break-after: always;
      }
      .cutlines {
        position: absolute;
        top: 0;
        left: 0;
        width: 210mm;
        height: 297mm;
        z-index: 1;
        display: ${showCutlines ? 'block' : 'none'};
        pointer-events: none;
      }
      .sheet {
        position: absolute;
        top: 13.5mm;
        left: 10.5mm;
        width: 189mm;
        height: 291mm;
        display: grid;
        grid-template-columns: repeat(3, 63mm);
        grid-template-rows: repeat(3, 88mm);
        gap: 0;
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
    ${(() => {
      const pages = [];
      for (let i = 0; i < cards.length; i += 9) {
        const cardImgs = cards.slice(i, i + 9);
        const images = cardImgs.map(src => `<img src="${src}" />`).join('');
        pages.push(`
          <div class="page">
            <div class="sheet">${images}</div>
            <div class="cutlines">
              <canvas width="794" height="1123"></canvas>
            </div>
          </div>
        `);
      }
      return pages.join('');
    })()}
    <script>
      document.title = ${JSON.stringify(title)};
      const canvases = document.querySelectorAll('.cutlines canvas');
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        const pxPerMM = canvas.width / 210;
        const cardW = 63 * pxPerMM;
        const cardH = 88 * pxPerMM;
        const left = 10.5 * pxPerMM;
        const top = 13.5 * pxPerMM;
        const extend = 5 * pxPerMM;

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1.5;

        // Vertical cutlines
        for (let i = 0; i <= 3; i++) {
          const x = left + i * cardW;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }

        // Horizontal cutlines
        for (let i = 0; i <= 3; i++) {
          const y = top + i * cardH;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      });

      window.onload = () => window.print();
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