import { AlertTriangle, CheckCircle2, Inbox, ShieldBan } from 'lucide-react';
import type { DashboardStats } from '../types/support';

interface MetricCardsProps {
  stats: DashboardStats;
}

export function MetricCards({ stats }: MetricCardsProps) {
  const cards = [
    {
      label: 'Total Incoming',
      value: stats.total,
      detail: `${stats.replyRatePercent}% auto-replied`,
      icon: Inbox,
      accent: 'text-slate-200',
      iconColor: 'text-indigo-400',
    },
    {
      label: 'Replied by Tom',
      value: stats.replied,
      detail: 'Direct KB answers sent',
      icon: CheckCircle2,
      accent: 'text-emerald-400',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Escalated Queue',
      value: stats.escalatedOpen,
      detail: `${stats.escalatedResolved} resolved · ${stats.escalatedTotal} total`,
      icon: AlertTriangle,
      accent: stats.escalatedOpen > 0 ? 'text-amber-400' : 'text-slate-200',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Spam',
      value: stats.ignored,
      detail: 'Auto-purged in 24h',
      icon: ShieldBan,
      accent: 'text-slate-300',
      iconColor: 'text-slate-400',
    },
  ];

  return (
    <section aria-label="Support metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-[#111827] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">{card.label}</span>
              <Icon className={`w-4 h-4 ${card.iconColor}`} aria-hidden="true" />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`font-display text-2xl font-semibold tabular-nums ${card.accent}`}>
                {card.value}
              </span>
              <span className="text-xs text-slate-400 tabular-nums truncate">{card.detail}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
