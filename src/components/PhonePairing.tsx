import { useState } from 'react';
import type { HermesPairing } from '../hermes';

/**
 * The phone's door, opened from here.
 *
 * The desktop is the only side that holds a way to the host, so it is the one
 * that mints the bridge's code there. What it shows is a single picture: the
 * tailnet address and the code, together, for the phone to scan. Nothing is
 * kept — a code works once, and the picture is worth twenty minutes.
 */
export function PhonePairing() {
  const bridge = window.hermes;
  const [pairing, setPairing] = useState<HermesPairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function mint() {
    if (!bridge?.pairingCode || busy) return;
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      setPairing(await bridge.pairingCode());
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : 'The host did not answer.',
      );
      setPairing(null);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!pairing?.link || !bridge?.copyText) return;
    await bridge.copyText(pairing.link);
    setCopied(true);
  }

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <div>
          <h2>Phone</h2>
          <p>
            The same bots and conversations, from the Hermes Bot app on your
            phone. The phone never holds a Hermes key: it opens the bridge, and
            the bridge reads the keys here, on the host.
          </p>
        </div>
      </header>

      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h3>Pair a phone</h3>
            <p>
              The code is minted on the host, where the bridge runs. It works
              once, and for twenty minutes.
            </p>
          </div>
          {pairing?.ok && pairing.expiresIn ? (
            <span className="settings-card-meta">
              {Math.round(pairing.expiresIn / 60)} minutes
            </span>
          ) : null}
        </header>

        {error ? <p className="settings-notice">{error}</p> : null}

        {!pairing || !pairing.ok ? (
          <div className="settings-form">
            {pairing?.error ? (
              <p className="settings-notice">{pairing.error}</p>
            ) : null}
            {pairing?.hint ? (
              <p className="settings-field-note">{pairing.hint}</p>
            ) : null}
            <p className="settings-field-note">
              On the phone: Tailscale on, the Hermes Bot app open, then
              Settings → Connection → Scan the code.
            </p>
            <div className="settings-field-actions">
              <button
                type="button"
                className="settings-text-button"
                disabled={busy || !bridge?.pairingCode}
                onClick={() => void mint()}
              >
                {busy
                  ? 'Minting…'
                  : pairing?.error
                    ? 'Try again'
                    : 'Mint a code'}
              </button>
            </div>
          </div>
        ) : (
          <div className="phone-pairing">
            <div className="phone-pairing-qr">
              {pairing.qr ? (
                <img
                  src={pairing.qr}
                  alt={`Pairing code ${pairing.code ?? ''}`}
                  width={220}
                  height={220}
                />
              ) : (
                <span className="phone-pairing-code">{pairing.code}</span>
              )}
            </div>

            <div className="phone-pairing-copy">
              <p className="phone-pairing-lead">
                Scan this from the phone: Settings → Connection → Scan the
                code.
              </p>
              <p className="phone-pairing-code">{pairing.code}</p>
              <p className="settings-field-note">{pairing.url}</p>
              <p className="settings-field-note">
                Minted on {pairing.label ?? 'the host'}. The code works once,
                and can be revoked from the phone's Connection page afterwards.
              </p>

              {pairing.published === false ? (
                <p className="settings-notice">
                  Tailscale is not publishing the bridge yet. On{' '}
                  {pairing.label ?? 'the host'}:{' '}
                  <code>
                    sudo tailscale serve --bg --https=443
                    http://127.0.0.1:8765
                  </code>
                </p>
              ) : null}

              {pairing.bridge === false ? (
                <p className="settings-notice">
                  The bridge is not answering on{' '}
                  {pairing.label ?? 'the host'}. Start it, then mint a code
                  again.
                </p>
              ) : null}

              <div className="settings-field-actions">
                <button
                  type="button"
                  className="settings-text-button"
                  onClick={() => void copyLink()}
                >
                  {copied ? 'Copied' : 'Copy the link'}
                </button>
                <button
                  type="button"
                  className="settings-text-button is-muted"
                  disabled={busy}
                  onClick={() => void mint()}
                >
                  {busy ? 'Minting…' : 'Another code'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
