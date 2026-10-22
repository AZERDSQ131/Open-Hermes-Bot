import { useEffect, useState } from 'react';
import type { Connector } from '../connectors';
import {
  GoogleCalendarIcon,
  GoogleDriveIcon,
  NotionIcon,
} from './Icons';

/** The real brand mark for a known service, by slug. Unknown slugs fall
 * through to the letter stand-in. */
function brandFor(slug: string) {
  const leaf = String(slug ?? '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (leaf === 'notion') return NotionIcon;
  if (leaf === 'googledrive' || leaf === 'drive') return GoogleDriveIcon;
  if (leaf === 'googlecalendar' || leaf === 'calendar' || leaf === 'gcal') {
    return GoogleCalendarIcon;
  }
  return null;
}

/**
 * The mark of a connector.
 *
 * The logos live on the vendor's own service, and the shell is the one that
 * asks for them: the window touches no network of its own, so the picture
 * arrives the way a file does. The known services draw their real brand mark
 * from the app itself; only an unknown service with no picture falls back on
 * the first letter of its name.
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
    const Brand = brandFor(row.slug);
    if (Brand) {
      return (
        <span className={className} aria-hidden="true">
          <Brand size={24} />
        </span>
      );
    }
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
