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
import { updateMood } from '../moods';
import { MoodBloub } from './MoodBloub';

/** The walk of the ring that follows the download, around its circle. */
const CIRCLE = 2 * Math.PI * 9;

/**
 * The round face at the foot of the sidebar, where the next version lives.
 *
 * Icon only: it listens to the shell for what is happening with the update,
 * and says it with a mood instead of a word — still while nothing is known,
 * the comet while the app looks or the download runs, the asking stare when
 * a version was seen, the burst of celebration when it is on the disk. The
 * words are for the ear that reads before pressing; the ring walks on top
 * while the download has a progress to carry.
 *
 * The app looks by itself: the scan the shell starts on launch is read here,
 * so the face shows the search going on without anybody asking for it. What
 * the app found on its own waits for the app to close — only a look the
 * person asked for takes the app over.
 *
 * It is not shown where there is no app around it, as in a page seen from a
 * browser.
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

  // The look the app started on its own is already running: the mark reads
  // where it stands, so the search is seen from the first word. What it says
  // is only read while the mark still knows nothing: a look the person
  // started has already moved it on.
  useEffect(() => {
    if (!bridge?.updateState) return;
    let cancelled = false;
    bridge
      .updateState()
      .then((event) => {
        if (cancelled) return;
        setStatus((current) =>
          current.state === 'idle' ? applyUpdateEvent(current, event) : current,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // The new version is on the disk: let it take over, from here too — but
  // only when the person asked for it. The app's own look waits for the app
  // to close: a conversation is not something to interrupt.
  useEffect(() => {
    if (!updateIsTakingOver(status) || status.quiet) return;
    bridge?.installUpdate().catch(() => undefined);
  }, [status.state, status.quiet, bridge]);

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
        <MoodBloub
          color="currentColor"
          shape="cercle"
          mood={updateMood(status)}
          size={16}
        />
      )}
      <span className="update-entry-dot" aria-hidden="true" />
    </button>
  );
}
