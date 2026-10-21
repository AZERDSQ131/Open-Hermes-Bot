import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// The model preferences are the person's own: the models the picker offers,
// the ones that are pinned, the model each bot falls back to. They live with
// the bot that is always there — the primary profile — so they follow the
// person from one machine to another, and nothing about them is written on
// this one.

export type ModelRef = { provider: string; model: string };

export type ModelPrefs = {
  /** Ids of models the picker must not offer. */
  hidden: string[];
  /** Ids pinned to the top of the picker. */
  favorites: string[];
  /** Model each bot falls back to, keyed by profile name. */
  defaults: Record<string, ModelRef>;
  /** The model each bot last ran on, keyed by profile name. */
  picks: Record<string, ModelRef>;
};

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

export function emptyPrefs(): ModelPrefs {
  return { hidden: [], favorites: [], defaults: {}, picks: {} };
}

/** Reads preferences that came from the server, and leaves out what is not. */
export function normalize(raw: unknown): ModelPrefs {
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
  const picks: Record<string, ModelRef> = {};
  if (record.picks && typeof record.picks === 'object') {
    for (const [key, value] of Object.entries(
      record.picks as Record<string, unknown>,
    )) {
      const ref = asRef(value);
      if (ref) picks[profileKey(key)] = ref;
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
    picks,
  };
}

/** Hides a model from the picker, or shows it again. */
export function withVisibility(
  prefs: ModelPrefs,
  id: string,
  visible: boolean,
): ModelPrefs {
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
  return { ...prefs, hidden, favorites, defaults };
}

/** Shows every model the picker hid. */
export function withAllVisible(prefs: ModelPrefs): ModelPrefs {
  return { ...prefs, hidden: [] };
}

/** Pins a model to the top of the picker, or unpins it. */
export function withFavorite(prefs: ModelPrefs, id: string): ModelPrefs {
  const favorites = prefs.favorites.includes(id)
    ? prefs.favorites.filter((entry) => entry !== id)
    : [...prefs.favorites, id];
  return { ...prefs, favorites };
}

/** Sets (or clears, with null) the model one bot falls back to. */
export function withDefault(
  prefs: ModelPrefs,
  profile: string | undefined,
  ref: ModelRef | null,
): ModelPrefs {
  const defaults = { ...prefs.defaults };
  if (ref) defaults[profileKey(profile)] = ref;
  else delete defaults[profileKey(profile)];
  return { ...prefs, defaults };
}

/** Remembers the model a bot last ran on, so the next conversation starts there. */
export function withPick(
  prefs: ModelPrefs,
  profile: string | undefined,
  ref: ModelRef,
): ModelPrefs {
  return {
    ...prefs,
    picks: { ...prefs.picks, [profileKey(profile)]: ref },
  };
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
  prefs?: ModelPrefs,
): { model: string; provider: string; label: string } | null {
  const ref = defaultModelFor(prefs ?? emptyPrefs(), profile);
  if (!ref) return null;
  return { model: ref.model, provider: ref.provider, label: ref.model };
}

/** The model a bot last ran on, the way the composer wants it. */
export function pickFor(
  prefs: ModelPrefs,
  profile?: string,
): { model: string; provider: string; label: string } | null {
  const ref = prefs.picks[profileKey(profile)];
  if (!ref) return null;
  return { model: ref.model, provider: ref.provider, label: ref.model };
}

type PrefsContextValue = {
  prefs: ModelPrefs;
  /** Applies a change and keeps it on the server. */
  update: (next: ModelPrefs) => void;
  /** True while the preferences are still coming from the server. */
  loading: boolean;
};

const ModelPrefsContext = createContext<PrefsContextValue>({
  prefs: emptyPrefs(),
  update: () => undefined,
  loading: true,
});

/**
 * The preferences, read from the server and kept there. The app writes nothing
 * on this machine: the models a person chose follow them, and a reinstall
 * changes nothing.
 */
export function ModelPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ModelPrefs>(emptyPrefs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.hermes;
    if (!bridge?.prefs) {
      setLoading(false);
      return;
    }
    bridge
      .prefs()
      .then((result) => {
        if (cancelled) return;
        if (result?.ok && result.prefs) setPrefs(normalize(result.prefs));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((next: ModelPrefs) => {
    setPrefs(next);
    // The server keeps the truth; a write that fails is a write that is
    // repeated the next time the person changes something.
    window.hermes?.savePrefs?.({ prefs: next }).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ prefs, update, loading }),
    [prefs, update, loading],
  );

  return (
    <ModelPrefsContext.Provider value={value}>
      {children}
    </ModelPrefsContext.Provider>
  );
}

/** The preferences, and the way to change them. */
export function useModelPrefs(): PrefsContextValue {
  return useContext(ModelPrefsContext);
}
