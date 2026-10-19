import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BotStyle, SingleAvatar } from '../data';
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

type CreateAgentDialogProps = {
  candidates: CreateCandidate[];
  onClose: () => void;
  onCreateBot: (input: { name: string; shape: BloubShape; color: string }) => void;
  onCreateGroup: (input: { name: string; members: BotStyle[] }) => void;
};

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
  const canCreate =
    name.trim().length > 0 && (mode === 'bot' || selected.length >= 2);

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    if (mode === 'bot') {
      onCreateBot({ name: name.trim(), shape, color });
    } else {
      onCreateGroup({ name: name.trim(), members: groupMembers });
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
              maxLength={40}
              spellCheck={false}
              placeholder={
                mode === 'bot' ? 'e.g. Research assistant' : 'e.g. Launch crew'
              }
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          {mode === 'bot' ? (
            <>
              <div className="create-section">
                <span className="create-label">Shape</span>
                <ShapeGrid value={shape} color={color} onChange={setShape} />
              </div>
              <div className="create-section">
                <span className="create-label">Color</span>
                <ColorGrid value={color} onChange={setColor} />
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
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={!canCreate}>
            {mode === 'bot' ? 'Create bot' : 'Create group'}
          </button>
        </div>
      </form>
    </div>
  );
}
