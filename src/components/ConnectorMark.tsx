import { useEffect, useState } from 'react';
import type { Connector } from '../connectors';

/**
 * The mark of a connector.
 *
 * The logos live on the vendor's own service, and the shell is the one that
 * asks for them: the window touches no network of its own, so the picture
 * arrives the way a file does. When it does not come, the first letter of
 * the name stands in — a tile with nothing in it says nothing.
 */
export function ConnectorMark({
  row,
  className,
}: {
  row: Connector;
  /** The tile this mark belongs to: the dock's or the capabilities'. */
  className: string;
}) {
  const [logo, setLogo] = useState('');
  const address = row.logo;

  useEffect(() => {
    const bridge = window.hermes;
    if (!bridge?.connectorLogo || !address) return;
    let cancelled = false;
    bridge
      .connectorLogo({ url: address })
      .then((answer) => {
        if (cancelled) return;
        if (answer?.ok && answer.logo) setLogo(answer.logo);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [address]);

  const letter = row.name.slice(0, 1).toUpperCase() || '?';
  if (!logo) {
    return (
      <span className={`${className} is-letter`} aria-hidden="true">
        {letter}
      </span>
    );
  }
  return (
    <span className={className} aria-hidden="true">
      <img src={logo} alt="" />
    </span>
  );
}
