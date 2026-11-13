import React, { useState } from 'react';
import { QrCode, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onResolved: (result: {
    venueId: string;
    venueName: string;
    floorId: string | null;
    nodeId: string | null;
    landmarkName: string;
  }) => void;
}

const DEMO_QR_CODES = [
  { code: 'AR-VENUE-UBCITY-2026', label: 'UB City Civic Concourse (Venue Map)' },
  { code: 'AR-QR-UB-ATRIUM', label: 'UB City Central Atrium Desk (Ground)' },
  { code: 'AR-QR-UB-TOILET-1', label: 'UB City Accessible Restroom (Level 1)' },
  { code: 'AR-VENUE-MARTHAS-2026', label: "St. Martha's Care Pavilion (Venue Map)" },
  { code: 'AR-QR-SM-CLINIC', label: "St. Martha's Mobility Clinic (Level 1)" },
];

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ open, onClose, onResolved }) => {
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resolveCode = async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/qr/resolve?code=${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (!res.ok || !data.matched) {
        setError(data.error || 'Code not recognised.');
      } else {
        onResolved(data);
        onClose();
      }
    } catch {
      setError('Network error while checking QR code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="QR Code Venue & Landmark Scanner"
    >
      <div className="w-full md:max-w-md bg-white dark:bg-[#102B27] rounded-t-3xl md:rounded-2xl shadow-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#087F8C]/10 text-[#087F8C] dark:text-[#D3E94D] flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#17211F] dark:text-[#F7F8F3]">Scan Venue or Landmark QR</h2>
              <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                Confirm indoor position or open a published floor plan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR scanner"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            resolveCode(codeInput);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Enter QR token (e.g. AR-VENUE-UBCITY-2026)"
            className="flex-1 min-h-[44px] px-3 rounded-xl border border-[#17211F]/15 dark:border-white/15 bg-[#F7F8F3] dark:bg-[#0D1917] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#087F8C]"
          />
          <button
            type="submit"
            disabled={loading || !codeInput.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-[#087F8C] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#066974]"
          >
            {loading ? 'Checking' : 'Open'}
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70">
            Quick-Scan Simulated Venue &amp; Landmark QR Checkpoints
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {DEMO_QR_CODES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => resolveCode(item.code)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#17211F]/10 dark:border-white/10 hover:border-[#087F8C] hover:bg-[#087F8C]/5 flex items-center justify-between text-left transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-[#17211F] dark:text-[#F7F8F3]">{item.label}</div>
                  <div className="text-[11px] font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60">{item.code}</div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-[#087F8C] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
