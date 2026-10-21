import { useEffect, useMemo, useRef, useState } from 'react';
import type { HermesModel } from '../hermes';
import {
  defaultModelPick,
  isFavorite,
  isHidden,
  modelId,
  useModelPrefs,
} from '../modelPrefs';
import { StarIcon } from './Icons';

type ModelPickerProps = {
  /** Profile whose inventory to offer; the primary profile when absent. */
  profile?: string;
  /** Picked model, absent for the bot's own default. */
  value?: string;
  provider?: string;
  /** What the chip shows when a model is picked. */
  label?: string;
  /**
   * The model a message would actually use when nothing is picked here —
   * the thread's pick, this bot's remembered model, then the settings default.
   * The gatekeeper resolves it, so the chip cannot drift from the send path.
   */
  fallbackLabel?: string;
  disabled?: boolean;
  /** Only a live tunnel can list models; without one the chip stays generic. */
  connected?: boolean;
  onChange: (pick: {
    model?: string;
    provider?: string;
    label?: string;
  }) => void;
};

type Pick = { model?: string; provider?: string; label?: string };

export function ModelPicker({
  profile,
  value,
  provider,
  label,
  fallbackLabel,
  disabled,
  connected = true,
  onChange,
}: ModelPickerProps) {
  const bridge = window.hermes;
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<HermesModel[] | null>(null);
  const [defaultModel, setDefaultModel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needle, setNeedle] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const { prefs } = useModelPrefs();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || models) return;
    if (!bridge?.models) {
      setError('Model selection needs the desktop app.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    bridge
      .models({ profile })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? 'Could not list the models');
          return;
        }
        setModels(result.models ?? []);
        setDefaultModel(result.current ?? '');
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, models, bridge, profile]);

  // The chip names the model the bot runs on, so the inventory is fetched as
  // soon as the composer appears — not only when the menu opens. A failure here
  // stays quiet: the menu reports it properly when the person asks for it.
  useEffect(() => {
    if (!connected || models || !bridge?.models) return;
    let cancelled = false;
    bridge
      .models({ profile })
      .then((result) => {
        if (cancelled || !result.ok) return;
        setModels(result.models ?? []);
        setDefaultModel(result.current ?? '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connected, models, bridge, profile]);

  // Settings curate the inventory: hidden models never reach the menu, and
  // favourites float above the provider groups instead of being repeated there.
  const needleLower = needle.trim().toLowerCase();
  const visible = useMemo(
    () =>
      (models ?? []).filter(
        (entry) =>
          !isHidden(prefs, modelId(entry)) &&
          (!needleLower || entry.model.toLowerCase().includes(needleLower)),
      ),
    [models, needleLower, prefs],
  );

  const favoriteEntries = useMemo(
    () => visible.filter((entry) => isFavorite(prefs, modelId(entry))),
    [visible, prefs],
  );

  const groups = useMemo(() => {
    const byProvider = new Map<string, HermesModel[]>();
    for (const model of visible) {
      if (isFavorite(prefs, modelId(model))) continue;
      const key = model.providerName || model.provider;
      const list = byProvider.get(key) ?? [];
      list.push(model);
      byProvider.set(key, list);
    }
    return [...byProvider.entries()];
  }, [visible, prefs]);

  function pick(next: Pick) {
    onChange(next);
    setOpen(false);
    setNeedle('');
  }

  // Just the name of whatever a send would use: this bot's remembered model,
  // the settings' default, then the profile's configured model — so the chip
  // never has to explain itself with a placeholder.
  const preferred = defaultModelPick(profile, prefs);
  const pinnedName = fallbackLabel ?? preferred?.model ?? defaultModel;
  const chipLabel = value ? (label ?? value) : pinnedName || 'Model';

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        className={`model-chip ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={
          value
            ? `${value}${provider ? ` · ${provider}` : ''}`
            : pinnedName
              ? `${pinnedName} · the model used when none is picked`
              : 'The model this bot is configured with'
        }
        onClick={() => setOpen((current) => !current)}
      >
        <span className="model-chip-name">{chipLabel}</span>
      </button>

      {open ? (
        <div className="model-menu" role="listbox" aria-label="Model">
          <div className="model-menu-head">
            <input
              className="model-search"
              type="text"
              value={needle}
              placeholder="Search models"
              spellCheck={false}
              autoFocus
              onChange={(event) => setNeedle(event.target.value)}
            />
          </div>

          {loading ? <p className="model-note">Loading models…</p> : null}
          {error ? <p className="model-error">{error}</p> : null}

          {!loading && !error ? (
            <div className="model-list">
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={`model-option ${!value ? 'is-active' : ''}`}
                onClick={() => pick({})}
              >
                <span className="model-name">
                  {pinnedName || 'Configured model'}
                </span>
                <span className="model-provider">default</span>
              </button>

              {favoriteEntries.length ? (
                <div className="model-group">
                  <span className="model-group-name">Favorites</span>
                  {favoriteEntries.map((entry) => {
                    const active =
                      entry.model === value && entry.provider === provider;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        key={`${entry.provider}:${entry.model}`}
                        className={`model-option ${active ? 'is-active' : ''}`}
                        title={entry.model}
                        onClick={() =>
                          pick({
                            model: entry.model,
                            provider: entry.provider,
                            label: entry.model,
                          })
                        }
                      >
                        <span className="model-name">{entry.model}</span>
                        <StarIcon filled className="model-star" />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {groups.map(([providerName, entries]) => (
                <div className="model-group" key={providerName}>
                  <span className="model-group-name">{providerName}</span>
                  {entries.map((entry) => {
                    const active =
                      entry.model === value && entry.provider === provider;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        key={`${entry.provider}:${entry.model}`}
                        className={`model-option ${active ? 'is-active' : ''}`}
                        title={entry.model}
                        onClick={() =>
                          pick({
                            model: entry.model,
                            provider: entry.provider,
                            label: entry.model,
                          })
                        }
                      >
                        <span className="model-name">{entry.model}</span>
                        {entry.current ? (
                          <span className="model-tag">current</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}

              {groups.length === 0 && favoriteEntries.length === 0 ? (
                <p className="model-note">
                  No authenticated provider offers a model yet.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
