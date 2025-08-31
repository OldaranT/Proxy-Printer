// script.js

// ---------- Tweakable constants ----------
const CONFIG = {
  // Supported page sizes (portrait dimensions, in mm)
  PAGE_SIZES_MM: {
    A4: { W: 210, H: 297 },
    A3: { W: 297, H: 420 }
  },
  DEFAULT_PAGE: 'A4',              // used when pageSize toggle is OFF

  // Auto orientation picks portrait/landscape to maximize #cards per page.
  // Options: 'auto' | 'portrait' | 'landscape'
  ORIENTATION_MODE: 'auto',

  // Card geometry (mm)
  CARD_MM: { W: 63, H: 88 },

  // Spacing
  GAP_WHEN_ENABLED_MM: 6,          // space between cards when "spaceBetween" toggle is ON

  // Cutline (corner crop marks) styling
  CUTLINE: {
    OFFSET_FROM_EDGE_MM: 0.5,      // 0.5mm from card edge to start of each crop mark
    LENGTH_MM: 2,                  // each crop mark line is 2mm long
    STROKE_PX: 1.2,                // stroke width (canvas pixels)
    COLOR: '#00ff00'               // crop mark color
  },

  // Back image for duplex printing
  BACK_IMAGE_URL: 'https://i.imgur.com/LdOBU1I.jpeg',

  // Canvas pixel density (used to size the canvases to the physical page)
  CANVAS_DPI: 96                   // pixels per inch for the canvas drawing of cutlines & bg panel
};
// ----------------------------------------

let cachedImages = [];
let cachedDeckName = "Deck";

// The new UI uses slider-style checkboxes with these IDs:
// cutLinesToggle, spaceBetweenToggle, backSideToggle, blackBackgroundToggle, pageSizeToggle

document.addEventListener('DOMContentLoaded', () => {
  // Slider toggles are pure CSS (:checked). No JS needed here.
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
 * Choose portrait or landscape to maximize capacity (unless orientation is forced).
 */
function choosePageGeometry(sizeKey, gapmm) {
  const base = CONFIG.PAGE_SIZES_MM[sizeKey]; // portrait dims
  let portrait = { W: base.W, H: base.H, orient: 'portrait' };
  let landscape = { W: base.H, H: base.W, orient: 'landscape' };

  if (CONFIG.ORIENTATION_MODE === 'portrait') return portrait;
  if (CONFIG.ORIENTATION_MODE === 'landscape') return landscape;

  const a = computeGridDims(portrait.W, portrait.H, CONFIG.CARD_MM.W, CONFIG.CARD_MM.H, gapmm);
  const b = computeGridDims(landscape.W, landscape.H, CONFIG.CARD_MM.W, CONFIG.CARD_MM.H, gapmm);
  return (b.cols * b.rows) > (a.cols * a.rows) ? landscape : portrait; // tie -> portrait
}

/**
 * Print view with options:
 * - spaceBetweenToggle: adds GAP_WHEN_ENABLED_MM gaps between cards (cards remain 63x88mm).
 * - backSideToggle: inserts a matching "backs" page after each fronts page.
 *   Backs are ALWAYS full-page grids (9 for A4, 18 for A3) and perfectly centered.
 * - blackBackgroundToggle: draws a CANVAS at the lowest z-index (−5) so PDF includes it.
 * - cutLinesToggle: per-card corner crop marks (2mm lines, start 0.5mm from edges).
 * - pageSizeToggle: toggles between A4 (unchecked) and A3 (checked).
 * - Auto orientation: chooses portrait/landscape to fit the MOST cards per page.
 */
function openPrintView() {
  if (!cachedImages.length) return;

  const deckName        = cachedDeckName;
  const showCutlines    = document.getElementById('cutLinesToggle')?.checked;
  const addSpaceBetween = document.getElementById('spaceBetweenToggle')?.checked;
  const addBackground   = document.getElementById('backSideToggle')?.checked;
  const useA3           = document.getElementById('pageSizeToggle')?.checked || false;
  const useBlackBg      = document.getElementById('blackBackgroundToggle')?.checked || false;

  const sizeKey = useA3 ? 'A3' : CONFIG.DEFAULT_PAGE;

  // Geometry (mm)
  const CARD_W = CONFIG.CARD_MM.W;
  const CARD_H = CONFIG.CARD_MM.H;
  const GAP = addSpaceBetween ? CONFIG.GAP_WHEN_ENABLED_MM : 0;

  // Decide orientation + working page dims
  const chosen = choosePageGeometry(sizeKey, GAP);
  const PAGE_W = chosen.W;
  const PAGE_H = chosen.H;
  const ORIENT = chosen.orient;

  // Compute grid (dynamic)
  const { cols: GRID_COLS, rows: GRID_ROWS } = computeGridDims(PAGE_W, PAGE_H, CARD_W, CARD_H, GAP);

  // Derived sheet dimensions and centered margins (CENTER-BASED ALIGNMENT)
  const SHEET_W = GRID_COLS * CARD_W + (GRID_COLS - 1) * GAP;
  const SHEET_H = GRID_ROWS * CARD_H + (GRID_ROWS - 1) * GAP;
  const MARGIN_L = Math.max(0, (PAGE_W - SHEET_W) / 2);
  const MARGIN_T = Math.max(0, (PAGE_H - SHEET_H) / 2);

  // Canvas sizing from physical page size
  const MM_PER_IN = 25.4;
  const CANVAS_W_PX = Math.round((PAGE_W / MM_PER_IN) * CONFIG.CANVAS_DPI);
  const CANVAS_H_PX = Math.round((PAGE_H / MM_PER_IN) * CONFIG.CANVAS_DPI);

  const cards = cachedImages.flatMap(card => Array(card.quantity ?? 1).fill(card.img));
  const perPage = GRID_COLS * GRID_ROWS;

  const titleBits = [
    deckName,
    `${sizeKey} ${ORIENT}`,
    `${perPage}/page`,
    showCutlines ? '(cutlines)' : '(no cutlines)',
    addSpaceBetween ? `(${GAP}mm gaps)` : '(tight)',
    addBackground ? '(with backs)' : '',
    useBlackBg ? '(black page bg panel)' : ''
  ].filter(Boolean);
  const title = titleBits.join(' ');

  const win = window.open('', '_blank');

  function buildPageHTML(imgSrcs, isBack = false) {
    // FRONT: use actual chunk images (could be < perPage)
    // BACK: always fill the entire page with background backs (exactly perPage)
    const imgs = isBack ? new Array(perPage).fill(CONFIG.BACK_IMAGE_URL) : imgSrcs;
    const imagesHTML = imgs.map(src => `<img src="${src}" alt="${isBack ? 'Card back' : 'Card front'}" />`).join('');

    return `
      <div class="page ${isBack ? 'back' : 'front'}">
        <!-- Lowest layer: CANVAS we fill (black/transparent), with z-index -5 inside a page stacking context -->
        <canvas class="page-fill" width="${CANVAS_W_PX}" height="${CANVAS_H_PX}"
          style="position:absolute; left:0; top:0; width:${PAGE_W}mm; height:${PAGE_H}mm; z-index:-5;"></canvas>

        <!-- Centered sheet of cards -->
        <div class="sheet" style="
          top:${MARGIN_T}mm;
          left:${MARGIN_L}mm;
          width:${SHEET_W}mm;
          height:${SHEET_H}mm;
          display:grid;
          grid-template-columns: repeat(${GRID_COLS}, ${CARD_W}mm);
          grid-template-rows: repeat(${GRID_ROWS}, ${CARD_H}mm);
          gap:${GAP}mm;
          z-index:10;">
          ${imagesHTML}
        </div>

        <!-- Cutlines overlay -->
        <div class="cutlines" style="position:absolute; inset:0; z-index:20; pointer-events:none; display:${showCutlines ? 'block' : 'none'};">
          <canvas width="${CANVAS_W_PX}" height="${CANVAS_H_PX}"
            style="position:absolute; left:0; top:0; width:${PAGE_W}mm; height:${PAGE_H}mm;"></canvas>
        </div>
      </div>
    `;
  }

  // Build all pages (fronts + optional backs)
  const pages = [];
  for (let i = 0; i < cards.length; i += perPage) {
    const chunk = cards.slice(i, i + perPage);
    pages.push(buildPageHTML(chunk, false));        // Fronts (may be partial on last page)
    if (addBackground) pages.push(buildPageHTML(chunk, true)); // Backs (ALWAYS full grid)
  }

  const html = `
  <html>
    <head>
      <title>Print Template</title>
      <style>
        @page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: transparent; }
        .page {
          position: relative;
          width: ${PAGE_W}mm;
          height: ${PAGE_H}mm;
          page-break-after: always;
          overflow: hidden;

          /* Ensure a stacking context so negative z-index children stay behind
             only within this page and don't slip under other pages */
          z-index: 0;
          isolation: isolate;
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

        // Injected geometry (shared by fronts/backs/cutlines)
        const USE_BLACK_BG = ${useBlackBg ? 'true' : 'false'};
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
        const MARGIN_L = ${MARGIN_L};
        const MARGIN_T = ${MARGIN_T};

        // Fill the bottom page canvas (ensures background is part of PDF content)
        document.querySelectorAll('.page-fill').forEach(canvas => {
          const ctx = canvas.getContext('2d');
          if (USE_BLACK_BG) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            // transparent; uncomment to force white
            // ctx.fillStyle = '#FFFFFF';
            // ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        });

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

        // Draw cutlines for each page using the same center-based math (no DOM reads)
        document.querySelectorAll('.cutlines canvas').forEach(canvas => {
          const ctx = canvas.getContext('2d');
          const pxPerMM_X = canvas.width / PAGE_W;
          const pxPerMM_Y = canvas.height / PAGE_H;

          const left = MARGIN_L * pxPerMM_X;
          const top  = MARGIN_T * pxPerMM_Y;

          const cardW = CARD_W * pxPerMM_X;
          const cardH = CARD_H * pxPerMM_Y;
          const gapX  = GAP * pxPerMM_X;
          const gapY  = GAP * pxPerMM_Y;

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
