import { describe, expect, it } from 'vitest';
import {
  connectorLogo,
  connectorTitle,
  dockConnectors,
  readConnectors,
  type Connector,
} from './connectors';

const LIST = {
  ok: true,
  available: true,
  catalog: [
    {
      slug: 'notion',
      name: 'Notion',
      description: 'Your pages',
      category: 'Documents',
      logo: 'https://logos.composio.dev/api/notion',
    },
    { slug: 'google_maps', name: 'Google Maps', description: '', category: '' },
  ],
  toolkit: [
    { connector: 'notion', enabled: true },
    { connector: 'google_maps', enabled: false },
  ],
  accounts: [
    {
      connector: 'notion',
      status: 'active',
      label: 'jules@acme.com',
      active: true,
    },
  ],
};

describe('the name of a connector', () => {
  it('is what the catalogue says', () => {
    expect(connectorTitle('notion')).toBe('Notion');
  });

  it('is the words of the slug when the catalogue says nothing', () => {
    expect(connectorTitle('google_calendar')).toBe('Google Calendar');
    expect(connectorTitle('linear-mcp')).toBe('Linear MCP');
  });

  it('is nothing when there is no name', () => {
    expect(connectorTitle('')).toBe('');
  });
});

describe('the mark of a connector', () => {
  it('is the logo of the vendor', () => {
    expect(connectorLogo('notion')).toBe(
      'https://logos.composio.dev/api/notion',
    );
  });

  it('is nothing for a name that is not a name', () => {
    expect(connectorLogo('')).toBe('');
    expect(connectorLogo('../evil')).toBe('');
  });
});

describe('the connectors of the host', () => {
  it('are read out of the three lists it answered with', () => {
    const rows = readConnectors(LIST);
    expect(rows.map((row) => row.slug).sort()).toEqual([
      'google_maps',
      'notion',
    ]);
    const notion = rows.find((row) => row.slug === 'notion');
    expect(notion?.name).toBe('Notion');
    expect(notion?.description).toBe('Your pages');
    expect(notion?.state).toBe('connected');
    expect(notion?.account).toBe('jules@acme.com');
  });

  it('say when a service is connected, and to which account', () => {
    const rows = readConnectors(LIST);
    const maps = rows.find((row) => row.slug === 'google_maps');
    expect(maps?.state).toBe('off');
    expect(maps?.enabled).toBe(false);
  });

  it('say when a service may be used and is not connected yet', () => {
    const rows = readConnectors({
      ...LIST,
      toolkit: [{ connector: 'notion', enabled: true }],
      accounts: [],
    });
    expect(rows.find((row) => row.slug === 'notion')?.state).toBe('available');
  });

  it('say when an account is there and broken', () => {
    const rows = readConnectors({
      ...LIST,
      accounts: [
        { connector: 'notion', status: 'expired', label: 'jules@acme.com' },
      ],
    });
    expect(rows.find((row) => row.slug === 'notion')?.state).toBe('broken');
  });

  it('say when an account is there and waiting, or turned off', () => {
    const waiting = readConnectors({
      ...LIST,
      accounts: [{ connector: 'notion', status: 'pending', label: 'jules@acme' }],
    });
    expect(waiting.find((row) => row.slug === 'notion')?.state).toBe('unknown');
    const idle = readConnectors({
      ...LIST,
      accounts: [{ connector: 'notion', status: 'inactive', label: 'jules@acme' }],
    });
    expect(idle.find((row) => row.slug === 'notion')?.state).toBe('off');
  });

  it('say a service is connected when the account does not say otherwise', () => {
    const rows = readConnectors({
      ...LIST,
      accounts: [{ connector: 'notion', status: 'something-new', label: 'x' }],
    });
    expect(rows.find((row) => row.slug === 'notion')?.state).toBe('connected');
  });

  it('say nothing is known about a service the host did not mention', () => {
    const rows = readConnectors({
      ...LIST,
      catalog: [],
      toolkit: [],
      accounts: [],
    });
    expect(rows).toEqual([]);
    const one = readConnectors({
      ...LIST,
      catalog: [{ slug: 'notion' }],
      toolkit: [],
      accounts: [],
    });
    expect(one.find((row) => row.slug === 'notion')?.state).toBe('unknown');
  });

  it('take the logo of the catalogue, or the one of the vendor', () => {
    const rows = readConnectors(LIST);
    expect(rows.find((row) => row.slug === 'notion')?.logo).toContain('notion');
    expect(rows.find((row) => row.slug === 'google_maps')?.logo).toContain(
      'google_maps',
    );
  });

  it('are nothing when the host said nothing', () => {
    expect(readConnectors({ ...LIST, catalog: [], toolkit: [], accounts: [] })).toEqual(
      [],
    );
    expect(
      readConnectors({
        ...LIST,
        catalog: undefined,
        toolkit: undefined,
        accounts: undefined,
      } as never),
    ).toEqual([]);
  });
});

describe('the dock of the connectors', () => {
  const rows: Connector[] = [
    {
      slug: 'a',
      name: 'A',
      description: '',
      category: '',
      logo: '',
      state: 'available',
      enabled: true,
      account: '',
    },
    {
      slug: 'b',
      name: 'B',
      description: '',
      category: '',
      logo: '',
      state: 'connected',
      enabled: true,
      account: '',
    },
    {
      slug: 'c',
      name: 'C',
      description: '',
      category: '',
      logo: '',
      state: 'connected',
      enabled: true,
      account: '',
    },
  ];

  it('shows the connected ones first', () => {
    expect(dockConnectors(rows).map((row) => row.slug)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('shows no more than it has room for', () => {
    expect(dockConnectors(rows, 2)).toHaveLength(2);
    expect(dockConnectors(rows, 0)).toHaveLength(0);
  });

  it('is empty when the host offers nothing', () => {
    expect(dockConnectors([])).toEqual([]);
  });
});
