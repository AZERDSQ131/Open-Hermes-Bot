import type { AvatarSpec, SingleAvatar } from '../data';
import { BloubSvg } from './Bloub';
import { MoodBloub } from './MoodBloub';
import type { MoodId } from '../moods';

type AgentAvatarProps = {
  avatar: AvatarSpec;
  size?: number;
  className?: string;
  showBadge?: boolean;
  unread?: boolean;
  /**
   * A mood: when given, a bot (not a group) plays its theatre instead of
   * wearing the still face. Absent: the still face, as everywhere the
   * picture is only decorative.
   */
  mood?: MoodId;
};

const UNREAD_BADGE = '#2496e8';

const GROUP_LAYOUT_3 = [
  { style: { top: '0%', left: '9%' }, scale: 0.64 },
  { style: { bottom: '0%', left: '0%' }, scale: 0.57 },
  { style: { bottom: '2%', right: '0%' }, scale: 0.53 },
];

const GROUP_LAYOUT_2 = [
  { style: { top: '0%', left: '5%' }, scale: 0.68 },
  { style: { bottom: '0%', right: '1%' }, scale: 0.6 },
];

/**
 * The face a bot wears in the app: one face for one bot, three laid over one
 * another for a group. When a mood travels with the call, the single face
 * becomes the theatre.
 */
export function AgentAvatar({
  avatar,
  size = 40,
  className,
  showBadge = true,
  unread = false,
  mood,
}: AgentAvatarProps) {
  /**
   * The face of a single bot: the theatre when a mood travels with it, the
   * still face otherwise. The badge rides on either.
   */
  function singleFace(bot: SingleAvatar) {
    if (mood) {
      return (
        <MoodBloub
          color={bot.color}
          shape={bot.shape}
          mood={mood}
          size={size}
        />
      );
    }
    return (
      <BloubSvg
        color={bot.color}
        shape={bot.shape}
        variant={bot.variant ?? 'neutral'}
      />
    );
  }

  const badgeSize = Math.max(10, Math.round(size * 0.29));
  const showUnreadBadge = showBadge && unread;
  const face = avatar.kind === 'group' ? null : singleFace(avatar);

  if (avatar.kind === 'group') {
    const visibleMembers = avatar.members.slice(0, 3);
    const extraMembers = avatar.members.length - visibleMembers.length;
    const layout =
      visibleMembers.length > 2 ? GROUP_LAYOUT_3 : GROUP_LAYOUT_2;
    const countSize = Math.max(14, Math.round(size * 0.3));

    return (
      <span
        className={`bloub-group ${className ?? ''}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {visibleMembers.map((member, index) => (
          <span
            className="bloub-group-item"
            key={index}
            style={{
              width: `${layout[index].scale * 100}%`,
              height: `${layout[index].scale * 100}%`,
              ...layout[index].style,
            }}
          >
            <BloubSvg
              color={member.color}
              shape={member.shape}
              variant={member.variant ?? 'neutral'}
            />
          </span>
        ))}
        {extraMembers > 0 && size >= 32 ? (
          <span
            className="bloub-group-more"
            style={{
              height: countSize,
              minWidth: countSize,
              fontSize: Math.max(8, Math.round(countSize * 0.62)),
            }}
          >
            +{extraMembers}
          </span>
        ) : null}
        {showUnreadBadge ? (
          <span
            className="bloub-badge"
            role="img"
            aria-label="Unread"
            style={{
              width: badgeSize,
              height: badgeSize,
              background: UNREAD_BADGE,
              borderWidth: Math.max(2, Math.round(size * 0.055)),
            }}
          />
        ) : null}
      </span>
    );
  }

  return (
    <span
      className={`bloub ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {face}
      {showUnreadBadge ? (
        <span
          className="bloub-badge"
          role="img"
          aria-label="Unread"
          style={{
            width: badgeSize,
            height: badgeSize,
            background: UNREAD_BADGE,
            borderWidth: Math.max(2, Math.round(size * 0.055)),
          }}
        />
      ) : null}
    </span>
  );
}
