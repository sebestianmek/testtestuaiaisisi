import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Inbox,
  Settings,
  ShieldBan,
  X,
} from 'lucide-react';
import type { DashboardStats, DashboardTab, PollerStatus } from '../types/support';
import { SebAiMark } from './SebAiMark';

interface SidebarProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  stats: DashboardStats;
  status: PollerStatus;
  gmailEmail: string;
  modelName: string;
  onOpenSetup: () => void;
  onOpenKnowledgeBase: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  stats,
  status,
  gmailEmail,
  modelName,
  onOpenSetup,
  onOpenKnowledgeBase,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: Array<{
    id: DashboardTab;
    label: string;
    count: number;
    icon: typeof Inbox;
  }> = [
    { id: 'all', label: 'All Incoming Tickets', count: stats.total, icon: Inbox },
    { id: 'replied', label: 'Successfully Replied (Tom)', count: stats.replied, icon: CheckCircle2 },
    { id: 'escalated', label: 'Escalated Tickets', count: stats.escalatedTotal, icon: AlertTriangle },
    { id: 'ignored', label: 'Spam', count: stats.ignored, icon: ShieldBan },
  ];

  const content = (
    <div className="flex flex-col h-full bg-[#0F1521] border-r border-slate-800/80 w-[276px] shrink-0">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <SebAiMark size={30} />
          <div className="min-w-0">
            <div className="font-display font-semibold text-sm text-slate-100 truncate">
              Seb AI Support
            </div>
            <div className="text-xs text-slate-400 truncate">Tom Support Desk</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-slate-100 rounded-md"
          aria-label="Close navigation menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-4 flex-1 overflow-y-auto">
        <div className="px-2.5 pb-2 text-xs font-medium text-slate-400">
          Ticket Queues
        </div>
        <nav className="space-y-1" aria-label="Ticket views">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-indigo-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="whitespace-nowrap truncate">{item.label}</span>
                </span>
                <span
                  className={`font-mono text-xs tabular-nums shrink-0 ${
                    active ? 'text-indigo-300' : 'text-slate-500'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-1">
          <div className="px-2.5 pb-2 text-xs font-medium text-slate-400">
            Agent & Docs
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenKnowledgeBase();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition-colors text-left"
          >
            <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">Seb AI Knowledge Base</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenSetup();
              onCloseMobile();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 transition-colors text-left"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">Setup & Configuration</span>
          </button>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800/80 bg-[#0B0F17]/60 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">Inbox</span>
          <span className="text-slate-200 font-mono truncate max-w-[180px]" title={gmailEmail}>
            {gmailEmail || 'Not set'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Model</span>
          <span className="text-slate-200 font-mono truncate max-w-[155px]" title={modelName}>
            {modelName}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Gmail App Pass</span>
          <span className={status.gmailConfigured ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
            {status.gmailConfigured ? 'Saved' : 'Needed'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Seb AI Key</span>
          <span className={status.aiConfigured ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
            {status.aiConfigured ? 'Saved' : 'Needed'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-full shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
