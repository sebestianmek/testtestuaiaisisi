import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Menu,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { KnowledgeBaseModal } from './components/KnowledgeBaseModal';
import { MetricCards } from './components/MetricCards';
import { SetupModal } from './components/SetupModal';
import { Sidebar } from './components/Sidebar';
import { TicketDetail } from './components/TicketDetail';
import { TicketList } from './components/TicketList';
import { DEFAULT_SUPPORT_CONFIG } from './lib/sebaiKnowledge';
import { computeDashboardStats, filterTickets } from './lib/ticketLogic';
import type {
  DashboardTab,
  PollerStatus,
  SupportConfig,
  SupportTicket,
} from './types/support';

const LOCAL_CONFIG_KEY = 'seb_ai_support_config_v1';

const TAB_TITLES: Record<DashboardTab, string> = {
  all: 'All Incoming Tickets',
  replied: 'Successfully Replied (Tom)',
  escalated: 'Escalated Tickets',
  ignored: 'Ignored / Spam',
};

export default function App() {
  const [config, setConfig] = useState<SupportConfig>(DEFAULT_SUPPORT_CONFIG);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [status, setStatus] = useState<PollerStatus>({
    autoPollEnabled: true,
    isScanning: false,
    lastScanAt: null,
    lastScanResult: null,
    lastScanError: null,
    gmailConfigured: false,
    aiConfigured: false,
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = (await res.json()) as {
        config: SupportConfig;
        tickets: SupportTicket[];
        status: PollerStatus;
      };

      // If browser has locally saved credentials and server store doesn't yet, sync once
      let mergedConfig = data.config;
      const savedRaw = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (savedRaw) {
        try {
          const localCfg = JSON.parse(savedRaw) as Partial<SupportConfig>;
          const serverNeedsCreds = !data.config.apiKey && !data.config.gmailAppPassword;
          const localHasCreds = Boolean(localCfg.apiKey || localCfg.gmailAppPassword);
          if (serverNeedsCreds && localHasCreds) {
            mergedConfig = { ...data.config, ...localCfg };
            await fetch('/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mergedConfig),
            });
          }
        } catch {
          // Ignore malformed local storage
        }
      }

      setConfig(mergedConfig);
      setTickets(data.tickets);
      setStatus(data.status);
      setSelectedTicketId((prev) =>
        prev && data.tickets.some((t) => t.id === prev)
          ? prev
          : data.tickets[0]?.id ?? null
      );
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load dashboard state.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  // Periodically refresh state from server every 15s to show new auto-scanned tickets
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchState();
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchState]);

  const stats = useMemo(() => computeDashboardStats(tickets), [tickets]);

  const filteredTickets = useMemo(
    () => filterTickets(tickets, activeTab, searchQuery),
    [tickets, activeTab, searchQuery]
  );

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? filteredTickets[0] ?? null,
    [tickets, selectedTicketId, filteredTickets]
  );

  const handleSaveConfig = async (nextConfig: SupportConfig) => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig),
    });
    const data = (await res.json()) as {
      config?: SupportConfig;
      status?: PollerStatus;
      error?: string;
    };
    if (!res.ok || !data.config) {
      throw new Error(data.error || 'Failed to save configuration.');
    }
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(data.config));
    setConfig(data.config);
    if (data.status) setStatus(data.status);
    setBanner({
      type: 'success',
      text: 'Configuration saved. Automatic 60-second Gmail scanning is active.',
    });
  };

  const handleScanNow = async () => {
    setScanning(true);
    setBanner(null);
    try {
      const res = await fetch('/api/gmail/scan', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        summary?: string;
        error?: string;
        tickets?: SupportTicket[];
        status?: PollerStatus;
        newTickets?: SupportTicket[];
      };
      if (data.status) setStatus(data.status);
      if (!res.ok || !data.ok) {
        setBanner({
          type: 'error',
          text: data.error || 'Inbox scan failed.',
        });
        return;
      }
      if (data.tickets) {
        setTickets(data.tickets);
        if (data.newTickets && data.newTickets.length > 0) {
          setSelectedTicketId(data.newTickets[0].id);
        }
      }
      setBanner({
        type: 'success',
        text: data.summary || 'Inbox scan completed.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Network error during Gmail scan.',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleResolve = async (id: string) => {
    setBusyTicketId(id);
    try {
      const res = await fetch(`/api/tickets/${id}/resolve`, { method: 'POST' });
      const data = (await res.json()) as { tickets?: SupportTicket[]; error?: string };
      if (!res.ok || !data.tickets) throw new Error(data.error || 'Failed to resolve ticket.');
      setTickets(data.tickets);
      setBanner({ type: 'success', text: 'Escalated ticket marked as resolved.' });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to resolve ticket.',
      });
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleReopen = async (id: string) => {
    setBusyTicketId(id);
    try {
      const res = await fetch(`/api/tickets/${id}/reopen`, { method: 'POST' });
      const data = (await res.json()) as { tickets?: SupportTicket[]; error?: string };
      if (!res.ok || !data.tickets) throw new Error(data.error || 'Failed to reopen ticket.');
      setTickets(data.tickets);
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reopen ticket.',
      });
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleSendEmail = async (id: string) => {
    setBusyTicketId(id);
    try {
      const res = await fetch(`/api/tickets/${id}/send-email`, { method: 'POST' });
      const data = (await res.json()) as { tickets?: SupportTicket[]; error?: string };
      if (!res.ok || !data.tickets) throw new Error(data.error || 'Failed to send email.');
      setTickets(data.tickets);
      setBanner({ type: 'success', text: 'Email sent via Gmail SMTP.' });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send email.',
      });
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyTicketId(id);
    try {
      const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { tickets?: SupportTicket[]; error?: string };
      if (!res.ok || !data.tickets) throw new Error(data.error || 'Failed to delete ticket.');
      setTickets(data.tickets);
      if (selectedTicketId === id) {
        setSelectedTicketId(data.tickets[0]?.id ?? null);
      }
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete ticket.',
      });
    } finally {
      setBusyTicketId(null);
    }
  };

  const handleClearIgnored = async () => {
    try {
      const res = await fetch('/api/tickets/clear-ignored', { method: 'POST' });
      const data = (await res.json()) as { tickets?: SupportTicket[]; error?: string };
      if (!res.ok || !data.tickets) {
        throw new Error(data.error || 'Failed to clear ignored spam tickets.');
      }
      setTickets(data.tickets);
      setSelectedTicketId(data.tickets[0]?.id ?? null);
      setBanner({
        type: 'success',
        text: 'Filtered spam cleared from dashboard. Message IDs remain saved to prevent re-fetching.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to clear ignored tickets.',
      });
    }
  };

  return (
    <div className="min-h-screen h-screen flex bg-[#0B0F17] text-slate-100 overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        stats={stats}
        status={status}
        gmailEmail={config.gmailEmail}
        modelName={config.model}
        onOpenSetup={() => setSetupOpen(true)}
        onOpenKnowledgeBase={() => setKbOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-800/80 bg-[#0F1521]/80 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-semibold text-slate-100 truncate">
              {TAB_TITLES[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleScanNow}
              disabled={scanning}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {scanning ? 'Scanning...' : 'Scan Inbox Now'}
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Workspace Operations Toolbar */}
          <div className="bg-[#111827] border border-slate-800/80 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="text-slate-200 font-medium">{config.senderName}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span>
                Escalations → <span className="font-mono text-slate-300">{config.escalationEmail}</span>
              </span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="text-emerald-400 font-medium">Auto-scan: Every 60s</span>
              {status.lastScanAt && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline">·</span>
                  <span className="font-mono tabular-nums">
                    Last scan: {new Date(status.lastScanAt).toLocaleTimeString()}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0B0F17] border border-slate-800 hover:border-indigo-500/40 text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {!status.gmailConfigured || !status.aiConfigured ? 'Configure Credentials' : 'Settings'}
              </button>
            </div>
          </div>

          {/* Setup Prompt Callout if Credentials Missing */}
          {(!status.gmailConfigured || !status.aiConfigured) && !loading && (
            <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-indigo-200">
                <strong className="font-semibold">Finish live setup:</strong> Add your Seb AI API key and Google App Password for{' '}
                <span className="font-mono">{config.gmailEmail}</span> to enable automated Gmail triage.
              </div>
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                Enter App Password & API Key
              </button>
            </div>
          )}

          {/* Action Feedback Banner */}
          {banner && (
            <div
              role="status"
              className={`rounded-xl px-4 py-3 text-xs border flex items-center justify-between gap-3 ${
                banner.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : banner.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-200'
              }`}
            >
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-current opacity-70 hover:opacity-100 font-medium"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 4 Metric Cards */}
          <MetricCards stats={stats} />

          {/* Ticket Feed & Detail Inspector */}
          {loading ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <div className="xl:col-span-5 bg-[#111827] border border-slate-800/80 rounded-xl h-[480px] animate-pulse" />
              <div className="xl:col-span-7 bg-[#111827] border border-slate-800/80 rounded-xl h-[480px] animate-pulse" />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
              <div className="xl:col-span-5">
                <TicketList
                  tickets={filteredTickets}
                  selectedTicketId={selectedTicket?.id ?? null}
                  onSelectTicket={setSelectedTicketId}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onScanInbox={handleScanNow}
                  scanning={scanning}
                  onClearIgnored={handleClearIgnored}
                />
              </div>

              <div className="xl:col-span-7">
                <TicketDetail
                  ticket={selectedTicket}
                  escalationEmail={config.escalationEmail}
                  gmailConfigured={status.gmailConfigured}
                  onResolve={handleResolve}
                  onReopen={handleReopen}
                  onSendEmail={handleSendEmail}
                  onDelete={handleDelete}
                  busyId={busyTicketId}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <SetupModal
        open={setupOpen}
        config={config}
        onClose={() => setSetupOpen(false)}
        onSave={handleSaveConfig}
      />

      <KnowledgeBaseModal open={kbOpen} onClose={() => setKbOpen(false)} />
    </div>
  );
}
