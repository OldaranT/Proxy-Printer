// script.js

// ---------- Tweakable constants ----------
const CONFIG = {
  // Supported page sizes (portrait, in mm)
  PAGE_SIZES_MM: {
    A4: { W: 210, H: 297 },
    A3: { W: 297, H: 420 }
  },
  DEFAULT_PAGE: 'A4',              // starting size if your toggle is unchecked

  // Card geometry (mm)
  CARD_MM: { W: 63, H: 88 },

  // Spacing
  GAP_WHEN_ENABLED_MM: 6,          // space between cards when "spaceBetween" toggle is ON

  // Cutline (corner crop marks) styling
  CUTLINE: {
    OFFSET_FROM_EDGE_MM: 0.5,      // space from card edge to start of each crop mark
    LENGTH_MM: 2,                  // length of each crop mark line
    STROKE_PX: 1.2,                // stroke width (canvas pixels)
    COLOR: '#00ff00'               // crop mark color
  },

  // Back image for duplex printing
  BACK_IMAGE_URL: 'https://i.imgur.com/LdOBU1I.jpeg',

  // Canvas pixel density (used to size the canvas to the physical page)
  CANVAS_DPI: 96                   // pixels per inch for the canvas drawing of cutlines
};
// ----------------------------------------

let cachedImages = [];
let cachedDeckName = "Deck";

document.addEventListener('DOMContentLoaded', () => {
  const cutlineToggleWrapper = document.getElementById('cutlineToggleWrapper');
  const cutlineToggleCheckbox = document.getElementById('cutlineToggle');

  const spaceBetweenToggleWrapper = document.getElementById('spaceBetweenToggleWrapper');
  const spaceBetweenToggleCheckbox = document.getElementById('spaceBetweenToggle');

  const showBackgroundToggleWrapper = document.getElementById('showBackgroundToggleWrapper');
  const showBackgroundToggleCheckbox = document.getElementById('showBackgroundToggle');

  const pageSizeToggleWrapper = document.getElementById('pageSizeToggleWrapper');
  const pageSizeToggleCheckbox = document.getElementById('pageSizeToggle');

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

  if (pageSizeToggleWrapper && pageSizeToggleCheckbox) {
    pageSizeToggleWrapper.addEventListener('click', () => {
      pageSizeToggleCheckbox.checked = !pageSizeToggleCheckbox.checked;
      pageSizeToggleWrapper.classList.toggle('active', pageSizeToggleCheckbox.checked);
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
  if (pageSizeToggleWrapper && pageSizeToggleCheckbox) {
    // If you want A3 by default, set the checkbox default in HTML or flip this line
    pageSizeToggleWrapper.classList.toggle('active', pageSizeToggleCheckbox.checked);
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
 * Compute max grid that fits on a page given physical dimensions and gap.
 * Returns { cols, rows } with minimum of 1 each.
 */
function computeGridDims(pageWmm, pageHmm, cardWmm, cardHmm, gapmm) {
  const cols = Math.max(1, Math.floor((pageWmm + gapmm) / (cardWmm + gapmm)));
  const rows = Math.max(1, Math.floor((pageHmm + gapmm) / (cardHmm + gapmm)));
  return { cols, rows };
}

/**
 * Print view with options:
 * - spaceBetweenToggle: adds GAP_WHEN_ENABLED_MM gaps between cards (cards remain 63x88mm).
 * - showBackgroundToggle: inserts a matching "backs" page after each fronts page (duplex aligned).
 * - cutlineToggle: corner crop marks per card (two lines, 2mm long, starting 0.5mm from each corner).
 * - pageSizeToggle: toggles between A4 (unchecked) and A3 (checked).
 */
function openPrintView() {
  if (!cachedImages.length) return;

  const deckName = cachedDeckName;
  const showCutlines = document.getElementById('cutlineToggle')?.checked;
  const addSpaceBetween = document.getElementById('spaceBetweenToggle')?.checked;
  const addBackground = document.getElementById('showBackgroundToggle')?.checked;

  // Page size toggle: unchecked => A4, checked => A3
  const useA3 = document.getElementById('pageSizeToggle')?.checked || false;
  const sizeKey = useA3 ? 'A3' : CONFIG.DEFAULT_PAGE; // DEFAULT_PAGE is 'A4' unless you change it
  const PAGE_W = CONFIG.PAGE_SIZES_MM[sizeKey].W;
  const PAGE_H = CONFIG.PAGE_SIZES_MM[sizeKey].H;

  // Geometry (mm)
  const CARD_W = CONFIG.CARD_MM.W;
  const CARD_H = CONFIG.CARD_MM.H;
  const GAP = addSpaceBetween ? CONFIG.GAP_WHEN_ENABLED_MM : 0;

  // Compute grid (dynamic: more cards on A3)
  const { cols: GRID_COLS, rows: GRID_ROWS } = computeGridDims(PAGE_W, PAGE_H, CARD_W, CARD_H, GAP);

  // Derived sheet dimensions (centered on page)
  const SHEET_W = GRID_COLS * CARD_W + (GRID_COLS - 1) * GAP;
  const SHEET_H = GRID_ROWS * CARD_H + (GRID_ROWS - 1) * GAP;
  const MARGIN_L = Math.max(0, (PAGE_W - SHEET_W) / 2);
  const MARGIN_T = Math.max(0, (PAGE_H - SHEET_H) / 2);

  // Canvas size in pixels based on physical page dimensions
  const MM_PER_IN = 25.4;
  const CANVAS_W_PX = Math.round((PAGE_W / MM_PER_IN) * CONFIG.CANVAS_DPI);
  const CANVAS_H_PX = Math.round((PAGE_H / MM_PER_IN) * CONFIG.CANVAS_DPI);

  const cards = cachedImages.flatMap(card => Array(card.quantity).fill(card.img));
  const titleBits = [
    deckName,
    sizeKey,
    showCutlines ? '(cutlines)' : '(no cutlines)',
    addSpaceBetween ? `(${GAP}mm gaps)` : '(tight)',
    addBackground ? '(with backs)' : ''
  ].filter(Boolean);
  const title = titleBits.join(' ');

  const win = window.open('', '_blank');

  // Build one page's HTML (front or back). Back uses the same geometry.
  function buildPageHTML(imgSrcs, isBack = false) {
    const imgs = isBack ? new Array(imgSrcs.length).fill(CONFIG.BACK_IMAGE_URL) : imgSrcs;
    const imagesHTML = imgs.map(src => `<img src="${src}" alt="${isBack ? 'Card back' : 'Card front'}" />`).join('');

    return `
      <div class="page ${isBack ? 'back' : 'front'}">
        <div class="sheet" style="
          top:${MARGIN_T}mm;
          left:${MARGIN_L}mm;
          width:${SHEET_W}mm;
          height:${SHEET_H}mm;
          grid-template-columns: repeat(${GRID_COLS}, ${CARD_W}mm);
          grid-template-rows: repeat(${GRID_ROWS}, ${CARD_H}mm);
          gap:${GAP}mm;">
          ${imagesHTML}
        </div>
        <div class="cutlines" style="display:${showCutlines ? 'block' : 'none'};">
          <canvas width="${CANVAS_W_PX}" height="${CANVAS_H_PX}"></canvas>
        </div>
      </div>
    `;
  }

  // Build all pages (fronts + optional backs)
  const pages = [];
  const pageCapacity = GRID_COLS * GRID_ROWS;
  for (let i = 0; i < cards.length; i += pageCapacity) {
    const chunk = cards.slice(i, i + pageCapacity);
    pages.push(buildPageHTML(chunk, false));        // Fronts
    if (addBackground) pages.push(buildPageHTML(chunk, true)); // Backs
  }

  const html = `
  <html>
    <head>
      <title>Print Template</title>
      <style>
        @page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
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

        // Cutline config (injected constants)
        const OFFSET_MM = ${CONFIG.CUTLINE.OFFSET_FROM_EDGE_MM};
        const LENGTH_MM = ${CONFIG.CUTLINE.LENGTH_MM};
        const STROKE_PX = ${CONFIG.CUTLINE.STROKE_PX};
        const COLOR = ${JSON.stringify(CONFIG.CUTLINE.COLOR)};

        const PAGE_W = ${PAGE_W};
        const PAGE_H = ${PAGE_H};
        const CARD_W = ${CARD_W};
        const CARD_H = ${CARD_H};
        const GAP = ${GAP};
        const GRID_COLS = ${GRID_COLS};
        const GRID_ROWS = ${GRID_ROWS};

        function drawCornerMarks(ctx, x, y, w, h, pxPerMM_X, pxPerMM_Y) {
          const offX = OFFSET_MM * pxPerMM_X;
          const offY = OFFSET_MM * pxPerMM_Y;
          const lenX = LENGTH_MM * pxPerMM_X;
          const lenY = LENGTH_MM * pxPerMM_Y;

          ctx.strokeStyle = COLOR;
          ctx.lineWidth = STROKE_PX;

          // TOP-LEFT
          ctx.beginPath();
          ctx.moveTo(x - offX - lenX, y);  // horizontal outward
          ctx.lineTo(x - offX, y);
          ctx.moveTo(x, y - offY - lenY);  // vertical outward
          ctx.lineTo(x, y - offY);
          ctx.stroke();

          // TOP-RIGHT
          ctx.beginPath();
          ctx.moveTo(x + w + offX, y);
          ctx.lineTo(x + w + offX + lenX, y);
          ctx.moveTo(x + w, y - offY - lenY);
          ctx.lineTo(x + w, y - offY);
          ctx.stroke();

          // BOTTOM-LEFT
          ctx.beginPath();
          ctx.moveTo(x - offX - lenX, y + h);
          ctx.lineTo(x - offX, y + h);
          ctx.moveTo(x, y + h + offY);
          ctx.lineTo(x, y + h + offY + lenY);
          ctx.stroke();

          // BOTTOM-RIGHT
          ctx.beginPath();
          ctx.moveTo(x + w + offX, y + h);
          ctx.lineTo(x + w + offX + lenX, y + h);
          ctx.moveTo(x + w, y + h + offY);
          ctx.lineTo(x + w, y + h + offY + lenY);
          ctx.stroke();
        }

        // Draw for each page
        document.querySelectorAll('.cutlines canvas').forEach(canvas => {
          const ctx = canvas.getContext('2d');
          const pxPerMM_X = canvas.width / PAGE_W;
          const pxPerMM_Y = canvas.height / PAGE_H;

          // Read sheet position from inline style to stay exact
          const sheet = canvas.parentElement.previousElementSibling;
          const style = sheet.style;

          const leftMM = parseFloat(style.left);
          const topMM = parseFloat(style.top);

          const left = leftMM * pxPerMM_X;
          const top  = topMM  * pxPerMM_Y;

          const cardW = CARD_W * pxPerMM_X;
          const cardH = CARD_H * pxPerMM_Y;
          const gapX  = GAP * pxPerMM_X;
          const gapY  = GAP * pxPerMM_Y;

          // Loop grid and draw corner marks for each card
          for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
              const x = left + col * (cardW + gapX);
              const y = top  + row * (cardH + gapY);
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
