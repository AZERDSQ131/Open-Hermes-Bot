import { useState } from 'react';
import { canAnswer, clarifyAnswer, type ClarifyRequest } from '../clarify';

type Props = {
  clarify: ClarifyRequest;
  /** The bot that asked, when the card sits in a single bot's thread. */
  botName?: string;
  /** Sends the answer; the card stays until the host has taken it. */
  onRespond: (answer: string) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * A question a bot is holding the turn on, right above the composer. It is the
 * same place an approval takes, because it is the same situation: nothing moves
 * on the host until the person answers, and the answer is what the turn wanted.
 *
 * The host may put answers on the table, may ask for free text, or both; the
 * card offers whichever it sent, and never sends an empty one.
 */
export function ClarifyCard({ clarify, botName, onRespond }: Props) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const send = async (value: string) => {
    if (busy || !canAnswer(value)) return;
    setBusy(value);
    setError('');
    const result = await onRespond(clarifyAnswer(value));
    if (!result?.ok) {
      setError(result?.error || 'The host did not take that answer.');
      setBusy('');
    }
  };

  return (
    <section className="clarify-card" aria-label="A question from the bot">
      <div className="clarify-head">
        <span className="clarify-mark" aria-hidden="true">
          ?
        </span>
        <div className="clarify-title">
          <strong>{botName ? `${botName} is asking` : 'The bot is asking'}</strong>
          <span className="clarify-sub">
            The turn is waiting for this answer.
          </span>
        </div>
      </div>

      <p className="clarify-question">{clarify.question}</p>

      {clarify.choices.length ? (
        <div className="clarify-choices">
          {clarify.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              className="clarify-choice"
              disabled={Boolean(busy)}
              onClick={() => send(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="clarify-form"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <input
          className="clarify-input"
          value={draft}
          spellCheck={false}
          placeholder={clarify.choices.length ? 'Or type an answer' : 'Your answer'}
          aria-label="Your answer"
          disabled={Boolean(busy)}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className="clarify-send"
          disabled={!canAnswer(draft) || Boolean(busy)}
        >
          Send
        </button>
      </form>

      {error ? (
        <p className="clarify-error" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
