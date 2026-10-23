// Isolated UI regression checks: all API calls and submit callbacks stay in memory.
// Run: node --test apps/web/tests/create-wizards.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');
const ts = require('typescript');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData']) global[key] = dom.window[key];
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const root = createRoot(document.getElementById('root'));
const sourceRoot = path.resolve(__dirname, '../src');
const nativeRequire = createRequire(path.resolve(__dirname, '../package.json'));
const requests = [];
const salons = [{ _id: 's1', name: 'Salón uno' }, { _id: 's2', name: 'Salón dos' }];
const quotes = [{ _id: 'q1', quoteNumber: 'Q1', contactName: 'Cliente presupuesto', eventType: 'Fiesta', eventDate: '2027-01-20', startTime: '21:00', endTime: '03:00', guestCount: 50, totalAmount: 50000, salonId: salons[0] }];
const api = {
  get: async (url) => {
    requests.push(url);
    if (url.startsWith('/customers')) return { items: [{ _id: 'c1', fullName: 'Cliente existente' }] };
    if (url.startsWith('/quotes?')) return { items: quotes };
    if (url.startsWith('/quotes/packages?')) return { packages: [{ _id: url.includes('s2') ? 'p2' : 'p1', name: url.includes('s2') ? 'Paquete dos' : 'Paquete uno', pricingMode: 'fixed', fixedPrice: 10000, startTime: '21:00', endTime: '03:00' }] };
    if (url.includes('/package-rules')) return { packageRules: [] };
    if (url.startsWith('/quotes/packages/')) return { package: { _id: 'p1', name: 'Paquete uno', ruleConfigured: true, pricingMode: 'fixed', fixedPrice: 10000, startTime: '21:00', endTime: '03:00' } };
    throw new Error(`Unexpected mock GET: ${url}`);
  },
  post: async (url, payload) => { requests.push({ url, payload }); return { event: { _id: 'new-event' } }; }
};
const cache = new Map();
const showToast = () => {};
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const localRequire = (id) => {
    if (id === '@/lib/api') return { api };
    if (id === '@/components/ui/toast-provider') return { useToast: () => ({ showToast }) };
    if (id === '@/features/events/event-operations') return { createDefaultResourcePlan: () => ({}) };
    if (!id.startsWith('@/') && !id.startsWith('.')) return nativeRequire(id);
    const base = id.startsWith('@/') ? path.join(sourceRoot, id.slice(2)) : path.resolve(path.dirname(filename), id);
    return load(['.tsx', '.ts', '/index.tsx'].map((ext) => base + ext).find(fs.existsSync));
  };
  new Function('require', 'module', 'exports', output)(localRequire, mod, mod.exports);
  return mod.exports;
}
const { QuoteFormModal } = load(path.join(sourceRoot, 'features/quotes/quote-form-modal.tsx'));
const { EventCreateModal } = load(path.join(sourceRoot, 'features/events/event-create-modal.tsx'));
const visible = (el) => { for (let p = el; p; p = p.parentElement) if (p.style.display === 'none' || p.hidden) return false; return true; };
const controls = () => [...document.querySelectorAll('input,select,textarea')].filter(visible);
const field = (label) => controls().find((el) => el.closest('label')?.textContent.startsWith(label));
async function render(Component, props) { await act(async () => { root.render(React.createElement(Component, props)); }); }
async function click(text) {
  const button = [...document.querySelectorAll('button')].find((el) => visible(el) && el.textContent.includes(text));
  assert.ok(button, `Missing button ${text}`);
  await act(async () => { button.click(); });
}
async function fill(el, value) {
  assert.ok(el, `Missing field for ${value}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const heading = () => document.querySelector('h2[tabindex]')?.textContent;
const common = { open: true, salons, onClose: () => {} };
async function fresh() { await act(async () => root.render(null)); requests.length = 0; }

test('presupuesto manual: etapas aisladas, obligatorios, volver, resumen y payload completo', async () => {
  await fresh(); let payload;
  await render(QuoteFormModal, { ...common, leads: [], saving: false, onSubmit: async (value) => { payload = value; } });
  assert.equal(heading(), 'Cliente y evento');
  assert.equal(field('Paquete'), undefined);
  assert.equal(field('Inicio'), undefined);
  await click('Continuar'); assert.equal(heading(), 'Cliente y evento');
  for (const [label, value] of [['Nombre y apellido', 'Ana Prueba'], ['Teléfono', '1112345678'], ['Tipo de evento', 'Cumpleaños'], ['Fecha del evento', '2027-01-20'], ['Cantidad estimada', '50']]) await fill(field(label), value);
  await click('Continuar'); assert.equal(heading(), 'Salón y paquete');
  assert.equal(field('Nombre y apellido'), undefined);
  await click('Continuar'); assert.equal(heading(), 'Salón y paquete');
  await act(async () => document.querySelector('input[name="quote-salon"]').click());
  await fill(field('Paquete'), 'manual');
  await click('Continuar'); assert.equal(heading(), 'Valores');
  await click('Continuar'); assert.equal(heading(), 'Valores');
  await fill(field('Inicio'), '21:00'); await fill(field('Fin'), '03:00'); await fill(field('Valor por persona'), '1000');
  await click('Anterior'); await click('Anterior');
  assert.equal(field('Nombre y apellido').value, 'Ana Prueba');
  await click('Continuar'); await click('Continuar');
  assert.equal(field('Valor por persona').value, '1000');
  await click('Continuar'); assert.equal(heading(), 'Detalles');
  await click('Continuar'); assert.equal(heading(), 'Resumen');
  assert.equal(controls().length, 0);
  assert.match(document.body.textContent, /Ana Prueba/);
  assert.match(document.body.textContent, /50\.000/);
  assert.equal(payload, undefined);
  await click('Crear presupuesto');
  assert.equal(payload.contactName, 'Ana Prueba'); assert.equal(payload.guestCount, 50); assert.equal(payload.finalPricePerPerson, 1000);
  assert.equal(payload.salonId, 's1');
});

test('presupuestos: paquetes por salón, edición completa y reinicio al reabrir', async () => {
  await fresh();
  const props = { ...common, leads: [], saving: false, onSubmit: async () => {} };
  await render(QuoteFormModal, { ...props, quote: { ...quotes[0], phone: '1111', pricingMode: 'fixed', fixedPrice: 50000 } });
  assert.ok(field('Nombre y apellido')); assert.ok(field('Inicio')); assert.ok(field('Paquete'));
  await render(QuoteFormModal, { ...props, open: false }); await render(QuoteFormModal, props);
  assert.equal(heading(), 'Cliente y evento');
});

test('evento manual: cliente aislado, carga manual desbloqueada y creación sólo al final', async () => {
  await fresh(); let created = false;
  await render(EventCreateModal, { ...common, onCreated: () => { created = true; }, onError: (msg) => { throw new Error(msg); } });
  await click('Continuar'); assert.equal(heading(), 'Origen y cliente');
  await fill(field('Salón'), 's1'); await fill(field('Nombre completo'), 'Ana Evento');
  await click('Continuar'); assert.equal(heading(), 'Evento'); assert.equal(field('Nombre completo'), undefined);
  await fill(field('Tipo de evento'), 'Cumpleaños'); await fill(field('Fecha'), '2027-01-20'); await fill(field('Inicio'), '21:00'); await fill(field('Fin'), '03:00'); await fill(field('Invitados'), '50');
  await click('Continuar'); assert.equal(heading(), 'Comercial');
  await click('Continuar'); assert.equal(heading(), 'Comercial');
  await fill(field('Paquete / propuesta'), 'A medida'); await fill(field('Precio de lista'), '50000');
  await click('Continuar'); assert.equal(heading(), 'Detalles');
  await click('Continuar'); assert.equal(heading(), 'Resumen'); assert.equal(controls().length, 0); assert.equal(created, false);
  await click('Crear evento'); assert.equal(created, true);
  assert.equal(requests.find((item) => item.url === '/events').payload.packageName, 'A medida');
});

test('evento desde presupuesto: datos heredados y resumen sin campos de otras etapas', async () => {
  await fresh();
  await render(EventCreateModal, { ...common, onCreated: () => {}, onError: () => {} });
  await click('Desde presupuesto'); await fill(field('Presupuesto existente'), 'q1');
  for (let i = 0; i < 4; i++) await click('Continuar');
  assert.equal(heading(), 'Resumen'); assert.equal(controls().length, 0);
  assert.match(document.body.textContent, /Cliente presupuesto/);
});

test('presupuesto con lead: filtra paquetes al cambiar salón y descarta la selección anterior', async () => {
  await fresh();
  const lead = { _id: 'l1', fullName: 'Lead prueba', phone: '1111', eventType: 'Fiesta', eventDate: '2027-02-15', guestCount: 50 };
  await render(QuoteFormModal, { ...common, leads: [lead], saving: false, onSubmit: async () => {} });
  await click('Buscar'); await fill(field('Leads'), 'l1'); await click('Continuar');
  assert.equal(heading(), 'Salón y paquete');
  await act(async () => document.querySelector('input[name="quote-salon"]').click());
  assert.match(field('Paquete').textContent, /Paquete uno/);
  await fill(field('Paquete'), 'p1');
  await act(async () => document.querySelectorAll('input[name="quote-salon"]')[1].click());
  assert.match(field('Paquete').textContent, /Paquete dos/);
  assert.doesNotMatch(field('Paquete').textContent, /Paquete uno/);
  assert.equal(field('Paquete').value, '');
  await click('Continuar'); assert.equal(heading(), 'Salón y paquete');
  await fill(field('Paquete'), 'p2'); await click('Continuar'); assert.equal(heading(), 'Valores');
});

test('catering externo: exige locación y permite recorrer la carga manual', async () => {
  await fresh();
  await render(EventCreateModal, { ...common, initialValues: { serviceMode: 'external_catering' }, onCreated: () => {}, onError: () => {} });
  assert.equal(field('Salón'), undefined);
  await fill(field('Nombre completo'), 'Cliente catering');
  await click('Continuar'); assert.equal(heading(), 'Origen y cliente');
  await fill(field('Nombre de la locación'), 'Locación externa'); await fill(field('Contacto en locación'), 'Contacto'); await fill(field('Dirección'), 'Calle prueba 123');
  await click('Continuar'); assert.equal(heading(), 'Evento');
  assert.equal(field('Dirección'), undefined);
  for (const [label, value] of [['Tipo de evento', 'Fiesta'], ['Fecha', '2027-01-20'], ['Inicio', '21:00'], ['Fin', '03:00'], ['Invitados', '100']]) await fill(field(label), value);
  await click('Continuar'); assert.equal(heading(), 'Comercial');
  await fill(field('Propuesta comercial'), 'Catering a medida'); await fill(field('Precio de lista'), '50000');
  await click('Continuar'); await click('Continuar');
  assert.equal(heading(), 'Resumen'); assert.equal(controls().length, 0);
});
