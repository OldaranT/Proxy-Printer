let cachedImages = [];
let cachedDeckName = "Deck";

document.addEventListener('DOMContentLoaded', () => {
  const cutlineToggleWrapper = document.getElementById('cutlineToggleWrapper');
  const cutlineToggleCheckbox = document.getElementById('cutlineToggle');
  const spaceBetweenToggleWrapper = document.getElementById('spaceBetweenToggleWrapper');
  const spaceBetweenToggleCheckbox = document.getElementById('spaceBetweenToggle');
  const showBackgroundToggleWrapper = document.getElementById('showBackgroundToggleWrapper');
  const showBackgroundToggleCheckbox = document.getElementById('showBackgroundToggle');

  // Wrapper click -> toggle checkbox + active class
  cutlineToggleWrapper.addEventListener('click', () => {
    cutlineToggleCheckbox.checked = !cutlineToggleCheckbox.checked;
    cutlineToggleWrapper.classList.toggle('active', cutlineToggleCheckbox.checked);
  });

  spaceBetweenToggleWrapper.addEventListener('click', () => {
    spaceBetweenToggleCheckbox.checked = !spaceBetweenToggleCheckbox.checked;
    spaceBetweenToggleWrapper.classList.toggle('active', spaceBetweenToggleCheckbox.checked);
  });

  showBackgroundToggleWrapper.addEventListener('click', () => {
    showBackgroundToggleCheckbox.checked = !showBackgroundToggleCheckbox.checked;
    showBackgroundToggleWrapper.classList.toggle('active', showBackgroundToggleCheckbox.checked);
  });

  // Ensure initial state is synced
  cutlineToggleWrapper.classList.toggle('active', cutlineToggleCheckbox.checked);
  spaceBetweenToggleWrapper.classList.toggle('active', spaceBetweenToggleCheckbox.checked);
  showBackgroundToggleWrapper.classList.toggle('active', showBackgroundToggleCheckbox.checked);
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
    .filter(part => part && !/^\d+$/.test(part))
    .pop()
    ?.replace(/[-_]/g, ' ')
    ?.replace(/[^\w\s]/g, '')
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

/**
 * Print view with two new options:
 * - addSpaceBetween (checkbox #spaceBetweenToggle): adds uniform gaps between cards (cards remain 63x88mm).
 * - addBackground (checkbox #showBackgroundToggle): inserts a matching "backs" page after every fronts page,
 *   using public/images/BACKGROUND.PNG. Layout & cutlines are identical so duplex prints align.
 */
function openPrintView() {
  if (!cachedImages.length) return;

  const deckName = cachedDeckName;
  const showCutlines = document.getElementById('cutlineToggle')?.checked;
  const addSpaceBetween = document.getElementById('spaceBetweenToggle')?.checked;
  const addBackground = document.getElementById('showBackgroundToggle')?.checked;

  // --- Physical constants (mm) ---
  const PAGE_W = 210;           // A4 width (mm)
  const PAGE_H = 297;           // A4 height (mm)
  const CARD_W = 63;            // card width (mm)
  const CARD_H = 88;            // card height (mm)
  const MARGIN_L = 10.5;        // left margin (mm)
  const MARGIN_T = 13.5;        // top margin (mm)
  const GAP = addSpaceBetween ? 3 : 0; // uniform gap between cards (mm) — tweak if you want more/less

  // Derived sheet dimensions (3x3 grid)
  const SHEET_W = 3 * CARD_W + 2 * GAP;
  const SHEET_H = 3 * CARD_H + 2 * GAP;

  const cards = cachedImages.flatMap(card => Array(card.quantity).fill(card.img));
  const titleBits = [
    deckName,
    showCutlines ? '(cutlines)' : '(no cutlines)',
    addSpaceBetween ? '(with gaps)' : '(tight)',
    addBackground ? '(with backs)' : ''
  ].filter(Boolean);
  const title = titleBits.join(' ');

  const win = window.open('', '_blank');

  // Helper to build one "front" page (or "back" page if isBack=true)
  function buildPageHTML(imgSrcs, isBack = false) {
    // for back pages use the BACKGROUND.PNG for all 9 slots
    const imgs = isBack ? new Array(imgSrcs.length).fill('public/images/BACKGROUND.PNG') : imgSrcs;
    const imagesHTML = imgs.map(src => `<img src="${src}" alt="${isBack ? 'Card back' : 'Card front'}" />`).join('');

    return `
      <div class="page ${isBack ? 'back' : 'front'}">
        <div class="sheet" style="
          top:${MARGIN_T}mm;
          left:${MARGIN_L}mm;
          width:${SHEET_W}mm;
          height:${SHEET_H}mm;
          grid-template-columns: repeat(3, ${CARD_W}mm);
          grid-template-rows: repeat(3, ${CARD_H}mm);
          gap:${GAP}mm;">
          ${imagesHTML}
        </div>
        <div class="cutlines" style="display:${showCutlines ? 'block' : 'none'};">
          <canvas width="794" height="1123"></canvas>
        </div>
      </div>
    `;
  }

  // Build all pages (fronts, then optional matching backs)
  const pages = [];
  for (let i = 0; i < cards.length; i += 9) {
    const chunk = cards.slice(i, i + 9);
    // Fronts
    pages.push(buildPageHTML(chunk, false));
    // Backs (exact same geometry so duplex aligns)
    if (addBackground) {
      pages.push(buildPageHTML(chunk, true));
    }
  }

  const html = `
  <html>
    <head>
      <title>Print Template</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; }
        .page {
          position: relative;
          width: ${PAGE_W}mm;
          height: ${PAGE_H}mm;    /* corrected to full A4 height */
          page-break-after: always;
        }
        .cutlines {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }
        .sheet {
          position: absolute;
          display: grid;
          z-index: 2;
        }
        .sheet img {
          width: ${CARD_W}mm;
          height: ${CARD_H}mm;
          object-fit: cover;
          display: block;
        }
      </style>
    </head>
    <body>
      ${pages.join('')}
      <script>
        document.title = ${JSON.stringify(title)};

        // Draw cutlines aligned to the grid, respecting margins and gaps
        const canvases = document.querySelectorAll('.cutlines canvas');
        canvases.forEach(canvas => {
          const ctx = canvas.getContext('2d');
          const pxPerMM_X = canvas.width / ${PAGE_W};
          const pxPerMM_Y = canvas.height / ${PAGE_H};

          const left = ${MARGIN_L} * pxPerMM_X;
          const top = ${MARGIN_T} * pxPerMM_Y;
          const cardW = ${CARD_W} * pxPerMM_X;
          const cardH = ${CARD_H} * pxPerMM_Y;
          const gapX = ${GAP} * pxPerMM_X;
          const gapY = ${GAP} * pxPerMM_Y;

          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 1.5;

          // Vertical grid boundaries (0..3)
          for (let i = 0; i <= 3; i++) {
            const x = left + i * cardW + (i > 0 ? i * gapX : 0);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }

          // Horizontal grid boundaries (0..3)
          for (let j = 0; j <= 3; j++) {
            const y = top + j * cardH + (j > 0 ? j * gapY : 0);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
        });

        // Auto-open the print dialog
        window.onload = () => window.print();
      <\/script>
    </body>
  </html>
  `;

  win.document.write(html);
  win.document.close();
}

// Icon rotation (unchanged)
const spinnerIcon = document.getElementById('spinnerIcon');
const iconPaths = [
  'public/icons/FF-ICON-1.png',
  'public/icons/FF-ICON-2.png',
  'public/icons/FF-ICON-3.png'
];
let currentIconIndex = 0;
setInterval(() => {
  currentIconIndex = (currentIconIndex + 1) % iconPaths.length;
  if (spinnerIcon) spinnerIcon.src = iconPaths[currentIconIndex];
}, 5000);