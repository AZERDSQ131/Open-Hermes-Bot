import { useEffect, useState } from 'react';
import type { HermesSkill } from '../hermes';

/**
 * The skills: what a bot can be taught to do.
 *
 * They live on the host, where they are written: the app reads the list and
 * turns one on or off there. It keeps nothing of its own.
 */
export function SkillsSettings() {
  const bridge = window.hermes;
  const [skills, setSkills] = useState<HermesSkill[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // The list is read once, when the page opens: it is the host's, not ours.
  useEffect(() => {
    const reader = bridge?.skills;
    if (!reader) return;
    let cancelled = false;
    reader()
      .then((next: { ok: boolean; skills?: HermesSkill[]; error?: string }) => {
        if (cancelled) return;
        setSkills(next?.skills ?? []);
        setError(next?.error ?? '');
      })
      .catch((reason: Error) => {
        if (cancelled) return;
        setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  /** A skill is turned on or off on the host, where the skill lives. */
  async function toggle(skill: HermesSkill) {
    if (!bridge?.toggleSkill) return;
    const enabled = !skill.enabled;
    setBusy(skill.name);
    setError('');
    // The row moves at once: the host is the one that decides, and it says
    // so a moment later.
    setSkills((current) =>
      (current ?? []).map((entry) =>
        entry.name === skill.name ? { ...entry, enabled } : entry,
      ),
    );
    try {
      const result = await bridge.toggleSkill({
        name: skill.name,
        enabled,
      });
      if (!result.ok) {
        setError(result.error ?? 'The skill could not be turned on or off.');
        setSkills((current) =>
          (current ?? []).map((entry) =>
            entry.name === skill.name ? { ...entry, enabled: !enabled } : entry,
          ),
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The skill could not be turned on or off.',
      );
      setSkills((current) =>
        (current ?? []).map((entry) =>
          entry.name === skill.name ? { ...entry, enabled: !enabled } : entry,
        ),
      );
    } finally {
      setBusy('');
    }
  }

  const on = (skills ?? []).filter((skill) => skill.enabled).length;

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <div>
          <h2>Skills</h2>
          <p>
            What your bots know how to do. They live on the host, and they are
            turned on and off there.
          </p>
        </div>
        <div className="settings-page-side">
          <span className="settings-card-meta">
            {skills ? `${on} of ${skills.length} on` : 'Reading the host…'}
          </span>
        </div>
      </header>

      {error ? <p className="models-error">{error}</p> : null}

      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h3>The skills</h3>
            <p>A skill that is off is not offered to the bots.</p>
          </div>
        </header>
        <div className="capability-list">
          {(skills ?? []).map((skill) => (
            <div className="capability-row" key={skill.name}>
              <span className="capability-copy">
                <span className="capability-name">{skill.name}</span>
                {skill.description ? (
                  <span className="capability-description">
                    {skill.description}
                  </span>
                ) : null}
              </span>
              {skill.provenance ? (
                <span className="capability-tag">{skill.provenance}</span>
              ) : null}
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(skill.enabled)}
                aria-label={skill.name}
                className={`settings-switch ${skill.enabled ? 'is-on' : ''}`}
                disabled={busy === skill.name}
                onClick={() => void toggle(skill)}
              >
                <span className="settings-switch-knob" />
              </button>
            </div>
          ))}
          {skills && skills.length === 0 ? (
            <p className="settings-hint">
              The host holds no skill yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
