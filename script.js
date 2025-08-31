// script.js

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
  if (cutlineToggleWrapper && cutlineToggleCheckbox) {
    cutlineToggleWrapper.addEventListener('click', () => {
      cutlineToggleCheckbox.checked = !cutlineToggleCheckbox.checked;
      cutlineToggleWrapper.classList.toggle('active', cutlineToggleCheckbox.checked);
    });
  }

  if (spaceBetweenToggleWrapper && spaceBetweenToggleCheckbox) {
    spaceBetweenToggleWrapper.addEventListener('click', () => {
      spaceBetweenToggleCheckbox.checked = !spaceBetweenToggleCheckbox.checked;
      spaceBetweenToggleWrapper.classList.toggle('active', spaceBetweenToggleCheckbox.checked);
    });
  }

  if (showBackgroundToggleWrapper && showBackgroundToggleCheckbox) {
    showBackgroundToggleWrapper.addEventListener('click', () => {
      showBackgroundToggleCheckbox.checked = !showBackgroundToggleCheckbox.checked;
      showBackgroundToggleWrapper.classList.toggle('active', showBackgroundToggleCheckbox.checked);
    });
  }

  // Ensure initial state is synced
  if (cutlineToggleWrapper && cutlineToggleCheckbox) {
    cutlineToggleWrapper.classList.toggle('active', cutlineToggleCheckbox.checked);
  }
  if (spaceBetweenToggleWrapper && spaceBetweenToggleCheckbox) {
    spaceBetweenToggleWrapper.classList.toggle('active', spaceBetweenToggleCheckbox.checked);
  }
  if (showBackgroundToggleWrapper && showBackgroundToggleCheckbox) {
    showBackgroundToggleWrapper.classList.toggle('active', showBackgroundToggleCheckbox.checked);
  }
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
 * Print view with options:
 * - addSpaceBetween (checkbox #spaceBetweenToggle): adds 10mm gaps between cards (cards remain 63x88mm).
 * - addBackground (checkbox #showBackgroundToggle): inserts a matching "backs" page after each fronts page,
 *   using https://i.imgur.com/LdOBU1I.jpeg. Layout & cutlines are identical so duplex prints align.
 * - Cutlines: per-card corner crop marks: two outgoing lines (H+V) of 3mm, starting 1mm away from each corner.
 */
function openPrintView() {
  if (!cachedImages.length) return;

  const deckName = cachedDeckName;
  const showCutlines = document.getElementById('cutlineToggle')?.checked;
  const addSpaceBetween = document.getElementById('spaceBetweenToggle')?.checked;
  const addBackground = document.getElementById('showBackgroundToggle')?.checked;

  // --- Physical constants (mm) ---
  const PAGE_W = 210;              // A4 width (mm)
  const PAGE_H = 297;              // A4 height (mm)
  const CARD_W = 63;               // card width (mm)
  const CARD_H = 88;               // card height (mm)
  const GAP = addSpaceBetween ? 10 : 0; // gap between cards (mm)

  // Derived sheet dimensions (3x3 grid)
  const SHEET_W = 3 * CARD_W + 2 * GAP; // 63*3 + 2*GAP
  const SHEET_H = 3 * CARD_H + 2 * GAP; // 88*3 + 2*GAP

  // Center the sheet so it always fits on A4 (keeps A4 format, preserves card size)
  const MARGIN_L = Math.max(0, (PAGE_W - SHEET_W) / 2);
  const MARGIN_T = Math.max(0, (PAGE_H - SHEET_H) / 2);

  const cards = cachedImages.flatMap(card => Array(card.quantity).fill(card.img));
  const titleBits = [
    deckName,
    showCutlines ? '(cutlines)' : '(no cutlines)',
    addSpaceBetween ? '(10mm gaps)' : '(tight)',
    addBackground ? '(with backs)' : ''
  ].filter(Boolean);
  const title = titleBits.join(' ');

  const win = window.open('', '_blank');

  // Use the provided absolute URL so the image is present in the new window's source
  const backgroundAbsUrl = 'https://i.imgur.com/LdOBU1I.jpeg';

  // Helper to build one "front" page (or "back" page if isBack=true)
  function buildPageHTML(imgSrcs, isBack = false) {
    // for back pages use the BACKGROUND image for all card slots being used on this page
    const imgs = isBack ? new Array(imgSrcs.length).fill(backgroundAbsUrl) : imgSrcs;
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
          height: ${PAGE_H}mm;
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

        // Draw corner crop marks for EVERY card:
        // two outgoing lines of 3mm starting 1mm away from each corner (one horizontal + one vertical).
        const OFFSET_MM = 1;  // gap between card edge and start of line
        const LENGTH_MM = 3;  // length of each crop mark line

        function drawCornerMarks(ctx, x, y, w, h, pxPerMM_X, pxPerMM_Y) {
          const offX = OFFSET_MM * pxPerMM_X;
          const offY = OFFSET_MM * pxPerMM_Y;
          const lenX = LENGTH_MM * pxPerMM_X;
          const lenY = LENGTH_MM * pxPerMM_Y;

          // TOP-LEFT
          ctx.beginPath();
          // horizontal to the left
          ctx.moveTo(x - offX - lenX, y);
          ctx.lineTo(x - offX, y);
          // vertical up
          ctx.moveTo(x, y - offY - lenY);
          ctx.lineTo(x, y - offY);
          ctx.stroke();

          // TOP-RIGHT
          ctx.beginPath();
          // horizontal to the right
          ctx.moveTo(x + w + offX, y);
          ctx.lineTo(x + w + offX + lenX, y);
          // vertical up
          ctx.moveTo(x + w, y - offY - lenY);
          ctx.lineTo(x + w, y - offY);
          ctx.stroke();

          // BOTTOM-LEFT
          ctx.beginPath();
          // horizontal to the left
          ctx.moveTo(x - offX - lenX, y + h);
          ctx.lineTo(x - offX, y + h);
          // vertical down
          ctx.moveTo(x, y + h + offY);
          ctx.lineTo(x, y + h + offY + lenY);
          ctx.stroke();

          // BOTTOM-RIGHT
          ctx.beginPath();
          // horizontal to the right
          ctx.moveTo(x + w + offX, y + h);
          ctx.lineTo(x + w + offX + lenX, y + h);
          // vertical down
          ctx.moveTo(x + w, y + h + offY);
          ctx.lineTo(x + w, y + h + offY + lenY);
          ctx.stroke();
        }

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
          ctx.lineWidth = 1.2;

          // Loop 3x3 grid and draw corner marks for each cell
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
              const x = left + col * (cardW + gapX);
              const y = top + row * (cardH + gapY);
              drawCornerMarks(ctx, x, y, cardW, cardH, pxPerMM_X, pxPerMM_Y);
            }
          }
        });

        // Wait for all images to load before printing (ensures backs/fronts are present)
        function whenImagesLoaded() {
          const imgs = Array.from(document.images);
          const pending = imgs.filter(img => !img.complete || img.naturalWidth === 0);
          if (!pending.length) return Promise.resolve();
          return Promise.all(pending.map(img => new Promise(res => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          })));
        }

        whenImagesLoaded().then(() => window.print());
      <\/script>
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
  if (spinnerIcon) spinnerIcon.src = iconPaths[currentIconIndex];
}, 5000);
