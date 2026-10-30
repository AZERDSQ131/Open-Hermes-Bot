/**
 * What a finished turn is worth saying out loud.
 *
 * The bridge decides when a notification is shown, and that decision is a rule
 * of the app, not a detail of Electron: it is kept here, away from the window
 * and the system, so it can be exercised without either.
 */

/** The one line a notification shows: the answer, on a single line. */
function notificationBody(text, limit = 160) {
  const body = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (body.length <= limit) return body;
  return `${body.slice(0, Math.max(0, limit - 3))}...`;
}

/**
 * Whether this turn, seen from this window, deserves a notification.
 *
 * A turn that failed says nothing: the window already carries the reason, and
 * a notification would pull the person back to a conversation they left on
 * purpose. A window that is in front says nothing either - the answer is on
 * the screen - but a minimised one does, because nothing of it is visible.
 */
function shouldAnnounce(result, view) {
  if (!result?.ok) return false;
  if (!String(result.text ?? '').trim()) return false;
  if (!view?.supported) return false;
  if (view.focused && !view.minimized) return false;
  return true;
}

module.exports = {
  notificationBody,
  shouldAnnounce,
};
