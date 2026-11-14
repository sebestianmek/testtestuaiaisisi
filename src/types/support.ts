export type TicketClassification = 'IGNORE' | 'REPLY' | 'ESCALATE';

export type TicketSource = 'gmail';

export type DashboardTab = 'all' | 'replied' | 'escalated' | 'ignored';

export interface SupportConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  gmailEmail: string;
  gmailAppPassword: string;
  escalationEmail: string;
  senderName: string;
  autoPollEnabled: boolean;
  pollIntervalSeconds: number;
}

export interface SupportTicket {
  id: string;
  messageId?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt: string;
  processedAt: string;
  classification: TicketClassification;
  reason: string;
  replyBody?: string;
  escalationBullets?: string[];
  escalationSentTo?: string;
  emailSent: boolean;
  emailError?: string;
  resolved: boolean;
  resolvedAt?: string;
  source: TicketSource;
  modelUsed: string;
  inferenceMode: 'live-api';
}

export interface DashboardStats {
  total: number;
  replied: number;
  escalatedOpen: number;
  escalatedResolved: number;
  escalatedTotal: number;
  ignored: number;
  replyRatePercent: number;
}

export interface PollerStatus {
  autoPollEnabled: boolean;
  isScanning: boolean;
  lastScanAt: string | null;
  lastScanResult: string | null;
  lastScanError: string | null;
  gmailConfigured: boolean;
  aiConfigured: boolean;
}

export interface AgentClassificationOutput {
  classification: TicketClassification;
  reason: string;
  replyBody?: string;
  escalationBullets?: string[];
}
