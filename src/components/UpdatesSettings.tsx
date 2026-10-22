import { useEffect, useState } from 'react';
import type { HermesUpdateInfo, HermesUpdateResult } from '../hermes';
import {
  applyUpdateEvent,
  initialUpdateStatus,
  updateButtonBusy,
  updateButtonDisabled,
  updateButtonLabel,
  updateDetail,
  updateIsTakingOver,
  type UpdateStatus,
} from '../updates';

const UNSUPPORTED_MESSAGE =
  'Updates are found by the installed app, not by a copy running from the sources.';

/** The state the card says, in the short form the meta line takes. */
function stateMeta(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Not checked yet';
    case 'checking':
      return 'Looking';
    case 'available':
      return 'Found';
    case 'downloading':
      return `${status.percent}%`;
    case 'ready':
      return 'Ready';
    case 'current':
      return 'Up to date';
    case 'unsupported':
      return 'Not here';
    case 'error':
      return 'Failed';
  }
}

export function UpdatesSettings() {
  const bridge = window.hermes;
  const [status, setStatus] = useState<UpdateStatus>(initialUpdateStatus);
  const [info, setInfo] = useState<HermesUpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    bridge
      ?.updateInfo()
      .then((next: HermesUpdateInfo) => {
        if (cancelled) return;
        setInfo(next);
        if (!next.supported) {
          setStatus((current) => ({
            ...current,
            state: 'unsupported',
            message: UNSUPPORTED_MESSAGE,
          }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // The shell says what happened while looking: found, downloading, ready.
  useEffect(() => {
    if (!bridge?.onUpdate) return;
    return bridge.onUpdate((event) => {
      setStatus((current) => applyUpdateEvent(current, event));
    });
  }, [bridge]);

  // The new version is on the disk: the app becomes it and comes back.
  useEffect(() => {
    if (!updateIsTakingOver(status)) return;
    let cancelled = false;
    bridge
      ?.installUpdate()
      .catch((reason: Error) => {
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          state: 'error',
          message: reason.message,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [status.state, bridge]);

  async function handleCheck() {
    if (!bridge) return;
    setStatus({ ...initialUpdateStatus(), state: 'checking' });
    const result: HermesUpdateResult = await bridge
      .checkForUpdates()
      .catch(
        (reason: Error): HermesUpdateResult => ({
          ok: false,
          state: 'error',
          message: reason.message,
        }),
      );
    setStatus((current) =>
      applyUpdateEvent(current, {
        state: result.state,
        version: result.version,
        message: result.message,
      }),
    );
  }

  const busy = updateButtonBusy(status);
  const disabled = !bridge || updateButtonDisabled(status);

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <div>
          <h2>Updates</h2>
          <p>
            The app looks for its next version on the releases page, and takes
            it when it is ready.
          </p>
        </div>
        <div className="settings-page-side">
          <span className="settings-card-meta">
            {info ? `Version ${info.version}` : 'Version —'}
          </span>
        </div>
      </header>

      {bridge ? null : (
        <p className="settings-notice">
          Updates are only available inside the desktop app.
        </p>
      )}

      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h3>Check for updates</h3>
            <p>{updateDetail(status)}</p>
          </div>
          <span className="settings-card-meta">{stateMeta(status)}</span>
        </header>

        <div className="settings-card-body">
          {status.state === 'downloading' ? (
            <div
              className="update-meter"
              role="progressbar"
              aria-label="Downloading the update"
              aria-valuenow={status.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                className="update-meter-fill"
                style={{ width: `${status.percent}%` }}
              />
            </div>
          ) : null}

          <div className="settings-page-buttons">
            <button
              type="button"
              className="settings-action"
              disabled={disabled}
              onClick={handleCheck}
            >
              {updateButtonLabel(status)}
            </button>
          </div>

          <p className="settings-hint">
            {busy
              ? 'The app restarts itself when the download is done.'
              : 'A conversation is not interrupted: the app restarts when you are ready.'}
          </p>
        </div>
      </section>
    </div>
  );
}
