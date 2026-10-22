import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The rules live in a CommonJS module, because the bridge that uses them
// runs in the Electron main process. The test loads it the way Node does.
const require = createRequire(import.meta.url);
const {
  LOCAL,
  SSH,
  MODES,
  normalizeMode,
  resolveMode,
  isConfigured,
  apiBaseUrl,
  apiUrl,
  connectionLabel,
  sshConfigHosts,
} = require('./connection.js');

describe('the two connections', () => {
  it('are the ones there are', () => {
    expect(MODES).toEqual(['local', 'ssh']);
  });
});

describe('the mode the app understands', () => {
  it('is the local one when it is asked for', () => {
    expect(normalizeMode('local')).toBe(LOCAL);
  });

  it('is the tunnel when it is asked for', () => {
    expect(normalizeMode('ssh')).toBe(SSH);
  });

  it('is the tunnel for anything it does not know', () => {
    expect(normalizeMode('telepathy')).toBe(SSH);
    expect(normalizeMode(undefined)).toBe(SSH);
    expect(normalizeMode(null)).toBe(SSH);
  });
});

describe('the mode a record means', () => {
  it('is the one that was written down', () => {
    expect(resolveMode({ mode: 'local' })).toBe(LOCAL);
    expect(resolveMode({ mode: 'ssh' })).toBe(SSH);
  });

  it('is the tunnel for a record written before the modes existed', () => {
    expect(resolveMode({ sshHost: 'hermes-box.local' })).toBe(SSH);
  });

  it('is this Mac for a record that says nothing', () => {
    expect(resolveMode({})).toBe(LOCAL);
    expect(resolveMode({ sshHost: '  ' })).toBe(LOCAL);
    expect(resolveMode(undefined)).toBe(LOCAL);
  });

  it('is the tunnel when a host is there and a mode says otherwise', () => {
    // The mode that was written down is the answer: a person who moved
    // Hermes onto this Mac said so.
    expect(resolveMode({ mode: 'local', sshHost: 'hermes-box.local' })).toBe(
      LOCAL,
    );
  });
});

describe('whether the person has said where Hermes is', () => {
  it('is yes once a mode is written down', () => {
    expect(isConfigured({ mode: 'local' })).toBe(true);
    expect(isConfigured({ mode: 'ssh' })).toBe(true);
  });

  it('is yes for a record written before the modes existed', () => {
    expect(isConfigured({ sshHost: 'hermes-box.local' })).toBe(true);
  });

  it('is no for a record that says nothing', () => {
    expect(isConfigured({})).toBe(false);
    expect(isConfigured({ sshHost: '' })).toBe(false);
    expect(isConfigured({ sshHost: '   ' })).toBe(false);
    expect(isConfigured(undefined)).toBe(false);
  });
});

describe('the address of the Hermes API', () => {
  it('is the port itself when Hermes is on this machine', () => {
    expect(apiBaseUrl(LOCAL, { apiPort: 8642, localPort: 18742 })).toBe(
      'http://127.0.0.1:8642',
    );
  });

  it('is the forwarded port when Hermes is elsewhere', () => {
    expect(apiBaseUrl(SSH, { apiPort: 8642, localPort: 18742 })).toBe(
      'http://127.0.0.1:18742',
    );
  });

  it('is nothing when there is no port to talk to', () => {
    expect(apiBaseUrl(LOCAL, {})).toBe('http://127.0.0.1:undefined');
    expect(apiBaseUrl(SSH, undefined)).toBe('http://127.0.0.1:undefined');
  });
});

describe('a call to the Hermes API', () => {
  it('goes to the primary profile when there is none', () => {
    expect(apiUrl('http://127.0.0.1:8642', '', '/api/sessions')).toBe(
      'http://127.0.0.1:8642/api/sessions',
    );
  });

  it('goes under the profile it is about', () => {
    expect(apiUrl('http://127.0.0.1:8642', 'nova', '/api/sessions')).toBe(
      'http://127.0.0.1:8642/p/nova/api/sessions',
    );
  });

  it('keeps a profile name that needs escaping readable', () => {
    expect(apiUrl('http://127.0.0.1:8642', 'a b', '/api/sessions')).toBe(
      'http://127.0.0.1:8642/p/a%20b/api/sessions',
    );
  });
});

describe('what the person is told about where Hermes is', () => {
  it('is the machine they are on', () => {
    expect(connectionLabel(LOCAL, 'hermes-box.local')).toBe('This Mac');
  });

  it('is the machine they chose', () => {
    expect(connectionLabel(SSH, 'hermes-box.local')).toBe('hermes-box.local');
  });

  it('is nothing when the host was never said', () => {
    expect(connectionLabel(SSH, '')).toBe('');
    expect(connectionLabel(SSH, undefined)).toBe('');
  });
});

describe('the hosts an SSH config knows', () => {
  it('are the ones it names', () => {
    expect(sshConfigHosts('Host jetson\nHostname 192.168.1.4\n')).toEqual([
      'jetson',
    ]);
  });

  it('are all the names one Host line carries', () => {
    expect(sshConfigHosts('Host jetson lab\n')).toEqual(['jetson', 'lab']);
  });

  it('are named without regard to the case of the word Host', () => {
    expect(sshConfigHosts('host jetson\nHOST lab\n')).toEqual([
      'jetson',
      'lab',
    ]);
  });

  it('are not the patterns a config leaves out', () => {
    expect(sshConfigHosts('Host lab !lab-* *\n')).toEqual(['lab']);
    expect(sshConfigHosts('Host 10.* !10.0.*\n')).toEqual([]);
  });

  it('are said once each', () => {
    expect(sshConfigHosts('Host jetson\nHost jetson\n')).toEqual(['jetson']);
  });

  it('are read out of lines the comments do not spoil', () => {
    expect(
      sshConfigHosts('# hermes\nHost jetson # the box\n Host still\ntunnel\n'),
    ).toEqual(['jetson', 'still']);
  });

  it('come from the file the person wrote, carriage returns and all', () => {
    expect(sshConfigHosts('Host jetson\r\nHost lab\r\n')).toEqual([
      'jetson',
      'lab',
    ]);
  });

  it('are nothing when the config says nothing of hosts', () => {
    expect(sshConfigHosts('')).toEqual([]);
    expect(sshConfigHosts(undefined)).toEqual([]);
    expect(sshConfigHosts('Hostname jetson\nMatch all\n')).toEqual([]);
  });
});
