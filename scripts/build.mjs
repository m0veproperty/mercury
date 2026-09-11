import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const origin = 'https://mercury.com';
const uploadedSha256 = '04b6cd5c3fbb3ef2ea1bc8b0164af8f4ef4de7b4a73936449a8ecb522ec0a29f';
const payloadDir = new URL('../src/command-payload/', import.meta.url);
const distDir = new URL('../dist/', import.meta.url);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateCommandPage(html, source) {
  if (html.length < 500000) {
    throw new Error(`${source} is unexpectedly small: ${html.length} bytes.`);
  }
  if (!html.includes('<title>Mercury Command') || !html.includes('Mercury Command')) {
    throw new Error(`${source} failed Mercury Command content validation.`);
  }
  return html;
}

async function readRepositorySnapshot() {
  const parts = (await readdir(payloadDir)).filter(name => name.endsWith('.part')).sort();
  if (parts.length !== 15) {
    throw new Error(`repository payload incomplete: expected 15 parts, found ${parts.length}`);
  }

  const encoded = (await Promise.all(parts.map(name => readFile(new URL(name, payloadDir), 'utf8')))).join('');
  const html = validateCommandPage(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'), 'Repository snapshot');
  const digest = sha256(html);
  if (digest !== uploadedSha256) {
    throw new Error(`repository snapshot checksum mismatch: ${digest}`);
  }
  return html;
}

async function readOriginSnapshot() {
  const response = await fetch(`${origin}/command`, {
    headers: { 'user-agent': 'Mozilla/5.0 MercuryCommandNpm/1.2' }
  });
  if (!response.ok) {
    throw new Error(`Mercury origin returned HTTP ${response.status}.`);
  }
  return validateCommandPage(await response.text(), 'Mercury origin /command');
}

async function loadSnapshot() {
  try {
    return { html: await readRepositorySnapshot(), source: 'uploaded repository snapshot' };
  } catch (error) {
    console.warn(`Repository snapshot unavailable: ${error.message}`);
    return { html: await readOriginSnapshot(), source: 'validated mercury.com/command fallback' };
  }
}

function prepareForStandaloneHosting(html) {
  const runtimeGuard = `<script data-command-standalone>\n(() => {\n  const origin = ${JSON.stringify(origin)};\n  document.addEventListener('click', event => {\n    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;\n    if (!anchor) return;\n    const raw = anchor.getAttribute('href');\n    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw === '/command' || raw.startsWith('/command?') || raw.startsWith('/command#')) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    window.location.assign(origin + raw);\n  }, true);\n})();\n</script>`;

  return html.includes('</head>') ? html.replace('</head>', `${runtimeGuard}</head>`) : `${runtimeGuard}${html}`;
}

const snapshot = await loadSnapshot();
const output = prepareForStandaloneHosting(snapshot.html);

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await writeFile(new URL('./command.html', distDir), output);

console.log(`Mercury Command build complete from ${snapshot.source}.`);
console.log(`Uploaded source reference SHA256: ${uploadedSha256}`);
console.log(`Output size: ${Buffer.byteLength(output)} bytes.`);
