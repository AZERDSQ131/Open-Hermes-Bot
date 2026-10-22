import { useEffect, useState } from 'react';
import type {
  HermesUpdateHistory,
  HermesUpdateInfo,
  HermesUpdateResult,
} from '../hermes';
import {
  applyUpdateEvent,
  initialUpdateStatus,
  releaseDateWords,
  releaseRows,
  updateButtonBusy,
  updateButtonDisabled,
  updateButtonLabel,
  updateDetail,
  updateIsTakingOver,
  type ReleaseRow,
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

/**
 * The version is named the way the releases page names it: a `v` before it,
 * and no second one after the first.
 */
function tagOf(version: string): string {
  return version ? `v${version.replace(/^v/, '')}` : '';
}

/** What the page of the project has published, and what went wrong reading it. */
type History = {
  loaded: boolean;
  rows: ReleaseRow[];
  page: string;
  message: string;
};

const EMPTY_HISTORY: History = { loaded: false, rows: [], page: '', message: '' };

export function UpdatesSettings() {
  const bridge = window.hermes;
  const [status, setStatus] = useState<UpdateStatus>(initialUpdateStatus);
  const [info, setInfo] = useState<HermesUpdateInfo | null>(null);
  const [book, setBook] = useState<History>(EMPTY_HISTORY);

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

  // What the page of the project has published. Read once, said plainly: a
  // page that says no, or says nothing, is not an error the person carries.
  useEffect(() => {
    let cancelled = false;
    bridge
      ?.updateHistory?.()
      .then((next: HermesUpdateHistory) => {
        if (cancelled) return;
        setBook({
          loaded: true,
          rows: releaseRows(next?.rows),
          page: typeof next?.page === 'string' ? next.page : '',
          message:
            next?.ok === false
              ? next.message ||
                'GitHub did not say. The app still looks for its next version.'
              : '',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBook({
          ...EMPTY_HISTORY,
          loaded: true,
          message: 'GitHub did not answer. The app still looks for its next version.',
        });
      });
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
  // The version the page named, while it is being looked at, carried in, or
  // waited on: shown apart, and read in its row too.
  const wanted = tagOf(status.version);
  const beingFound =
    ['available', 'downloading', 'ready'].includes(status.state)
      ? book.loaded
        ? book.rows.find((row) => row.tag === wanted) || null
        : null
      : null;
  const rows = book.rows.filter((row) => row.tag !== wanted);

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <div>
          <h2>Updates</h2>
          <p>
            Hermes Bot reads its next version on GitHub, and becomes it on its
            own: the download runs here, and the restart too.
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
            <h3>Now</h3>
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
              : 'The app also looks when it opens, and takes the update when it closes.'}
          </p>
        </div>
      </section>

      <section className="settings-card">
        <header className="settings-card-head">
          <div>
            <h3>On GitHub</h3>
            <p>What the page of the project has published.</p>
          </div>
          <span className="settings-card-meta">GitHub</span>
        </header>

        <div className="settings-card-body">
          {beingFound ? (
            <button
              type="button"
              className="update-release is-found"
              title="Read the release on GitHub"
              onClick={() =>
                bridge?.openRelease?.(beingFound.url || book.page)
              }
            >
              <code className="update-release-tag">{beingFound.tag}</code>
              <span className="update-release-name">{beingFound.name}</span>
              <span className="update-release-date">
                {releaseDateWords(beingFound.date)}
              </span>
            </button>
          ) : null}

          {!book.loaded ? (
            <p className="settings-hint">Reading the page…</p>
          ) : rows.length === 0 && !beingFound ? (
            <p className="settings-hint">
              {book.message || 'The page is there, and it has nothing on it yet.'}
            </p>
          ) : (
            <ul className="update-releases">
              {rows.map((row, which) => (
                <li key={`${row.tag}-${which}`}>
                  <button
                    type="button"
                    className="update-release"
                    title={
                      row.url ? 'Read the release on GitHub' : undefined
                    }
                    onClick={() => row.url && bridge?.openRelease?.(row.url)}
                  >
                    <code className="update-release-tag">{row.tag}</code>
                    <span className="update-release-name">{row.name}</span>
                    {row.prerelease ? (
                      <span className="update-release-chip">prerelease</span>
                    ) : null}
                    <span className="update-release-date">
                      {releaseDateWords(row.date)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {book.page ? (
            <div className="settings-page-buttons">
              <button
                type="button"
                className="update-open"
                onClick={() => bridge?.openRelease?.(book.page)}
              >
                Open the releases page
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
