import { useEffect, useState } from 'react';
import type { HermesProfile } from '../hermes';

type ProfilePickerProps = {
  /** The profile that is asked for: '' is the default bot of the host. */
  value: string;
  onChange: (profile: string) => void;
  /** What the row is about: "Whose skills?" */
  label: string;
};

/**
 * Which bot the page is about.
 *
 * The skills and the tools live with a bot, on the host: the default bot has
 * its own, and so has every other one.
 */
export function ProfilePicker({ value, onChange, label }: ProfilePickerProps) {
  const bridge = window.hermes;
  const [bots, setBots] = useState<HermesProfile[]>([]);
  const [defaultLabel, setDefaultLabel] = useState('Default bot');

  useEffect(() => {
    const reader = bridge?.profiles;
    if (!reader) return;
    let cancelled = false;
    reader()
      .then((answer: { profiles?: HermesProfile[]; primary?: HermesProfile }) => {
        if (cancelled) return;
        setBots(answer?.profiles ?? []);
        const primary = answer?.primary?.title?.trim();
        if (primary) setDefaultLabel(primary);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  return (
    <label className="capability-picker">
      <span className="settings-field-label">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{defaultLabel}</option>
        {bots.map((bot) => (
          <option key={bot.name} value={bot.name}>
            {bot.title?.trim() || bot.name}
          </option>
        ))}
      </select>
    </label>
  );
}
