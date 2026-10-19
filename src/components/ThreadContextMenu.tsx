import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Thread } from '../data';
import { EnvelopeIcon, PencilIcon, PinIcon, TrashIcon } from './Icons';

type ThreadContextMenuProps = {
  thread: Thread;
  x: number;
  y: number;
  canPin: boolean;
  pinLimit: number;
  canDelete: boolean;
  onPin: () => void;
  onDelete: () => void;
  onToggleUnread: () => void;
  onEdit: () => void;
  onClose: () => void;
};

const EDGE = 8;

export function ThreadContextMenu({
  thread,
  x,
  y,
  canPin,
  pinLimit,
  canDelete,
  onPin,
  onDelete,
  onToggleUnread,
  onEdit,
  onClose,
}: ThreadContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const isGroup = thread.avatar.kind === 'group';

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const nextX = Math.min(
      Math.max(EDGE, x),
      window.innerWidth - rect.width - EDGE,
    );
    const nextY = Math.min(
      Math.max(EDGE, y),
      window.innerHeight - rect.height - EDGE,
    );
    setPosition((current) =>
      current.x === nextX && current.y === nextY
        ? current
        : { x: nextX, y: nextY },
    );
  }, [x, y]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLButtonElement>('.context-menu-item:not(:disabled)')
      ?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    function dismiss() {
      onClose();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('scroll', dismiss, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [onClose]);

  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={`Actions for ${thread.name}`}
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="context-menu-item"
        disabled={!canPin}
        title={canPin ? undefined : `Up to ${pinLimit} pinned agents`}
        onClick={() => run(onPin)}
      >
        <span className="context-menu-icon">
          <PinIcon size={15} />
        </span>
        <span>
          {thread.pinned
            ? 'Unpin'
            : canPin
              ? 'Pin'
              : `Pin (max ${pinLimit})`}
        </span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="context-menu-item"
        onClick={() => run(onToggleUnread)}
      >
        <span className="context-menu-icon">
          <EnvelopeIcon size={15} />
        </span>
        <span>{thread.unread ? 'Mark as read' : 'Mark as unread'}</span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="context-menu-item"
        onClick={() => run(onEdit)}
      >
        <span className="context-menu-icon">
          <PencilIcon size={15} />
        </span>
        <span>{isGroup ? 'Edit group' : 'Edit bot'}</span>
      </button>

      <div className="context-menu-separator" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="context-menu-item is-danger"
        disabled={!canDelete}
        title={canDelete ? undefined : 'Keep at least one agent'}
        onClick={() => run(onDelete)}
      >
        <span className="context-menu-icon">
          <TrashIcon size={15} />
        </span>
        <span>{isGroup ? 'Delete group' : 'Delete bot'}</span>
      </button>
    </div>
  );
}
