import { useState } from 'react';
import {
  approvalLabel,
  type ApprovalChoice,
  type ApprovalRequest,
} from '../approvals';

type Props = {
  approval: ApprovalRequest;
  /** The bot that asked, when the card sits in a single bot's thread. */
  botName?: string;
  /** Sends the answer; the card stays until the host has taken it. */
  onRespond: (
    choice: ApprovalChoice,
  ) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * The command a bot is holding, right above the composer: what it would run,
 * why, and the four answers the host offered. It is a question, not a warning
 * banner - it sits where the person is about to type, and it goes away by
 * itself once the host says the request is settled.
 */
export function ApprovalCard({ approval, botName, onRespond }: Props) {
  const [busy, setBusy] = useState<ApprovalChoice | null>(null);
  const [error, setError] = useState('');

  const answer = async (choice: ApprovalChoice) => {
    if (busy) return;
    setBusy(choice);
    setError('');
    const result = await onRespond(choice);
    if (!result?.ok) {
      setError(result?.error || 'The host did not take that answer.');
      setBusy(null);
    }
  };

  return (
    <section className="approval-card" aria-label="Approval needed">
      <div className="approval-head">
        <span className="approval-mark" aria-hidden="true">
          !
        </span>
        <div className="approval-title">
          <strong>
            {botName ? `${botName} needs your approval` : 'Approval needed'}
          </strong>
          <span className="approval-sub">
            {approval.description ||
              'This command can change the machine it runs on.'}
          </span>
        </div>
      </div>

      <pre className="approval-command">
        <span className="approval-prompt" aria-hidden="true">
          $
        </span>
        <code>{approval.command}</code>
      </pre>

      <div className="approval-actions">
        <div className="approval-allows">
          {approval.choices
            .filter((choice) => choice !== 'deny')
            .map((choice) => (
              <button
                key={choice}
                type="button"
                className={`approval-button ${
                  choice === 'once' ? 'is-primary' : ''
                }`}
                disabled={busy !== null}
                onClick={() => void answer(choice)}
              >
                {busy === choice ? 'Sending…' : approvalLabel(choice)}
              </button>
            ))}
        </div>
        {approval.choices.includes('deny') ? (
          <button
            type="button"
            className="approval-button is-deny"
            disabled={busy !== null}
            onClick={() => void answer('deny')}
          >
            {busy === 'deny' ? 'Sending…' : approvalLabel('deny')}
          </button>
        ) : null}
      </div>

      {error ? <p className="approval-error">{error}</p> : null}
    </section>
  );
}
