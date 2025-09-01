// script.js

// ---------- Tweakable constants ----------
const CONFIG = {
  PAGE_SIZES_MM: {
    A4: { W: 210, H: 297 },
    A3: { W: 297, H: 420 }
  },
  DEFAULT_PAGE: 'A4',
  ORIENTATION_MODE: 'auto',

  CARD_MM: { W: 63, H: 88 },

  GAP_WHEN_ENABLED_MM: 6,

  CUTLINE: {
    OFFSET_FROM_EDGE_MM: 0.5,
    LENGTH_MM: 2,
    STROKE_PX: 1.2,
    COLOR: '#00ff00'
  },

  // Back image source (your custom Eris Proxies back)
  BACK_IMAGE_URL: 'https://cdn.imgchest.com/files/7kzcajvdwp7.png',

  CANVAS_DPI: 96,

  /**
   * How to flip backs so they align in duplex printing.
   * - 'long'  : mirror horizontally (reverse columns) → most common (“Flip on long edge”)
   * - 'short' : mirror vertically   (reverse rows)    → use if your printer flips on short edge
   * - 'none'  : no mirroring (not recommended for duplex)
   */
  BACK_FLIP_MODE: 'long'
};
// ----------------------------------------

let cachedImages = [];
let cachedDeckName = "Deck";
let categoryOrderFromServer = []; // optional order hint from server

document.addEventListener('DOMContentLoaded', () => {
  ensureTotalsBar();

  // Fallback for :has() styles in CSS (older browsers)
  const supportsHas = CSS.supports?.('selector(:has(*))');
  if (!supportsHas) {
    document.querySelectorAll('.toggle').forEach(toggle => {
      const input = toggle.querySelector('input[type="checkbox"]');
      if (!input) return;
      const sync = () => toggle.classList.toggle('is-on', input.checked);
      input.addEventListener('change', sync);
      sync();
    });
  }
});

// =============== Totals Bar (UI) ===============
function ensureTotalsBar() {
  if (document.getElementById('totalsBar')) return;

  const toggles = document.querySelector('.toggles');
  const bar = document.createElement('div');
  bar.id = 'totalsBar';
  bar.className = 'totals-bar';
  bar.innerHTML = `
    <span class="label">Total cards to print:</span>
    <span class="value" id="totalCount">0</span>
    <span class="muted">(<span id="zeroCount">0</span> at ×0)</span>
  `;
  if (toggles && toggles.parentElement) {
    toggles.insertAdjacentElement('afterend', bar);
  } else {
    document.querySelector('.container')?.prepend(bar);
  }
  updateTotalsBar();
}

function getTotals() {
  let total = 0;
  let zeroed = 0;
  for (const c of cachedImages) {
    const q = clampQty(c.quantity ?? 0);
    if (q === 0) zeroed++;
    total += q;
  }
  return { total, zeroed };
}

function updateTotalsBar() {
  const { total, zeroed } = getTotals();
  const totalEl = document.getElementById('totalCount');
  const zeroEl = document.getElementById('zeroCount');
  if (totalEl) totalEl.textContent = String(total);
  if (zeroEl) zeroEl.textContent = String(zeroed);
}

// =============== Helpers ===============
function clampQty(n) {
  n = Number.isFinite(+n) ? +n : 0;
  return Math.max(0, Math.floor(n));
}

function applyZeroStateClass(tile, qty) {
  tile?.classList.toggle('is-zero', qty === 0);
}

function setCardQuantity(index, qty) {
  if (!cachedImages[index]) return;
  const newQty = clampQty(qty);
  cachedImages[index].quantity = newQty;

  const tile = document.querySelector(`.card[data-index="${index}"]`);
  if (tile) {
    const badge = tile.querySelector('.qty-badge');
    if (badge) badge.textContent = `×${newQty}`;
    const name = cachedImages[index].name ?? 'Card';
    tile.setAttribute('aria-label', `${name} – quantity ${newQty}`);
    applyZeroStateClass(tile, newQty);
  }
  updateTotalsBar();
  updateCategoryCounts();

  // keep modal display in sync if open
  const modalQty = document.querySelector('.preview-controls .qty-display');
  const controls = document.querySelector('.preview-controls');
  if (controls && Number(controls?.dataset.index) === index && modalQty) {
    modalQty.textContent = `×${newQty}`;
  }
}

function extractDeckUrl(url) {
  return url.trim();
}

// Group cards by category. Uses server-provided order if available, else first-seen order.
function groupByCategory(cards) {
  const groups = new Map();
  const order = [];

  cards.forEach(c => {
    const cat = (c.category || 'Uncategorized').trim() || 'Uncategorized';
    if (!groups.has(cat)) {
      groups.set(cat, []);
      order.push(cat);
    }
    groups.get(cat).push(c);
  });

  if (Array.isArray(categoryOrderFromServer) && categoryOrderFromServer.length) {
    const ordered = [];
    const seen = new Set();
    categoryOrderFromServer.forEach(cat => {
      if (groups.has(cat)) {
        ordered.push([cat, groups.get(cat)]);
        seen.add(cat);
      }
    });
    order.forEach(cat => {
      if (!seen.has(cat)) ordered.push([cat, groups.get(cat)]);
    });
    return ordered;
  }

  return order.map(cat => [cat, groups.get(cat)]);
}

function countsForCategory(cards) {
  const uniqueCount = cards.length;
  const copyCount = cards.reduce((sum, c) => sum + clampQty(c.quantity ?? 0), 0);
  return { uniqueCount, copyCount };
}

// Render overview: vertical (label → cards → next label → cards)
function renderOverviewGrid() {
  const grid = document.getElementById('cardGrid');

  grid.className = 'categories-wrap';
  grid.innerHTML = '';

  const grouped = groupByCategory(cachedImages);

  grouped.forEach(([category, cards]) => {
    const { uniqueCount, copyCount } = countsForCategory(cards);

    const section = document.createElement('section');
    section.className = 'category-section';
    section.dataset.category = category;

    const header = document.createElement('div');
    header.className = 'category-title';
    header.innerHTML = `
      <span class="category-name">${escapeHTML(category)}</span>
      <span class="category-meta">
        <span class="category-uniques" title="Unique cards">${uniqueCount} unique</span>
        <span class="category-count" title="Total copies to print">${copyCount}</span>
      </span>
    `;
    section.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = 'category-grid';

    cards.forEach(card => {
      const i = card._idx;
      const tile = document.createElement('div');
      tile.className = 'card';
      tile.dataset.index = String(i);

      const qty = clampQty(card.quantity ?? 1);
      tile.setAttribute('aria-label', `${card.name} – quantity ${qty}`);

      const img = document.createElement('img');
      img.src = card.img;
      img.alt = card.name ?? 'Card';

      const badge = document.createElement('span');
      badge.className = 'qty-badge';
      badge.textContent = `×${qty}`;

      applyZeroStateClass(tile, qty);
      tile.addEventListener('click', () => openPreviewModal(i));

      tile.appendChild(img);
      tile.appendChild(badge);
      wrap.appendChild(tile);
    });

    section.appendChild(wrap);
    grid.appendChild(section);
  });
}

function updateCategoryCounts() {
  const grouped = groupByCategory(cachedImages);
  grouped.forEach(([category, cards]) => {
    const { uniqueCount, copyCount } = countsForCategory(cards);
    const sel = `.category-section[data-category="${cssEscape(category)}"]`;
    const section = document.querySelector(sel);
    if (!section) return;
    const uniquesEl = section.querySelector('.category-uniques');
    const countEl = section.querySelector('.category-count');
    if (uniquesEl) uniquesEl.textContent = `${uniqueCount} unique`;
    if (countEl) countEl.textContent = `${copyCount}`;
  });
}

// HTML/CSS escapers
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\#.:?[\]()]/g, '\\$&');
}

// =============== Load deck ===============
async function loadDeck() {
  const urlInput = document.getElementById('deckUrl');
  const button = document.getElementById('loadBtn');
  const printBtn = document.getElementById('printBtn');
  const loading = document.getElementById('loading');

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
  document.getElementById('cardGrid').innerHTML = '';
  cachedImages = [];
  categoryOrderFromServer = [];
  updateTotalsBar();

  try {
    const res = await fetch(`https://mtg-proxy-api-server.onrender.com/api/deck?url=${encodeURIComponent(deckUrl)}`);
    const data = await res.json();

    if (!data.images || data.images.length === 0) {
      throw new Error("No images returned.");
    }

    categoryOrderFromServer = Array.isArray(data.categoryOrder) ? data.categoryOrder : [];

    // keep category & clamp quantities
    cachedImages = data.images.map((card, i) => ({
      ...card,
      quantity: clampQty(card.quantity ?? 1),
      category: (card.category || 'Uncategorized').trim() || 'Uncategorized',
      _idx: i
    }));

    renderOverviewGrid();
    updateTotalsBar();

    printBtn.disabled = false;
  } catch (err) {
    console.error("❌ Deck load failed:", err);
    alert("Failed to load deck.");
  }

  loading.classList.add('hidden');
  urlInput.disabled = false;
  button.disabled = false;
}

// ========= Print helpers =========
function computeGridDims(pageWmm, pageHmm, cardWmm, cardHmm, gapmm) {
  const cols = Math.max(1, Math.floor((pageWmm + gapmm) / (cardWmm + gapmm)));
  const rows = Math.max(1, Math.floor((pageHmm + gapmm) / (cardHmm + gapmm)));
  return { cols, rows };
}

function choosePageGeometry(sizeKey, gapmm) {
  const base = CONFIG.PAGE_SIZES_MM[sizeKey];
  let portrait = { W: base.W, H: base.H, orient: 'portrait' };
  let landscape = { W: base.H, H: base.W, orient: 'landscape' };

  if (CONFIG.ORIENTATION_MODE === 'portrait') return portrait;
  if (CONFIG.ORIENTATION_MODE === 'landscape') return landscape;

  const a = computeGridDims(portrait.W, portrait.H, CONFIG.CARD_MM.W, CONFIG.CARD_MM.H, gapmm);
  const b = computeGridDims(landscape.W, landscape.H, CONFIG.CARD_MM.W, CONFIG.CARD_MM.H, gapmm);
  return (b.cols * b.rows) > (a.cols * a.rows) ? landscape : portrait;
}

/**
 * Return an array of length perPage that mirrors the *positions* of the front chunk
 * to the back page, so each front aligns with its back after duplex printing.
 * - flip 'long'  : mirror horizontally (reverse columns)
 * - flip 'short' : mirror vertically   (reverse rows)
 * - flip 'none'  : 1:1 positions
 */
function mapBackCells(frontChunkLength, cols, rows, flipMode) {
  const perPage = cols * rows;
  const cells = new Array(perPage).fill(null);

  for (let k = 0; k < frontChunkLength; k++) {
    const r = Math.floor(k / cols);
    const c = k % cols;

    let rr = r, cc = c;
    if (flipMode === 'long') {
      // mirror across vertical axis (reverse columns)
      cc = cols - 1 - c;
    } else if (flipMode === 'short') {
      // mirror across horizontal axis (reverse rows)
      rr = rows - 1 - r;
    } else {
      // 'none' → leave rr, cc as-is
    }
    const idxBack = rr * cols + cc;
    cells[idxBack] = CONFIG.BACK_IMAGE_URL;
  }
  return cells;
}

// Build print pages COMPACTLY — categories do NOT influence layout
function openPrintView() {
  if (!cachedImages.length) return;

  const deckName        = cachedDeckName;
  const showCutlines    = document.getElementById('cutLinesToggle')?.checked;
  const addSpaceBetween = document.getElementById('spaceBetweenToggle')?.checked;
  const addBackground   = document.getElementById('backSideToggle')?.checked;
  const useA3           = document.getElementById('pageSizeToggle')?.checked || false;
  const useBlackBg      = document.getElementById('blackBackgroundToggle')?.checked || false;

  const sizeKey = useA3 ? 'A3' : CONFIG.DEFAULT_PAGE;

  const CARD_W = CONFIG.CARD_MM.W;
  const CARD_H = CONFIG.CARD_MM.H;
  const GAP = addSpaceBetween ? CONFIG.GAP_WHEN_ENABLED_MM : 0;

  const chosen = choosePageGeometry(sizeKey, GAP);
  const PAGE_W = chosen.W;
  const PAGE_H = chosen.H;
  const ORIENT = chosen.orient;

  const { cols: GRID_COLS, rows: GRID_ROWS } = computeGridDims(PAGE_W, PAGE_H, CARD_W, CARD_H, GAP);

  const SHEET_W = GRID_COLS * CARD_W + (GRID_COLS - 1) * GAP;
  const SHEET_H = GRID_ROWS * CARD_H + (GRID_ROWS - 1) * GAP;
  const MARGIN_L = Math.max(0, (PAGE_W - SHEET_W) / 2);
  const MARGIN_T = Math.max(0, (PAGE_H - SHEET_H) / 2);

  const MM_PER_IN = 25.4;
  const CANVAS_W_PX = Math.round((PAGE_W / MM_PER_IN) * CONFIG.CANVAS_DPI);
  const CANVAS_H_PX = Math.round((PAGE_H / MM_PER_IN) * CONFIG.CANVAS_DPI);

  // Flatten all cards with qty > 0, in their current deck order
  const imgsAll = [];
  cachedImages.forEach(card => {
    const q = clampQty(card.quantity);
    if (q > 0) {
      for (let i = 0; i < q; i++) imgsAll.push(card.img);
    }
  });

  const perPage = GRID_COLS * GRID_ROWS;

  const titleBits = [
    deckName,
    `${sizeKey} ${ORIENT}`,
    `${perPage}/page`,
    showCutlines ? '(cutlines)' : '(no cutlines)',
    addSpaceBetween ? `(${GAP}mm gaps)` : '(tight)',
    addBackground ? '(backs aligned)' : '',
    useBlackBg ? '(black page bg panel)' : ''
  ].filter(Boolean);
  const title = titleBits.join(' ');

  const win = window.open('', '_blank');

  // Build a full grid of slots (perPage) from an array of image URLs (<= perPage)
  function buildSlotsHTML(srcArray, perPage) {
    const slots = new Array(perPage).fill(null);
    for (let i = 0; i < Math.min(srcArray.length, perPage); i++) {
      slots[i] = srcArray[i];
    }
    return slots.map(src => {
      if (src) {
        return `<div class="slot"><img src="${src}" alt="Card" /></div>`;
      }
      return `<div class="slot empty"></div>`;
    }).join('');
  }

  function buildBackSlotsHTML(frontCount) {
    const backCells = mapBackCells(frontCount, GRID_COLS, GRID_ROWS, CONFIG.BACK_FLIP_MODE);
    return backCells.map(src => {
      if (src) {
        return `<div class="slot"><img src="${src}" alt="Card back" /></div>`;
      }
      return `<div class="slot empty"></div>`;
    }).join('');
  }

  function buildPageHTML(slotsHTML, isBack = false) {
    return `
      <div class="page ${isBack ? 'back' : 'front'}">
        <canvas class="page-fill" width="${CANVAS_W_PX}" height="${CANVAS_H_PX}"
          style="position:absolute; left:0; top:0; width:${PAGE_W}mm; height:${PAGE_H}mm; z-index:-5;"></canvas>

        <div class="sheet" style="
          position:absolute;
          top:${MARGIN_T}mm;
          left:${MARGIN_L}mm;
          width:${SHEET_W}mm;
          height:${SHEET_H}mm;
          display:grid;
          grid-template-columns: repeat(${GRID_COLS}, ${CARD_W}mm);
          grid-template-rows: repeat(${GRID_ROWS}, ${CARD_H}mm);
          gap:${GAP}mm;
          z-index:10;">
          ${slotsHTML}
        </div>

        <div class="cutlines" style="position:absolute; inset:0; z-index:20; pointer-events:none; display:${showCutlines ? 'block' : 'none'};">
          <canvas width="${CANVAS_W_PX}" height="${CANVAS_H_PX}"
            style="position:absolute; left:0; top:0; width:${PAGE_W}mm; height:${PAGE_H}mm;"></canvas>
        </div>
      </div>
    `;
  }

  // Build compact pages (fronts + aligned backs)
  const pages = [];
  for (let i = 0; i < imgsAll.length; i += perPage) {
    const chunk = imgsAll.slice(i, i + perPage);          // fronts on this page
    const frontSlots = buildSlotsHTML(chunk, perPage);     // create perPage slots, extras empty
    pages.push(buildPageHTML(frontSlots, false));

    if (addBackground) {
      const backSlots = buildBackSlotsHTML(chunk.length);  // mirror only the count present on the front
      pages.push(buildPageHTML(backSlots, true));
    }
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
          z-index: 0;
          isolation: isolate;
          font-family: system-ui, Segoe UI, Roboto, Inter, Arial, sans-serif;
        }
        .sheet { position: absolute; }
        .sheet .slot {
          width: ${CONFIG.CARD_MM.W}mm;
          height: ${CONFIG.CARD_MM.H}mm;
          display: block;
          position: relative;
          overflow: hidden;
        }
        .sheet .slot img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
      </style>
    </head>
    <body>
      ${pages.join('')}
      <script>
        document.title = ${JSON.stringify(title)};

        const USE_BLACK_BG = ${useBlackBg ? 'true' : 'false'};
        const OFFSET_MM = ${CONFIG.CUTLINE.OFFSET_FROM_EDGE_MM};
        const LENGTH_MM = ${CONFIG.CUTLINE.LENGTH_MM};
        const STROKE_PX = ${CONFIG.CUTLINE.STROKE_PX};
        const COLOR = ${JSON.stringify(CONFIG.CUTLINE.COLOR)};

        const PAGE_W = ${PAGE_W};
        const PAGE_H = ${PAGE_H};
        const CARD_W = ${CONFIG.CARD_MM.W};
        const CARD_H = ${CONFIG.CARD_MM.H};
        const GAP = ${GAP};
        const GRID_COLS = ${GRID_COLS};
        const GRID_ROWS = ${GRID_ROWS};
        const MARGIN_L = ${MARGIN_L};
        const MARGIN_T = ${MARGIN_T};

        document.querySelectorAll('.page-fill').forEach(canvas => {
          const ctx = canvas.getContext('2d');
          if (USE_BLACK_BG) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
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
          ctx.moveTo(x - offX - lenX, y);
          ctx.lineTo(x - offX, y);
          ctx.moveTo(x, y - offY - lenY);
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

// =============== Preview Modal (click-to-zoom with quantity controls) ===============
function openPreviewModal(index) {
  const card = cachedImages[index];
  if (!card) return;
  if (document.getElementById('previewOverlay')) return;

  document.body.classList.add('modal-open');

  const overlay = document.createElement('div');
  overlay.id = 'previewOverlay';
  overlay.className = 'overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="preview-card" role="document" aria-label="${card.name ?? 'Card preview'}">
      <button class="preview-close" aria-label="Close">×</button>
      <div class="preview-image-wrap">
        <img src="${card.img}" alt="${card.name ?? 'Card'}">
      </div>
      <div class="preview-controls" data-index="${index}">
        <button class="qty-btn step minus10" aria-label="Decrease by 10">−10</button>
        <button class="qty-btn step minus5"  aria-label="Decrease by 5">−5</button>
        <button class="qty-btn minus"        aria-label="Decrease by 1">−1</button>
        <span class="qty-display" aria-live="polite">×${clampQty(card.quantity)}</span>
        <button class="qty-btn plus"         aria-label="Increase by 1">+1</button>
        <button class="qty-btn step plus5"   aria-label="Increase by 5">+5</button>
        <button class="qty-btn step plus10"  aria-label="Increase by 10">+10</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePreviewModal(); });
  overlay.querySelector('.preview-close').addEventListener('click', closePreviewModal);

  const controls = overlay.querySelector('.preview-controls');
  controls.addEventListener('click', (e) => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    const idx = Number(controls.dataset.index);
    const current = clampQty(cachedImages[idx]?.quantity ?? 0);
    let delta = 0;
    if (btn.classList.contains('minus10')) delta = -10;
    else if (btn.classList.contains('minus5')) delta = -5;
    else if (btn.classList.contains('minus')) delta = -1;
    else if (btn.classList.contains('plus')) delta = +1;
    else if (btn.classList.contains('plus5')) delta = +5;
    else if (btn.classList.contains('plus10')) delta = +10;

    const next = Math.max(0, current + delta);
    setCardQuantity(idx, next);
  });

  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closePreviewModal(); } };
  document.addEventListener('keydown', onKey, { once: true });

  document.body.appendChild(overlay);
  overlay.querySelector('.preview-close').focus();

  function closePreviewModal() {
    document.body.classList.remove('modal-open');
    overlay.remove();
    document.removeEventListener('keydown', onKey, { once: true });
  }
}

// ================= Spinner icon + rotating messages =================
const spinnerIcon = document.getElementById('spinnerIcon');
const iconPaths = [
  'public/icons/FF-ICON-1.png',
  'public/icons/FF-ICON-2.png',
  'public/icons/FF-ICON-3.png'
];
const quips = [
  'Summoning proxies',
  'Shuffling decklists',
  'Fetching art & frames'
];
const hints = [
  'We’re scraping your Archidekt/Moxfield deck — bigger decks can take a bit longer.',
  'Counting card quantities & images — hang tight!',
  'Optimizing images for crisp print — almost there.'
];

function updateLoadingCopy(index) {
  const quipEl = document.querySelector('#loading .spinner-copy .quip');
  const hintEl = document.querySelector('#loading .spinner-copy .hint');
  if (quipEl) {
    quipEl.innerHTML = `${quips[index % quips.length]} <span class="dots"><span>•</span><span>•</span><span>•</span></span>`;
  }
  if (hintEl) {
    hintEl.textContent = hints[index % hints.length];
  }
}

let currentIconIndex = 0;
if (spinnerIcon) spinnerIcon.src = iconPaths[currentIconIndex];
updateLoadingCopy(currentIconIndex);

setInterval(() => {
  currentIconIndex = (currentIconIndex + 1) % iconPaths.length;
  if (spinnerIcon) spinnerIcon.src = iconPaths[currentIconIndex];
  updateLoadingCopy(currentIconIndex);
}, 5000);
