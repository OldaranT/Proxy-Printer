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
  BACK_FLIP_MODE: 'long',

  // --- Spinner animation assets (JSON + SVG icons) ---
  ANIM_ICON_DIR: '/public/icons/animation/',                 // folder where icons live
  ANIM_ICON_MANIFEST: '/public/icons/animation/manifest.json',// JSON ["icon-animation-1.svg", ...]
  LOADING_TEXT_URL: '/public/strings/loading.json',          // { quips: [...], hints: [...] }

  // fallback if manifest can't be read:
  ANIM_FALLBACK_COUNT: 300,
  ANIM_FALLBACK_PATTERN: (n) => `icon-animation-${n}.svg`,

  // spinner rotation (ms)
  SPINNER_ROTATE_MS: 5000
};
// ----------------------------------------

let cachedImages = [];
let cachedDeckName = "Deck";
let categoryOrderFromServer = [];

// ================== Small utils ==================
function clampQty(n) {
  n = Number.isFinite(+n) ? +n : 0;
  return Math.max(0, Math.floor(n));
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pathVariants(p) {
  const norm = String(p).replace(/^\.?\//, "");
  const noPublic = norm.replace(/^public\//, "");
  return [norm, "/" + norm, noPublic, "/" + noPublic];
}
async function tryFetchAny(urls, opts) {
  for (const u of urls) {
    try {
      const res = await fetch(u, opts);
      console.log(`[fetch] ${u} → ${res.status}`);
      if (res.ok) return { url: u, res };
    } catch (e) {
      console.warn(`[fetch] ${u} → error`, e);
    }
  }
  return null;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\#.:?[\]()]/g, '\\$&');
}
function extractDeckUrl(url) { return url.trim(); }

// ================== Spinner / Loading overlay ==================
const SpinnerAnimator = (() => {
  let icons = [];             // full URLs to SVGs
  let iconIndex = 0;
  let quipPool = [];
  let hintPool = [];
  let quipIndex = 0;
  let hintIndex = 0;
  let timer = null;

  // DOM refs (filled by init)
  let ringEl = null;          // .spinner-ring
  let iconHost = null;        // #spinnerIcon (we'll ensure it's a <div>)
  let quipEl = null;          // #loading .quip
  let hintEl = null;          // #loading .hint

  // read theme colors
  function themePalette() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, def) => (cs.getPropertyValue(name) || def).trim() || def;
    const c400 = pick('--forest-400', '#21a06a');
    const c500 = pick('--forest-500', '#1a7a52');
    const c600 = pick('--forest-600', '#146045');
    return [c400, c500, c600];
  }

  // make SVG colorable by currentColor
  function normalizeSVGColors(svgText) {
    try {
      return svgText
        .replace(/fill="[^"]*"/gi, 'fill="currentColor"')
        .replace(/stroke="[^"]*"/gi, 'stroke="currentColor"');
    } catch {
      return svgText;
    }
  }

  function ensureDivHost() {
    const el = document.getElementById('spinnerIcon');
    if (!el) return null;
    if (el.tagName.toLowerCase() === 'img') {
      const div = document.createElement('div');
      div.id = el.id;
      div.className = el.className || 'spinner-icon';
      div.setAttribute('aria-hidden', 'true');
      el.replaceWith(div);
      return div;
    }
    return el;
  }

  async function loadManifest() {
    try{
      const candidates = pathVariants(CONFIG.ANIM_ICON_MANIFEST);
      console.log("[manifest] candidates:", candidates);
      const hit = await tryFetchAny(candidates, { cache: "no-store" });
      if (!hit) throw new Error("manifest not found via any candidate");

      const arr = await hit.res.json();
      console.log("[manifest] using:", hit.url, "items:", Array.isArray(arr) ? arr.length : typeof arr);

      let files = [];
      if (Array.isArray(arr)) {
        if (typeof arr[0] === "string") {
          files = arr.filter(x => typeof x === "string" && /\.svg$/i.test(x));
        } else if (typeof arr[0] === "object" && arr[0]) {
          files = arr
            .map(o => o.album || o.file || o.filename || o.name)
            .filter(v => typeof v === "string" && /\.svg$/i.test(v));
        }
      }

      const seen = new Set();
      icons = files
        .filter(f => !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase()))
        .map(f => CONFIG.ANIM_ICON_DIR + f);

      if (!icons.length) {
        console.warn("[manifest] parsed but no .svg entries found; falling back to generated list");
        const N = CONFIG.ANIM_FALLBACK_COUNT || 300;
        icons = Array.from({length: N}, (_, i) => CONFIG.ANIM_ICON_DIR + CONFIG.ANIM_FALLBACK_PATTERN(i+1));
      }
    } catch (e) {
      console.warn("[manifest] failed; falling back to generated icon list:", e);
      const N = CONFIG.ANIM_FALLBACK_COUNT || 300;
      icons = Array.from({length: N}, (_, i) => CONFIG.ANIM_ICON_DIR + CONFIG.ANIM_FALLBACK_PATTERN(i+1));
    }
  }

  async function loadStrings() {
    try{
      const candidates = pathVariants(CONFIG.LOADING_TEXT_URL);
      console.log("[strings] candidates:", candidates);
      const hit = await tryFetchAny(candidates, { cache: "no-store" });
      if (!hit) throw new Error("strings not found via any candidate");

      const json = await hit.res.json();
      console.log("[strings] using:", hit.url);

      const quips = Array.isArray(json.quips) ? json.quips : [];
      const hints = Array.isArray(json.hints) ? json.hints : [];
      quipPool = shuffle([...quips]);
      hintPool = shuffle([...hints]);
      quipIndex = 0; hintIndex = 0;

      applyText();
    } catch(e) {
      console.warn("[strings] failed, using defaults:", e);
      quipPool = shuffle([
        "Summoning proxies","Shuffling decklists","Fetching art & frames"
      ]);
      hintPool = shuffle([
        "We’re scraping your Archidekt/Moxfield deck — bigger decks can take a bit longer.",
        "Counting card quantities & images — hang tight!",
        "Optimizing images for crisp print — almost there."
      ]);
      quipIndex = 0; hintIndex = 0;
      applyText();
    }
  }

  function applyText() {
    if (quipEl && quipPool.length) {
      const q = quipPool[quipIndex % quipPool.length];
      quipEl.innerHTML = `${escapeHTML(q)} <span class="dots"><span>•</span><span>•</span><span>•</span></span>`;
    }
    if (hintEl && hintPool.length) {
      const h = hintPool[hintIndex % hintPool.length];
      hintEl.textContent = h;
    }
  }

  async function swapIcon() {
    if (!icons.length || !iconHost) return;

    if (iconIndex === 0) {
      icons = shuffle(icons);
    }
    const url = icons[iconIndex % icons.length];
    iconIndex++;

    const palette = themePalette();
    const color = palette[(Math.random() * palette.length) | 0];

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      let svgText = await res.text();
      svgText = normalizeSVGColors(svgText);

      iconHost.innerHTML = svgText;
      const svg = iconHost.querySelector('svg');
      if (svg) {
        svg.setAttribute('aria-hidden', 'true');
        svg.style.display = 'block';
        svg.style.width = '46px';
        svg.style.height = '46px';
        svg.style.color = color;
        svg.style.fill = 'currentColor';
        svg.style.stroke = 'currentColor';
      }
      if (ringEl) {
        ringEl.style.borderTopColor = color;
      }
    } catch (e) {
      console.warn('[spinner] failed to load icon', url, e);
    }
  }

  function tick() {
    swapIcon();
    quipIndex++;
    hintIndex++;
    applyText();
  }

  async function init() {
    ringEl = document.querySelector('#loading .spinner-ring');
    iconHost = ensureDivHost();
    quipEl = document.querySelector('#loading .spinner-copy .quip');
    hintEl = document.querySelector('#loading .spinner-copy .hint');

    await Promise.all([loadManifest(), loadStrings()]);
    await swapIcon();
    applyText();

    clearInterval(timer);
    timer = setInterval(tick, CONFIG.SPINNER_ROTATE_MS);
  }

  return { init, tick };
})();

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

  SpinnerAnimator.init().catch(e => console.warn('Spinner init failed', e));
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

// =============== Quantity helpers ===============
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

  const controls = document.querySelector('.preview-controls');
  const modalQty = document.querySelector('.preview-controls .qty-display');
  if (controls && Number(controls?.dataset.index) === index && modalQty) {
    modalQty.textContent = `×${newQty}`;
  }
}

// =============== Grouping & Overview ===============
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

// Font Awesome glyphs (shown via CSS ::before)
const GLYPH = {
  FLIP: "\uf021",   // refresh
  PLUS: "\uf067",   // +
  MINUS: "\uf068",  // −
  CLOSE: "\uf00d"   // ×
};

// Render a single glyph via data-icon (prevents double text)
function applyGlyph(el, glyph) {
  if (!el) return el;
  el.classList.add('icon-glyph');
  el.textContent = '';
  el.setAttribute('data-icon', glyph);
  return el;
}

function makeGlyphButton({ className, title, aria, glyph }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  if (title) btn.title = title;
  if (aria) btn.setAttribute('aria-label', aria);
  applyGlyph(btn, glyph);
  return btn;
}

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

    const left = document.createElement('div');
    left.className = 'category-left';
    left.setAttribute('role', 'button');
    left.setAttribute('tabindex', '0');
    left.setAttribute('aria-expanded', 'true');

    const indicator = document.createElement('span');
    indicator.className = 'category-indicator';
    applyGlyph(indicator, GLYPH.MINUS); // expanded by default

    const nameEl = document.createElement('span');
    nameEl.className = 'category-name';
    nameEl.textContent = category;

    left.appendChild(indicator);
    left.appendChild(nameEl);

    const meta = document.createElement('span');
    meta.className = 'category-meta';
    meta.innerHTML = `
      <span class="category-uniques" title="Unique cards">${uniqueCount} unique</span>
      <span class="category-count" title="Total copies to print">${copyCount}</span>
    `;

    header.appendChild(left);
    header.appendChild(meta);
    section.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = 'category-grid';
    const wrapId = `cat_${Math.random().toString(36).slice(2)}`;
    wrap.id = wrapId;
    left.setAttribute('aria-controls', wrapId);

    cards.forEach(card => {
      const i = card._idx;
      const tile = document.createElement('div');
      tile.className = 'card';
      tile.dataset.index = String(i);
      if (card.backImg) tile.classList.add('has-back');

      if (typeof card._showBack !== 'boolean') card._showBack = false;

      const qty = clampQty(card.quantity ?? 1);
      tile.setAttribute('aria-label', `${card.name} – quantity ${qty}`);

      const img = document.createElement('img');
      img.src = card._showBack && card.backImg ? card.backImg : card.img;
      img.alt = card.name ?? 'Card';

      const badge = document.createElement('span');
      badge.className = 'qty-badge';
      badge.textContent = `×${qty}`;

      if (card.backImg) {
        const flip = makeGlyphButton({
          className: 'flip-badge',
          title: 'Flip card face',
          aria: `Flip ${card.name}`,
          glyph: GLYPH.FLIP
        });
        flip.addEventListener('click', (e) => {
          e.stopPropagation();
          card._showBack = !card._showBack;
          img.src = card._showBack ? card.backImg : card.img;
          tile.classList.toggle('showing-back', !!card._showBack);
          flip.classList.add('spin');
          setTimeout(() => flip.classList.remove('spin'), 500);
        });
        tile.appendChild(flip);
      }

      applyZeroStateClass(tile, qty);
      tile.addEventListener('click', () => openPreviewModal(i));

      tile.appendChild(img);
      tile.appendChild(badge);
      wrap.appendChild(tile);
    });

    section.appendChild(wrap);
    grid.appendChild(section);

    function toggleSection() {
      const isCollapsed = section.classList.toggle('collapsed');
      wrap.style.display = isCollapsed ? 'none' : '';
      left.setAttribute('aria-expanded', String(!isCollapsed));
      applyGlyph(indicator, isCollapsed ? GLYPH.PLUS : GLYPH.MINUS);
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

  let showingBack = !!card._showBack;

  const flipBtnHTML = card.backImg
    ? (() => {
        const btn = makeGlyphButton({
          className: 'preview-flip',
          title: 'Flip card face',
          aria: 'Flip card face',
          glyph: GLYPH.FLIP
        });
        return btn.outerHTML;
      })()
    : '';

  overlay.innerHTML = `
    <div class="preview-card" role="document" aria-label="${escapeHTML(card.name ?? 'Card preview')}">
      <button class="preview-close" aria-label="Close"></button>

      <div class="preview-image-wrap">
        ${flipBtnHTML}
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

  // Close button glyph
  const closeBtn = overlay.querySelector('.preview-close');
  applyGlyph(closeBtn, GLYPH.CLOSE);

  // Close on backdrop
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePreviewModal(overlay); });
  // Close on X
  closeBtn?.addEventListener('click', () => closePreviewModal(overlay));
  // ESC
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closePreviewModal(overlay); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  // Flip (modal)
  const flipBtn = overlay.querySelector('.preview-flip');
  if (flipBtn && card.backImg) {
    flipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showingBack = !showingBack;
      card._showBack = showingBack; // sync to overview state
      const imgEl = overlay.querySelector('.preview-image-wrap img');
      if (imgEl) imgEl.src = showingBack ? card.backImg : card.img;

      const tileImg = document.querySelector(`.card[data-index="${index}"] img`);
      if (tileImg) tileImg.src = showingBack ? card.backImg : card.img;
      const tile = document.querySelector(`.card[data-index="${index}"]`);
      tile?.classList.toggle('showing-back', showingBack);

      flipBtn.classList.add('spin');
      setTimeout(() => flipBtn.classList.remove('spin'), 500);
    });
  }

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
  closeBtn?.focus();
}
function closePreviewModal(overlayEl) {
  try {
    document.body.classList.remove('modal-open');
    (overlayEl || document.getElementById('previewOverlay'))?.remove();
  } catch (_) {}
}
