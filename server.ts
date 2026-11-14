import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { DEFAULT_SUPPORT_CONFIG, buildTomSystemPrompt } from './src/lib/sebaiKnowledge.ts';
import {
  formatEscalationEmailText,
  parseAgentClassification,
} from './src/lib/ticketLogic.ts';
import type {
  AgentClassificationOutput,
  PollerStatus,
  SupportConfig,
  SupportTicket,
} from './src/types/support.ts';

interface PersistedStore {
  config: SupportConfig;
  tickets: SupportTicket[];
  processedMessageIds: string[];
  repliedMessageIds: string[];
  lastScanAt: string | null;
  lastScanResult: string | null;
  lastScanError: string | null;
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'support-store.json');

let store: PersistedStore = {
  config: {
    ...DEFAULT_SUPPORT_CONFIG,
    apiKey: process.env.SEB_AI_API_KEY || DEFAULT_SUPPORT_CONFIG.apiKey,
    gmailAppPassword:
      process.env.GMAIL_APP_PASSWORD || DEFAULT_SUPPORT_CONFIG.gmailAppPassword,
  },
  tickets: [],
  processedMessageIds: [],
  repliedMessageIds: [],
  lastScanAt: null,
  lastScanResult: null,
  lastScanError: null,
};

let isScanning = false;
let pollTimer: NodeJS.Timeout | null = null;

export function getThreadKey(from: string, subject: string): string {
  const cleanFrom = (from || '').toLowerCase().trim();
  const cleanSub = (subject || '')
    .replace(/^(re|fwd|fw):\s*/i, '')
    .replace(/^(re|fwd|fw):\s*/i, '')
    .replace(/^(re|fwd|fw):\s*/i, '')
    .toLowerCase()
    .trim();
  return `${cleanFrom}::${cleanSub}`;
}

async function loadStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedStore>;
    const rawTickets = Array.isArray(parsed.tickets)
      ? parsed.tickets.filter((t) => !t.id.startsWith('seed-'))
      : [];

    // Deduplicate tickets by messageId or from+subject+receivedAt
    const seenKeys = new Set<string>();
    const deduplicatedTickets: SupportTicket[] = [];
    for (const ticket of rawTickets) {
      const key = ticket.messageId || `${ticket.from}::${ticket.subject}::${ticket.receivedAt}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduplicatedTickets.push(ticket);
      }
    }

    const processedSet = new Set<string>(
      Array.isArray(parsed.processedMessageIds)
        ? parsed.processedMessageIds.filter((id) => !id.includes('sebai-demo.local'))
        : []
    );
    for (const t of deduplicatedTickets) {
      if (t.messageId) processedSet.add(t.messageId);
    }

    const repliedSet = new Set<string>(
      Array.isArray(parsed.repliedMessageIds) ? parsed.repliedMessageIds : []
    );
    for (const t of deduplicatedTickets) {
      if (t.emailSent && t.messageId) {
        repliedSet.add(t.messageId);
      }
    }

    store = {
      config: {
        ...DEFAULT_SUPPORT_CONFIG,
        ...(parsed.config ?? {}),
        apiKey:
          parsed.config?.apiKey ||
          process.env.SEB_AI_API_KEY ||
          DEFAULT_SUPPORT_CONFIG.apiKey,
        gmailAppPassword:
          parsed.config?.gmailAppPassword ||
          process.env.GMAIL_APP_PASSWORD ||
          DEFAULT_SUPPORT_CONFIG.gmailAppPassword,
        autoPollEnabled: true,
        pollIntervalSeconds: 60,
      },
      tickets: deduplicatedTickets,
      processedMessageIds: Array.from(processedSet),
      repliedMessageIds: Array.from(repliedSet),
      lastScanAt: parsed.lastScanAt ?? null,
      lastScanResult: parsed.lastScanResult ?? null,
      lastScanError: parsed.lastScanError ?? null,
    };
  } catch (err) {
    console.warn('[Storage] Could not load existing store, verifying file existence:', err);
    try {
      await fs.access(STORE_PATH);
    } catch {
      await saveStore();
    }
  }
}

async function saveStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = `${STORE_PATH}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tempPath, STORE_PATH);
}

function normalizeAppPassword(pw: string): string {
  return pw.replace(/\s+/g, '').trim();
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
}

async function classifyEmailWithSebAI(
  config: SupportConfig,
  from: string,
  subject: string,
  body: string
): Promise<{ output: AgentClassificationOutput; inferenceMode: 'live-api' }> {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new Error(
      'Missing Seb AI API Key. Open Setup & Configuration and enter your SEB_ API key.'
    );
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_SUPPORT_CONFIG.baseUrl);
  const endpoint = `${baseUrl}/chat/completions`;
  const model = config.model.trim() || 'Seb AI S1';

  const systemPrompt = buildTomSystemPrompt(
    config.senderName || 'Tom - Seb AI Support',
    config.escalationEmail || 'yeniljacob@gmail.com'
  );

  const userPrompt = [
    'Classify and handle this incoming support email:',
    `From: ${from}`,
    `Subject: ${subject}`,
    'Body:',
    body.slice(0, 6000),
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Seb AI API returned HTTP ${response.status}: ${errText.slice(0, 240) || response.statusText}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string } | string;
  };

  if (data.error) {
    const msg = typeof data.error === 'string' ? data.error : data.error.message;
    throw new Error(`Seb AI API error: ${msg || 'Unknown error'}`);
  }

  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Seb AI API returned an empty completion choice.');
  }

  return {
    output: parseAgentClassification(rawContent),
    inferenceMode: 'live-api',
  };
}

function createSmtpTransport(config: SupportConfig) {
  const email = config.gmailEmail.trim();
  const appPassword = normalizeAppPassword(config.gmailAppPassword);

  if (!email || !appPassword) {
    throw new Error('Gmail email and Google App Password are required.');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
  });
}

function createImapClient(config: SupportConfig) {
  const email = config.gmailEmail.trim();
  const appPassword = normalizeAppPassword(config.gmailAppPassword);

  if (!email || !appPassword) {
    throw new Error('Gmail email and Google App Password are required.');
  }

  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });
}

async function sendDirectReplyEmail(
  config: SupportConfig,
  to: string,
  originalSubject: string,
  replyBody: string,
  inReplyTo?: string,
  references?: string[]
): Promise<void> {
  const transporter = createSmtpTransport(config);
  const subject = /^re:/i.test(originalSubject)
    ? originalSubject
    : `Re: ${originalSubject}`;

  const refChain =
    references && references.length > 0
      ? Array.from(new Set([...references, ...(inReplyTo ? [inReplyTo] : [])])).join(' ')
      : inReplyTo;

  await transporter.sendMail({
    from: `"${config.senderName || 'Tom - Seb AI Support'}" <${config.gmailEmail.trim()}>`,
    to,
    subject,
    text: replyBody,
    ...(inReplyTo ? { inReplyTo, references: refChain } : {}),
  });
}

async function sendEscalationEmail(
  config: SupportConfig,
  ticket: { from: string; subject: string; body: string; receivedAt: string },
  bullets: string[]
): Promise<void> {
  const transporter = createSmtpTransport(config);
  const target = config.escalationEmail.trim() || 'yeniljacob@gmail.com';
  const text = formatEscalationEmailText(ticket, bullets);

  await transporter.sendMail({
    from: `"${config.senderName || 'Tom - Seb AI Support'}" <${config.gmailEmail.trim()}>`,
    to: target,
    replyTo: ticket.from,
    subject: `[Seb AI Escalation] ${ticket.subject}`,
    text,
  });
}

async function fetchSentHistory(
  client: ImapFlow,
  config: SupportConfig
): Promise<{
  sentInReplyToIds: Set<string>;
  latestSentAtByThread: Map<string, number>;
}> {
  const sentInReplyToIds = new Set<string>();
  const latestSentAtByThread = new Map<string, number>();

  try {
    let sentPath = '[Gmail]/Sent Mail';
    try {
      const boxes = await client.list();
      const sentBox = boxes.find(
        (b) => b.specialUse === '\\Sent' || b.path.toLowerCase().includes('sent')
      );
      if (sentBox?.path) sentPath = sentBox.path;
    } catch {
      // fallback to [Gmail]/Sent Mail
    }

    const sentLock = await client.getMailboxLock(sentPath);
    try {
      const totalSent =
        client.mailbox && typeof client.mailbox === 'object'
          ? client.mailbox.exists
          : 0;
      if (totalSent > 0) {
        const startSent = Math.max(1, totalSent - 49);
        const escalationAddr = config.escalationEmail.trim().toLowerCase();
        for await (const msg of client.fetch(`${startSent}:${totalSent}`, { envelope: true })) {
          const inReplyTo = (msg.envelope?.inReplyTo || '').trim();
          if (inReplyTo) {
            sentInReplyToIds.add(inReplyTo);
          }

          const sentSubject = msg.envelope?.subject || '';
          // Skip internal escalation notices when tracking customer thread reply timestamps
          if (sentSubject.startsWith('[Seb AI Escalation]')) {
            continue;
          }

          const sentDateMs = msg.envelope?.date
            ? new Date(msg.envelope.date).getTime()
            : 0;
          const recipients = Array.isArray(msg.envelope?.to) ? msg.envelope.to : [];
          for (const recipient of recipients) {
            const addr = (recipient?.address || '').trim().toLowerCase();
            if (!addr || addr === escalationAddr) continue;
            const tKey = getThreadKey(addr, sentSubject);
            const prev = latestSentAtByThread.get(tKey) ?? 0;
            if (sentDateMs > prev) {
              latestSentAtByThread.set(tKey, sentDateMs);
            }
          }
        }
      }
    } finally {
      sentLock.release();
    }
  } catch (err) {
    console.warn(
      '[Sent Mail Check] Could not read Sent Mail folder:',
      err instanceof Error ? err.message : err
    );
  }

  return { sentInReplyToIds, latestSentAtByThread };
}

async function runGmailScan(): Promise<{
  scanned: number;
  newTickets: SupportTicket[];
  summary: string;
}> {
  if (isScanning) {
    return { scanned: 0, newTickets: [], summary: 'Scan already in progress.' };
  }

  const config = store.config;
  if (!config.gmailEmail.trim() || !normalizeAppPassword(config.gmailAppPassword)) {
    throw new Error(
      'Gmail App Password is not configured. Open Setup & Configuration and enter your 16-character Google App Password.'
    );
  }
  if (!config.apiKey.trim()) {
    throw new Error(
      'Seb AI API Key is not configured. Open Setup & Configuration and enter your SEB_ API key.'
    );
  }

  isScanning = true;
  store.lastScanError = null;
  const newTickets: SupportTicket[] = [];
  let scannedCount = 0;

  const client = createImapClient(config);

  try {
    await client.connect();

    // Sync Sent Mail across all instances/restarts so Tom never replies twice to the same message or stale thread
    const { sentInReplyToIds, latestSentAtByThread } = await fetchSentHistory(client, config);
    for (const id of sentInReplyToIds) {
      if (!store.repliedMessageIds.includes(id)) {
        store.repliedMessageIds.push(id);
      }
      if (!store.processedMessageIds.includes(id)) {
        store.processedMessageIds.push(id);
      }
    }

    const lock = await client.getMailboxLock('INBOX');

    try {
      const total =
        client.mailbox && typeof client.mailbox === 'object'
          ? client.mailbox.exists
          : 0;
      if (total === 0) {
        return { scanned: 0, newTickets: [], summary: 'INBOX is empty.' };
      }

      // Fetch from the top of the inbox down 20 messages (or all available if < 20)
      const startSeq = Math.max(1, total - 19);
      const endSeq = total;
      const seqRange = `${startSeq}:${endSeq}`;

      interface EnvelopeEntry {
        seq: number;
        uid: number;
        envelope: any;
        flags: Set<string>;
      }

      const headers: EnvelopeEntry[] = [];
      for await (const msg of client.fetch(seqRange, { uid: true, envelope: true, flags: true })) {
        headers.push({
          seq: msg.seq,
          uid: msg.uid,
          envelope: msg.envelope,
          flags: msg.flags || new Set<string>(),
        });
      }

      // Scan from the top of the inbox downwards (newest sequence first)
      headers.sort((a, b) => b.seq - a.seq);

      const ownEmail = config.gmailEmail.trim().toLowerCase();
      const processedLookup = new Set<string>(store.processedMessageIds);
      const repliedLookup = new Set<string>(store.repliedMessageIds);
      const handledThreadsInBatch = new Set<string>();

      for (const item of headers) {
        const rawEnvelopeId = (item.envelope?.messageId || '').trim();
        const fallbackId = `seq-${item.seq}-${item.envelope?.date?.toISOString() ?? ''}-${item.envelope?.subject ?? ''}`;
        const envelopeKey = rawEnvelopeId || fallbackId;
        const senderAddress = (item.envelope?.from?.[0]?.address || '').toLowerCase();
        const envelopeSubject = item.envelope?.subject || '';
        const threadKey = getThreadKey(senderAddress, envelopeSubject);

        // 0. If IMAP already marked this message as \Answered, NEVER reply again
        if (item.flags.has('\\Answered')) {
          processedLookup.add(envelopeKey);
          repliedLookup.add(envelopeKey);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          if (!store.repliedMessageIds.includes(envelopeKey)) {
            store.repliedMessageIds.push(envelopeKey);
          }
          continue;
        }

        // 1. Check if we already sent a reply to this message (local store OR Gmail Sent Mail)
        const alreadyReplied =
          sentInReplyToIds.has(envelopeKey) ||
          (rawEnvelopeId && sentInReplyToIds.has(rawEnvelopeId)) ||
          repliedLookup.has(envelopeKey) ||
          (rawEnvelopeId && repliedLookup.has(rawEnvelopeId)) ||
          store.tickets.some(
            (t) =>
              (t.messageId === envelopeKey || (rawEnvelopeId && t.messageId === rawEnvelopeId)) &&
              t.emailSent
          );

        if (alreadyReplied) {
          processedLookup.add(envelopeKey);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          continue;
        }

        // 2. Check if a newer message in this exact thread was already replied to in this scan batch
        if (handledThreadsInBatch.has(threadKey)) {
          processedLookup.add(envelopeKey);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          continue;
        }

        // 3. Check if Sent Mail OR an earlier scan already replied to this thread AFTER/AT this message's date
        const itemDateMs = item.envelope?.date ? new Date(item.envelope.date).getTime() : 0;
        const latestSentInGmail = latestSentAtByThread.get(threadKey) ?? 0;
        if (latestSentInGmail > 0 && latestSentInGmail >= itemDateMs) {
          processedLookup.add(envelopeKey);
          repliedLookup.add(envelopeKey);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          if (!store.repliedMessageIds.includes(envelopeKey)) {
            store.repliedMessageIds.push(envelopeKey);
          }
          continue;
        }

        const hasNewerSentReplyInThread = store.tickets.some((t) => {
          if (!t.emailSent) return false;
          if (getThreadKey(t.from, t.subject) !== threadKey) return false;
          const tDateMs = new Date(t.receivedAt).getTime();
          return tDateMs >= itemDateMs && t.messageId !== envelopeKey;
        });

        if (hasNewerSentReplyInThread) {
          processedLookup.add(envelopeKey);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          continue;
        }

        // 4. General deduplication: if already processed and not unreplied, skip
        const alreadyProcessed =
          processedLookup.has(envelopeKey) ||
          (rawEnvelopeId && processedLookup.has(rawEnvelopeId)) ||
          store.tickets.some(
            (t) =>
              t.messageId === envelopeKey ||
              (rawEnvelopeId && t.messageId === rawEnvelopeId)
          );

        if (alreadyProcessed) {
          continue;
        }

        if (
          senderAddress === ownEmail ||
          senderAddress.includes('mailer-daemon') ||
          senderAddress.includes('postmaster')
        ) {
          processedLookup.add(envelopeKey);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          continue;
        }

        // Fetch full message body
        const fullMsg = await client.fetchOne(
          item.seq,
          { uid: true, source: true, envelope: true },
          { uid: false }
        );

        if (!fullMsg || !fullMsg.source) {
          processedLookup.add(envelopeKey);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          continue;
        }

        const parsed = await simpleParser(fullMsg.source);
        const parsedMessageId = (parsed.messageId || '').trim();
        const finalMessageId = parsedMessageId || envelopeKey;

        // Check again with parsed RFC message ID to ensure it hasn't been replied to
        if (
          repliedLookup.has(finalMessageId) ||
          store.tickets.some((t) => t.messageId === finalMessageId && t.emailSent)
        ) {
          processedLookup.add(envelopeKey);
          processedLookup.add(finalMessageId);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          if (!store.processedMessageIds.includes(finalMessageId)) {
            store.processedMessageIds.push(finalMessageId);
          }
          continue;
        }

        // Check again with parsed RFC message ID in processed list
        if (
          processedLookup.has(finalMessageId) ||
          store.tickets.some((t) => t.messageId === finalMessageId)
        ) {
          processedLookup.add(envelopeKey);
          processedLookup.add(finalMessageId);
          if (!store.processedMessageIds.includes(envelopeKey)) {
            store.processedMessageIds.push(envelopeKey);
          }
          if (!store.processedMessageIds.includes(finalMessageId)) {
            store.processedMessageIds.push(finalMessageId);
          }
          continue;
        }

        // Save into processed list right away
        processedLookup.add(envelopeKey);
        processedLookup.add(finalMessageId);
        if (!store.processedMessageIds.includes(envelopeKey)) {
          store.processedMessageIds.push(envelopeKey);
        }
        if (!store.processedMessageIds.includes(finalMessageId)) {
          store.processedMessageIds.push(finalMessageId);
        }

        const fromObj = parsed.from?.value?.[0];
        const fromEmail =
          fromObj?.address || item.envelope?.from?.[0]?.address || 'unknown@sender.invalid';
        const fromName = fromObj?.name || item.envelope?.from?.[0]?.name || undefined;
        const subject = parsed.subject || item.envelope?.subject || '(No Subject)';
        const body = (
          parsed.text ||
          (typeof parsed.html === 'string'
            ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : '')
        ).trim();

        const normalizedFrom = fromEmail.toLowerCase();
        if (
          normalizedFrom === ownEmail ||
          normalizedFrom.includes('mailer-daemon') ||
          normalizedFrom.includes('postmaster')
        ) {
          try {
            await client.messageFlagsAdd(item.seq, ['\\Seen']);
          } catch {
            // ignore flag update
          }
          continue;
        }

        scannedCount += 1;
        const receivedAt = (parsed.date || item.envelope?.date || new Date()).toISOString();

        const { output, inferenceMode } = await classifyEmailWithSebAI(
          config,
          fromEmail,
          subject,
          body || subject
        );

        let emailSent = false;
        let emailError: string | undefined;

        const parsedRefs = Array.isArray(parsed.references)
          ? parsed.references.map((r) => String(r).trim()).filter(Boolean)
          : typeof parsed.references === 'string'
            ? parsed.references.split(/\s+/).filter(Boolean)
            : [];

        if (output.classification === 'REPLY' && output.replyBody) {
          // Atomic IMAP claim check right before sending to prevent multi-instance duplicate sends
          const freshCheck = await client.fetchOne(item.seq, { flags: true }).catch(() => null);
          if (freshCheck?.flags?.has('\\Answered')) {
            repliedLookup.add(finalMessageId);
            handledThreadsInBatch.add(threadKey);
            continue;
          }

          try {
            await client.messageFlagsAdd(item.seq, ['\\Seen', '\\Answered']);
          } catch {
            // continue even if flag write is rejected
          }

          try {
            await sendDirectReplyEmail(
              config,
              fromEmail,
              subject,
              output.replyBody,
              finalMessageId,
              parsedRefs
            );
            emailSent = true;
            repliedLookup.add(finalMessageId);
            if (!store.repliedMessageIds.includes(finalMessageId)) {
              store.repliedMessageIds.push(finalMessageId);
            }
            handledThreadsInBatch.add(threadKey);
          } catch (err) {
            try {
              await client.messageFlagsRemove(item.seq, ['\\Answered']);
            } catch {
              // ignore rollback failure
            }
            emailError = err instanceof Error ? err.message : String(err);
            console.error('[Send Reply Error]', emailError);
          }
        } else if (
          output.classification === 'ESCALATE' &&
          output.escalationBullets?.length
        ) {
          // Atomic IMAP claim check right before sending to prevent multi-instance duplicate sends
          const freshCheck = await client.fetchOne(item.seq, { flags: true }).catch(() => null);
          if (freshCheck?.flags?.has('\\Answered')) {
            repliedLookup.add(finalMessageId);
            handledThreadsInBatch.add(threadKey);
            continue;
          }

          try {
            await client.messageFlagsAdd(item.seq, ['\\Seen', '\\Answered']);
          } catch {
            // continue
          }

          try {
            // Send 3-bullet escalation notice to internal escalation email
            await sendEscalationEmail(
              config,
              { from: fromEmail, subject, body, receivedAt },
              output.escalationBullets
            );
            emailSent = true;
            handledThreadsInBatch.add(threadKey);
          } catch (err) {
            emailError = err instanceof Error ? err.message : String(err);
            console.error('[Send Escalation Error]', emailError);
          }

          // Send customer notification / purchase thank you message if replyBody exists
          if (output.replyBody) {
            try {
              await sendDirectReplyEmail(
                config,
                fromEmail,
                subject,
                output.replyBody,
                finalMessageId,
                parsedRefs
              );
              emailSent = true;
              repliedLookup.add(finalMessageId);
              if (!store.repliedMessageIds.includes(finalMessageId)) {
                store.repliedMessageIds.push(finalMessageId);
              }
              handledThreadsInBatch.add(threadKey);
            } catch (err) {
              const replyErr = err instanceof Error ? err.message : String(err);
              emailError = emailError ? `${emailError} | ${replyErr}` : replyErr;
              console.error('[Send Escalation Customer Reply Error]', replyErr);
            }
          }
        } else {
          try {
            await client.messageFlagsAdd(item.seq, ['\\Seen']);
          } catch {
            // ignore flag write error
          }
        }

        const ticket: SupportTicket = {
          id: crypto.randomUUID(),
          messageId: finalMessageId,
          from: fromEmail,
          fromName,
          subject,
          body: body || '(Empty body)',
          receivedAt,
          processedAt: new Date().toISOString(),
          classification: output.classification,
          reason: output.reason,
          replyBody: output.replyBody,
          escalationBullets: output.escalationBullets,
          escalationSentTo:
            output.classification === 'ESCALATE'
              ? config.escalationEmail.trim()
              : undefined,
          emailSent,
          emailError,
          resolved: output.classification !== 'ESCALATE',
          source: 'gmail',
          modelUsed: config.model || 'Seb AI S1',
          inferenceMode,
        };

        // Guarantee no duplicate ticket in store.tickets
        if (!store.tickets.some((t) => t.messageId === ticket.messageId)) {
          store.tickets.unshift(ticket);
          newTickets.push(ticket);
        }

        await saveStore();
      }
    } finally {
      lock.release();
    }

    await client.logout();

    const summary =
      newTickets.length === 0
        ? 'Inbox top 20 scanned — 0 new messages found.'
        : `Processed ${newTickets.length} new message(s): ${newTickets.filter((t) => t.classification === 'REPLY').length} replied, ${newTickets.filter((t) => t.classification === 'ESCALATE').length} escalated, ${newTickets.filter((t) => t.classification === 'IGNORE').length} ignored.`;

    store.lastScanAt = new Date().toISOString();
    store.lastScanResult = summary;
    store.lastScanError = null;
    await saveStore();

    return { scanned: scannedCount, newTickets, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.lastScanAt = new Date().toISOString();
    store.lastScanError = message;
    await saveStore();
    throw err;
  } finally {
    isScanning = false;
  }
}

function syncBackgroundPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const { gmailAppPassword, apiKey } = store.config;
  if (
    normalizeAppPassword(gmailAppPassword).length > 0 &&
    apiKey.trim().length > 0
  ) {
    setTimeout(() => {
      runGmailScan().catch((err) => {
        console.error('[Auto-Poller] Startup scan failed:', err instanceof Error ? err.message : err);
      });
    }, 2500);

    pollTimer = setInterval(() => {
      runGmailScan().catch((err) => {
        console.error('[Auto-Poller] Scan failed:', err instanceof Error ? err.message : err);
      });
    }, 60 * 1000);
  }
}

function getPollerStatus(): PollerStatus {
  return {
    autoPollEnabled: true,
    isScanning,
    lastScanAt: store.lastScanAt,
    lastScanResult: store.lastScanResult,
    lastScanError: store.lastScanError,
    gmailConfigured:
      store.config.gmailEmail.trim().length > 0 &&
      normalizeAppPassword(store.config.gmailAppPassword).length > 0,
    aiConfigured: store.config.apiKey.trim().length > 0,
  };
}

async function startServer(): Promise<void> {
  await loadStore();
  syncBackgroundPoller();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: getPollerStatus() });
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      config: store.config,
      tickets: store.tickets,
      status: getPollerStatus(),
    });
  });

  app.post('/api/config', async (req, res) => {
    try {
      const incoming = (req.body ?? {}) as Partial<SupportConfig>;
      store.config = {
        ...store.config,
        ...incoming,
        baseUrl: (incoming.baseUrl ?? store.config.baseUrl).trim() || DEFAULT_SUPPORT_CONFIG.baseUrl,
        model: (incoming.model ?? store.config.model).trim() || DEFAULT_SUPPORT_CONFIG.model,
        gmailEmail: (incoming.gmailEmail ?? store.config.gmailEmail).trim(),
        gmailAppPassword: incoming.gmailAppPassword ?? store.config.gmailAppPassword,
        escalationEmail:
          (incoming.escalationEmail ?? store.config.escalationEmail).trim() ||
          'yeniljacob@gmail.com',
        senderName:
          (incoming.senderName ?? store.config.senderName).trim() || 'Tom - Seb AI Support',
        autoPollEnabled: true,
        pollIntervalSeconds: 60,
      };
      await saveStore();
      syncBackgroundPoller();
      res.json({ config: store.config, status: getPollerStatus() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/gmail/test', async (req, res) => {
    try {
      const candidate: SupportConfig = {
        ...store.config,
        ...(req.body as Partial<SupportConfig>),
      };

      const imap = createImapClient(candidate);
      await imap.connect();
      await imap.logout();

      const smtp = createSmtpTransport(candidate);
      await smtp.verify();

      res.json({
        ok: true,
        message: `Connected to Gmail IMAP & SMTP for ${candidate.gmailEmail.trim()}.`,
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/gmail/scan', async (_req, res) => {
    try {
      const result = await runGmailScan();
      res.json({
        ok: true,
        ...result,
        tickets: store.tickets,
        status: getPollerStatus(),
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        status: getPollerStatus(),
      });
    }
  });

  app.post('/api/tickets/:id/resolve', async (req, res) => {
    const ticket = store.tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    ticket.resolved = true;
    ticket.resolvedAt = new Date().toISOString();
    await saveStore();
    res.json({ ticket, tickets: store.tickets });
  });

  app.post('/api/tickets/:id/reopen', async (req, res) => {
    const ticket = store.tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    ticket.resolved = false;
    ticket.resolvedAt = undefined;
    await saveStore();
    res.json({ ticket, tickets: store.tickets });
  });

  app.post('/api/tickets/:id/send-email', async (req, res) => {
    try {
      const ticket = store.tickets.find((t) => t.id === req.params.id);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }

      const config = store.config;
      if (ticket.classification === 'REPLY' && ticket.replyBody) {
        await sendDirectReplyEmail(
          config,
          ticket.from,
          ticket.subject,
          ticket.replyBody,
          ticket.messageId
        );
      } else if (ticket.classification === 'ESCALATE' && ticket.escalationBullets?.length) {
        await sendEscalationEmail(config, ticket, ticket.escalationBullets);
        if (ticket.replyBody) {
          await sendDirectReplyEmail(
            config,
            ticket.from,
            ticket.subject,
            ticket.replyBody,
            ticket.messageId
          );
        }
      } else {
        res.status(400).json({ error: 'Ignored tickets do not send outbound emails.' });
        return;
      }

      ticket.emailSent = true;
      ticket.emailError = undefined;
      if (ticket.messageId && !store.repliedMessageIds.includes(ticket.messageId)) {
        store.repliedMessageIds.push(ticket.messageId);
      }
      await saveStore();
      res.json({ ticket, tickets: store.tickets });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/tickets/:id', async (req, res) => {
    const prevLength = store.tickets.length;
    const target = store.tickets.find((t) => t.id === req.params.id);
    if (target?.messageId && !store.processedMessageIds.includes(target.messageId)) {
      store.processedMessageIds.push(target.messageId);
    }
    store.tickets = store.tickets.filter((t) => t.id !== req.params.id);
    if (store.tickets.length === prevLength) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    await saveStore();
    res.json({ tickets: store.tickets });
  });

  app.post('/api/tickets/clear-ignored', async (_req, res) => {
    const ignored = store.tickets.filter((t) => t.classification === 'IGNORE');
    for (const t of ignored) {
      if (t.messageId && !store.processedMessageIds.includes(t.messageId)) {
        store.processedMessageIds.push(t.messageId);
      }
    }
    store.tickets = store.tickets.filter((t) => t.classification !== 'IGNORE');
    await saveStore();
    res.json({ tickets: store.tickets });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Seb AI Support Desk listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
