import { useEffect, useState } from 'react';

// Model preferences are a Sidekick concern, not a Hermes one: the gateway
// keeps listing every authenticated model, while the person curates what the
// picker offers. They live in localStorage so they survive a reconnect.

export type ModelRef = { provider: string; model: string };

export type ModelPrefs = {
  /** Ids of models the picker must not offer. */
  hidden: string[];
  /** Ids pinned to the top of the picker. */
  favorites: string[];
  /** Model used when a conversation has no pick of its own. */
  default?: ModelRef;
};

const STORAGE_KEY = 'sidekick.models.prefs';
const CHANGE_EVENT = 'sidekick:models-changed';

const EMPTY: ModelPrefs = { hidden: [], favorites: [] };

/** One identity for a model across providers: `provider:model`. */
export function modelId(ref: { provider: string; model: string }): string {
  return `${ref.provider}:${ref.model}`;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalize(raw: unknown): ModelPrefs {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const record = raw as Record<string, unknown>;
  const storedDefault = record.default as Partial<ModelRef> | undefined;
  const fallback: ModelRef | undefined =
    storedDefault &&
    typeof storedDefault.model === 'string' &&
    storedDefault.model
      ? {
          model: storedDefault.model,
          provider:
            typeof storedDefault.provider === 'string'
              ? storedDefault.provider
              : '',
        }
      : undefined;
  return {
    hidden: strings(record.hidden),
    favorites: strings(record.favorites),
    default: fallback,
  };
}

export function readModelPrefs(): ModelPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function publish(next: ModelPrefs): ModelPrefs {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage must not break the settings pane.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

export function setModelVisible(id: string, visible: boolean): ModelPrefs {
  const prefs = readModelPrefs();
  const hidden = visible
    ? prefs.hidden.filter((entry) => entry !== id)
    : prefs.hidden.includes(id)
      ? prefs.hidden
      : [...prefs.hidden, id];
  // Hiding means "stop offering this one": a pinned mark or the default would
  // otherwise point at a model the composer no longer lists.
  const favorites = visible
    ? prefs.favorites
    : prefs.favorites.filter((entry) => entry !== id);
  const defaultModel =
    !visible && prefs.default && modelId(prefs.default) === id
      ? undefined
      : prefs.default;
  return publish({ ...prefs, hidden, favorites, default: defaultModel });
}

export function toggleModelFavorite(id: string): ModelPrefs {
  const prefs = readModelPrefs();
  const favorites = prefs.favorites.includes(id)
    ? prefs.favorites.filter((entry) => entry !== id)
    : [...prefs.favorites, id];
  return publish({ ...prefs, favorites });
}

export function setDefaultModel(ref: ModelRef | null): ModelPrefs {
  const prefs = readModelPrefs();
  return publish({ ...prefs, default: ref ?? undefined });
}

export function isHidden(prefs: ModelPrefs, id: string): boolean {
  return prefs.hidden.includes(id);
}

export function isFavorite(prefs: ModelPrefs, id: string): boolean {
  return prefs.favorites.includes(id);
}

export function isDefault(prefs: ModelPrefs, ref: ModelRef): boolean {
  return Boolean(
    prefs.default &&
      prefs.default.model === ref.model &&
      prefs.default.provider === ref.provider,
  );
}

/** The default as the composer wants it: a full pick, label included. */
export function defaultModelPick(
  prefs: ModelPrefs = readModelPrefs(),
): { model: string; provider: string; label: string } | null {
  if (!prefs.default) return null;
  return {
    model: prefs.default.model,
    provider: prefs.default.provider,
    label: prefs.default.model,
  };
}

/** Re-reads on every change so the picker and the settings pane agree. */
export function useModelPrefs(): ModelPrefs {
  const [prefs, setPrefs] = useState<ModelPrefs>(readModelPrefs);

  useEffect(() => {
    const sync = () => setPrefs(readModelPrefs());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return prefs;
}
