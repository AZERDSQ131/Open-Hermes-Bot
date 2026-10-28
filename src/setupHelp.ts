// What the setup says when it cannot read the key of the host, or when the
// API server is not there to answer.
//
// The app reaches Hermes through Hermes' own API server, and that server is
// off until Hermes' home holds a key. A person who installed Hermes through
// its desktop app never needed one, so the first thing they meet is a read
// that finds nothing, and a raw `API_SERVER_KEY not found in ~/.hermes/.env`
// does not say what the key is, why it is missing, or how to make one.
//
// The words for every way that read can fail live here, in one file, so the
// first run and the settings cannot drift apart. `electron/main.js` reports
// the facts (which failure it was, and the raw words of the shell); this file
// turns them into something a person can act on.

import type { HermesConnectionMode } from './hermes';

/** Why the key could not be read from the machine that runs Hermes. */
export type KeyReadReason =
  // There is no `~/.hermes/.env` there. That is not Hermes being absent: a
  // home is only written when something is saved to it, so a fresh install
  // can have none.
  | 'no-file'
  // The file exists and has no `API_SERVER_KEY` line: the server was never on.
  | 'no-key'
  // The line is there and too short for Hermes to accept it.
  | 'short-key'
  // The command that reads the file did not run (an SSH that asked a question,
  // a home that cannot be read). The raw words ride along in `details`.
  | 'unreadable';

/** A failure the setup knows how to explain. */
export type ConnectionFailure =
  | {
      kind: 'key';
      reason: KeyReadReason;
      mode: HermesConnectionMode;
      host: string;
      details?: string;
    }
  | {
      // The key is in hand and nothing answers on the port: the API server
      // was never started, which is what a key added without a restart looks
      // like.
      kind: 'port';
      mode: HermesConnectionMode;
      host: string;
      port: string;
    };

/** What the page shows, in the order it is read. */
export type Help = {
  /** What happened, in one line. */
  title: string;
  /** Why, in the app's own words. One paragraph each. */
  lines: string[];
  /** The commands that fix it, to be run on the machine that runs Hermes. */
  code?: string[];
  /** What to do once they ran. */
  after?: string;
  /** The raw words of the shell, when there are any: behind Details. */
  details?: string;
};

/** The machine that runs Hermes, said the way the pages say it. */
export function machineLabel(
  mode: HermesConnectionMode,
  host?: string,
): string {
  if (mode === 'local') return 'this Mac';
  // A host is only named when Hermes runs elsewhere; an empty one is still
  // a machine the sentence has to call something.
  return String(host ?? '').trim() || 'the host';
}

/** The file Hermes keeps its key in, and the only file the app reads. */
export const HERMES_ENV = '~/.hermes/.env';

/**
 * Hermes writing its own key, rather than the person editing the file: the
 * CLI writes the line atomically and tightens the file to 0600, which an
 * append by hand would not (`save_env_value` in `hermes_cli/config.py`).
 * It replaces an existing `API_SERVER_KEY` rather than adding a second one,
 * and creates the file when there is none.
 */
const SET_KEY_LINE =
  'hermes config set API_SERVER_KEY "$(openssl rand -hex 32)"';

/** Hermes reads the file at start: a key written now is a key on the next run. */
const RESTART_LINE = 'hermes gateway restart';

/**
 * On `this Mac` the commands run in a terminal on the same machine; elsewhere
 * they run on the host, once the SSH a person would type works without asking
 * anything; the app's own SSH never can.
 */
function whereToRun(mode: HermesConnectionMode, host: string): string {
  if (mode === 'local') {
    return 'Run these in a terminal on this Mac.';
  }
  return `Run these on ${machineLabel(mode, host)}, once ssh ${machineLabel(
    mode,
    host,
  )} works in a terminal without asking anything.`;
}

/**
 * The help for a failure the setup met. A `key` failure names what the read
 * found; a `port` failure says the server is the part that is missing, not
 * the key.
 */
export function describeFailure(failure: ConnectionFailure): Help {
  const where = machineLabel(failure.mode, failure.host);

  if (failure.kind === 'port') {
    return {
      title:
        failure.mode === 'local'
          ? `Hermes is here, but its API server is not listening on 127.0.0.1:${failure.port}.`
          : `The API server of ${where} is not listening on port ${failure.port}.`,
      lines: [
        'The key is in hand. The API server is a listener of its own: it comes up with the gateway, so a key written a moment ago is read at the next restart.',
        failure.mode === 'local'
          ? 'Restart the gateway on this Mac, then try again:'
          : `Restart the gateway on ${where}, then try again:`,
      ],
      code: [RESTART_LINE],
    };
  }

  if (failure.reason === 'no-file') {
    // No file is not "Hermes is not installed". A home is only written when
    // something is saved to it, so a fresh install can have none, and the
    // commands create it. The app reads one path: a Hermes that moved its
    // home with HERMES_HOME is not where the app looks.
    return {
      title: `There is no ${HERMES_ENV} on ${where} yet.`,
      lines: [
        `${HERMES_ENV} is where Hermes keeps the key of its API server. It is written when something is saved to it, so a fresh install may not have one.`,
        `${whereToRun(failure.mode, failure.host)} The first creates the file and puts a key in it, readable only by you; the second restarts the gateway.`,
        'If Hermes keeps its home somewhere else (HERMES_HOME), the app does not read that one.',
      ],
      code: [SET_KEY_LINE, RESTART_LINE],
      after: 'Then try again: the app reads the key on its own, and keeps it in the Keychain.',
      details: failure.details,
    };
  }

  if (failure.reason === 'short-key') {
    return {
      title: `The key in ${HERMES_ENV} is too short.`,
      lines: [
        'Hermes ignores a key shorter than 16 characters, so its API server never starts.',
        'Have Hermes write a new one over it, and restart the gateway:',
      ],
      code: [SET_KEY_LINE, RESTART_LINE],
      after: 'Then try again: the app reads the key on its own.',
      details: failure.details,
    };
  }

  if (failure.reason === 'unreadable') {
    // The command did not run, so there is nothing to read and nothing to
    // fix in the file: what failed is the way in.
    return {
      title:
        failure.mode === 'local'
          ? 'The key could not be read on this Mac.'
          : `The key could not be read from ${where}.`,
      lines:
        failure.mode === 'local'
          ? [
              `A command that reads ${HERMES_ENV} failed before it could answer.`,
              'Try again; if it keeps failing, open a terminal on this Mac and check that the file is readable.',
            ]
          : [
              `The app reaches ${where} over SSH without a terminal, so anything that would ask a question fails: a password, the passphrase of a key, a security key, or a host key seen for the first time.`,
              `In a terminal on this Mac, ssh ${where} has to work without asking anything. Then try again.`,
            ],
      details: failure.details,
    };
  }

  return {
    title: "Hermes' API server is off.",
    lines: [
      `Hermes Bot talks to Hermes through its API server, and that server is off until ${HERMES_ENV} holds a key. The desktop app Hermes ships with never needs one, so a fresh install does not have it.`,
      `${whereToRun(failure.mode, failure.host)} They have Hermes write a key into its own file, readable only by you, and restart the gateway so it is read.`,
    ],
    code: [SET_KEY_LINE, RESTART_LINE],
    after: 'Then try again: the app reads the key on its own, and keeps it in the Keychain.',
    details: failure.details,
  };
}

/**
 * The help for a key the host does not have, when the read could say why it
 * found none. Null when it could not, so the page keeps its plain line: the
 * five pages that show this ask the same question in the same way.
 */
export function keyFailureHelp(
  reason: KeyReadReason | undefined,
  mode: HermesConnectionMode,
  host: string,
  details?: string,
): Help | null {
  return reason
    ? describeFailure({ kind: 'key', reason, mode, host, details })
    : null;
}
