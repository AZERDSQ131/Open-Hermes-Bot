// The rules of the tunnel: what the app asks ssh for, which local port it
// takes when the one it wanted is held, and how it recognises the forward it
// left behind.
//
// The bridge spawns the process and keeps its state; the decisions live here,
// in one file, so they can be read and tested without an SSH server — the same
// reason `connection.js` and `keys.js` exist. `electron/main.js` still owns
// everything that touches the machine.

'use strict';

/** How many local ports to try when the preferred one is held. */
const PORT_ATTEMPTS = 5;

/** Hermes' own API port, and the local end of the forward. */
const DEFAULT_API_PORT = 8642;
const DEFAULT_LOCAL_PORT = 18742;

/**
 * The local port a connection test uses: the next slot after the live tunnel's
 * port, so a test never collides with a tunnel that is already running.
 *
 * The port is a 16-bit number, so "the next slot" has to wrap: at the top of
 * the range it goes down instead, which keeps it out of the tunnel's way just
 * as well.
 */
function testPortFor(localPort) {
  return localPort >= 65535 ? localPort - 1 : localPort + 1;
}

/**
 * The local port to try on the nth attempt.
 *
 * A forward nobody reaped (an ssh that outlived the app) keeps the port the
 * record names, and the tunnel cannot bind to it. The record stays the
 * preference; this is the app working around what is in the way. Attempt 0 is
 * the preferred port itself, and the walk wraps like `testPortFor`.
 */
function portAfter(localPort, attempt) {
  const port = localPort + attempt;
  return port > 65535 ? localPort - attempt : port;
}

/** The `-L` value: the local end of the forward, and where it lands. */
function forwardSpec(localPort, apiPort) {
  return `127.0.0.1:${localPort}:127.0.0.1:${apiPort}`;
}

/**
 * What Hermes answers on when it runs on this machine.
 *
 * A connection carries its own `apiPort`; a record written before it did, or a
 * record with a value that is not a port, is Hermes' default. The port is the
 * one thing the app reads out of a record to talk to it directly.
 */
function apiPortOf(connection) {
  const port = Number(connection?.apiPort);
  return Number.isInteger(port) && port > 0 && port <= 65535
    ? port
    : DEFAULT_API_PORT;
}

/** The local port a connection asks for, with the same fallback. */
function localPortOf(connection) {
  const port = Number(connection?.localPort);
  return Number.isInteger(port) && port > 0 && port <= 65535
    ? port
    : DEFAULT_LOCAL_PORT;
}

/**
 * The arguments of the ssh that holds the forward.
 *
 * Every `-o` here is a rule, not a preference:
 *
 * - `BatchMode=yes`, so a host that would ask for a password fails instead of
 *   waiting for a terminal nobody can see.
 * - `ControlMaster=no` and `ControlPath=none`, so the forward belongs to this
 *   process: a shared connection would keep the port listening after the app
 *   that opened it is gone, and the next launch would find its own port taken
 *   by a link to nothing.
 * - `ExitOnForwardFailure=yes`, so ssh exits when the forward cannot be made
 *   rather than sitting there looking connected.
 * - `ConnectTimeout=10` and `ServerAliveInterval=30`, so an unreachable host
 *   is an answer in ten seconds and a dead link is noticed in a minute.
 */
function sshArgs(connection, localPort) {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'ControlMaster=no',
    '-o',
    'ControlPath=none',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ConnectTimeout=10',
    '-o',
    'ServerAliveInterval=30',
    '-N',
    '-L',
    forwardSpec(localPort ?? localPortOf(connection), apiPortOf(connection)),
    String(connection?.sshHost ?? '').trim(),
  ];
}

/**
 * Whether a command line is the forward this app leaves behind.
 *
 * Used to reap an orphan on the next start, and it decides whether a process
 * is killed: it has to be narrow. A command line is ours when it runs ssh and
 * forwards a loopback port with `-L`, and nothing else counts.
 */
function isOurTunnelCommand(command) {
  const line = String(command ?? '');
  return line.includes('ssh') && /-L 127\.0\.0\.1:\d+:/.test(line);
}

/**
 * The pid a tunnel pid file holds, or 0 when it holds nothing usable.
 *
 * The file is read after a crash, so its content is whatever the last write
 * got there: a number is a pid, anything else is not, and a pid that is not a
 * positive integer cannot be a process this app started.
 */
function readTunnelPid(text) {
  const pid = Number.parseInt(String(text ?? '').trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : 0;
}

/** What the pid file holds for a tunnel. */
function formatTunnelPid(pid) {
  return `${Math.trunc(Number(pid))}\n`;
}

module.exports = {
  PORT_ATTEMPTS,
  DEFAULT_API_PORT,
  DEFAULT_LOCAL_PORT,
  testPortFor,
  portAfter,
  forwardSpec,
  apiPortOf,
  localPortOf,
  sshArgs,
  isOurTunnelCommand,
  readTunnelPid,
  formatTunnelPid,
};
