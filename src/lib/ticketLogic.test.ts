import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardStats,
  filterTickets,
  formatEscalationEmailText,
  parseAgentClassification,
} from './ticketLogic.ts';
import type { SupportTicket } from '../types/support.ts';

test('parseAgentClassification handles fenced JSON for REPLY', () => {
  const raw = `\`\`\`json
  {
    "classification": "REPLY",
    "reason": "Question about Seb AI model limits.",
    "replyBody": "Hi! Seb AI offers unlimited messages on free models and 12 messages/day on Premium models."
  }
  \`\`\``;
  const result = parseAgentClassification(raw);
  assert.equal(result.classification, 'REPLY');
  assert.equal(result.replyBody, 'Hi! Seb AI offers unlimited messages on free models and 12 messages/day on Premium models.');
});

test('parseAgentClassification guarantees 3 bullets and replyBody for ESCALATE', () => {
  const raw = JSON.stringify({
    classification: 'ESCALATE',
    reason: 'User bought Monthly Robux Premium.',
    escalationBullets: ['Customer wants 100R$ Monthly plan', 'Seb AI Account Email: alex@dev.io'],
    replyBody: 'Thanks for your purchase of Seb AI Premium! We have escalated your order to the billing team.',
  });
  const result = parseAgentClassification(raw);
  assert.equal(result.classification, 'ESCALATE');
  assert.equal(result.escalationBullets?.length, 3);
  assert.match(result.replyBody || '', /Thanks for your purchase/);
  assert.match(result.replyBody || '', /billing team/);
  assert.doesNotMatch(result.replyBody || '', /Yenil/i);
});

test('parseAgentClassification rejects invalid classification', () => {
  assert.throws(() =>
    parseAgentClassification(JSON.stringify({ classification: 'UNKNOWN', reason: 'bad' }))
  );
});

test('computeDashboardStats & filterTickets accurately calculate metrics and tabs', () => {
  const sample: SupportTicket[] = [
    {
      id: '1',
      from: 'a@test.com',
      subject: 'API question',
      body: 'How does S1 work?',
      receivedAt: '2026-11-14T10:00:00Z',
      processedAt: '2026-11-14T10:00:05Z',
      classification: 'REPLY',
      reason: 'KB question',
      replyBody: 'S1 is balanced.',
      emailSent: true,
      resolved: true,
      source: 'gmail',
      modelUsed: 'Seb AI S1',
      inferenceMode: 'live-api',
    },
    {
      id: '2',
      from: 'b@test.com',
      subject: 'Robux upgrade',
      body: 'Buy Yearly 1000R$',
      receivedAt: '2026-11-14T10:05:00Z',
      processedAt: '2026-11-14T10:05:05Z',
      classification: 'ESCALATE',
      reason: 'Purchase',
      escalationBullets: ['1', '2', '3'],
      emailSent: true,
      resolved: false,
      source: 'gmail',
      modelUsed: 'Seb AI S1',
      inferenceMode: 'live-api',
    },
    {
      id: '3',
      from: 'c@test.com',
      subject: 'Bug report',
      body: 'Login failed',
      receivedAt: '2026-11-14T10:10:00Z',
      processedAt: '2026-11-14T10:10:05Z',
      classification: 'ESCALATE',
      reason: 'Bug',
      escalationBullets: ['1', '2', '3'],
      emailSent: true,
      resolved: true,
      source: 'gmail',
      modelUsed: 'Seb AI S1',
      inferenceMode: 'live-api',
    },
    {
      id: '4',
      from: 'spam@promo.com',
      subject: 'Crypto promo',
      body: 'Win free coins',
      receivedAt: '2026-11-14T10:15:00Z',
      processedAt: '2026-11-14T10:15:05Z',
      classification: 'IGNORE',
      reason: 'Spam',
      emailSent: false,
      resolved: true,
      source: 'gmail',
      modelUsed: 'Seb AI S1',
      inferenceMode: 'live-api',
    },
  ];

  const stats = computeDashboardStats(sample);
  assert.equal(stats.total, 3);
  assert.equal(stats.replied, 1);
  assert.equal(stats.escalatedOpen, 1);
  assert.equal(stats.escalatedResolved, 1);
  assert.equal(stats.escalatedTotal, 2);
  assert.equal(stats.ignored, 1);
  assert.equal(stats.replyRatePercent, 33);

  assert.equal(filterTickets(sample, 'all', '').length, 3);
  assert.equal(filterTickets(sample, 'replied', '').length, 1);
  assert.equal(filterTickets(sample, 'escalated', '').length, 2);
  assert.equal(filterTickets(sample, 'ignored', '').length, 1);
  assert.equal(filterTickets(sample, 'all', 'Yearly').length, 1);
});

test('formatEscalationEmailText includes all 3 bullets and customer body', () => {
  const text = formatEscalationEmailText(
    {
      from: 'player@roblox.com',
      subject: 'Lifetime Premium',
      body: 'I sent 20000 Robux.',
      receivedAt: '2026-11-14T12:00:00Z',
    },
    ['Customer wants Lifetime', '20,000 Robux tier', 'Verify payment']
  );
  assert.ok(text.includes('• Customer wants Lifetime'));
  assert.ok(text.includes('• 20,000 Robux tier'));
  assert.ok(text.includes('I sent 20000 Robux.'));
});
