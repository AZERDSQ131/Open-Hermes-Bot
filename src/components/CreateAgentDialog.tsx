import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { BotStyle, SingleAvatar } from '../data';
import { profileColor } from '../profileColor';
import type { BloubShape } from './bloubFrames';
import { AgentAvatar } from './AgentAvatar';
import { AnimatedBloub } from './AnimatedBloub';
import { BLOUB_COLOR_OPTIONS } from './Bloub';
import { ColorGrid, ShapeGrid } from './LogoControls';

export type CreateCandidate = {
  id: string;
  name: string;
  avatar: SingleAvatar;
};

export type CreateBotOutcome = { ok: true } | { ok: false; error: string };

export type CreateBotProgress = {
  /** Seconds since the server picked the job up. */
  elapsed: number;
  /** What the server is doing, in its own words. */
  step: string;
};

type CreateAgentDialogProps = {
  candidates: CreateCandidate[];
  onClose: () => void;
  onCreateBot: (
    input: {
      name: string;
      shape: BloubShape;
      color: string;
      /** Present only when the colour was picked by hand. */
      customColor?: string;
    },
    onProgress?: (progress: CreateBotProgress) => void,
  ) => Promise<CreateBotOutcome>;
  onCreateGroup: (input: { name: string; members: BotStyle[] }) => void;
};

export function toProfileId(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const DEFAULT_COLOR =
  BLOUB_COLOR_OPTIONS.find((color) => color.name === 'Indigo')?.hex ?? '#5b5bda';

export function CreateAgentDialog({
  candidates,
  onClose,
  onCreateBot,
  onCreateGroup,
}: CreateAgentDialogProps) {
  const [mode, setMode] = useState<'bot' | 'group'>('bot');
  const [name, setName] = useState('');
  const [shape, setShape] = useState<BloubShape>('cercle');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<CreateBotProgress | null>(null);
  // The colour starts out as the one Hermes derives from the name, and follows
  // the name until the user picks one — then it is theirs.
  const [colorTouched, setColorTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const selectedCandidates = candidates.filter((candidate) =>
    selected.includes(candidate.id),
  );
  const groupMembers: BotStyle[] = selectedCandidates.map((candidate) => ({
    color: candidate.avatar.color,
    shape: candidate.avatar.shape,
    variant: candidate.avatar.variant,
  }));
  const profileId = mode === 'bot' ? toProfileId(name) : '';
  const canCreate =
    name.trim().length > 0 && (mode === 'bot' || selected.length >= 2);

  const hermesColor = useMemo(
    () => profileColor(profileId) ?? DEFAULT_COLOR,
    [profileId],
  );

  useEffect(() => {
    if (!colorTouched) setColor(hermesColor);
  }, [hermesColor, colorTouched]);

  const preview =
    mode === 'group'
      ? selectedCandidates.length >= 2
        ? { kind: 'group' as const, members: groupMembers }
        : selectedCandidates[0]?.avatar ?? {
            color: '#3d3d44',
            shape: 'cercle' as const,
          }
      : { color, shape, variant: 'neutral' as const };

  function toggleCandidate(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canCreate || busy) return;
    if (mode !== 'bot') {
      onCreateGroup({ name: name.trim(), members: groupMembers });
      return;
    }
    setBusy(true);
    setError('');
    setProgress({ elapsed: 0, step: 'sending it to the server' });
    // However this ends — success, refusal, or a call that throws — the button
    // has to come back. A creation that fails silently is worse than one that
    // fails loudly.
    try {
      const outcome = await onCreateBot(
        { name: name.trim(), shape, color, customColor: colorTouched ? color : undefined },
        setProgress,
      );
      if (!outcome.ok) {
        setError(outcome.error);
        setProgress(null);
      }
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message
          ? reason.message
          : 'Could not create the bot.',
      );
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onSubmit={handleSubmit}
      >
        <div className={`modal-body ${mode === 'group' ? 'is-group' : ''}`}>
          <div className="modal-head">
            <div>
              <h2 id="create-title">New agent</h2>
              <p>Create a bot, or bring a few together.</p>
            </div>
            <button
              type="button"
              className="modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Agent type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'bot'}
              className={mode === 'bot' ? 'is-active' : ''}
              onClick={() => setMode('bot')}
            >
              Bot
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'group'}
              className={mode === 'group' ? 'is-active' : ''}
              onClick={() => setMode('group')}
            >
              Group
            </button>
          </div>

          <div className="creation-preview">
            {mode === 'bot' ? (
              <AnimatedBloub color={color} shape={shape} size={64} />
            ) : (
              <AgentAvatar avatar={preview} size={64} showBadge={false} />
            )}
          </div>

          <label className="field">
            <span>{mode === 'bot' ? 'Bot name' : 'Group name'}</span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              maxLength={64}
              spellCheck={false}
              disabled={busy}
              placeholder={
                mode === 'bot' ? 'e.g. Research assistant' : 'e.g. Launch crew'
              }
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
            />
          </label>

          {mode === 'bot' ? (
            <p className="create-hint">
              {profileId
                ? `Creates the Hermes profile “${profileId}” on the connected machine.`
                : 'A bot lives as a Hermes profile on the connected machine.'}
            </p>
          ) : null}

          {error ? <p className="create-error">{error}</p> : null}

          {busy && progress ? (
            <div className="create-progress" role="status">
              <span className="create-progress-dot" aria-hidden="true" />
              <div>
                <p className="create-progress-line">
                  {progress.elapsed}s · {progress.step}…
                </p>
                <p className="create-hint">
                  A bot gets its own profile, so the first one takes a minute or
                  two. Closing this window will not interrupt it.
                </p>
              </div>
            </div>
          ) : null}

          {mode === 'bot' ? (
            <>
              <div className="create-section">
                <span className="create-label">Shape</span>
                <ShapeGrid value={shape} color={color} onChange={setShape} />
              </div>
              <div className="create-section">
                <span className="create-label">Color</span>
                <ColorGrid
                  value={color}
                  onChange={(next) => {
                    setColorTouched(true);
                    setColor(next);
                  }}
                />
                {colorTouched ? (
                  <p className="create-hint">
                    This is the colour Hermes will show for {name.trim() || 'this bot'}.
                  </p>
                ) : (
                  <p className="create-hint">
                    Hermes' own colour for {profileId || 'this name'} — pick one
                    to override it.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="create-section">
              <div className="create-label-row">
                <span className="create-label">Bots</span>
                <span className="create-count">
                  {selected.length} selected
                </span>
              </div>
              <div className="member-picker">
                {candidates.map((candidate) => {
                  const checked = selected.includes(candidate.id);
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      className={`member-option ${checked ? 'is-checked' : ''}`}
                      onClick={() => toggleCandidate(candidate.id)}
                    >
                      <AgentAvatar
                        avatar={candidate.avatar}
                        size={28}
                        showBadge={false}
                      />
                      <span className="member-name">{candidate.name}</span>
                      <span className="member-check" aria-hidden="true">
                        {checked ? '✓' : ''}
                      </span>
                    </button>
                  );
                })}
                {candidates.length < 2 ? (
                  <p className="create-hint">
                    Create at least two bots before building a group.
                  </p>
                ) : null}
              </div>
              <p className="create-hint">
                Pick at least two bots. There is no maximum.
              </p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="button-ghost" onClick={onClose}>
            {busy ? 'Close' : 'Cancel'}
          </button>
          <button
            type="submit"
            className="button-primary"
            disabled={!canCreate || busy}
          >
            {busy
              ? progress
                ? `Creating bot… ${progress.elapsed}s`
                : 'Creating bot…'
              : mode === 'bot'
                ? 'Create bot'
                : 'Create group'}
          </button>
        </div>
      </form>
    </div>
  );
}
