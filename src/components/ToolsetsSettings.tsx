import { useEffect, useState } from 'react';
import type { HermesToolset } from '../hermes';

/**
 * The tools: what a bot can use besides Hermes itself.
 *
 * They live on the host, where they are configured: the app reads the list
 * and turns one on or off there. It keeps nothing of its own.
 */
export function ToolsetsSettings() {
  const bridge = window.hermes;
  const [toolsets, setToolsets] = useState<HermesToolset[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // The list is read once, when the page opens: it is the host's, not ours.
  useEffect(() => {
    const reader = bridge?.toolsets;
    if (!reader) return;
    let cancelled = false;
    reader()
      .then(
        (next: { ok: boolean; toolsets?: HermesToolset[]; error?: string }) => {
          if (cancelled) return;
          setToolsets(next?.toolsets ?? []);
          setError(next?.error ?? '');
        },
      )
      .catch((reason: Error) => {
        if (cancelled) return;
        setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  /** A tool is turned on or off on the host, where the tools live. */
  async function toggle(toolset: HermesToolset) {
    if (!bridge?.toggleToolset) return;
    const enabled = !toolset.enabled;
    setBusy(toolset.name);
    setError('');
    setToolsets((current) =>
      (current ?? []).map((entry) =>
        entry.name === toolset.name ? { ...entry, enabled } : entry,
      ),
    );
    try {
      const result = await bridge.toggleToolset({
        name: toolset.name,
        enabled,
      });
      if (!result.ok) {
        setError(result.error ?? 'The tool could not be turned on or off.');
        setToolsets((current) =>
          (current ?? []).map((entry) =>
            entry.name === toolset.name ? { ...entry, enabled: !enabled } : entry,
          ),
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The tool could not be turned on or off.',
      );
      setToolsets((current) =>
        (current ?? []).map((entry) =>
          entry.name === toolset.name ? { ...entry, enabled: !enabled } : entry,
        ),
      );
    } finally {
      setBusy('');
    }
  }

  const on = (toolsets ?? []).filter((toolset) => toolset.enabled).length;

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <div>
          <h2>Tools</h2>
          <p>
            What your bots can use besides Hermes. They live on the host, and
            they are turned on and off there.
          </p>
        </div>
        <div className="settings-page-side">
          <span className="settings-card-meta">
            {toolsets
              ? `${on} of ${toolsets.length} on`
              : 'Reading the host…'}
          </span>
        </div>
      </header>

      {error ? <p className="models-error">{error}</p> : null}

      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h3>The tools</h3>
            <p>A tool that is off is not offered to the bots.</p>
          </div>
        </header>
        <div className="capability-list">
          {(toolsets ?? []).map((toolset) => (
            <div className="capability-row" key={toolset.name}>
              <span className="capability-copy">
                <span className="capability-name">
                  {toolset.label || toolset.name}
                </span>
                {toolset.description ? (
                  <span className="capability-description">
                    {toolset.description}
                  </span>
                ) : null}
              </span>
              {toolset.configured === false ? (
                <span className="capability-tag">Needs a key</span>
              ) : null}
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(toolset.enabled)}
                aria-label={toolset.label || toolset.name}
                className={`settings-switch ${toolset.enabled ? 'is-on' : ''}`}
                disabled={busy === toolset.name}
                onClick={() => void toggle(toolset)}
              >
                <span className="settings-switch-knob" />
              </button>
            </div>
          ))}
          {toolsets && toolsets.length === 0 ? (
            <p className="settings-hint">The host offers no tool yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
