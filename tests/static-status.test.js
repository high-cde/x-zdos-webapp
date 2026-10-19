import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('wallet page contains no sample financial balances or enabled value actions', async () => {
  const html = await file('wallet.html');
  assert.match(html, /nessun saldo, account, rete o transazione è collegato/i);
  assert.match(html, /Saldo non disponibile/);
  assert.doesNotMatch(html, /€\s*[0-9]|[0-9,.]+\s*(DSN|POL|zETH)|function\s+(claimMiningRewards|executeTokenBurn|grabToken)/i);
  assert.match(html, /disabled>Burn disattivato/);
});

test('xcloud exposes the real workspace mission API without legacy endpoints or card collection', async () => {
  const html = await file('xcloud.html');
  assert.match(html, /fetch\('\/health'\)/);
  assert.match(html, /\/api\/v1\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}\/missions/);
  assert.match(html, /Accedi con il tuo account/);
  assert.doesNotMatch(html, /cardNumber|cardHolder|\/api\/(onboarding|feed|messages|tasks|leads)/i);
  assert.match(html, /pagamenti e firma non sono disponibili/i);
});

test('lab and specs pages do not simulate successful execution or measurements', async () => {
  const lab = await file('lab.html');
  const specs = await file('specs.html');
  const ide = await file('lab-ide.html');
  assert.match(lab, /nessuna compilazione o transazione reale/i);
  assert.doesNotMatch(lab, /SUCCESS.*minato|ottimizzate al 100%|99\.99%|Math\.random/i);
  assert.match(specs, /i valori non vengono misurati/i);
  assert.doesNotMatch(specs, /248\.4 tok\/s|1,940 ops|18\.4%|100% PACKET DELIVERY|Math\.random\(\) \* 25/i);
  assert.match(ide, /terminale ed esecuzione remota disattivati/i);
  assert.doesNotMatch(ide, /Push dei commit.*completato|Compilazione eseguita/i);
});

test('specs labels Organism as a configured provider gateway rather than native ZLang inference', async () => {
  const specs = await file('specs.html');
  assert.match(specs, /ZDOS Organism · Generative Gateway/);
  assert.match(specs, /non è un modello nativo ZLang/);
  assert.match(specs, /\/api\/v1\/workspaces\/\$\{encodeURIComponent\(workspace\)\}\/organism\/generate/);
  assert.match(specs, /\/api\/v1\/organism\/status/);
});

test('homepage labels canvas as decorative and removes unsupported benchmark claims', async () => {
  const html = await file('index.html');
  assert.match(html, /Animazione canvas decorativa/i);
  assert.match(html, /Non misurato/);
  assert.doesNotMatch(html, /0\.12 ms|100%<span> uptime|0 infezioni rilevate/i);
});

test('ZDOS downloads link to the official release assets and document checksum verification', async () => {
  const page = await file('downloads.html');
  const app = await file('src/app.js');
  const worker = await file('service-worker.js');
  assert.match(page, /https:\/\/github\.com\/high-cde\/ZDOS\/releases\/latest\/download\/zdos-linux-x86_64\.iso/);
  assert.match(page, /https:\/\/github\.com\/high-cde\/ZDOS\/releases\/latest\/download\/SHA256SUMS/);
  assert.match(page, /https:\/\/github\.com\/high-cde\/ZDOS(?:"|\/releases)/);
  assert.match(page, /sha256sum -c SHA256SUMS/);
  assert.match(app, /'downloads\.html'/);
  assert.match(worker, /'\/downloads\.html'/);
});

test('site HTML has no remote font requests or hard-coded public-site navigation', async () => {
  for (const page of ['index.html', 'lab.html', 'lab-ide.html', 'specs.html', 'wallet.html', 'xcloud.html', 'velvet.html']) {
    const html = await file(page);
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com|https:\/\/x-zdos\.it/i, page);
    assert.doesNotMatch(html, /<(script|iframe|img|link)[^>]+(?:src|href)="https?:\/\//i, page);
    assert.doesNotMatch(html, /window\.alert\s*\(|target="_blank"/i, page);
  }
});

test('offline app shell is local and does not cache API or authenticated responses', async () => {
  const worker = await file('service-worker.js');
  const manifest = await file('manifest.webmanifest');
  assert.match(worker, /ZDOS eNET blocks external requests/);
  assert.match(worker, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /pathname\.startsWith\('\/auth\/'\)/);
  assert.match(worker, /headers\.has\('set-cookie'\)/);
  assert.match(manifest, /"display": "standalone"/);
});
