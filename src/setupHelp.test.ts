import { describe, expect, it } from 'vitest';
import {
  HERMES_ENV,
  describeFailure,
  keyFailureHelp,
  machineLabel,
} from './setupHelp';

describe('the machine that runs Hermes', () => {
  it('is this Mac when Hermes runs here', () => {
    expect(machineLabel('local', '')).toBe('this Mac');
  });

  it('is the host the person named', () => {
    expect(machineLabel('ssh', 'jetson')).toBe('jetson');
  });

  it('is a word when no host was named', () => {
    expect(machineLabel('ssh', '')).toBe('the host');
    expect(machineLabel('ssh')).toBe('the host');
  });
});

describe('no key on this Mac', () => {
  const help = describeFailure({
    kind: 'key',
    reason: 'no-key',
    mode: 'local',
    host: '',
  });

  it('says the API server is off, which is what a missing key means', () => {
    expect(help.title).toBe("Hermes' API server is off.");
    expect(help.lines[0]).toContain('off until ~/.hermes/.env holds a key');
  });

  it('says why a fresh install has none', () => {
    expect(help.lines[0]).toContain('The desktop app Hermes ships with');
  });

  it('asks Hermes to write the key itself, then restarts the gateway', () => {
    expect(help.code).toEqual([
      'hermes config set API_SERVER_KEY "$(openssl rand -hex 32)"',
      'hermes gateway restart',
    ]);
  });

  it('asks for them in a terminal on this machine', () => {
    expect(help.lines[1]).toContain('Run these in a terminal on this Mac');
  });

  it('says where the key ends up', () => {
    expect(help.after).toContain('Keychain');
  });
});

describe('no key on another machine', () => {
  const help = describeFailure({
    kind: 'key',
    reason: 'no-key',
    mode: 'ssh',
    host: 'jetson',
  });

  it('names the host the lines are run on', () => {
    expect(help.lines[1]).toContain('Run these on jetson');
  });

  it('says what the SSH itself has to do first', () => {
    expect(help.lines[1]).toContain('once ssh jetson works in a terminal');
  });
});

describe('no Hermes home on the machine', () => {
  it('says the file is not there yet, without claiming Hermes is missing', () => {
    const help = describeFailure({
      kind: 'key',
      reason: 'no-file',
      mode: 'local',
      host: '',
    });
    expect(help.title).toBe(`There is no ${HERMES_ENV} on this Mac yet.`);
    expect(help.lines[0]).toContain('a fresh install may not have one');
    expect(help.lines.join(' ')).not.toContain('not installed');
  });

  it('asks Hermes to create it, because the CLI creates it', () => {
    const help = describeFailure({
      kind: 'key',
      reason: 'no-file',
      mode: 'local',
      host: '',
    });
    expect(help.code).toEqual([
      'hermes config set API_SERVER_KEY "$(openssl rand -hex 32)"',
      'hermes gateway restart',
    ]);
    expect(help.lines[1]).toContain('The first creates the file');
  });

  it('names the one path the app reads, and the home it does not follow', () => {
    const help = describeFailure({
      kind: 'key',
      reason: 'no-file',
      mode: 'local',
      host: '',
    });
    expect(help.lines[2]).toContain('HERMES_HOME');
  });

  it('asks the host to be the home the app reads, when it is remote', () => {
    const help = describeFailure({
      kind: 'key',
      reason: 'no-file',
      mode: 'ssh',
      host: 'jetson',
    });
    expect(help.title).toBe(`There is no ${HERMES_ENV} on jetson yet.`);
    expect(help.lines[1]).toContain('Run these on jetson');
  });
});

describe('a key Hermes will not take', () => {
  const help = describeFailure({
    kind: 'key',
    reason: 'short-key',
    mode: 'local',
    host: '',
    details: 'API_SERVER_KEY=abc',
  });

  it('says the length is the reason the server never starts', () => {
    expect(help.title).toBe(`The key in ${HERMES_ENV} is too short.`);
    expect(help.lines[0]).toContain('16 characters');
  });

  it('replaces the key through the writer that owns the file', () => {
    expect(help.code?.[0]).toBe(
      'hermes config set API_SERVER_KEY "$(openssl rand -hex 32)"',
    );
  });

  it('restarts the gateway afterwards', () => {
    expect(help.code?.at(-1)).toBe('hermes gateway restart');
  });

  it('keeps the raw words for the Details toggle', () => {
    expect(help.details).toBe('API_SERVER_KEY=abc');
  });
});

describe('a read that did not run', () => {
  it('says so on this Mac, and asks for the file to be readable', () => {
    const help = describeFailure({
      kind: 'key',
      reason: 'unreadable',
      mode: 'local',
      host: '',
    });
    expect(help.title).toBe('The key could not be read on this Mac.');
    expect(help.lines[1]).toContain('the file is readable');
  });

  it('explains what the SSH cannot do, for a host', () => {
    const help = describeFailure({
      kind: 'key',
      reason: 'unreadable',
      mode: 'ssh',
      host: 'jetson',
      details: 'sign_and_send_pubkey: signing failed',
    });
    expect(help.title).toBe('The key could not be read from jetson.');
    expect(help.lines[0]).toContain('without a terminal');
    expect(help.lines[1]).toContain('ssh jetson');
  });

  it('shows the words of the shell behind Details', () => {
    const help = describeFailure({
      kind: 'key',
      reason: 'unreadable',
      mode: 'ssh',
      host: 'jetson',
      details: 'Permission denied (publickey)',
    });
    expect(help.details).toBe('Permission denied (publickey)');
  });
});

describe('a key in hand and nothing on the port', () => {
  it('says the API server is the part that is missing, on this Mac', () => {
    const help = describeFailure({
      kind: 'port',
      mode: 'local',
      host: '',
      port: '8642',
    });
    expect(help.title).toBe(
      'Hermes is here, but its API server is not listening on 127.0.0.1:8642.',
    );
    expect(help.code).toEqual(['hermes gateway restart']);
  });

  it('names the host and the port when Hermes runs elsewhere', () => {
    const help = describeFailure({
      kind: 'port',
      mode: 'ssh',
      host: 'jetson',
      port: '8642',
    });
    expect(help.title).toBe(
      'The API server of jetson is not listening on port 8642.',
    );
    expect(help.lines[1]).toContain('Restart the gateway on jetson');
  });

  it('does not ask for a key that was already read', () => {
    const help = describeFailure({
      kind: 'port',
      mode: 'local',
      host: '',
      port: '8642',
    });
    expect(help.lines.join(' ')).not.toContain('openssl');
  });
});

describe('the help a page shows for a key it could not read', () => {
  it('explains it when the read could say why', () => {
    const help = keyFailureHelp('no-key', 'local', '');
    expect(help?.title).toBe("Hermes' API server is off.");
  });

  it('keeps the plain line when the read could not say why', () => {
    expect(keyFailureHelp(undefined, 'local', '')).toBeNull();
  });

  it('names the host when the key lives on another machine', () => {
    const help = keyFailureHelp('no-file', 'ssh', 'jetson', '');
    expect(help?.title).toBe(`There is no ${HERMES_ENV} on jetson yet.`);
    expect(help?.details).toBe('');
  });
});
