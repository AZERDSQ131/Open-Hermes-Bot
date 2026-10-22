import { useEffect, useState } from 'react';
import {
  applyUpdateEvent,
  initialUpdateStatus,
  updateBadge,
  updateIsTakingOver,
  updateMarkWords,
  updateProgress,
  type UpdateStatus,
} from '../updates';
import { UpdateIcon } from './Icons';

/** The walk of the ring that follows the download, around its circle. */
const CIRCLE = 2 * Math.PI * 9;

/**
 * The small place beside the settings, where the next version lives.
 *
 * Ico only: it listens to the shell for what is happening with the update,
 * and says it with a mark instead of a word — nothing while nothing is
 * known, a turning look while it checks, a ring while the download walks, a
 * pulsing dot when a version was seen, a ping when it is on the disk. The
 * words are for the ear that reads before pressing. It is not shown where
 * there is no app around it, as in a page seen from a browser.
 */
export function UpdateButton() {
  const bridge = window.hermes;
  const [status, setStatus] = useState<UpdateStatus>(initialUpdateStatus);

  // The shell tells what happened while looking: the mark follows.
  useEffect(() => {
    if (!bridge?.onUpdate) return;
    return bridge.onUpdate((event) => {
      setStatus((current) => applyUpdateEvent(current, event));
    });
  }, [bridge]);

  // The new version is on the disk: let it take over, from here too.
  useEffect(() => {
    if (!updateIsTakingOver(status)) return;
    bridge?.installUpdate().catch(() => undefined);
  }, [status.state, bridge]);

  if (!bridge) return null;

  const badge = updateBadge(status);
  const words = updateMarkWords(status);
  const progress = updateProgress(status);

  return (
    <button
      type="button"
      className={`update-entry is-${badge}`}
      onClick={() => bridge.checkForUpdates().catch(() => undefined)}
      aria-label={words}
      title={words}
      disabled={badge === 'busy' || badge === 'coming' || badge === 'here'}
    >
      {progress !== null ? (
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          className="update-entry-ring"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            opacity="0.25"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={CIRCLE}
            strokeDashoffset={CIRCLE * (1 - progress / 100)}
            transform="rotate(-90 12 12)"
          />
        </svg>
      ) : (
        <UpdateIcon
          size={16}
          className={
            status.state === 'checking' ? 'update-entry-spin' : undefined
          }
        />
      )}
      <span className="update-entry-dot" aria-hidden="true" />
    </button>
  );
}
