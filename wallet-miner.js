const startButton = document.getElementById('minerStart');
const stopButton = document.getElementById('minerStop');
const terminal = document.getElementById('minerTerminal');
const difficulty = document.getElementById('minerDifficulty');
const intensity = document.getElementById('minerIntensity');
let minerWorker = null;

function setMinerRunning(running) {
  startButton.disabled = running;
  stopButton.disabled = !running;
}

function startMiner() {
  if (!('Worker' in window) || !globalThis.crypto?.subtle) {
    terminal.textContent = 'Questo browser non supporta Web Worker o Web Crypto. Apri la pagina tramite HTTPS.';
    return;
  }
  minerWorker?.terminate();
  minerWorker = new Worker('/dsn-miner.js');
  setMinerRunning(true);
  for (const id of ['minerRate', 'minerHashes', 'minerShares', 'minerBest']) document.getElementById(id).textContent = '0';
  const challenge = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  terminal.textContent = `Challenge locale ${challenge}\nSHA-256 · ${difficulty.value} zeri iniziali · nessun pool o accredito DSN.`;
  minerWorker.onmessage = ({ data }) => {
    if (data.type === 'started') terminal.textContent = `Calcolo avviato · challenge ${data.challenge}\nLa prova resta locale e non viene inviata a una rete.`;
    if (data.type === 'progress') {
      document.getElementById('minerRate').textContent = data.hashesPerSecond.toLocaleString('it-IT');
      document.getElementById('minerHashes').textContent = data.hashes.toLocaleString('it-IT');
      document.getElementById('minerShares').textContent = data.shares.toLocaleString('it-IT');
      document.getElementById('minerBest').textContent = data.best;
    }
    if (data.type === 'share') terminal.textContent = `Prova locale valida · nonce ${data.nonce}\nSHA-256 ${data.hash}\nProve: ${data.shares}. Non è una share accettata da una rete e non produce $DSN.`;
    if (data.type === 'error') {
      terminal.textContent = `Miner fermato: ${data.message}`;
      minerWorker?.terminate(); minerWorker = null; setMinerRunning(false);
    }
  };
  minerWorker.onerror = () => {
    terminal.textContent = 'Errore nel worker. Il calcolo è stato fermato.';
    minerWorker?.terminate(); minerWorker = null; setMinerRunning(false);
  };
  minerWorker.postMessage({ type: 'start', challenge, difficulty: Number(difficulty.value), intensity: Number(intensity.value) });
}

function stopMiner(reason = 'Calcolo fermato dall’utente.') {
  if (!minerWorker) return;
  minerWorker.postMessage({ type: 'stop' });
  minerWorker.terminate();
  minerWorker = null;
  setMinerRunning(false);
  terminal.textContent += `\n${reason}`;
}

startButton.addEventListener('click', startMiner);
stopButton.addEventListener('click', () => stopMiner());
difficulty.addEventListener('input', () => { document.getElementById('minerDifficultyValue').textContent = difficulty.value; });
intensity.addEventListener('input', () => { document.getElementById('minerIntensityValue').textContent = `${intensity.value}%`; minerWorker?.postMessage({ type: 'intensity', value: Number(intensity.value) }); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMiner('Calcolo fermato perché la pagina è in background.'); });
window.addEventListener('pagehide', () => stopMiner('Pagina chiusa.'));
