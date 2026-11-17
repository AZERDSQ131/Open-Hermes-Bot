const {
  PORT_ATTEMPTS,
  DEFAULT_API_PORT,
  DEFAULT_LOCAL_PORT,
  apiPortOf,
  formatTunnelPid,
  forwardSpec,
  isOurTunnelCommand,
  localPortOf,
  portAfter,
  readTunnelPid,
  sshArgs,
  testPortFor,
} = require('./tunnel.js');

describe('the local port a probe uses', () => {
  it('takes the next slot after the live tunnel', () => {
    expect(testPortFor(18742)).toBe(18743);
  });

  it('goes down at the top of the range instead of past it', () => {
    expect(testPortFor(65535)).toBe(65534);
    expect(testPortFor(65534)).toBe(65535);
  });
});

describe('the walk to a port that is not held', () => {
  it('starts on the preferred port', () => {
    expect(portAfter(18742, 0)).toBe(18742);
  });

  it('moves up, attempt after attempt', () => {
    expect(portAfter(18742, 1)).toBe(18743);
    expect(portAfter(18742, 4)).toBe(18746);
  });

  it('wraps downwards when the walk would leave the range', () => {
    expect(portAfter(65534, 2)).toBe(65532);
  });

  it('tries five ports before giving up', () => {
    expect(PORT_ATTEMPTS).toBe(5);
  });
});

describe('the forward', () => {
  it('is loopback to loopback', () => {
    expect(forwardSpec(18742, 8642)).toBe('127.0.0.1:18742:127.0.0.1:8642');
  });
});

describe('the ports a connection asks for', () => {
  it('reads what the record says', () => {
    expect(apiPortOf({ apiPort: 9000 })).toBe(9000);
    expect(localPortOf({ localPort: 19000 })).toBe(19000);
  });

  it('falls back to Hermes and the app defaults', () => {
    expect(apiPortOf({})).toBe(DEFAULT_API_PORT);
    expect(localPortOf({})).toBe(DEFAULT_LOCAL_PORT);
    expect(DEFAULT_API_PORT).toBe(8642);
    expect(DEFAULT_LOCAL_PORT).toBe(18742);
  });

  it('refuses a value that cannot be a port', () => {
    expect(apiPortOf({ apiPort: 0 })).toBe(DEFAULT_API_PORT);
    expect(apiPortOf({ apiPort: 70000 })).toBe(DEFAULT_API_PORT);
    expect(apiPortOf({ apiPort: 'abc' })).toBe(DEFAULT_API_PORT);
    expect(apiPortOf(null)).toBe(DEFAULT_API_PORT);
    expect(localPortOf({ localPort: -1 })).toBe(DEFAULT_LOCAL_PORT);
  });
});

describe('the ssh arguments', () => {
  const args = sshArgs(
    { sshHost: 'jetson', apiPort: 8642 },
    18742,
  );

  it('runs a forward and nothing else', () => {
    expect(args).toContain('-N');
    expect(args).toContain('-L');
    expect(args).toContain('127.0.0.1:18742:127.0.0.1:8642');
  });

  it('never waits for a password nobody can type', () => {
    expect(args.join(' ')).toContain('BatchMode=yes');
  });

  it('keeps the forward to this process', () => {
    expect(args.join(' ')).toContain('ControlMaster=no');
    expect(args.join(' ')).toContain('ControlPath=none');
  });

  it('fails when the forward cannot be made, and times out a dead host', () => {
    const line = args.join(' ');
    expect(line).toContain('ExitOnForwardFailure=yes');
    expect(line).toContain('ConnectTimeout=10');
    expect(line).toContain('ServerAliveInterval=30');
  });

  it('names the host last, trimmed', () => {
    expect(args[args.length - 1]).toBe('jetson');
    expect(sshArgs({ sshHost: '  jetson  ' }, 18742).at(-1)).toBe('jetson');
  });

  it('falls back to the default ports when the call names none', () => {
    const line = sshArgs({ sshHost: 'jetson' }).join(' ');
    expect(line).toContain(
      `127.0.0.1:${DEFAULT_LOCAL_PORT}:127.0.0.1:${DEFAULT_API_PORT}`,
    );
  });

  it('asks for no host when the call names none', () => {
    expect(sshArgs({}).at(-1)).toBe('');
    expect(sshArgs(null).at(-1)).toBe('');
  });
});

describe('recognising the forward this app leaves behind', () => {
  it('is ours when ssh forwards a loopback port', () => {
    expect(
      isOurTunnelCommand(
        'ssh -o BatchMode=yes -N -L 127.0.0.1:18742:127.0.0.1:8642 jetson',
      ),
    ).toBe(true);
  });

  it('is not ours when something else is running ssh', () => {
    expect(isOurTunnelCommand('ssh jetson uptime')).toBe(false);
    expect(isOurTunnelCommand('vim notes.txt')).toBe(false);
    expect(isOurTunnelCommand('')).toBe(false);
    expect(isOurTunnelCommand(undefined)).toBe(false);
  });

  it('is not ours when the forward is not a loopback one', () => {
    expect(
      isOurTunnelCommand('ssh -N -L 0.0.0.0:18742:127.0.0.1:8642 jetson'),
    ).toBe(false);
  });
});

describe('the pid file', () => {
  it('reads a pid and its newline', () => {
    expect(readTunnelPid('4242\n')).toBe(4242);
    expect(readTunnelPid('4242')).toBe(4242);
    expect(readTunnelPid('  4242  ')).toBe(4242);
  });

  it('treats anything unusable as no pid at all', () => {
    expect(readTunnelPid('')).toBe(0);
    expect(readTunnelPid(null)).toBe(0);
    expect(readTunnelPid('not a pid')).toBe(0);
    expect(readTunnelPid('0')).toBe(0);
    expect(readTunnelPid('-12')).toBe(0);
  });

  it('writes what it reads', () => {
    expect(formatTunnelPid(4242)).toBe('4242\n');
    expect(readTunnelPid(formatTunnelPid(4242))).toBe(4242);
  });
});
