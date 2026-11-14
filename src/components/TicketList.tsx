import { AlertTriangle, CheckCircle2, Search, ShieldBan, Trash2 } from 'lucide-react';
import type { DashboardTab, SupportTicket } from '../types/support';

interface TicketListProps {
  tickets: SupportTicket[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string) => void;
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onScanInbox: () => void;
  scanning: boolean;
  onClearIgnored?: () => void;
}

const TAB_OPTIONS: Array<{ id: DashboardTab; label: string; ariaLabel: string }> = [
  { id: 'all', label: 'All Incoming', ariaLabel: 'All Incoming Tickets' },
  { id: 'replied', label: 'Replied (Tom)', ariaLabel: 'Successfully Replied (Tom)' },
  { id: 'escalated', label: 'Escalated', ariaLabel: 'Escalated Tickets' },
  { id: 'ignored', label: 'Ignored / Spam', ariaLabel: 'Ignored / Spam' },
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function TicketList({
  tickets,
  selectedTicketId,
  onSelectTicket,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onScanInbox,
  scanning,
  onClearIgnored,
}: TicketListProps) {
  return (
    <div className="bg-[#111827] border border-slate-800/80 rounded-xl flex flex-col min-h-[480px] overflow-hidden">
      {/* Segmented Tab Bar + Search */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <div
          className="flex items-center gap-1 bg-[#0B0F17] p-1 rounded-lg border border-slate-800/70 overflow-x-auto"
          role="tablist"
          aria-label="Ticket status tabs"
        >
          {TAB_OPTIONS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-label={tab.ariaLabel}
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search sender, subject, reply, or escalation summary..."
            aria-label="Search tickets"
            className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {activeTab === 'ignored' && tickets.length > 0 && onClearIgnored && (
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-400 font-mono">
            {tickets.length} filtered spam email{tickets.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onClearIgnored}
            className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Clear Filtered Spam
          </button>
        </div>
      )}

      {/* Ticket Feed */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 space-y-3">
            <p className="text-sm font-medium text-slate-300">
              No tickets match this view yet
            </p>
            <p className="text-xs text-slate-400 max-w-sm">
              Tom automatically scans Gmail every 60 seconds, or click Scan Inbox Now to check immediately.
            </p>
            <button
              type="button"
              onClick={onScanInbox}
              disabled={scanning}
              className="mt-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {scanning ? 'Scanning Inbox...' : 'Scan Inbox Now'}
            </button>
          </div>
        ) : (
          tickets.map((ticket) => {
            const isSelected = ticket.id === selectedTicketId;
            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => onSelectTicket(ticket.id)}
                className={`w-full text-left px-4 py-3.5 transition-colors flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-500/10'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-100 truncate">
                    {ticket.subject}
                  </span>
                  <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                    {formatRelativeTime(ticket.receivedAt)}
                  </span>
                </div>

                <div className="flex items-center gap-x-2 text-xs text-slate-400 overflow-hidden">
                  <span className="text-slate-300 truncate max-w-[165px]">
                    {ticket.fromName || ticket.from}
                  </span>
                  <span aria-hidden="true" className="shrink-0">·</span>
                  {ticket.classification === 'REPLY' && (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium whitespace-nowrap shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Replied
                    </span>
                  )}
                  {ticket.classification === 'ESCALATE' && (
                    <span
                      className={`inline-flex items-center gap-1 font-medium whitespace-nowrap shrink-0 ${
                        ticket.resolved ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {ticket.resolved ? (
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {ticket.resolved ? 'Resolved' : 'Escalated'}
                    </span>
                  )}
                  {ticket.classification === 'IGNORE' && (
                    <span className="inline-flex items-center gap-1 text-slate-400 font-medium whitespace-nowrap shrink-0">
                      <ShieldBan className="w-3.5 h-3.5" aria-hidden="true" />
                      Ignored
                    </span>
                  )}
                  <span aria-hidden="true" className="shrink-0">·</span>
                  <span className="font-mono text-slate-500 truncate">{ticket.modelUsed}</span>
                </div>

                <p className="text-xs text-slate-400 line-clamp-1">{ticket.body}</p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
