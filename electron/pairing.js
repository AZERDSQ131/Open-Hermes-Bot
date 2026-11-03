// The code a phone scans.
//
// The desktop window already holds the way to the host: an SSH connection, or
// this Mac. That is the one thing the phone does not have. So the window mints
// the bridge's pairing code where it can, asks Tailscale where the bridge is
// published, and folds both into one link the phone reads with its camera.
//
// The rules live here, in one file, so the shell and its tests cannot disagree
// about them: what the script asks the host, and what its answer means.

'use strict';

/** The scheme the phone understands: `hermesbot://pair?url=…&code=…`. */
const SCHEME = 'hermesbot';

/** The bridge's own address on the host. Published, never bound, elsewhere. */
const BRIDGE_PORT = 8765;

/** The bridge mints a code for twenty minutes, once. */
const PAIRING_TTL_SECONDS = 20 * 60;

/** The sections the script writes, so one run answers every question. */
const SECTIONS = ['PAIR', 'TAILSCALE', 'SERVE', 'HEALTH'];

/**
 * What the host is asked, in one run: mint a code, name the tailnet, say
 * whether the bridge is published, and whether it answers here.
 *
 * The code comes from the bridge's own command line — running it where the
 * package lives (`~/hermes-bridge`, as `bridge/deploy/install.sh` lays it
 * out). A host without the bridge says so with Python's own sentence, and
 * that sentence is relayed rather than guessed at.
 */
function pairingScript() {
  return [
    'for candidate in "$HOME/hermes-bridge" "$HOME/.hermes-bridge" "$HOME/bridge"; do',
    '  if [ -f "$candidate/hermes_bridge/__main__.py" ]; then cd "$candidate"; break; fi',
    'done',
    'echo "##PAIR"',
    'python3 -m hermes_bridge pair 2>&1',
    'TS=""',
    'if command -v tailscale >/dev/null 2>&1; then TS=$(command -v tailscale); fi',
    'if [ -z "$TS" ] && [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then',
    '  TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    'fi',
    'if [ -z "$TS" ] && [ -x /usr/local/bin/tailscale ]; then TS=/usr/local/bin/tailscale; fi',
    'if [ -z "$TS" ] && [ -x /opt/homebrew/bin/tailscale ]; then TS=/opt/homebrew/bin/tailscale; fi',
    'echo "##TAILSCALE"',
    'if [ -n "$TS" ]; then "$TS" status --json 2>/dev/null; fi',
    'echo "##SERVE"',
    'if [ -n "$TS" ]; then "$TS" serve status 2>/dev/null; fi',
    'echo "##HEALTH"',
    'curl -sf -m 3 "http://127.0.0.1:' + BRIDGE_PORT + '/v1/health" 2>/dev/null',
    'echo',
    'exit 0',
  ].join('\n');
}

/** One section of the script's answer, without the sentinels. */
function section(stdout, name) {
  const text = String(stdout ?? '');
  const start = text.indexOf(`##${name}`);
  if (start === -1) return '';
  const body = text.slice(start + name.length + 2);
  const next = SECTIONS.map((entry) => body.indexOf(`##${entry}`))
    .filter((index) => index !== -1)
    .sort((left, right) => left - right)[0];
  return (next === undefined ? body : body.slice(0, next)).trim();
}

/** The code the bridge printed: `ABCD-EFGH`, and nothing else. */
function pairingCode(stdout) {
  const found = /Pairing code:\s*([A-Z2-9]{4}-[A-Z2-9]{4})/i.exec(
    section(stdout, 'PAIR'),
  );
  return found ? found[1].toUpperCase() : '';
}

/** What went wrong when no code came out, in the host's own words. */
function pairingFailure(stdout, label) {
  const pair = section(stdout, 'PAIR');
  if (/No module named ['"]?hermes_bridge/i.test(pair)) {
    return {
      error: `The bridge is not installed on ${label}.`,
      hint: `Run bridge/deploy/install.sh there — it lays the package out in ~/hermes-bridge.`,
    };
  }
  const line = pair
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return {
    error: line || `The bridge on ${label} did not mint a code.`,
    hint: 'The bridge must be running on the host, and Python must find its package.',
  };
}

/** The machine's name on the tailnet, as `tailscale status` writes it. */
function tailnetName(stdout) {
  const raw = section(stdout, 'TAILSCALE');
  if (!raw) return '';
  try {
    const name = JSON.parse(raw)?.Self?.DNSName;
    if (typeof name === 'string' && name.trim()) return name.trim().replace(/\.$/, '');
  } catch {
    // An older Tailscale, or a half-written answer: the line still says it.
  }
  const found = /"DNSName"\s*:\s*"([^"]+)"/.exec(raw);
  return found ? found[1].trim().replace(/\.$/, '') : '';
}

/** The HTTPS address `tailscale serve` publishes, when it publishes one. */
function servedUrl(stdout) {
  const found = /https:\/\/[^\s"'|]+/.exec(section(stdout, 'SERVE'));
  return found ? found[0].replace(/\/+$/, '') : '';
}

/** Whether the published address is the bridge's own port. */
function servedBridge(stdout) {
  const serve = section(stdout, 'SERVE');
  return Boolean(servedUrl(stdout)) && serve.includes(`:${BRIDGE_PORT}`);
}

/** Whether the bridge answers on the host itself. */
function bridgeAnswers(stdout) {
  const health = section(stdout, 'HEALTH');
  if (!health) return false;
  try {
    return Boolean(JSON.parse(health)?.service);
  } catch {
    return false;
  }
}

/** The link the phone scans: both halves of a pairing, in one string. */
function pairingLink(url, code) {
  return `${SCHEME}://pair?url=${encodeURIComponent(url)}&code=${encodeURIComponent(code)}`;
}

/**
 * Everything the phone will need, read out of the one answer.
 *
 * `label` is the machine as the person named it — "This Mac", or the SSH
 * host — because "it did not work" is worth less than "here is where".
 */
function describePairing(stdout, label) {
  const code = pairingCode(stdout);
  if (!code) return { ok: false, ...pairingFailure(stdout, label) };

  const served = servedUrl(stdout);
  const dns = tailnetName(stdout);
  const url = (servedBridge(stdout) ? served : '') || (dns ? `https://${dns}` : '');
  if (!url) {
    return {
      ok: false,
      code,
      error: `${label} is not on a tailnet the phone can reach.`,
      hint: 'Install Tailscale on the host and publish the bridge: sudo tailscale serve --bg --https=443 http://127.0.0.1:8765',
    };
  }

  return {
    ok: true,
    code,
    url,
    link: pairingLink(url, code),
    published: servedBridge(stdout),
    bridge: bridgeAnswers(stdout),
    expiresIn: PAIRING_TTL_SECONDS,
  };
}

module.exports = {
  SCHEME,
  BRIDGE_PORT,
  PAIRING_TTL_SECONDS,
  SECTIONS,
  pairingScript,
  section,
  pairingCode,
  pairingFailure,
  tailnetName,
  servedUrl,
  servedBridge,
  bridgeAnswers,
  pairingLink,
  describePairing,
};
