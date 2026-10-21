import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  defaultModelFor,
  defaultModelPick,
  emptyPrefs,
  isDefaultFor,
  isFavorite,
  isHidden,
  modelId,
  ModelPrefsProvider,
  normalize,
  pickFor,
  profileKey,
  useModelPrefs,
  withAllVisible,
  withDefault,
  withFavorite,
  withPick,
  withVisibility,
  type ModelPrefs,
} from './modelPrefs';

describe('the identity of a model', () => {
  it('is its provider and its name', () => {
    expect(modelId({ provider: 'opencode-go', model: 'muse' })).toBe(
      'opencode-go:muse',
    );
  });
});

describe('the profile a bot is keyed by', () => {
  it('is its own name', () => {
    expect(profileKey('bob')).toBe('bob');
  });

  it('is the primary for the primary', () => {
    expect(profileKey(undefined)).toBe('default');
    expect(profileKey('')).toBe('default');
    expect(profileKey('default')).toBe('default');
  });
});

describe('preferences that come from the server', () => {
  it('are empty when there are none', () => {
    expect(normalize(null)).toEqual(emptyPrefs());
    expect(normalize('nonsense')).toEqual(emptyPrefs());
  });

  it('keep the lists that are lists', () => {
    const prefs = normalize({
      hidden: ['a', 2, 'b'],
      favorites: ['c'],
    });
    expect(prefs.hidden).toEqual(['a', 'b']);
    expect(prefs.favorites).toEqual(['c']);
  });

  it('keep the models that are models', () => {
    const prefs = normalize({
      defaults: { bob: { model: 'm', provider: 'p' }, bad: { provider: 'p' } },
      picks: { bob: { model: 'm2', provider: 'p2' } },
    });
    expect(prefs.defaults.bob).toEqual({ model: 'm', provider: 'p' });
    expect(prefs.defaults.bad).toBeUndefined();
    expect(prefs.picks.bob).toEqual({ model: 'm2', provider: 'p2' });
  });

  it('take the first version of the default for the primary', () => {
    const prefs = normalize({ default: { model: 'm', provider: 'p' } });
    expect(prefs.defaults.default).toEqual({ model: 'm', provider: 'p' });
  });
});

describe('hiding a model', () => {
  const prefs: ModelPrefs = {
    hidden: [],
    favorites: ['p:a'],
    defaults: { bob: { model: 'a', provider: 'p' } },
    picks: {},
  };

  it('takes it out of the picker', () => {
    expect(isHidden(withVisibility(prefs, 'p:a', false), 'p:a')).toBe(true);
  });

  it('puts it back', () => {
    const hidden = withVisibility(prefs, 'p:a', false);
    expect(isHidden(withVisibility(hidden, 'p:a', true), 'p:a')).toBe(false);
  });

  it('does not hide it twice', () => {
    const hidden = withVisibility(prefs, 'p:a', false);
    expect(withVisibility(hidden, 'p:a', false).hidden).toEqual(['p:a']);
  });

  it('takes the pin and the default with it', () => {
    const hidden = withVisibility(prefs, 'p:a', false);
    expect(hidden.favorites).toEqual([]);
    expect(hidden.defaults.bob).toBeUndefined();
  });

  it('leaves the other models alone', () => {
    const hidden = withVisibility(prefs, 'p:b', false);
    expect(hidden.favorites).toEqual(['p:a']);
    expect(hidden.defaults.bob).toEqual({ model: 'a', provider: 'p' });
  });
});

describe('showing every model again', () => {
  it('empties the list of the hidden ones', () => {
    const hidden = withVisibility(emptyPrefs(), 'p:a', false);
    expect(withAllVisible(hidden).hidden).toEqual([]);
  });
});

describe('pinning a model', () => {
  it('pins it', () => {
    expect(isFavorite(withFavorite(emptyPrefs(), 'p:a'), 'p:a')).toBe(true);
  });

  it('unpins it', () => {
    const pinned = withFavorite(emptyPrefs(), 'p:a');
    expect(isFavorite(withFavorite(pinned, 'p:a'), 'p:a')).toBe(false);
  });
});

describe('the model a bot falls back to', () => {
  it('is the one the person gave it', () => {
    const prefs = withDefault(emptyPrefs(), 'bob', { model: 'm', provider: 'p' });
    expect(defaultModelFor(prefs, 'bob')).toEqual({ model: 'm', provider: 'p' });
    expect(isDefaultFor(prefs, 'bob', { model: 'm', provider: 'p' })).toBe(true);
    expect(isDefaultFor(prefs, 'bob', { model: 'other', provider: 'p' })).toBe(false);
  });

  it('is gone when the person takes it back', () => {
    const prefs = withDefault(emptyPrefs(), 'bob', { model: 'm', provider: 'p' });
    expect(defaultModelFor(withDefault(prefs, 'bob', null), 'bob')).toBeUndefined();
  });

  it('is the way the composer wants it', () => {
    const prefs = withDefault(emptyPrefs(), 'bob', { model: 'm', provider: 'p' });
    expect(defaultModelPick('bob', prefs)).toEqual({
      model: 'm',
      provider: 'p',
      label: 'm',
    });
    expect(defaultModelPick('bob', emptyPrefs())).toBeNull();
    expect(defaultModelPick('bob')).toBeNull();
  });
});

describe('the model a bot last ran on', () => {
  it('is remembered', () => {
    const prefs = withPick(emptyPrefs(), 'bob', { model: 'm', provider: 'p' });
    expect(pickFor(prefs, 'bob')).toEqual({
      model: 'm',
      provider: 'p',
      label: 'm',
    });
  });

  it('is nothing when the bot never ran', () => {
    expect(pickFor(emptyPrefs(), 'bob')).toBeNull();
  });
});

function PrefsProbe() {
  const { prefs, update, loading } = useModelPrefs();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="favorites">{prefs.favorites.join(',')}</span>
      <button onClick={() => update(withFavorite(prefs, 'p:a'))}>pin</button>
    </div>
  );
}

describe('the preferences, read from the server', () => {
  it('arrive, and a change goes back', async () => {
    const savePrefs = vi.fn(async () => ({ ok: true }));
    (window as unknown as { hermes: unknown }).hermes = {
      prefs: vi.fn(async () => ({
        ok: true,
        prefs: { favorites: ['p:z'] },
      })),
      savePrefs,
    };
    render(
      <ModelPrefsProvider>
        <PrefsProbe />
      </ModelPrefsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('favorites')).toHaveTextContent('p:z'),
    );
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    await userEvent.click(screen.getByText('pin'));
    await waitFor(() => expect(savePrefs).toHaveBeenCalled());
    expect(savePrefs).toHaveBeenCalledWith({
      prefs: expect.objectContaining({ favorites: ['p:z', 'p:a'] }),
    });
  });

  it('wait for the server before they are used', async () => {
    (window as unknown as { hermes: unknown }).hermes = {
      prefs: vi.fn(async () => ({ ok: true, prefs: {} })),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    render(
      <ModelPrefsProvider>
        <PrefsProbe />
      </ModelPrefsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false'),
    );
  });

  it('do not wait forever when the server is silent', async () => {
    (window as unknown as { hermes: unknown }).hermes = {
      prefs: vi.fn(async () => {
        throw new Error('no answer');
      }),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    render(
      <ModelPrefsProvider>
        <PrefsProbe />
      </ModelPrefsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false'),
    );
  });

  it('are forgotten when the app closes before the server answers', async () => {
    let answer: (value: unknown) => void = () => undefined;
    (window as unknown as { hermes: unknown }).hermes = {
      prefs: vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
      savePrefs: vi.fn(async () => ({ ok: true })),
    };
    const view = render(
      <ModelPrefsProvider>
        <PrefsProbe />
      </ModelPrefsProvider>,
    );
    view.unmount();
    answer({ ok: true, prefs: { favorites: ['p:z'] } });
    expect(screen.queryByTestId('favorites')).toBeNull();
  });

  it('are empty when the bridge is not there', async () => {
    render(
      <ModelPrefsProvider>
        <PrefsProbe />
      </ModelPrefsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false'),
    );
    expect(screen.getByTestId('favorites')).toHaveTextContent('');
  });
});
