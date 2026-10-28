'use strict';

const MAX_RANGE = 1e9;
const MAX_ENUM = 1e6;

// Unbiased random integer in [0, n), n <= 2^32, via rejection sampling.
function randBelow(n) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / n) * n;
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

function shuffle(arr, k = arr.length) {
  for (let i = 0; i < k; i++) {
    const j = i + randBelow(arr.length - i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, k);
}

// Parse "7, 13 20-30" into merged, sorted [from, to] intervals clipped to [min, max].
function parseExclusions(text, min, max) {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const intervals = [];
  for (const p of parts) {
    const m = p.match(/^(-?\d+)(?:-(-?\d+))?$/);
    if (!m) throw new Error(`Valore da escludere non valido: "${p}"`);
    let a = Number(m[1]);
    let b = m[2] !== undefined ? Number(m[2]) : a;
    if (a > b) [a, b] = [b, a];
    a = Math.max(a, min);
    b = Math.min(b, max);
    if (a <= b) intervals.push([a, b]);
  }
  intervals.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }
  return merged;
}

// Describes the allowed set [min, max] minus exclusions, without materializing it.
function allowedSet(min, max, excluded) {
  const excludedCount = excluded.reduce((s, [a, b]) => s + (b - a + 1), 0);
  const size = max - min + 1 - excludedCount;
  // Map the i-th allowed index (0-based) to its value by skipping excluded intervals.
  const nth = (i) => {
    let v = min + i;
    for (const [a, b] of excluded) {
      if (a <= v) v += b - a + 1;
      else break;
    }
    return v;
  };
  const all = () => {
    const out = [];
    for (let i = 0; i < size; i++) out.push(nth(i));
    return out;
  };
  return { size, nth, all };
}

function readRange(form) {
  const min = Number(form.min.value);
  const max = Number(form.max.value);
  if (!Number.isInteger(min) || !Number.isInteger(max)) throw new Error('Minimo e massimo devono essere interi.');
  if (Math.abs(min) > MAX_RANGE || Math.abs(max) > MAX_RANGE) throw new Error(`I limiti devono essere tra -${MAX_RANGE} e ${MAX_RANGE}.`);
  if (min > max) throw new Error('Il minimo deve essere minore o uguale al massimo.');
  const excluded = parseExclusions(form.escludi.value, min, max);
  return { min, max, excluded, set: allowedSet(min, max, excluded) };
}

function describeExclusions(excluded) {
  if (!excluded.length) return '';
  const txt = excluded.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ');
  return ` · Esclusi: ${txt}`;
}

// --- Rendering helpers ---
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function chips(values) {
  const box = el('div', 'chips');
  for (const v of values) box.append(el('span', 'chip', String(v)));
  return box;
}

function copyButton(text) {
  const b = el('button', 'copy', 'Copia');
  b.type = 'button';
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = 'Copiato!';
    } catch {
      b.textContent = 'Copia non riuscita';
    }
    setTimeout(() => (b.textContent = 'Copia'), 1500);
  });
  return b;
}

function show(id, ...nodes) {
  const box = document.getElementById(id);
  box.replaceChildren(...nodes);
  document.getElementById('ts').textContent = new Date().toLocaleString('it-IT');
}

function handle(formId, resultId, fn) {
  document.getElementById(formId).addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      fn(e.target, resultId);
    } catch (err) {
      show(resultId, el('p', 'error', err.message));
    }
  });
}

// --- Generators ---
handle('form-interi', 'res-interi', (f, rid) => {
  const n = Number(f.n.value);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error('Puoi generare da 1 a 10000 numeri.');
  const { excluded, set } = readRange(f);
  if (set.size <= 0) throw new Error('Tutti i numeri dell\'intervallo sono esclusi.');

  let out;
  if (f.unici.checked) {
    if (n > set.size) throw new Error(`Senza ripetizioni puoi ottenere al massimo ${set.size} numeri.`);
    if (set.size <= MAX_ENUM) {
      out = shuffle(set.all(), n);
    } else {
      const seen = new Set();
      while (seen.size < n) seen.add(set.nth(randBelow(set.size)));
      out = [...seen];
    }
  } else {
    out = Array.from({ length: n }, () => set.nth(randBelow(set.size)));
  }
  if (f.ordina.checked) out.sort((a, b) => a - b);

  show(rid, chips(out), copyButton(out.join(', ')),
    el('p', 'meta', `${n} numeri tra ${f.min.value} e ${f.max.value}${describeExclusions(excluded)}`));
});

handle('form-sequenza', 'res-sequenza', (f, rid) => {
  const { excluded, set } = readRange(f);
  if (set.size <= 0) throw new Error('Tutti i numeri dell\'intervallo sono esclusi.');
  if (set.size > 10000) throw new Error('La sequenza può contenere al massimo 10000 numeri.');
  const out = shuffle(set.all());
  const list = el('ol');
  for (const v of out) list.append(el('li', null, String(v)));
  show(rid, list, copyButton(out.join('\n')),
    el('p', 'meta', `${out.length} numeri${describeExclusions(excluded)}`));
});

handle('form-lista', 'res-lista', (f, rid) => {
  const items = f.items.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!items.length) throw new Error('Inserisci almeno un elemento.');
  const k = f.k.value ? Number(f.k.value) : items.length;
  if (!Number.isInteger(k) || k < 1 || k > items.length) throw new Error(`Puoi estrarre da 1 a ${items.length} elementi.`);
  const out = shuffle(items, k);
  const list = el('ol');
  for (const v of out) list.append(el('li', null, v));
  show(rid, list, copyButton(out.join('\n')));
});

handle('form-moneta', 'res-moneta', (f, rid) => {
  const n = Number(f.n.value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Puoi lanciare da 1 a 100 monete.');
  const out = Array.from({ length: n }, () => (randBelow(2) ? 'Testa' : 'Croce'));
  const teste = out.filter((x) => x === 'Testa').length;
  show(rid, chips(out), el('p', 'meta', `Testa: ${teste} · Croce: ${n - teste}`));
});

handle('form-dadi', 'res-dadi', (f, rid) => {
  const n = Number(f.n.value);
  const facce = Number(f.facce.value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Puoi lanciare da 1 a 100 dadi.');
  if (!Number.isInteger(facce) || facce < 2 || facce > 1000) throw new Error('Le facce devono essere tra 2 e 1000.');
  const out = Array.from({ length: n }, () => 1 + randBelow(facce));
  const somma = out.reduce((a, b) => a + b, 0);
  show(rid, chips(out), el('p', 'meta', `Somma: ${somma}`));
});

handle('form-password', 'res-password', (f, rid) => {
  const n = Number(f.n.value);
  const len = Number(f.len.value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Puoi generare da 1 a 100 password.');
  if (!Number.isInteger(len) || len < 4 || len > 128) throw new Error('La lunghezza deve essere tra 4 e 128.');
  let chars = '';
  if (f.lower.checked) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (f.upper.checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (f.digits.checked) chars += '0123456789';
  if (f.symbols.checked) chars += '!@#$%^&*()-_=+[]{};:,.?/';
  if (!chars) throw new Error('Seleziona almeno un tipo di carattere.');
  const out = Array.from({ length: n }, () =>
    Array.from({ length: len }, () => chars[randBelow(chars.length)]).join(''));
  const list = el('ol', 'mono');
  for (const p of out) list.append(el('li', null, p));
  show(rid, list, copyButton(out.join('\n')));
});

// --- Tabs ---
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === tab.dataset.tab));
  });
}

// Exported for tests under Node; no effect in the browser.
if (typeof module !== 'undefined') module.exports = { parseExclusions, allowedSet, randBelow };
