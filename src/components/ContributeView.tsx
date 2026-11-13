import React, { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  Construction,
  DoorClosed,
  Footprints,
  HelpCircle,
  MapPin,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import type { Asset, Incident, IncidentCategory, IncidentSeverity, IncidentUpdate, Place } from '../types.ts';

interface ContributeViewProps {
  userId: string;
  places: Place[];
  assets: Asset[];
  incidents: Incident[];
  prefill?: { placeId?: string | null; assetId?: string | null; category?: string; lat?: number; lng?: number } | null;
  onSubmitted: () => Promise<void>;
  onPickOnMap: () => void;
}

const REPORT_CATEGORIES: Array<{ id: IncidentCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'Broken lift', label: 'Broken lift', icon: ArrowUpDown },
  { id: 'Blocked footpath', label: 'Blocked footpath', icon: Footprints },
  { id: 'Construction barrier', label: 'Construction barrier', icon: Construction },
  { id: 'Inaccessible entrance', label: 'Inaccessible entrance', icon: DoorClosed },
  { id: 'Broken ramp', label: 'Broken ramp', icon: AlertTriangle },
  { id: 'Crossing problem', label: 'Crossing problem', icon: MapPin },
  { id: 'Missing accessibility information', label: 'Missing info', icon: HelpCircle },
  { id: 'Other', label: 'Other', icon: HelpCircle },
];

const DRAFT_KEY = 'accessroute_offline_incident_draft';

export const ContributeView: React.FC<ContributeViewProps> = ({
  userId,
  places,
  assets,
  incidents,
  prefill,
  onSubmitted,
  onPickOnMap,
}) => {
  const [selectedCat, setSelectedCat] = useState<IncidentCategory | null>(
    (prefill?.category as IncidentCategory) || null
  );
  const [placeId, setPlaceId] = useState<string>(prefill?.placeId || 'place-mg-metro');
  const [assetId, setAssetId] = useState<string>(prefill?.assetId || 'asset-mg-lift');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('high');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedReport, setConfirmedReport] = useState<Incident | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [trackHistory, setTrackHistory] = useState<IncidentUpdate[]>([]);
  const [offlineDraftCount, setOfflineDraftCount] = useState(0);

  useEffect(() => {
    if (prefill) {
      if (prefill.category) setSelectedCat(prefill.category as IncidentCategory);
      if (prefill.placeId) setPlaceId(prefill.placeId);
      if (prefill.assetId) setAssetId(prefill.assetId);
    }
  }, [prefill]);

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    setOfflineDraftCount(raw ? 1 : 0);
  }, []);

  useEffect(() => {
    if (!selectedTrackId) {
      setTrackHistory([]);
      return;
    }
    fetch(`/api/incidents/${selectedTrackId}`)
      .then((r) => r.json())
      .then((d) => setTrackHistory(d.updates || []))
      .catch(() => {});
  }, [selectedTrackId, incidents]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCat) return;
    setSubmitting(true);
    setError(null);

    const chosenPlace = places.find((p) => p.id === placeId);
    const chosenAsset = assets.find((a) => a.id === assetId);
    const lat = prefill?.lat ?? chosenAsset?.lat ?? chosenPlace?.lat ?? 12.9756;
    const lng = prefill?.lng ?? chosenAsset?.lng ?? chosenPlace?.lng ?? 77.6066;

    const payload = {
      reporterUserId: userId,
      category: selectedCat,
      title: title.trim() || `${selectedCat} at ${chosenAsset?.name || chosenPlace?.name || 'Bengaluru location'}`,
      description: description.trim() || `Citizen report for ${selectedCat}.`,
      severity,
      assetId: assetId || null,
      placeId: placeId || null,
      lat,
      lng,
      photoDataUrl,
    };

    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save report.');
      localStorage.removeItem(DRAFT_KEY);
      setOfflineDraftCount(0);
      setConfirmedReport(data.incident);
      setSelectedTrackId(data.incident.id);
      setTitle('');
      setDescription('');
      setPhotoDataUrl(null);
      await onSubmitted();
    } catch (err) {
      // Save offline draft safely instead of showing a fake success message!
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      setOfflineDraftCount(1);
      setError(
        err instanceof Error
          ? `${err.message} Saved locally as an offline draft so you can retry.`
          : 'Network error — saved locally as an offline draft.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const retryOfflineDraft = async () => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      localStorage.removeItem(DRAFT_KEY);
      setOfflineDraftCount(0);
      setConfirmedReport(data.incident);
      await onSubmitted();
    } catch {
      setError('Still unable to sync offline draft. Check connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const trackedIncident = incidents.find((i) => i.id === selectedTrackId) || incidents[0];

  return (
    <div className="h-full overflow-y-auto bg-[#F7F8F3] dark:bg-[#0D1917] pb-24 md:pb-10">
      <div className="max-w-5xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Report Form */}
        <div className="lg:col-span-7 bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-[#17211F] dark:text-[#F7F8F3]">What would you like to report?</h1>
            <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65 mt-1">
              Reports save directly to the shared database and update step-free route calculations.
            </p>
          </div>

          {offlineDraftCount > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-2 text-xs">
              <span>You have 1 offline report draft waiting to sync.</span>
              <button
                type="button"
                onClick={retryOfflineDraft}
                className="px-3 py-1.5 rounded-lg bg-[#087F8C] text-white font-semibold inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Sync
              </button>
            </div>
          )}

          {confirmedReport && (
            <div className="p-4 rounded-xl bg-[#087F8C]/10 border border-[#087F8C] text-xs space-y-1">
              <div className="font-bold text-[#087F8C] dark:text-[#D3E94D] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Report Saved — ID {confirmedReport.report_code}
              </div>
              <p className="text-[#17211F]/80 dark:text-[#F7F8F3]/80">
                Status: <strong className="capitalize">{confirmedReport.status}</strong>. Affected routes have been updated.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Category Visual Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {REPORT_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const active = selectedCat === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCat(cat.id)}
                  className={`min-h-[74px] p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-colors ${
                    active
                      ? 'bg-[#087F8C] text-white border-[#087F8C]'
                      : 'bg-[#F7F8F3] dark:bg-[#0D1917] text-[#17211F] dark:text-[#F7F8F3] border-[#17211F]/10 dark:border-white/10 hover:border-[#087F8C]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-semibold leading-tight">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {selectedCat && (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-[#17211F]/10 dark:border-white/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Location / Station / Venue</label>
                  <select
                    value={placeId}
                    onChange={(e) => setPlaceId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                  >
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Affected Asset (if known)</label>
                  <select
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                  >
                    <option value="">General / No specific asset</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.operational_status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65 font-mono">
                  {prefill?.lat ? `Pinned: ${prefill.lat.toFixed(4)}, ${prefill.lng?.toFixed(4)}` : 'Using selected station/asset coordinates'}
                </span>
                <button
                  type="button"
                  onClick={onPickOnMap}
                  className="min-h-[38px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#087F8C]" /> Pick on Map
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Short Summary</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`e.g. ${selectedCat} blocking step-free access`}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the barrier, door clearance, or lift error..."
                  className="w-full p-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Severity</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['low', 'medium', 'high', 'critical'] as IncidentSeverity[]).map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setSeverity(sev)}
                        className={`min-h-[40px] rounded-xl text-xs font-semibold capitalize border ${
                          severity === sev
                            ? 'bg-[#102B27] text-white border-[#102B27] dark:bg-[#D3E94D] dark:text-[#102B27]'
                            : 'bg-[#F7F8F3] dark:bg-[#0D1917] border-[#17211F]/15 dark:border-white/15'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Optional Photo</label>
                  <label className="min-h-[40px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer">
                    <Camera className="w-4 h-4 text-[#087F8C]" />
                    {photoDataUrl ? 'Photo Attached' : 'Add Photo'}
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] rounded-xl bg-[#087F8C] text-white text-sm font-semibold hover:bg-[#066974] disabled:opacity-50"
              >
                {submitting ? 'Submitting Report...' : 'Submit Accessibility Report'}
              </button>
            </form>
          )}
        </div>

        {/* Right: Report Tracking & Status Timeline */}
        <div className="lg:col-span-5 bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#17211F] dark:text-[#F7F8F3]">Track Report Status</h2>
            <span className="text-xs font-mono tabular-nums text-[#17211F]/60 dark:text-[#F7F8F3]/60">
              {incidents.length} records
            </span>
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {incidents.slice(0, 12).map((inc) => {
              const selected = (trackedIncident?.id || '') === inc.id;
              return (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => setSelectedTrackId(inc.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    selected
                      ? 'border-[#087F8C] bg-[#087F8C]/5 dark:bg-[#087F8C]/15'
                      : 'border-[#17211F]/10 dark:border-white/10 hover:border-[#087F8C]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                      {inc.report_code} · {inc.severity}
                    </span>
                    <span className="text-xs font-semibold capitalize text-[#087F8C] dark:text-[#D3E94D]">
                      {inc.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-sm font-semibold mt-0.5 truncate">{inc.title}</div>
                </button>
              );
            })}
          </div>

          {trackedIncident && (
            <div className="pt-3 border-t border-[#17211F]/10 dark:border-white/10 space-y-2.5">
              <div className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70">
                Stored Status History — {trackedIncident.report_code}
              </div>
              {trackHistory.length === 0 ? (
                <div className="text-xs text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                  Select a report above to view stored transitions.
                </div>
              ) : (
                <ol className="space-y-2">
                  {trackHistory.map((upd) => (
                    <li key={upd.id} className="text-xs flex items-start gap-2.5">
                      <Clock className="w-3.5 h-3.5 text-[#087F8C] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold capitalize">{upd.to_status.replace('_', ' ')}</span>
                        <span className="text-[#17211F]/60 dark:text-[#F7F8F3]/60 ml-1.5">
                          by {upd.actor_name || 'System'}
                        </span>
                        <p className="text-[#17211F]/75 dark:text-[#F7F8F3]/75">{upd.note}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
