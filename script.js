let cachedImages = [];

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

  const showCutlines = document.getElementById('cutlineToggle')?.checked;
  const win = window.open('', '_blank');

  const images = cachedImages.flatMap(card =>
    Array(card.quantity).fill(card.img)
  );

  const pages = [];
  for (let i = 0; i < images.length; i += 9) {
    pages.push(images.slice(i, i + 9));
  }

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
        background: white;
      }
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .sheet {
        width: 210mm;
        height: 297mm;
        position: relative;
        page-break-after: always;
        overflow: hidden;
      }
      .cutlines {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
        display: ${showCutlines ? 'block' : 'none'};
        pointer-events: none;
      }
      .cutlines canvas {
        width: 210mm;
        height: 297mm;
        display: block;
      }
      .grid {
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
      .grid img {
        width: 63mm;
        height: 88mm;
        object-fit: cover;
        display: block;
      }
    </style>
  </head>
  <body>
    ${pages.map((page, index) => `
      <div class="sheet">
        <div class="cutlines"><canvas id="canvas${index}" width="793" height="1122"></canvas></div>
        <div class="grid">
          ${page.map(img => `<img src="${img}" />`).join('')}
        </div>
      </div>
    `).join('')}

    <script>
      const pxPerMM = 793 / 210; // Based on 96 DPI at 210mm width

      const leftMargin = 10.5 * pxPerMM;
      const topMargin = 16.5 * pxPerMM;
      const cardW = 63 * pxPerMM;
      const cardH = 88 * pxPerMM;

      const pageCount = ${pages.length};

      for (let p = 0; p < pageCount; p++) {
        const canvas = document.getElementById("canvas" + p);
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = 0.5;

        for (let i = 0; i <= 3; i++) {
          const x = leftMargin + i * cardW;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }

        for (let j = 0; j <= 3; j++) {
          const y = topMargin + j * cardH;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }

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
