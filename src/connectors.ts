// The connectors: the services a bot can reach besides Hermes itself.
//
// They live on the host, behind the managed gateway: the app asks the host
// for them and draws what it finds. The rules of that reading are here,
// apart from the interface, so they are covered to the line.
//
// Nothing about a connector is kept by the app. What it knows is its name,
// its mark and where it stands — and it learns it again every time it asks.

import type {
  HermesConnectorAccount,
  HermesConnectorCatalog,
  HermesConnectorList,
  HermesConnectorToolkit,
} from './hermes';

/** Where a connector stands. */
export type ConnectorState =
  /** The service is connected: an account is there. */
  | 'connected'
  /** The service may be used, and is not connected yet. */
  | 'available'
  /** The account is there, and it is broken. */
  | 'broken'
  /** The service may not be used: it is turned off. */
  | 'off'
  /** The host did not say. */
  | 'unknown';

/** One connector, as the page draws it. */
export type Connector = {
  /** What the service is called in the API. */
  slug: string;
  /** What the person reads. */
  name: string;
  /** What the service says it does. */
  description: string;
  /** The family the service belongs to. */
  category: string;
  /** Where its mark is. */
  logo: string;
  /** Where it stands. */
  state: ConnectorState;
  /** Whether the account may use it. */
  enabled: boolean;
  /** The account that is connected, when there is one. */
  account: string;
};

/**
 * The name a person reads, when the catalogue does not give one.
 *
 * The same rule the Hermes desktop uses: a slug becomes words, and MCP is
 * an acronym rather than a word.
 */
export function connectorTitle(slug: string): string {
  const leaf = String(slug ?? '').trim();
  if (!leaf) return '';
  return leaf
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bMcp\b/g, 'MCP');
}

/**
 * Where the mark of a service is.
 *
 * The logos live on one service of the connector vendor, and the address is
 * built from the slug — the same address the Hermes desktop draws.
 */
export function connectorLogo(slug: string): string {
  const leaf = String(slug ?? '').trim();
  if (!/^[a-z0-9_-]+$/i.test(leaf)) return '';
  return `https://logos.composio.dev/api/${leaf}`;
}

/** The account of a service that is connected, when there is one. */
function keyOf(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function accountOf(
  accounts: HermesConnectorAccount[],
  slug: string,
): HermesConnectorAccount | undefined {
  // The newest active account is the one the service executes with: it wins
  // over an account that is still there but no longer used. Slugs are matched
  // without regard to case: the catalogue, the toolkit and the accounts do
  // not always spell them the same way.
  const want = keyOf(slug);
  const mine = accounts.filter(
    (account) => keyOf(account.connector) === want,
  );
  return (
    mine.find((account) => account.active) ??
    mine[mine.length - 1] ??
    undefined
  );
}

/** Where a connector stands, given what the host said about it. */
function stateOf(
  toolkit: HermesConnectorToolkit | undefined,
  account: HermesConnectorAccount | undefined,
): ConnectorState {
  if (account) {
    const status = String(account.status ?? '').toLowerCase();
    if (status === 'active') return 'connected';
    if (status === 'pending') return 'unknown';
    if (status === 'expired' || status === 'revoked' || status === 'failed') {
      return 'broken';
    }
    if (status === 'inactive') return 'off';
    return 'connected';
  }
  if (toolkit) {
    // The toolkit knows whether the service is connected even when the
    // accounts list is empty: without it a connected service reads as merely
    // available and the page says "None connected" while the host is up.
    if (toolkit.connected === true) return 'connected';
    const status = String(toolkit.status ?? '')
      .trim()
      .toLowerCase();
    if (
      status === 'active' ||
      status === 'connected' ||
      status === 'enabled' ||
      status === 'ok' ||
      status === 'ready'
    ) {
      return 'connected';
    }
    if (
      status === 'expired' ||
      status === 'revoked' ||
      status === 'failed' ||
      status === 'error' ||
      status === 'broken'
    ) {
      return 'broken';
    }
    if (toolkit.enabled === false) return 'off';
    return 'available';
  }
  return 'unknown';
}

/**
 * The connectors of the host, read out of the three lists it answered with.
 *
 * The catalogue says what a service is called, the toolkit says which ones
 * the account may use, and the accounts say which ones are connected. A
 * service that is in none of them is not offered: it is not there.
 */
export function readConnectors(list: HermesConnectorList): Connector[] {
  const catalog = Array.isArray(list?.catalog) ? list.catalog : [];
  const toolkit = Array.isArray(list?.toolkit) ? list.toolkit : [];
  const accounts = Array.isArray(list?.accounts) ? list.accounts : [];

  const slugs = new Set<string>();
  for (const entry of catalog) slugs.add(String(entry?.slug ?? ''));
  for (const entry of toolkit) slugs.add(String(entry?.connector ?? ''));
  for (const entry of accounts) slugs.add(String(entry?.connector ?? ''));

  const rows: Connector[] = [];
  for (const slug of slugs) {
    if (!slug) continue;
    const described: HermesConnectorCatalog | undefined = catalog.find(
      (entry) => String(entry?.slug ?? '') === slug,
    );
    const known: HermesConnectorToolkit | undefined = toolkit.find(
      (entry) => String(entry?.connector ?? '') === slug,
    );
    const account = accountOf(accounts, slug);
    rows.push({
      slug,
      name: String(described?.name ?? '') || connectorTitle(slug),
      description: String(described?.description ?? ''),
      category: String(described?.category ?? ''),
      logo: String(described?.logo ?? '') || connectorLogo(slug),
      state: stateOf(known, account),
      enabled: known?.enabled !== false,
      account: String(account?.label ?? ''),
    });
  }
  return rows;
}

/**
 * The rows the dock shows, in the order the dock shows them.
 *
 * The connected ones first: they are the ones the person uses. Then the
 * ones that may be used, so the dock is never empty while there is
 * something to connect.
 */
export function dockConnectors(rows: Connector[], limit = 4): Connector[] {
  const connected = rows.filter((row) => row.state === 'connected');
  const rest = rows.filter((row) => row.state !== 'connected');
  return [...connected, ...rest].slice(0, Math.max(0, limit));
}
