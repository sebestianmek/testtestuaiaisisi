import { X } from 'lucide-react';
import { SEB_AI_MODELS } from '../lib/sebaiKnowledge';

interface KnowledgeBaseModalProps {
  open: boolean;
  onClose: () => void;
}

export function KnowledgeBaseModal({ open, onClose }: KnowledgeBaseModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-modal-title"
    >
      <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 id="kb-modal-title" className="font-display text-lg font-semibold text-slate-100">
              Seb AI Official Knowledge Base
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Reference rules used by Tom - Seb AI Support when triaging and answering emails.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close knowledge base"
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto text-sm text-slate-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#0B0F17] border border-slate-800 rounded-xl p-4 text-xs">
            <div>
              <div className="text-slate-400">Official Site</div>
              <div className="font-mono text-slate-100 mt-0.5">https://sebaioffical.lovable.app</div>
            </div>
            <div>
              <div className="text-slate-400">API Base URL</div>
              <div className="font-mono text-slate-100 mt-0.5">https://sebaioffical.lovable.app/api/sebaiapi</div>
            </div>
            <div>
              <div className="text-slate-400">Usage Limits</div>
              <div className="text-slate-100 mt-0.5">Unlimited free models · 12/day on Premium models · SEB_ keys</div>
            </div>
            <div>
              <div className="text-slate-400">Ownership</div>
              <div className="text-slate-100 mt-0.5">Seb AI Inc. · Sebestianmek on Roblox</div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-indigo-400 mb-2">Model Lineup</h3>
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B0F17] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Model</th>
                    <th className="py-2.5 px-3 font-medium">Best For</th>
                    <th className="py-2.5 px-3 font-medium">Plan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {SEB_AI_MODELS.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 px-3 font-mono text-slate-100">{m.displayName}</td>
                      <td className="py-2 px-3 text-slate-300">{m.bestFor}</td>
                      <td className="py-2 px-3 text-slate-400">{m.plan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-1.5 text-xs">
              <h3 className="font-semibold text-slate-100">Robux Premium Tiers</h3>
              <p className="text-slate-400">Escalated to yeniljacob@gmail.com for activation:</p>
              <ul className="space-y-1 pt-1 font-mono text-slate-200 tabular-nums">
                <li>Weekly · 25 R$ (20 R$ promo)</li>
                <li>Monthly · 100 R$</li>
                <li>Yearly · 1,000 R$</li>
                <li>Lifetime · 20,000 R$</li>
              </ul>
            </div>

            <div className="bg-[#0B0F17] border border-slate-800 rounded-xl p-4 space-y-1.5 text-xs">
              <h3 className="font-semibold text-slate-100">Mobile App Setup (PWA)</h3>
              <p className="text-slate-300">
                <strong className="text-slate-100">iOS (Safari):</strong> Open sebaioffical.lovable.app → Share → Add to Home Screen.
              </p>
              <p className="text-slate-300">
                <strong className="text-slate-100">Android (Chrome):</strong> Open sebaioffical.lovable.app → Menu (⋮) → Install app.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
