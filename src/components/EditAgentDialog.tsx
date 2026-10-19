import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AvatarSpec, BotStyle, Thread } from '../data';
import { AgentAvatar } from './AgentAvatar';
import { AnimatedBloub } from './AnimatedBloub';
import { ColorGrid, ShapeGrid } from './LogoControls';

type EditAgentDialogProps = {
  thread: Thread;
  /** The default bot's name is part of the app, not a local label. */
  nameLocked?: boolean;
  onClose: () => void;
  onSave: (input: { name: string; avatar: AvatarSpec }) => void;
};

export function EditAgentDialog({
  thread,
  nameLocked,
  onClose,
  onSave,
}: EditAgentDialogProps) {
  const [name, setName] = useState(thread.name);
  const [avatar, setAvatar] = useState<AvatarSpec>(thread.avatar);
  const [memberIndex, setMemberIndex] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const isGroup = avatar.kind === 'group';
  const members = avatar.kind === 'group' ? avatar.members : [];
  const activeMember = Math.min(memberIndex, Math.max(members.length - 1, 0));
  const current: BotStyle | null = isGroup
    ? (members[activeMember] ?? null)
    : avatar;

  useEffect(() => {
    if (nameLocked) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [nameLocked]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function apply(patch: Partial<BotStyle>) {
    if (avatar.kind === 'group') {
      setAvatar({
        ...avatar,
        members: avatar.members.map((member, index) =>
          index === activeMember ? { ...member, ...patch } : member,
        ),
      });
      return;
    }
    setAvatar({ ...avatar, ...patch });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), avatar });
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
        aria-labelledby="edit-agent-title"
        onSubmit={handleSubmit}
      >
        <div className="modal-body">
          <div className="modal-head">
            <div>
              <h2 id="edit-agent-title">
                {isGroup ? 'Edit group' : 'Edit bot'}
              </h2>
              <p>
                {nameLocked
                  ? 'Its name is fixed — update its logo.'
                  : 'Update its name and logo.'}
              </p>
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

          <div className="creation-preview">
            {avatar.kind === 'group' ? (
              <AgentAvatar avatar={avatar} size={64} showBadge={false} />
            ) : (
              <AnimatedBloub
                color={avatar.color}
                shape={avatar.shape}
                size={64}
              />
            )}
          </div>

          <label className="field">
            <span>{isGroup ? 'Group name' : 'Bot name'}</span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              maxLength={40}
              spellCheck={false}
              disabled={nameLocked}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          {avatar.kind === 'group' && current ? (
            <div className="create-section edit-member-section">
              <div className="create-label-row">
                <span className="create-label">Member logo</span>
                <span className="create-count">
                  {activeMember + 1} / {members.length}
                </span>
              </div>
              <div
                className="logo-members edit-member-tabs"
                aria-label="Group members"
              >
                {members.map((member, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`logo-member ${index === activeMember ? 'is-active' : ''}`}
                    aria-label={`Edit member ${index + 1}`}
                    aria-pressed={index === activeMember}
                    title={`Member ${index + 1}`}
                    onClick={() => setMemberIndex(index)}
                  >
                    <AgentAvatar
                      avatar={{
                        color: member.color,
                        shape: member.shape,
                        variant: member.variant,
                      }}
                      size={24}
                      showBadge={false}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {current ? (
            <>
              <div className="create-section">
                <span className="create-label">Shape</span>
                <ShapeGrid
                  value={current.shape}
                  color={current.color}
                  onChange={(shape) => apply({ shape })}
                />
              </div>
              <div className="create-section">
                <span className="create-label">Color</span>
                <ColorGrid
                  value={current.color}
                  onChange={(color) => apply({ color })}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="button-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button-primary"
            disabled={!name.trim()}
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
