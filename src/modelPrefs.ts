import { useEffect, useState } from 'react';

// Model preferences are a Grok Bot concern, not a Hermes one: the gateway
// keeps listing every authenticated model, while the person curates what the
// picker offers. They live in localStorage so they survive a reconnect.

export type ModelRef = { provider: string; model: string };

export type ModelPrefs = {
  /** Ids of models the picker must not offer. */
  hidden: string[];
  /** Ids pinned to the top of the picker. */
  favorites: string[];
  /** Model each bot falls back to, keyed by profile name. */
  defaults: Record<string, ModelRef>;
};

const STORAGE_KEY = 'grokbot.models.prefs';
const CHANGE_EVENT = 'grokbot:models-changed';
// The app was called Sidekick before: the preferences written under that name
// are read once and carried over, so the rename costs the person nothing.
const LEGACY_STORAGE_KEY = 'sidekick.models.prefs';

function emptyPrefs(): ModelPrefs {
  return { hidden: [], favorites: [], defaults: {} };
}

/** One identity for a model across providers: `provider:model`. */
export function modelId(ref: { provider: string; model: string }): string {
  return `${ref.provider}:${ref.model}`;
}

/** The profile key a bot uses: the primary profile is keyed `default`. */
export function profileKey(profile?: string): string {
  const name = (profile ?? '').trim();
  return !name || name === 'default' ? 'default' : name;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asRef(value: unknown): ModelRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Partial<ModelRef>;
  if (typeof record.model !== 'string' || !record.model) return undefined;
  return {
    model: record.model,
    provider: typeof record.provider === 'string' ? record.provider : '',
  };
}

function normalize(raw: unknown): ModelPrefs {
  if (!raw || typeof raw !== 'object') return emptyPrefs();
  const record = raw as Record<string, unknown>;
  const defaults: Record<string, ModelRef> = {};
  if (record.defaults && typeof record.defaults === 'object') {
    for (const [key, value] of Object.entries(
      record.defaults as Record<string, unknown>,
    )) {
      const ref = asRef(value);
      if (ref) defaults[profileKey(key)] = ref;
    }
  }
  // The first version stored one global default; it belongs to the primary
  // profile, so nobody loses the model they had already chosen.
  const legacy = asRef(record.default);
  if (legacy && !defaults.default) defaults.default = legacy;
  return {
    hidden: strings(record.hidden),
    favorites: strings(record.favorites),
    defaults,
  };
}

export function readModelPrefs(): ModelPrefs {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyPrefs();
  } catch {
    return emptyPrefs();
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
  // Hiding means "stop offering this one": a pinned mark or a bot default would
  // otherwise point at a model the composer no longer lists.
  const favorites = visible
    ? prefs.favorites
    : prefs.favorites.filter((entry) => entry !== id);
  const defaults: Record<string, ModelRef> = {};
  for (const [profile, ref] of Object.entries(prefs.defaults)) {
    if (!visible && modelId(ref) === id) continue;
    defaults[profile] = ref;
  }
  return publish({ ...prefs, hidden, favorites, defaults });
}

export function toggleModelFavorite(id: string): ModelPrefs {
  const prefs = readModelPrefs();
  const favorites = prefs.favorites.includes(id)
    ? prefs.favorites.filter((entry) => entry !== id)
    : [...prefs.favorites, id];
  return publish({ ...prefs, favorites });
}

/** Sets (or clears, with null) the model one bot falls back to. */
export function setDefaultModel(
  profile: string | undefined,
  ref: ModelRef | null,
): ModelPrefs {
  const prefs = readModelPrefs();
  const defaults = { ...prefs.defaults };
  if (ref) defaults[profileKey(profile)] = ref;
  else delete defaults[profileKey(profile)];
  return publish({ ...prefs, defaults });
}

export function isHidden(prefs: ModelPrefs, id: string): boolean {
  return prefs.hidden.includes(id);
}

export function isFavorite(prefs: ModelPrefs, id: string): boolean {
  return prefs.favorites.includes(id);
}

export function isDefaultFor(
  prefs: ModelPrefs,
  profile: string | undefined,
  ref: ModelRef,
): boolean {
  const current = prefs.defaults[profileKey(profile)];
  return Boolean(
    current && current.model === ref.model && current.provider === ref.provider,
  );
}

/** The model a bot falls back to, if the person gave it one. */
export function defaultModelFor(
  prefs: ModelPrefs,
  profile?: string,
): ModelRef | undefined {
  return prefs.defaults[profileKey(profile)];
}

/** The default as the composer wants it: a full pick, label included. */
export function defaultModelPick(
  profile?: string,
  prefs: ModelPrefs = readModelPrefs(),
): { model: string; provider: string; label: string } | null {
  const ref = defaultModelFor(prefs, profile);
  if (!ref) return null;
  return { model: ref.model, provider: ref.provider, label: ref.model };
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
