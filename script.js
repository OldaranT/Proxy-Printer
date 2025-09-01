// script.js

// ---------- Tweakable constants ----------
const CONFIG = {
  PAGE_SIZES_MM: { A4: { W: 210, H: 297 }, A3: { W: 297, H: 420 } },
  DEFAULT_PAGE: 'A4',
  ORIENTATION_MODE: 'auto',           // 'auto' | 'portrait' | 'landscape'
  CARD_MM: { W: 63, H: 88 },
  GAP_WHEN_ENABLED_MM: 6,
  CUTLINE: {
    OFFSET_FROM_EDGE_MM: 0.5,
    LENGTH_MM: 2,
    STROKE_PX: 1.2,
    COLOR: '#00ff00'
  },
  BACK_IMAGE_URL: 'https://cdn.imgchest.com/files/7kzcajvdwp7.png',
  CANVAS_DPI: 96,

  /**
   * Duplex flip mode for backs:
   * 'long'  → mirror columns (flip on long edge)
   * 'short' → mirror rows   (flip on short edge)
   * 'none'  → no mirroring
   */
  BACK_FLIP_MODE: 'long'
};
// ----------------------------------------

let cachedImages = [];
let cachedDeckName = "Deck";
let categoryOrderFromServer = [];

// =============== Boot ===============
document.addEventListener('DOMContentLoaded', () => {
  ensureTotalsBar();

  // Fallback for :has() so toggles still look right in older browsers
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
  if (toggles && toggles.parentElement) toggles.insertAdjacentElement('afterend', bar);
  else document.querySelector('.container')?.prepend(bar);

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

  // sync modal if open
  const controls = document.querySelector('.preview-controls');
  const modalQty = document.querySelector('.preview-controls .qty-display');
  if (controls && Number(controls?.dataset.index) === index && modalQty) {
    modalQty.textContent = `×${newQty}`;
  }
}

function extractDeckUrl(url) { return url.trim(); }

// Group by category (preserve server order if provided)
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
    order.forEach(cat => { if (!seen.has(cat)) ordered.push([cat, groups.get(cat)]); });
    return ordered;
  }

  return order.map(cat => [cat, groups.get(cat)]);
}

function countsForCategory(cards) {
  const uniqueCount = cards.length;
  const copyCount = cards.reduce((sum, c) => sum + clampQty(c.quantity ?? 0), 0);
  return { uniqueCount, copyCount };
}

// Small inline SVG (two circular arrows)
function flipIconSVG() {
  return `
<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
  <path d="M12 3a7 7 0 0 1 6.32 4H20a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1V4a1 1 0 1 1 2 0v1.03A9 9 0 1 0 12 21a1 1 0 1 1 0-2 7 7 0 1 1 0-14Z" fill="currentColor" opacity=".85"/>
  <path d="M12 21a7 7 0 0 1-6.32-4H4a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-1.03A9 9 0 1 0 12 3a1 1 0 1 1 0 2 7 7 0 1 1 0 16Z" fill="currentColor"/>
</svg>`;
}

// =============== Overview (categories) ===============
function renderOverviewGrid() {
  const grid = document.getElementById('cardGrid');
  grid.className = 'categories-wrap';
  grid.innerHTML = '';

  const grouped = groupByCategory(cachedImages);

  grouped.forEach(([category, cards]) => {
    const { uniqueCount, copyCount } = countsForCategory(cards);

    const section = document.createElement('section');
    section.className = 'category-section';
    section.dataset.category = category; // default OPEN

    const header = document.createElement('div');
    header.className = 'category-title';
    header.innerHTML = `
      <div class="category-left" role="button" tabindex="0" aria-expanded="true" aria-controls="">
        <span class="category-indicator" aria-hidden="true">–</span>
        <span class="category-name">${escapeHTML(category)}</span>
      </div>
      <span class="category-meta">
        <span class="category-uniques" title="Unique cards">${uniqueCount} unique</span>
        <span class="category-count" title="Total copies to print">${copyCount}</span>
      </span>
    `;
    section.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = 'category-grid';
    // give the title a target id reference for a11y
    const wrapId = `cat_${Math.random().toString(36).slice(2)}`;
    wrap.id = wrapId;
    header.querySelector('.category-left')?.setAttribute('aria-controls', wrapId);

    cards.forEach(card => {
      const i = card._idx;
      const tile = document.createElement('div');
      tile.className = 'card';
      tile.dataset.index = String(i);
      if (card.backImg) tile.classList.add('has-back');

      // init per-card face view (front by default)
      if (typeof card._showBack !== 'boolean') card._showBack = false;

      const qty = clampQty(card.quantity ?? 1);
      tile.setAttribute('aria-label', `${card.name} – quantity ${qty}`);

      const img = document.createElement('img');
      img.src = card._showBack && card.backImg ? card.backImg : card.img;
      img.alt = card.name ?? 'Card';

      // quantity badge (always visible)
      const badge = document.createElement('span');
      badge.className = 'qty-badge';
      badge.textContent = `×${qty}`;

      // flip badge (DFC only) — icon
      if (card.backImg) {
        const flip = document.createElement('button');
        flip.type = 'button';
        flip.className = 'flip-badge';
        flip.title = 'Flip card face';
        flip.setAttribute('aria-label', `Flip ${card.name}`);
        flip.innerHTML = flipIconSVG();
        flip.addEventListener('click', (e) => {
          e.stopPropagation();
          card._showBack = !card._showBack;
          img.src = card._showBack ? card.backImg : card.img;
          tile.classList.toggle('showing-back', !!card._showBack);
          // spin animation
          flip.classList.add('spin');
          setTimeout(() => flip.classList.remove('spin'), 500);
        });
        tile.appendChild(flip);
      }

      applyZeroStateClass(tile, qty);

      // Open modal on click
      tile.addEventListener('click', () => openPreviewModal(i));

      tile.appendChild(img);
      tile.appendChild(badge);
      wrap.appendChild(tile);
    });

    section.appendChild(wrap);
    grid.appendChild(section);

    // Collapsible behavior (default open)
    const left = header.querySelector('.category-left');
    const indicator = header.querySelector('.category-indicator');

    function toggleSection() {
      const isCollapsed = section.classList.toggle('collapsed');
      wrap.style.display = isCollapsed ? 'none' : '';
      left.setAttribute('aria-expanded', String(!isCollapsed));
      indicator.textContent = isCollapsed ? '+' : '–';
    }

    left.addEventListener('click', toggleSection);
    left.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSection();
      }
    });
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

// Escapers
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

    if (!data.images || data.images.length === 0) throw new Error("No images returned.");

    categoryOrderFromServer = Array.isArray(data.categoryOrder) ? data.categoryOrder : [];

    // keep category, quantities and DFC backImg; init face state
    cachedImages = data.images.map((card, i) => ({
      ...card,
      quantity: clampQty(card.quantity ?? 1),
      category: (card.category || 'Uncategorized').trim() || 'Uncategorized',
      backImg: card.backImg || null,
      _idx: i,
      _showBack: false
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

function mapBackIndex(k, cols, rows, flipMode) {
  const r = Math.floor(k / cols);
  const c = k % cols;
  let rr = r, cc = c;

  if (flipMode === 'long')      cc = cols - 1 - c; // mirror columns
  else if (flipMode === 'short') rr = rows - 1 - r; // mirror rows

  return rr * cols + cc;
}

// Build print pages COMPACTLY — categories do NOT affect layout
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

  // Flatten to {front, back}; DFCs use backImg; singles use custom back
  const itemsAll = [];
  cachedImages.forEach(card => {
    const q = clampQty(card.quantity);
    if (q > 0) {
      const backSrc = card.backImg || CONFIG.BACK_IMAGE_URL;
      for (let i = 0; i < q; i++) itemsAll.push({ front: card.img, back: backSrc });
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

  function buildFrontSlotsHTML(items, perPage) {
    const slots = new Array(perPage).fill(null);
    for (let i = 0; i < Math.min(items.length, perPage); i++) {
      slots[i] = items[i].front;
    }
    return slots.map(src => src
      ? `<div class="slot"><img src="${src}" alt="Card front" /></div>`
      : `<div class="slot empty"></div>`
    ).join('');
  }

  function buildBackSlotsHTML(items, perPage) {
    const slots = new Array(perPage).fill(null);
    for (let k = 0; k < Math.min(items.length, perPage); k++) {
      const idxBack = mapBackIndex(k, GRID_COLS, GRID_ROWS, CONFIG.BACK_FLIP_MODE);
      slots[idxBack] = items[k].back;
    }
    return slots.map(src => src
      ? `<div class="slot"><img src="${src}" alt="Card back" /></div>`
      : `<div class="slot empty"></div>`
    ).join('');
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

  const pages = [];
  for (let i = 0; i < itemsAll.length; i += perPage) {
    const chunkItems = itemsAll.slice(i, i + perPage);

    const frontSlots = buildFrontSlotsHTML(chunkItems, perPage);
    pages.push(buildPageHTML(frontSlots, false));

    if (addBackground) {
      const backSlots = buildBackSlotsHTML(chunkItems, perPage);
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
        .sheet .slot { width: ${CONFIG.CARD_MM.W}mm; height: ${CONFIG.CARD_MM.H}mm; display: block; position: relative; overflow: hidden; }
        .sheet .slot img { width: 100%; height: 100%; object-fit: cover; display: block; }
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

// =============== Preview Modal (click-to-zoom + qty + FLIP) ===============
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

  // use current tile face state as starting point
  let showingBack = !!card._showBack;

  overlay.innerHTML = `
    <div class="preview-card" role="document" aria-label="${escapeHTML(card.name ?? 'Card preview')}">
      <button class="preview-close" aria-label="Close">×</button>

      <div class="preview-image-wrap">
        ${card.backImg ? `<button class="preview-flip" type="button" aria-label="Flip card face">${flipIconSVG()}</button>` : ``}
        <img src="${showingBack && card.backImg ? card.backImg : card.img}" alt="${escapeHTML(card.name ?? 'Card')}" />
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

  // Close on backdrop
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePreviewModal(overlay); });
  // Close on X
  overlay.querySelector('.preview-close')?.addEventListener('click', () => closePreviewModal(overlay));
  // ESC
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closePreviewModal(overlay); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  // Flip (modal)
  overlay.querySelector('.preview-flip')?.addEventListener('click', (e) => {
    if (!card.backImg) return;
    e.stopPropagation();
    showingBack = !showingBack;
    card._showBack = showingBack; // sync to overview state
    const imgEl = overlay.querySelector('.preview-image-wrap img');
    if (imgEl) imgEl.src = showingBack ? card.backImg : card.img;

    // also update the overview tile image immediately
    const tileImg = document.querySelector(`.card[data-index="${index}"] img`);
    if (tileImg) tileImg.src = showingBack ? card.backImg : card.img;
    const tile = document.querySelector(`.card[data-index="${index}"]`);
    tile?.classList.toggle('showing-back', showingBack);

    const btn = overlay.querySelector('.preview-flip');
    btn?.classList.add('spin');
    setTimeout(() => btn?.classList.remove('spin'), 500);
  });

  // Quantity buttons
  overlay.querySelector('.preview-controls')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;

    const idx = Number(overlay.querySelector('.preview-controls')?.dataset.index || -1);
    if (idx < 0) return;

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

    const disp = overlay.querySelector('.qty-display');
    if (disp) disp.textContent = `×${next}`;
  });

  document.body.appendChild(overlay);
  overlay.querySelector('.preview-close')?.focus();
}

function closePreviewModal(overlayEl) {
  try {
    document.body.classList.remove('modal-open');
    (overlayEl || document.getElementById('previewOverlay'))?.remove();
  } catch (_) {}
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
  if (quipEl) quipEl.innerHTML = `${quips[index % quips.length]} <span class="dots"><span>•</span><span>•</span><span>•</span></span>`;
  if (hintEl) hintEl.textContent = hints[index % hints.length];
}

let currentIconIndex = 0;
if (spinnerIcon) spinnerIcon.src = iconPaths[currentIconIndex];
updateLoadingCopy(currentIconIndex);

setInterval(() => {
  currentIconIndex = (currentIconIndex + 1) % iconPaths.length;
  if (spinnerIcon) spinnerIcon.src = iconPaths[currentIconIndex];
  updateLoadingCopy(currentIconIndex);
}, 5000);
