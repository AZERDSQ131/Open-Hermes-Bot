import { useState } from 'react';
import type { AvatarSpec, BotStyle } from '../data';
import { AgentAvatar } from './AgentAvatar';
import { ColorGrid, ShapeGrid } from './LogoControls';

type LogoEditorProps = {
  avatar: AvatarSpec;
  onChange: (avatar: AvatarSpec) => void;
  onClose: () => void;
};

export function LogoEditor({ avatar, onChange, onClose }: LogoEditorProps) {
  const [memberIndex, setMemberIndex] = useState(0);
  const isGroup = avatar.kind === 'group';
  const members = isGroup ? avatar.members : [];
  const activeMember = Math.min(memberIndex, Math.max(members.length - 1, 0));
  const current: BotStyle | null = isGroup
    ? (members[activeMember] ?? null)
    : avatar;

  if (!current) return null;

  function apply(patch: Partial<BotStyle>) {
    if (avatar.kind === 'group') {
      const nextMembers = avatar.members.map((member, index) =>
        index === activeMember ? { ...member, ...patch } : member,
      );
      onChange({ ...avatar, members: nextMembers });
      return;
    }
    onChange({ ...avatar, ...patch });
  }

  return (
    <div className="logo-popover" role="dialog" aria-label="Edit logo">
      <div className="logo-popover-head">
        <span>
          {isGroup ? `Group logo · ${members.length} bots` : 'Bot logo'}
        </span>
        <button
          type="button"
          className="logo-popover-close"
          aria-label="Close logo editor"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {isGroup ? (
        <div className="logo-members">
          {members.map((member, index) => (
            <button
              key={index}
              type="button"
              className={`logo-member ${index === activeMember ? 'is-active' : ''}`}
              aria-label={`Style member ${index + 1}`}
              title={`Member ${index + 1}`}
              aria-pressed={index === activeMember}
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
      ) : null}

      <div className="logo-section">
        <span className="logo-label">Shape</span>
        <ShapeGrid
          value={current.shape}
          color={current.color}
          onChange={(shape) => apply({ shape })}
        />
      </div>

      <div className="logo-section">
        <span className="logo-label">Color</span>
        <ColorGrid
          value={current.color}
          onChange={(color) => apply({ color })}
        />
      </div>
    </div>
  );
}
