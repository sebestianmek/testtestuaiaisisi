import type {
  AgentClassificationOutput,
  DashboardStats,
  DashboardTab,
  SupportTicket,
  TicketClassification,
} from '../types/support.ts';

/**
 * Parses the raw LLM completion text into a validated AgentClassificationOutput.
 * Handles markdown code fences or surrounding text gracefully.
 */
export function parseAgentClassification(rawContent: string): AgentClassificationOutput {
  const trimmed = rawContent.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model response did not contain a valid JSON object.');
  }

  const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(jsonSlice) as Record<string, unknown>;

  const rawClass = String(parsed.classification ?? '').toUpperCase().trim();
  if (rawClass !== 'IGNORE' && rawClass !== 'REPLY' && rawClass !== 'ESCALATE') {
    throw new Error(`Invalid classification value: "${String(parsed.classification)}"`);
  }

  const classification = rawClass as TicketClassification;
  const reason =
    typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
      ? parsed.reason.trim()
      : `Classified as ${classification}.`;

  if (classification === 'REPLY') {
    const replyBody =
      typeof parsed.replyBody === 'string' ? parsed.replyBody.trim() : '';
    if (!replyBody) {
      throw new Error('REPLY classification requires a non-empty replyBody.');
    }
    return { classification, reason, replyBody };
  }

  if (classification === 'ESCALATE') {
    const bulletsRaw = Array.isArray(parsed.escalationBullets)
      ? parsed.escalationBullets
          .map((item) => String(item).trim().replace(/^[-•*]\s*/, ''))
          .filter(Boolean)
      : [];

    const escalationBullets =
      bulletsRaw.length >= 3
        ? bulletsRaw.slice(0, 3)
        : [
            ...bulletsRaw,
            ...Array.from(
              { length: 3 - bulletsRaw.length },
              (_, idx) =>
                idx === 0
                  ? reason
                  : 'Review customer message details and follow up manually.'
            ),
          ];

    const replyBody =
      typeof parsed.replyBody === 'string' && parsed.replyBody.trim().length > 0
        ? parsed.replyBody.trim()
        : 'Hi! Thank you for contacting Seb AI Support. We have escalated your request to the billing team for review and account verification. We will follow up with you as soon as possible.\n\nBest regards,\nTom - Seb AI Support\nsebaiincsebaiinc@gmail.com\nhttps://sebaioffical.lovable.app';

    return { classification, reason, escalationBullets, replyBody };
  }

  return { classification: 'IGNORE', reason };
}

export const SPAM_RETENTION_MS = 24 * 60 * 60 * 1000;

export function pruneExpiredSpamTickets(
  tickets: SupportTicket[],
  nowMs: number = Date.now()
): SupportTicket[] {
  return tickets.filter((ticket) => {
    if (ticket.classification !== 'IGNORE') return true;
    const timestamp = new Date(ticket.processedAt || ticket.receivedAt).getTime();
    if (Number.isNaN(timestamp)) return true;
    return nowMs - timestamp < SPAM_RETENTION_MS;
  });
}

export function formatSpamTimeRemaining(
  ticket: SupportTicket,
  nowMs: number = Date.now()
): string {
  const baseMs = new Date(ticket.processedAt || ticket.receivedAt).getTime();
  if (Number.isNaN(baseMs)) return '24h';
  const remainingMs = Math.max(0, baseMs + SPAM_RETENTION_MS - nowMs);
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export function computeDashboardStats(tickets: SupportTicket[]): DashboardStats {
  const replied = tickets.filter((t) => t.classification === 'REPLY').length;
  const escalated = tickets.filter((t) => t.classification === 'ESCALATE');
  const escalatedResolved = escalated.filter((t) => t.resolved).length;
  const escalatedOpen = escalated.length - escalatedResolved;
  const ignored = tickets.filter((t) => t.classification === 'IGNORE').length;

  // Main view excludes ignored spam so total reflects actionable support tickets
  const total = replied + escalated.length;
  const replyRatePercent = total > 0 ? Math.round((replied / total) * 100) : 0;

  return {
    total,
    replied,
    escalatedOpen,
    escalatedResolved,
    escalatedTotal: escalated.length,
    ignored,
    replyRatePercent,
  };
}

export function filterTickets(
  tickets: SupportTicket[],
  tab: DashboardTab,
  searchQuery: string
): SupportTicket[] {
  const query = searchQuery.trim().toLowerCase();

  return tickets.filter((ticket) => {
    if (tab === 'all' && ticket.classification === 'IGNORE') return false;
    if (tab === 'replied' && ticket.classification !== 'REPLY') return false;
    if (tab === 'escalated' && ticket.classification !== 'ESCALATE') return false;
    if (tab === 'ignored' && ticket.classification !== 'IGNORE') return false;

    if (!query) return true;

    const haystack = [
      ticket.from,
      ticket.fromName ?? '',
      ticket.subject,
      ticket.body,
      ticket.reason,
      ticket.replyBody ?? '',
      ...(ticket.escalationBullets ?? []),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function formatEscalationEmailText(
  ticket: { from: string; subject: string; body: string; receivedAt: string },
  bullets: string[]
): string {
  const bulletLines = bullets.map((b) => `• ${b}`).join('\n');
  return [
    'Seb AI Support Escalation Notice',
    '================================',
    '',
    '3-Bullet AI Summary (Tom - Seb AI Support):',
    bulletLines,
    '',
    'Original Customer Email:',
    `From: ${ticket.from}`,
    `Subject: ${ticket.subject}`,
    `Received: ${ticket.receivedAt}`,
    '',
    ticket.body,
  ].join('\n');
}
