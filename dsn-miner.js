let running = false;
let challenge = '';
let difficulty = 4;
let intensity = 35;
let nonce = 0;
let hashes = 0;
let shares = 0;
let best = 0;
let startedAt = 0;

const hex = (bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const leadingZeroNibbles = (hash) => {
  let count = 0;
  for (const char of hash) { if (char !== '0') break; count++; }
  return count;
};

self.onmessage = ({ data }) => {
  if (data?.type === 'start' && !running) {
    challenge = data.challenge;
    difficulty = data.difficulty;
    intensity = data.intensity;
    nonce = 0; hashes = 0; shares = 0; best = 0; startedAt = Date.now(); running = true;
    self.postMessage({ type: 'started', challenge, difficulty });
    void mineBatch();
  } else if (data?.type === 'stop') {
    running = false;
  } else if (data?.type === 'intensity') {
    intensity = Math.max(10, Math.min(100, Number(data.value) || 10));
  }
};

async function mineBatch() {
  if (!running) return;
  const encoder = new TextEncoder();
  try {
    for (let i = 0; i < 80 && running; i++) {
      const input = encoder.encode(`ZDOS-DSN-LOCAL-POW:v1:${challenge}:${nonce++}`);
      const digest = hex(await crypto.subtle.digest('SHA-256', input));
      const zeros = leadingZeroNibbles(digest);
      hashes++;
      if (zeros > best) best = zeros;
      if (zeros >= difficulty) {
        shares++;
        self.postMessage({ type: 'share', hash: digest, nonce: nonce - 1, shares });
      }
    }
    const elapsed = Math.max(1, Date.now() - startedAt);
    self.postMessage({ type: 'progress', hashes, shares, best, hashesPerSecond: Math.round(hashes * 1000 / elapsed), elapsedMs: elapsed });
    if (running) setTimeout(mineBatch, Math.round((100 - intensity) * 1.1));
  } catch (error) {
    running = false;
    self.postMessage({ type: 'error', message: error?.message || 'crypto_unavailable' });
  }
}
