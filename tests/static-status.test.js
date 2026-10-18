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

test('xcloud does not collect card data or call its legacy endpoints', async () => {
  const html = await file('xcloud.html');
  assert.match(html, /Backend non configurato/);
  assert.doesNotMatch(html, /cardNumber|cardHolder|fetch\s*\(|\/api\/(onboarding|feed|messages|tasks|leads)/i);
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

test('homepage labels canvas as decorative and removes unsupported benchmark claims', async () => {
  const html = await file('index.html');
  assert.match(html, /Animazione canvas decorativa/i);
  assert.match(html, /Non misurato/);
  assert.doesNotMatch(html, /0\.12 ms|100%<span> uptime|0 infezioni rilevate/i);
});
