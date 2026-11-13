import React, { useEffect, useState } from 'react';
import {
  X,
  ArrowUpDown,
  Navigation,
  Bookmark,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import type { ComputedRoute, Place, RoutePlanResponse, UserProfile } from '../types.ts';

interface JourneyPlannerSheetProps {
  open: boolean;
  places: Place[];
  profile: UserProfile;
  originNodeId: string;
  destinationNodeId: string;
  onChangeOriginNode: (id: string) => void;
  onChangeDestinationNode: (id: string) => void;
  onClose: () => void;
  onPreviewRoute: (route: ComputedRoute | null) => void;
  onStartNavigation: (route: ComputedRoute, destinationName: string, destinationVenueId: string | null) => void;
  onSaveRoute: (label: string, routeJson: string, placeId: string | null) => Promise<void>;
  refreshKey: number;
}

export const JourneyPlannerSheet: React.FC<JourneyPlannerSheetProps> = ({
  open,
  places,
  profile,
  originNodeId,
  destinationNodeId,
  onChangeOriginNode,
  onChangeDestinationNode,
  onClose,
  onPreviewRoute,
  onStartNavigation,
  onSaveRoute,
  refreshKey,
}) => {
  const [stepFree, setStepFree] = useState(profile.step_free);
  const [avoidStairs, setAvoidStairs] = useState(profile.avoid_stairs);
  const [wheelchair, setWheelchair] = useState(profile.wheelchair_accessible);
  const [maxWalk, setMaxWalk] = useState(profile.max_walking_m);
  const [fewerTransfers, setFewerTransfers] = useState(profile.prefer_fewer_transfers);

  const [plan, setPlan] = useState<RoutePlanResponse | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setStepFree(profile.step_free);
    setAvoidStairs(profile.avoid_stairs);
    setWheelchair(profile.wheelchair_accessible);
    setMaxWalk(profile.max_walking_m);
    setFewerTransfers(profile.prefer_fewer_transfers);
  }, [profile]);

  useEffect(() => {
    if (!open || !originNodeId || !destinationNodeId) return;
    setLoading(true);
    setError(null);
    fetch('/api/routes/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originNodeId,
        destinationNodeId,
        constraints: {
          stepFree,
          avoidStairs,
          wheelchairAccessible: wheelchair,
          maxWalkingM: maxWalk,
          preferFewerTransfers: fewerTransfers,
        },
      }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Could not compute route');
        setPlan(data);
        const firstFeasible = (data.routes as ComputedRoute[]).findIndex((rt) => rt.feasible);
        const idx = firstFeasible >= 0 ? firstFeasible : 0;
        setSelectedIdx(idx);
        onPreviewRoute(data.routes[idx]?.feasible ? data.routes[idx] : null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Routing error');
        onPreviewRoute(null);
      })
      .finally(() => setLoading(false));
  }, [open, originNodeId, destinationNodeId, stepFree, avoidStairs, wheelchair, maxWalk, fewerTransfers, refreshKey, onPreviewRoute]);

  if (!open) return null;

  const placeOptions = places.filter((p) => p.primary_node_id);
  const selectedRoute = plan?.routes[selectedIdx] || null;
  const destPlace = places.find((p) => p.primary_node_id === destinationNodeId);

  return (
    <aside
      className="fixed bottom-16 md:bottom-auto md:top-20 left-0 right-0 md:left-4 md:right-auto md:w-[420px] md:max-h-[calc(100vh-100px)] max-h-[75vh] z-30 bg-white dark:bg-[#102B27] rounded-t-3xl md:rounded-2xl shadow-2xl border border-[#17211F]/10 dark:border-white/15 flex flex-col overflow-hidden"
      aria-label="Accessible Journey Planner"
    >
      <div className="md:hidden w-10 h-1.5 bg-[#17211F]/20 dark:bg-white/20 rounded-full mx-auto mt-2.5 shrink-0" />

      <div className="flex items-center justify-between px-4 py-3 border-b border-[#17211F]/10 dark:border-white/10">
        <div>
          <h2 className="text-base font-bold text-[#17211F] dark:text-[#F7F8F3]">Accessible Journey Planner</h2>
          <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
            Real graph routing · Enforces hard constraints
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onPreviewRoute(null);
            onClose();
          }}
          aria-label="Close journey planner"
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Origin & Destination Inputs */}
        <div className="space-y-2 relative">
          <div>
            <label className="block text-[11px] font-semibold text-[#17211F]/65 dark:text-[#F7F8F3]/65 mb-1">
              Starting location
            </label>
            <select
              value={originNodeId}
              onChange={(e) => onChangeOriginNode(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm font-medium"
            >
              {placeOptions.map((p) => (
                <option key={p.id} value={p.primary_node_id!}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end -my-1">
            <button
              type="button"
              onClick={() => {
                const prevOrigin = originNodeId;
                onChangeOriginNode(destinationNodeId);
                onChangeDestinationNode(prevOrigin);
              }}
              aria-label="Swap start and destination"
              className="min-h-[36px] px-2.5 rounded-lg text-xs font-medium text-[#087F8C] dark:text-[#D3E94D] hover:bg-[#087F8C]/10 inline-flex items-center gap-1"
            >
              <ArrowUpDown className="w-3.5 h-3.5" /> Swap
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#17211F]/65 dark:text-[#F7F8F3]/65 mb-1">
              Destination
            </label>
            <select
              value={destinationNodeId}
              onChange={(e) => onChangeDestinationNode(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm font-medium"
            >
              {placeOptions.map((p) => (
                <option key={p.id} value={p.primary_node_id!}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Accessibility Constraints */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStepFree((v) => !v)}
            className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold border transition-colors ${
              stepFree
                ? 'bg-[#087F8C] text-white border-[#087F8C]'
                : 'bg-[#F7F8F3] dark:bg-[#0D1917] border-[#17211F]/15 dark:border-white/15'
            }`}
          >
            Step-free
          </button>
          <button
            type="button"
            onClick={() => setAvoidStairs((v) => !v)}
            className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold border transition-colors ${
              avoidStairs
                ? 'bg-[#087F8C] text-white border-[#087F8C]'
                : 'bg-[#F7F8F3] dark:bg-[#0D1917] border-[#17211F]/15 dark:border-white/15'
            }`}
          >
            Avoid stairs
          </button>
          <button
            type="button"
            onClick={() => setWheelchair((v) => !v)}
            className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold border transition-colors ${
              wheelchair
                ? 'bg-[#087F8C] text-white border-[#087F8C]'
                : 'bg-[#F7F8F3] dark:bg-[#0D1917] border-[#17211F]/15 dark:border-white/15'
            }`}
          >
            Wheelchair (85cm+)
          </button>
          <button
            type="button"
            onClick={() => setFewerTransfers((v) => !v)}
            className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold border transition-colors ${
              fewerTransfers
                ? 'bg-[#087F8C] text-white border-[#087F8C]'
                : 'bg-[#F7F8F3] dark:bg-[#0D1917] border-[#17211F]/15 dark:border-white/15'
            }`}
          >
            Fewer transfers
          </button>
        </div>

        {/* Active Disruptions Banner */}
        {plan && plan.active_disruptions.length > 0 && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Active Infrastructure Disruptions
            </div>
            {plan.active_disruptions.map((d) => (
              <div key={d.asset_id}>
                • {d.asset_name} ({d.status}) — excluded from step-free paths
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="space-y-2.5 animate-pulse">
            <div className="h-20 rounded-xl bg-[#F7F8F3] dark:bg-white/5" />
            <div className="h-20 rounded-xl bg-[#F7F8F3] dark:bg-white/5" />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Route Options */}
        {!loading && plan && (
          <div className="space-y-2.5">
            {plan.routes.map((rt, idx) => {
              const active = idx === selectedIdx;
              return (
                <button
                  key={rt.mode + idx}
                  type="button"
                  onClick={() => {
                    setSelectedIdx(idx);
                    onPreviewRoute(rt.feasible ? rt : null);
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-colors ${
                    active
                      ? 'border-[#087F8C] bg-[#087F8C]/5 dark:bg-[#087F8C]/15'
                      : 'border-[#17211F]/10 dark:border-white/10 hover:border-[#087F8C]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#17211F] dark:text-[#F7F8F3] flex items-center gap-1.5">
                      {idx === 0 && rt.feasible && <Sparkles className="w-3.5 h-3.5 text-[#087F8C]" />}
                      {rt.label}
                    </span>
                    {rt.feasible ? (
                      <span className="text-sm font-mono font-bold tabular-nums text-[#087F8C] dark:text-[#D3E94D]">
                        {rt.estimated_minutes} min
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">Blocked</span>
                    )}
                  </div>

                  {rt.feasible ? (
                    <>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#17211F]/70 dark:text-[#F7F8F3]/70 font-mono tabular-nums">
                        <span>{rt.total_distance_m}m total</span>
                        <span aria-hidden="true">·</span>
                        <span>{rt.walking_distance_m}m walk</span>
                        <span aria-hidden="true">·</span>
                        <span>{rt.transfers} transfer{rt.transfers === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1 font-medium text-[#087F8C] dark:text-[#D3E94D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {rt.accessibility_compatibility}
                        </span>
                        <span aria-hidden="true" className="text-[#17211F]/30 dark:text-white/30">·</span>
                        <span className="inline-flex items-center gap-1 text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                          <HelpCircle className="w-3 h-3" />
                          {rt.data_confidence}
                        </span>
                      </div>
                      {(rt.known_barriers.length > 0 || rt.unknown_disclosures.length > 0) && (
                        <div className="mt-2 pt-2 border-t border-[#17211F]/10 dark:border-white/10 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                          {rt.known_barriers.map((b, i) => (
                            <div key={i}>Note: {b}</div>
                          ))}
                          {rt.unknown_disclosures.map((u, i) => (
                            <div key={i}>Disclosure: {u}</div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">{rt.blocked_reason}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Route Steps Preview */}
        {selectedRoute && selectedRoute.feasible && (
          <div className="space-y-1.5 pt-1">
            <h3 className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70">Route Steps</h3>
            <ol className="space-y-1.5">
              {selectedRoute.steps.map((s, i) => (
                <li key={s.edge_id + i} className="text-xs flex items-start gap-2 text-[#17211F]/80 dark:text-[#F7F8F3]/80">
                  <span className="font-mono font-semibold text-[#087F8C] dark:text-[#D3E94D] w-4 shrink-0">
                    {i + 1}.
                  </span>
                  <span>{s.instruction}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      {selectedRoute && selectedRoute.feasible && (
        <div className="p-4 border-t border-[#17211F]/10 dark:border-white/10 flex items-center gap-2 bg-white dark:bg-[#102B27]">
          <button
            type="button"
            onClick={() =>
              onStartNavigation(
                selectedRoute,
                destPlace?.name || plan?.destination.name || 'Destination',
                destPlace?.venue_id || null
              )
            }
            className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#087F8C] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#066974]"
          >
            <Navigation className="w-4 h-4" />
            Start Navigation
          </button>
          <button
            type="button"
            onClick={async () => {
              await onSaveRoute(
                `${plan?.origin.name} → ${destPlace?.name || plan?.destination.name}`,
                JSON.stringify({ origin: originNodeId, destination: destinationNodeId, mode: selectedRoute.mode }),
                destPlace?.id || null
              );
              setSavedNotice(true);
              setTimeout(() => setSavedNotice(false), 2000);
            }}
            aria-label="Save route"
            className="min-h-[46px] px-3.5 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold flex items-center gap-1.5"
          >
            <Bookmark className="w-4 h-4 text-[#087F8C]" />
            {savedNotice ? 'Saved' : 'Save'}
          </button>
        </div>
      )}
    </aside>
  );
};
