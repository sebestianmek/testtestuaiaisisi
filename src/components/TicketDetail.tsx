import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RotateCcw,
  Send,
  ShieldBan,
  Trash2,
} from 'lucide-react';
import { formatSpamTimeRemaining } from '../lib/ticketLogic';
import type { SupportTicket } from '../types/support';

interface TicketDetailProps {
  ticket: SupportTicket | null;
  escalationEmail: string;
  gmailConfigured: boolean;
  onResolve: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
  onSendEmail: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  busyId: string | null;
}

export function TicketDetail({
  ticket,
  escalationEmail,
  gmailConfigured,
  onResolve,
  onReopen,
  onSendEmail,
  onDelete,
  busyId,
}: TicketDetailProps) {
  if (!ticket) {
    return (
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[480px]">
        <Mail className="w-8 h-8 text-slate-600 mb-3" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold text-slate-200">
          Select a ticket to inspect
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          View the original incoming email, Tom&apos;s classification reasoning, direct reply, or 3-bullet escalation summary.
        </p>
      </div>
    );
  }

  const isBusy = busyId === ticket.id;

  return (
    <div className="bg-[#111827] border border-slate-800/80 rounded-xl flex flex-col min-h-[480px] overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-800/80 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-slate-100 leading-snug">
              {ticket.subject}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <span className="text-slate-200 font-medium">
                {ticket.fromName ? `${ticket.fromName} <${ticket.from}>` : ticket.from}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {new Date(ticket.receivedAt).toLocaleString()}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{ticket.modelUsed}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDelete(ticket.id)}
            disabled={isBusy}
            aria-label={`Delete ticket ${ticket.subject}`}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/60 rounded-lg transition-colors shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Classification & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs font-medium">
            {ticket.classification === 'REPLY' && (
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                REPLY · {ticket.emailSent ? 'Sent by Tom' : 'Drafted (Not emailed yet)'}
              </span>
            )}
            {ticket.classification === 'ESCALATE' && (
              <span
                className={`inline-flex items-center gap-1.5 ${
                  ticket.resolved ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {ticket.resolved ? (
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                )}
                ESCALATE · {ticket.resolved ? 'Resolved' : `Open (${ticket.escalationSentTo || escalationEmail})`}
              </span>
            )}
            {ticket.classification === 'IGNORE' && (
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <ShieldBan className="w-4 h-4" aria-hidden="true" />
                SPAM · Auto-deleted from system ({formatSpamTimeRemaining(ticket)} · kept in Gmail)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {ticket.classification !== 'IGNORE' && !ticket.emailSent && (
              <button
                type="button"
                onClick={() => onSendEmail(ticket.id)}
                disabled={isBusy || !gmailConfigured}
                title={
                  gmailConfigured
                    ? 'Send this email via Gmail SMTP'
                    : 'Configure Gmail App Password in Setup first'
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                Send via Gmail
              </button>
            )}

            {ticket.classification === 'ESCALATE' && !ticket.resolved && (
              <button
                type="button"
                onClick={() => onResolve(ticket.id)}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                Mark Resolved
              </button>
            )}

            {ticket.classification === 'ESCALATE' && ticket.resolved && (
              <button
                type="button"
                onClick={() => onReopen(ticket.id)}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Reopen
              </button>
            )}
          </div>
        </div>

        {ticket.emailError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            SMTP Delivery Error: {ticket.emailError}
          </div>
        )}
      </div>

      {/* Body Sections */}
      <div className="p-5 space-y-6 overflow-y-auto flex-1">
        {/* AI Reasoning */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 mb-1.5">
            AI Triage Decision
          </h3>
          <p className="text-sm text-slate-200 leading-relaxed">{ticket.reason}</p>
        </div>

        {/* Original Customer Message */}
        <div className="pt-5 border-t border-slate-800/80">
          <h3 className="text-xs font-semibold text-slate-400 mb-2">
            Incoming Customer Message
          </h3>
          <div className="bg-[#0B0F17] border border-slate-800/80 rounded-lg p-4 text-sm text-slate-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
            {ticket.body}
          </div>
        </div>

        {/* Tom's Reply (for REPLY tickets) */}
        {ticket.classification === 'REPLY' && ticket.replyBody && (
          <div className="pt-5 border-t border-slate-800/80">
            <h3 className="text-xs font-semibold text-emerald-400 mb-2">
              Tom - Seb AI Support Reply (Sent to Customer from sebaiincsebaiinc@gmail.com)
            </h3>
            <div className="bg-[#0B0F17] border border-emerald-500/20 rounded-lg p-4 text-sm text-slate-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
              {ticket.replyBody}
            </div>
          </div>
        )}

        {/* Escalation 3-Bullet Summary & Customer Notification (for ESCALATE tickets) */}
        {ticket.classification === 'ESCALATE' && (
          <div className="pt-5 border-t border-slate-800/80 space-y-4">
            {ticket.escalationBullets && (
              <div>
                <h3 className="text-xs font-semibold text-amber-400 mb-2">
                  3-Bullet Escalation Summary (Sent to {ticket.escalationSentTo || escalationEmail})
                </h3>
                <ul className="bg-[#0B0F17] border border-amber-500/20 rounded-lg p-4 space-y-2.5 text-sm text-slate-100">
                  {ticket.escalationBullets.map((bullet, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <span className="font-mono text-xs text-amber-400 mt-0.5 shrink-0">
                        0{index + 1}.
                      </span>
                      <span className="leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ticket.replyBody && (
              <div>
                <h3 className="text-xs font-semibold text-emerald-400 mb-2">
                  Customer Escalation Notification (Sent to Customer from sebaiincsebaiinc@gmail.com)
                </h3>
                <div className="bg-[#0B0F17] border border-emerald-500/20 rounded-lg p-4 text-sm text-slate-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                  {ticket.replyBody}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
