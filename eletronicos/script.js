/* ------------------------------------------------------------------
   Scroll-driven frame-sequence scrubbing (Apple/Logitech-style).
   A sequence of JPEGs is preloaded and drawn to a <canvas> sized to
   the hero stage (right column). The frame index maps to scroll
   progress through #scroll-hero and is eased each rAF. No video
   seeking, so it works reliably across browsers and static hosts.
------------------------------------------------------------------- */

const FRAME_COUNT = 241;
const framePath = i => `assets/frames/f_${String(i).padStart(3, '0')}.jpg`;

const canvas   = document.getElementById('hero-canvas');
const ctx      = canvas.getContext('2d');
const stage    = canvas.parentElement;            // .hero-stage
const hero     = document.getElementById('scroll-hero');
const bar      = document.getElementById('scroll-progress-bar');
const loader   = document.getElementById('hero-loader');
const loaderBar= document.getElementById('hero-loader-bar');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const frames = new Array(FRAME_COUNT);
let loaded = 0, ready = false;
let targetFrame = 0, easedFrame = 0, lastDrawn = -1;

/* ---------- preload ---------- */
function preload() {
  for (let i = 0; i < FRAME_COUNT; i++) {
    const img = new Image();
    img.onload = img.onerror = () => {
      loaded++;
      loaderBar.style.width = Math.round((loaded / FRAME_COUNT) * 100) + '%';
      if (i === 0 && !ready) { ready = true; sizeCanvas(); }
      if (loaded === FRAME_COUNT) loader.classList.add('is-done');
    };
    img.src = framePath(i + 1);
    frames[i] = img;
  }
}

/* ---------- canvas sizing (DPR-aware) ---------- */
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = stage.clientWidth, h = stage.clientHeight;
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lastDrawn = -1;
  draw(easedFrame);
}

/* draw a frame with object-fit: cover (fills the whole viewport so the
   image edges sit at the screen boundary — no visible box). ANCHOR_X
   biases the framing slightly right so the diagonal keyboard sits
   center-right and the upper-left stays clear for the headline. */
const ANCHOR_X = 0.50;   // stage matches image ratio → exact fill, centered
const ANCHOR_Y = 0.50;
function draw(frameFloat) {
  const idx = clamp(Math.round(frameFloat), 0, FRAME_COUNT - 1);
  const img = frames[idx];
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const cw = stage.clientWidth, ch = stage.clientHeight;
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (cw - dw) * ANCHOR_X;
  const dy = (ch - dh) * ANCHOR_Y;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
  lastDrawn = idx;
}

/* ---------- scroll mapping ---------- */
function progress() {
  const rect  = hero.getBoundingClientRect();
  const total = hero.offsetHeight - window.innerHeight;
  return clamp(-rect.top / total, 0, 1);
}
function onScroll() {
  const p = progress();
  targetFrame = p * (FRAME_COUNT - 1);
  if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
}

/* ---------- per-frame easing loop ---------- */
function tick() {
  easedFrame += (targetFrame - easedFrame) * 0.18;
  if (Math.abs(targetFrame - easedFrame) < 0.01) easedFrame = targetFrame;
  if (ready && Math.round(easedFrame) !== lastDrawn) draw(easedFrame);
  requestAnimationFrame(tick);
}


/* ------------------------------------------------------------------
   Volt Store — vitrine de eletrônicos.
   Catálogo em memória, ilustrações SVG geradas por tipo de produto,
   filtros/busca/ordenação, carrinho em drawer (persistido no
   localStorage quando disponível), contador da oferta do dia e
   animações de entrada ao rolar.
------------------------------------------------------------------- */

const FREE_SHIPPING = 299;
const PIX_OFF = 0.10;
const INSTALLMENTS = 12;

const CATEGORIES = [
  { id: 'smartphones', name: 'Smartphones', type: 'phone',      color: '#16d6a0' },
  { id: 'notebooks',   name: 'Notebooks',   type: 'laptop',     color: '#5b8cff' },
  { id: 'audio',       name: 'Áudio',       type: 'headphones', color: '#ff7a59' },
  { id: 'wearables',   name: 'Smartwatch',  type: 'watch',      color: '#b06bff' },
  { id: 'games',       name: 'Games',       type: 'controller', color: '#ff4d5e' },
  { id: 'tablets',     name: 'Tablets',     type: 'tablet',     color: '#ffb020' },
];

const PRODUCTS = [
  { id: 'p1',  name: 'Nova X Pro 256GB',            cat: 'smartphones', type: 'phone',      color: '#16d6a0', price: 4499, old: 5499, rating: 4.9, reviews: 1284, tag: 'hot' },
  { id: 'p2',  name: 'Nova Lite 128GB',             cat: 'smartphones', type: 'phone',      color: '#5b8cff', price: 1799, old: 2199, rating: 4.7, reviews: 846 },
  { id: 'p3',  name: 'Notebook Aero 14" i7 16GB',   cat: 'notebooks',   type: 'laptop',     color: '#5b8cff', price: 6299, old: 7499, rating: 4.8, reviews: 512, tag: 'hot' },
  { id: 'p4',  name: 'Fone Pulse ANC Max',          cat: 'audio',       type: 'headphones', color: '#ff7a59', price: 1199, old: 1899, rating: 4.9, reviews: 2031, tag: 'hot' },
  { id: 'p5',  name: 'Fone Buds Air 2',             cat: 'audio',       type: 'earbuds',    color: '#16d6a0', price: 499,  old: 699,  rating: 4.6, reviews: 3120 },
  { id: 'p6',  name: 'Smartwatch Fit 5 GPS',        cat: 'wearables',   type: 'watch',      color: '#b06bff', price: 1299, old: 1599, rating: 4.7, reviews: 689, tag: 'new' },
  { id: 'p7',  name: 'Controle Pro Wireless',       cat: 'games',       type: 'controller', color: '#ff4d5e', price: 449,  old: 549,  rating: 4.8, reviews: 954 },
  { id: 'p8',  name: 'Tablet Slate 11" 128GB',      cat: 'tablets',     type: 'tablet',     color: '#ffb020', price: 2499, old: 2999, rating: 4.6, reviews: 402 },
  { id: 'p9',  name: 'Caixa de Som Boom 360',       cat: 'audio',       type: 'speaker',    color: '#5b8cff', price: 649,  old: 899,  rating: 4.8, reviews: 1177 },
  { id: 'p10', name: 'Notebook Flex 15" Ryzen 5',   cat: 'notebooks',   type: 'laptop',     color: '#16d6a0', price: 3699, old: 4299, rating: 4.5, reviews: 318 },
  { id: 'p11', name: 'Smartwatch Band Lite',        cat: 'wearables',   type: 'watch',      color: '#16d6a0', price: 349,  old: 449,  rating: 4.4, reviews: 1560 },
  { id: 'p12', name: 'Console Arcade Mini',         cat: 'games',       type: 'controller', color: '#b06bff', price: 1899, old: 2299, rating: 4.7, reviews: 233, tag: 'new' },
];

const byId = id => PRODUCTS.find(p => p.id === id);
const $ = sel => document.querySelector(sel);

/* ---------- formatting ---------- */
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = v => brl.format(v);
const pct = p => Math.round((1 - p.price / p.old) * 100);

/* ---------- SVG product illustrations ---------- */
let svgUid = 0;
function productSVG(type, color) {
  const id = 'g' + (++svgUid);
  const defs = `<defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="1" stop-color="#0d0e10"/>
    </linearGradient></defs>`;
  const body = '#1a1d22', edge = '#2c3038';
  const shapes = {
    phone: `
      <rect x="62" y="18" width="76" height="164" rx="16" fill="${body}" stroke="${edge}" stroke-width="3"/>
      <rect x="68" y="26" width="64" height="148" rx="11" fill="url(#${id})"/>
      <rect x="88" y="31" width="24" height="6" rx="3" fill="${body}"/>
      <circle cx="100" cy="100" r="18" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`,
    laptop: `
      <rect x="36" y="40" width="128" height="86" rx="8" fill="${body}" stroke="${edge}" stroke-width="3"/>
      <rect x="43" y="47" width="114" height="72" rx="3" fill="url(#${id})"/>
      <path d="M18 132h164l-10 16H28z" fill="#c9ced4"/>
      <rect x="84" y="132" width="32" height="4" rx="2" fill="#9aa1a9"/>`,
    headphones: `
      <path d="M46 112V92a54 54 0 0 1 108 0v20" fill="none" stroke="${body}" stroke-width="12" stroke-linecap="round"/>
      <rect x="32" y="104" width="34" height="58" rx="16" fill="url(#${id})"/>
      <rect x="134" y="104" width="34" height="58" rx="16" fill="url(#${id})"/>
      <rect x="40" y="112" width="18" height="42" rx="9" fill="${body}" opacity=".5"/>
      <rect x="142" y="112" width="18" height="42" rx="9" fill="${body}" opacity=".5"/>`,
    earbuds: `
      <rect x="44" y="92" width="112" height="72" rx="30" fill="#eef0f2" stroke="#d3d7dc" stroke-width="3"/>
      <path d="M44 118h112" stroke="#d3d7dc" stroke-width="3"/>
      <circle cx="100" cy="142" r="4" fill="${color}"/>
      <circle cx="74" cy="64" r="20" fill="url(#${id})"/>
      <rect x="68" y="72" width="12" height="30" rx="6" fill="${body}"/>
      <circle cx="126" cy="64" r="20" fill="url(#${id})"/>
      <rect x="120" y="72" width="12" height="30" rx="6" fill="${body}"/>`,
    watch: `
      <rect x="76" y="14" width="48" height="52" rx="10" fill="${color}" opacity=".8"/>
      <rect x="76" y="134" width="48" height="52" rx="10" fill="${color}" opacity=".8"/>
      <rect x="58" y="54" width="84" height="92" rx="24" fill="${body}" stroke="${edge}" stroke-width="3"/>
      <rect x="66" y="62" width="68" height="76" rx="17" fill="url(#${id})"/>
      <rect x="142" y="84" width="6" height="18" rx="3" fill="${edge}"/>
      <text x="100" y="108" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="20" fill="#fff">10:09</text>`,
    controller: `
      <path d="M52 64h96c22 0 32 20 36 50 4 28-4 44-18 44-12 0-18-10-28-24H62c-10 14-16 24-28 24-14 0-22-16-18-44 4-30 14-50 36-50z" fill="${body}" stroke="${edge}" stroke-width="3"/>
      <path d="M58 94v24M46 106h24" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
      <circle cx="140" cy="96" r="7" fill="${color}"/>
      <circle cx="154" cy="110" r="7" fill="${color}" opacity=".7"/>
      <circle cx="126" cy="110" r="7" fill="${color}" opacity=".7"/>
      <circle cx="140" cy="124" r="7" fill="${color}" opacity=".45"/>
      <circle cx="84" cy="130" r="10" fill="url(#${id})"/>
      <circle cx="116" cy="130" r="10" fill="url(#${id})"/>`,
    tablet: `
      <rect x="30" y="36" width="140" height="128" rx="14" fill="${body}" stroke="${edge}" stroke-width="3"/>
      <rect x="38" y="44" width="124" height="112" rx="8" fill="url(#${id})"/>
      <rect x="54" y="62" width="40" height="30" rx="6" fill="#fff" opacity=".25"/>
      <rect x="104" y="62" width="40" height="30" rx="6" fill="#fff" opacity=".15"/>
      <rect x="54" y="102" width="90" height="36" rx="6" fill="#fff" opacity=".18"/>`,
    speaker: `
      <rect x="62" y="24" width="76" height="156" rx="38" fill="${body}" stroke="${edge}" stroke-width="3"/>
      <rect x="70" y="40" width="60" height="124" rx="30" fill="url(#${id})"/>
      <g fill="#0d0e10" opacity=".35">${Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 4 }, (_, c) => `<circle cx="${84 + c * 11}" cy="${66 + r * 15}" r="2.6"/>`).join('')).join('')}</g>
      <rect x="86" y="30" width="28" height="4" rx="2" fill="${color}"/>`,
  };
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${defs}${shapes[type] || shapes.phone}</svg>`;
}

/* ---------- categories ---------- */
function renderCategories() {
  $('#cats').innerHTML = CATEGORIES.map(c => {
    const n = PRODUCTS.filter(p => p.cat === c.id).length;
    return `<a class="cat" href="#produtos" data-cat="${c.id}">
      <div class="cat__img">${productSVG(c.type, c.color)}</div>
      <strong>${c.name}</strong><span>${n} ${n === 1 ? 'produto' : 'produtos'}</span>
    </a>`;
  }).join('');
  $('#cats').addEventListener('click', e => {
    const a = e.target.closest('[data-cat]');
    if (a) setFilter(a.dataset.cat);
  });
}

/* ---------- product grid ---------- */
const state = { filter: 'all', query: '', sort: 'relevance' };

function renderChips() {
  const chips = [{ id: 'all', name: 'Todos' }, ...CATEGORIES];
  $('#chips').innerHTML = chips.map(c =>
    `<button class="chip${state.filter === c.id ? ' is-active' : ''}" data-filter="${c.id}">${c.name}</button>`
  ).join('');
}

function setFilter(id) {
  state.filter = id;
  renderChips();
  renderProducts();
}

function stars(r) {
  const full = Math.round(r);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function productCard(p) {
  const off = pct(p);
  const badge = p.tag === 'new'
    ? '<span class="badge badge--new">Novo</span>'
    : `<span class="badge${p.tag === 'hot' ? ' badge--hot' : ''}">-${off}%</span>`;
  return `<article class="product">
    ${badge}
    <div class="product__img">${productSVG(p.type, p.color)}</div>
    <div class="product__body">
      <p class="product__cat">${CATEGORIES.find(c => c.id === p.cat).name}</p>
      <h3>${p.name}</h3>
      <p class="rating">${stars(p.rating)} <small>${p.rating.toFixed(1)} (${p.reviews.toLocaleString('pt-BR')})</small></p>
      <p class="price-old">${money(p.old)}</p>
      <p class="price">${money(p.price)}</p>
      <p class="price-pix">${money(p.price * (1 - PIX_OFF))} no Pix</p>
      <p class="price-sub">ou ${INSTALLMENTS}x de ${money(p.price / INSTALLMENTS)}</p>
      <div class="product__foot">
        <button class="add-btn" data-add="${p.id}">Adicionar ao carrinho</button>
      </div>
    </div>
  </article>`;
}

function renderProducts() {
  const q = state.query.trim().toLowerCase();
  let list = PRODUCTS.filter(p =>
    (state.filter === 'all' || p.cat === state.filter) &&
    (!q || p.name.toLowerCase().includes(q) || CATEGORIES.find(c => c.id === p.cat).name.toLowerCase().includes(q))
  );
  const sorters = {
    'price-asc':  (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'discount':   (a, b) => pct(b) - pct(a),
    'rating':     (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  };
  if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);

  $('#products').innerHTML = list.map(productCard).join('');
  $('#empty').hidden = list.length > 0;
}

/* ---------- cart ---------- */
const STORAGE_KEY = 'volt-cart';
let cart = loadCart();

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Object.fromEntries(Object.entries(raw).filter(([id, q]) => byId(id) && q > 0));
  } catch { return {}; }
}
function saveCart() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* storage indisponível */ }
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  renderCart();
  const btn = $('#cart-open');
  btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
  toast(`${byId(id).name} adicionado ao carrinho`);
}
function setQty(id, q) {
  if (q <= 0) delete cart[id]; else cart[id] = q;
  saveCart();
  renderCart();
}

function renderCart() {
  const entries = Object.entries(cart);
  const count = entries.reduce((s, [, q]) => s + q, 0);
  const subtotal = entries.reduce((s, [id, q]) => s + byId(id).price * q, 0);

  $('#cart-count').textContent = count;
  $('#cart-subtotal').textContent = money(subtotal);
  $('#cart-pix').textContent = money(subtotal * (1 - PIX_OFF));
  $('#cart-inst').textContent = subtotal
    ? `ou ${INSTALLMENTS}x de ${money(subtotal / INSTALLMENTS)} sem juros`
    : `ou até ${INSTALLMENTS}x sem juros`;

  const missing = Math.max(0, FREE_SHIPPING - subtotal);
  $('#ship-msg').textContent = missing > 0
    ? `Faltam ${money(missing)} para o frete grátis`
    : 'Parabéns! Você ganhou frete grátis 🎉';
  $('#ship-bar').style.width = Math.min(100, (subtotal / FREE_SHIPPING) * 100) + '%';

  $('#cart-empty').hidden = entries.length > 0;
  $('#checkout').disabled = entries.length === 0;
  $('#checkout').style.opacity = entries.length ? 1 : .5;

  $('#cart-items').innerHTML = entries.map(([id, q]) => {
    const p = byId(id);
    return `<li class="item">
      <div class="item__img">${productSVG(p.type, p.color)}</div>
      <div>
        <h4>${p.name}</h4>
        <p class="item__price">${money(p.price * q)}</p>
        <div class="qty">
          <button data-qty="${id}" data-d="-1" aria-label="Diminuir">−</button>
          <span>${q}</span>
          <button data-qty="${id}" data-d="1" aria-label="Aumentar">+</button>
        </div>
      </div>
      <button class="item__remove" data-remove="${id}">Remover</button>
    </li>`;
  }).join('');
}

function openCart(open) {
  document.body.classList.toggle('cart-open', open);
  document.body.classList.toggle('no-scroll', open);
  $('#drawer').setAttribute('aria-hidden', String(!open));
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
}

/* ---------- deal of the day (countdown até meia-noite) ---------- */
function setupDeal() {
  const deal = byId('p4');
  $('#deal-img').innerHTML = productSVG(deal.type, deal.color);
  $('#deal-name').textContent = deal.name;
  $('#deal-old').textContent = money(deal.old);
  $('#deal-price').textContent = money(deal.price);

  const pad = n => String(n).padStart(2, '0');
  const tickCountdown = () => {
    const now = new Date();
    const end = new Date(now); end.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((end - now) / 1000));
    $('#cd-h').textContent = pad(Math.floor(s / 3600));
    $('#cd-m').textContent = pad(Math.floor(s / 60) % 60);
    $('#cd-s').textContent = pad(s % 60);
  };
  tickCountdown();
  setInterval(tickCountdown, 1000);
}

/* ---------- reveal on scroll ---------- */
function setupReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) {
    addToCart(add.dataset.add);
    if (add.classList.contains('add-btn')) {
      add.classList.add('is-added'); add.textContent = 'Adicionado ✓';
      setTimeout(() => { add.classList.remove('is-added'); add.textContent = 'Adicionar ao carrinho'; }, 1400);
    }
    return;
  }
  const chip = e.target.closest('[data-filter]');
  if (chip) return setFilter(chip.dataset.filter);

  const qty = e.target.closest('[data-qty]');
  if (qty) return setQty(qty.dataset.qty, (cart[qty.dataset.qty] || 0) + Number(qty.dataset.d));

  const rm = e.target.closest('[data-remove]');
  if (rm) return setQty(rm.dataset.remove, 0);
});

$('#cart-open').addEventListener('click', () => openCart(true));
$('#cart-close').addEventListener('click', () => openCart(false));
$('#overlay').addEventListener('click', () => openCart(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') openCart(false); });

$('#checkout').addEventListener('click', () => {
  if (!Object.keys(cart).length) return;
  cart = {};
  saveCart();
  renderCart();
  openCart(false);
  toast('Pedido realizado! (loja demonstrativa)');
});

$('#search-input').addEventListener('input', e => {
  state.query = e.target.value;
  renderProducts();
});
$('#search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('buy').scrollIntoView({ behavior: 'smooth' });
});
$('#sort').addEventListener('change', e => {
  state.sort = e.target.value;
  renderProducts();
});
$('#newsletter').addEventListener('submit', e => {
  e.preventDefault();
  e.target.reset();
  toast('Cupom VOLT50 enviado para o seu e-mail!');
});

/* ---------- init ---------- */
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', sizeCanvas);
preload();
onScroll();
requestAnimationFrame(tick);
renderCategories();
renderChips();
renderProducts();
renderCart();
setupDeal();
setupReveal();
