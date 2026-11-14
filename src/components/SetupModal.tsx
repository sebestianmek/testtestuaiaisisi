import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, PlugZap, X } from 'lucide-react';
import { SEB_AI_MODELS } from '../lib/sebaiKnowledge';
import type { SupportConfig } from '../types/support';

interface SetupModalProps {
  open: boolean;
  config: SupportConfig;
  onClose: () => void;
  onSave: (nextConfig: SupportConfig) => Promise<void>;
}

export function SetupModal({ open, config, onClose, onSave }: SetupModalProps) {
  const [form, setForm] = useState<SupportConfig>(config);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAppPassword, setShowAppPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingGmail, setTestingGmail] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(config);
      setTestFeedback(null);
      setSaveError(null);
    }
  }, [open, config]);

  if (!open) return null;

  const isPresetModel = SEB_AI_MODELS.some((m) => m.id === form.model);

  const handleTestGmail = async () => {
    setTestingGmail(true);
    setTestFeedback(null);
    try {
      const res = await fetch('/api/gmail/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setTestFeedback({
          ok: false,
          message: data.error || 'Failed to verify Gmail IMAP/SMTP credentials.',
        });
      } else {
        setTestFeedback({
          ok: true,
          message: data.message || 'Gmail IMAP & SMTP verified.',
        });
      }
    } catch (err) {
      setTestFeedback({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error testing Gmail.',
      });
    } finally {
      setTestingGmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-modal-title"
    >
      <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 id="setup-modal-title" className="font-display text-lg font-semibold text-slate-100">
              Setup & Configuration
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Credentials are saved locally so Tom can poll Gmail and call Seb AI models automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup modal"
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Seb AI Model & API */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-indigo-400">
              Seb AI OpenAI-Compatible Endpoint
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="cfg-base-url" className="block text-xs font-medium text-slate-300 mb-1.5">
                  OpenAI-Compatible Base URL
                </label>
                <input
                  id="cfg-base-url"
                  type="url"
                  required
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://sebaioffical.lovable.app/api/sebaiapi"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="cfg-api-key" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Seb AI API Key
                </label>
                <div className="relative">
                  <input
                    id="cfg-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder="SEB_your_key_here"
                    className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg pl-3 pr-9 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="cfg-model-select" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Seb AI Model
                </label>
                <select
                  id="cfg-model-select"
                  value={isPresetModel ? form.model : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') {
                      setForm({ ...form, model: e.target.value });
                    }
                  }}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {SEB_AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.plan}) — {m.bestFor}
                    </option>
                  ))}
                  {!isPresetModel && <option value="__custom__">Custom: {form.model}</option>}
                </select>
              </div>
            </div>
          </div>

          {/* Gmail App Password Settings */}
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-indigo-400">
                Gmail Connection (Google App Password — Always-On IMAP/SMTP)
              </h3>
              <button
                type="button"
                onClick={handleTestGmail}
                disabled={testingGmail || !form.gmailEmail || !form.gmailAppPassword}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {testingGmail ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <PlugZap className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
                )}
                Test Connection
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cfg-gmail-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Support Gmail Address
                </label>
                <input
                  id="cfg-gmail-email"
                  type="email"
                  required
                  value={form.gmailEmail}
                  onChange={(e) => setForm({ ...form, gmailEmail: e.target.value })}
                  placeholder="sebaiincsebaiinc@gmail.com"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="cfg-app-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                  16-Character Google App Password
                </label>
                <div className="relative">
                  <input
                    id="cfg-app-password"
                    type={showAppPassword ? 'text' : 'password'}
                    value={form.gmailAppPassword}
                    onChange={(e) => setForm({ ...form, gmailAppPassword: e.target.value })}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg pl-3 pr-9 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppPassword(!showAppPassword)}
                    aria-label={showAppPassword ? 'Hide app password' : 'Show app password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showAppPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Generate an App Password once at Google Account → Security → 2-Step Verification → App passwords for{' '}
              <span className="font-mono text-slate-300">{form.gmailEmail || 'sebaiincsebaiinc@gmail.com'}</span>.
              Unlike browser OAuth tokens, App Passwords never expire every hour.
            </p>

            {testFeedback && (
              <div
                className={`text-xs rounded-lg px-3 py-2 border flex items-center gap-2 ${
                  testFeedback.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                {testFeedback.ok && <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />}
                <span>{testFeedback.message}</span>
              </div>
            )}
          </div>

          {/* Persona & Routing */}
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold text-indigo-400">
              Persona, Escalation & Polling
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cfg-sender-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Sender Name
                </label>
                <input
                  id="cfg-sender-name"
                  type="text"
                  required
                  value={form.senderName}
                  onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                  placeholder="Tom - Seb AI Support"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="cfg-escalation-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Escalation Email
                </label>
                <input
                  id="cfg-escalation-email"
                  type="email"
                  required
                  value={form.escalationEmail}
                  onChange={(e) => setForm({ ...form, escalationEmail: e.target.value })}
                  placeholder="yeniljacob@gmail.com"
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5">
              <div className="text-sm font-medium text-emerald-300">
                Automatic 60-Second Inbox Scanning: Always Active
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                The server automatically scans Gmail every 60 seconds whenever your App Password and Seb AI API key are present.
              </div>
            </div>
          </div>

          {saveError && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Save Credentials Locally
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
