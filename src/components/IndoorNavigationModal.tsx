import React, { useEffect, useState } from 'react';
import {
  X,
  Building2,
  QrCode,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  Accessibility,
} from 'lucide-react';
import type { ComputedRoute, Floor, MapEdge, MapNode, UserProfile, Venue } from '../types.ts';

interface IndoorNavigationModalProps {
  venueId: string | null;
  initialNodeId?: string | null;
  profile: UserProfile;
  onClose: () => void;
  onOpenQrScanner: () => void;
}

interface IndoorPayload {
  venue: Venue;
  floors: Floor[];
  nodes: MapNode[];
  edges: MapEdge[];
}

export const IndoorNavigationModal: React.FC<IndoorNavigationModalProps> = ({
  venueId,
  initialNodeId,
  profile,
  onClose,
  onOpenQrScanner,
}) => {
  const [data, setData] = useState<IndoorPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFloorId, setActiveFloorId] = useState<string>('');
  const [confirmedLandmarkId, setConfirmedLandmarkId] = useState<string>('');
  const [destNodeId, setDestNodeId] = useState<string>('');
  const [indoorRoute, setIndoorRoute] = useState<ComputedRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/venues/${venueId}/indoor`)
      .then((r) => r.json())
      .then((payload: IndoorPayload) => {
        setData(payload);
        const startNode =
          (initialNodeId && payload.nodes.find((n) => n.id === initialNodeId)) ||
          payload.nodes.find((n) => n.node_type === 'entrance') ||
          payload.nodes[0];

        if (startNode) {
          setConfirmedLandmarkId(startNode.id);
          setActiveFloorId(startNode.floor_id || payload.floors[0]?.id || '');
        } else if (payload.floors[0]) {
          setActiveFloorId(payload.floors[0].id);
        }

        const defaultDest =
          payload.nodes.find((n) => n.node_type === 'toilet' || n.node_type === 'exit' || n.node_type === 'landmark') ||
          payload.nodes[payload.nodes.length - 1];
        if (defaultDest && defaultDest.id !== startNode?.id) {
          setDestNodeId(defaultDest.id);
        }
      })
      .finally(() => setLoading(false));
  }, [venueId, initialNodeId]);

  useEffect(() => {
    if (!confirmedLandmarkId || !destNodeId || confirmedLandmarkId === destNodeId) {
      setIndoorRoute(null);
      return;
    }
    setRouteError(null);
    fetch('/api/routes/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originNodeId: confirmedLandmarkId,
        destinationNodeId: destNodeId,
        constraints: {
          stepFree: profile.step_free,
          avoidStairs: profile.avoid_stairs,
          wheelchairAccessible: profile.wheelchair_accessible,
          maxWalkingM: profile.max_walking_m,
          preferFewerTransfers: profile.prefer_fewer_transfers,
        },
      }),
    })
      .then((r) => r.json())
      .then((plan) => {
        const best = plan.routes?.[0] || null;
        setIndoorRoute(best);
        if (best && !best.feasible) {
          setRouteError(best.blocked_reason || 'No step-free indoor route available.');
        }
      })
      .catch(() => setRouteError('Failed to calculate indoor route.'));
  }, [confirmedLandmarkId, destNodeId, profile]);

  if (!venueId) return null;

  const floorNodes = data?.nodes.filter((n) => n.floor_id === activeFloorId) || [];
  const floorNodeIds = new Set(floorNodes.map((n) => n.id));
  const floorEdges = data?.edges.filter((e) => floorNodeIds.has(e.from_node_id) && floorNodeIds.has(e.to_node_id)) || [];
  const confirmedNode = data?.nodes.find((n) => n.id === confirmedLandmarkId);
  const routeEdgeIds = new Set(indoorRoute?.steps.map((s) => s.edge_id) || []);

  const nodeColor = (n: MapNode) => {
    if (n.id === confirmedLandmarkId) return '#D3E94D';
    if (n.id === destNodeId) return '#102B27';
    if (n.node_type === 'stairs') return '#94A3B8';
    if (n.node_type === 'lift') return '#087F8C';
    if (n.node_type === 'toilet') return '#0EA5E9';
    return '#14B8A6';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Indoor Venue Navigation"
    >
      <div className="w-full md:max-w-4xl bg-white dark:bg-[#102B27] rounded-t-3xl md:rounded-2xl shadow-2xl border border-[#17211F]/10 dark:border-white/10 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#17211F]/10 dark:border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#087F8C]/10 text-[#087F8C] dark:text-[#D3E94D] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#17211F] dark:text-[#F7F8F3] truncate">
                {data?.venue.name || 'Loading Venue...'}
              </h2>
              <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65 truncate">
                Indoor Step-Free Graph · Multi-Floor Wayfinding
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenQrScanner}
              className="min-h-[40px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold flex items-center gap-1.5 hover:border-[#087F8C]"
            >
              <QrCode className="w-4 h-4 text-[#087F8C]" />
              Confirm Landmark QR
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close indoor map"
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading || !data ? (
          <div className="p-10 text-center text-sm text-[#17211F]/65 dark:text-[#F7F8F3]/65">
            Loading indoor venue graph...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
            {/* Left / Top: Interactive SVG Floor Map */}
            <div className="lg:col-span-7 p-4 md:p-5 bg-[#F7F8F3] dark:bg-[#0D1917] flex flex-col gap-3">
              {/* Honest Landmark Positioning Disclosure */}
              <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-semibold text-[#087F8C] dark:text-[#D3E94D]">Last confirmed landmark: </span>
                  <span className="font-medium text-[#17211F] dark:text-[#F7F8F3]">
                    {confirmedNode?.name || 'Unknown'}
                  </span>
                  <span className="text-[#17211F]/60 dark:text-[#F7F8F3]/60 ml-2">
                    (Manual / QR confirmation — not live indoor GPS)
                  </span>
                </div>
                {confirmedNode?.qr_landmark_code && (
                  <span className="font-mono text-[11px] text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                    {confirmedNode.qr_landmark_code}
                  </span>
                )}
              </div>

              {/* Floor Selector */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {data.floors.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFloorId(f.id)}
                    className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      activeFloorId === f.id
                        ? 'bg-[#102B27] text-white dark:bg-[#D3E94D] dark:text-[#102B27]'
                        : 'bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] border border-[#17211F]/10 dark:border-white/10'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>

              {/* Interactive SVG Floor Plan Canvas */}
              <div className="relative bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 aspect-[4/3] w-full overflow-hidden">
                <svg viewBox="0 0 600 450" className="w-full h-full" role="img" aria-label="Indoor floor plan graph">
                  {/* Floor grid */}
                  <defs>
                    <pattern id="indoorGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path
                        d="M 30 0 L 0 0 0 30"
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity="0.06"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect width="600" height="450" fill="url(#indoorGrid)" />
                  {/* Architectural perimeter */}
                  <rect
                    x="36"
                    y="36"
                    width="528"
                    height="378"
                    rx="18"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.14"
                    strokeWidth="2"
                  />

                  {/* Edges */}
                  {floorEdges.map((edge) => {
                    const from = floorNodes.find((n) => n.id === edge.from_node_id);
                    const to = floorNodes.find((n) => n.id === edge.to_node_id);
                    if (!from || !to) return null;
                    const x1 = (from.x_norm ?? 0.5) * 528 + 36;
                    const y1 = (from.y_norm ?? 0.5) * 378 + 36;
                    const x2 = (to.x_norm ?? 0.5) * 528 + 36;
                    const y2 = (to.y_norm ?? 0.5) * 378 + 36;
                    const isRoute = routeEdgeIds.has(edge.id);
                    return (
                      <line
                        key={edge.id}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={
                          isRoute
                            ? '#087F8C'
                            : edge.has_stairs
                            ? '#CBD5E1'
                            : edge.operational_status === 'unavailable'
                            ? '#DC2626'
                            : '#94A3B8'
                        }
                        strokeWidth={isRoute ? 6 : 3}
                        strokeDasharray={edge.has_stairs ? '5 4' : undefined}
                        strokeLinecap="round"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {floorNodes.map((n) => {
                    const cx = (n.x_norm ?? 0.5) * 528 + 36;
                    const cy = (n.y_norm ?? 0.5) * 378 + 36;
                    const isOrigin = n.id === confirmedLandmarkId;
                    const isDest = n.id === destNodeId;
                    return (
                      <g
                        key={n.id}
                        onClick={() => setDestNodeId(n.id)}
                        className="cursor-pointer"
                        role="button"
                        tabIndex={0}
                        aria-label={`${n.name} (${n.node_type})`}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isOrigin || isDest ? 17 : 13}
                          fill={nodeColor(n)}
                          stroke="#FFFFFF"
                          strokeWidth="3"
                        />
                        <text
                          x={cx}
                          y={cy + 4}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="700"
                          fill={isOrigin ? '#102B27' : '#FFFFFF'}
                        >
                          {n.node_type === 'lift'
                            ? 'L'
                            : n.node_type === 'stairs'
                            ? 'S'
                            : n.node_type === 'toilet'
                            ? 'WC'
                            : n.node_type === 'entrance'
                            ? 'IN'
                            : n.node_type === 'ramp'
                            ? 'R'
                            : '•'}
                        </text>
                        <text
                          x={cx}
                          y={cy + 29}
                          textAnchor="middle"
                          fontSize="10.5"
                          fontWeight="600"
                          fill="currentColor"
                          className="text-[#17211F] dark:text-[#F7F8F3]"
                        >
                          {n.name.replace(/\s*\([^)]*\)/g, '').slice(0, 26)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#17211F]/70 dark:text-[#F7F8F3]/70 px-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#D3E94D] border border-[#102B27]" /> Confirmed Position
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#087F8C]" /> Lift / Step-free Route
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#0EA5E9]" /> Accessible Toilet
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#94A3B8]" /> Stairs (excluded in step-free)
                </span>
              </div>
            </div>

            {/* Right: Indoor Route Controls & Turn-by-Turn Steps */}
            <div className="lg:col-span-5 p-5 space-y-4 border-t lg:border-t-0 lg:border-l border-[#17211F]/10 dark:border-white/10">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70 mb-1">
                    Confirmed Indoor Location
                  </label>
                  <select
                    value={confirmedLandmarkId}
                    onChange={(e) => {
                      setConfirmedLandmarkId(e.target.value);
                      const chosen = data.nodes.find((n) => n.id === e.target.value);
                      if (chosen?.floor_id) setActiveFloorId(chosen.floor_id);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                  >
                    {data.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70 mb-1">
                    Indoor Destination
                  </label>
                  <select
                    value={destNodeId}
                    onChange={(e) => setDestNodeId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                  >
                    {data.nodes
                      .filter((n) => n.id !== confirmedLandmarkId)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {routeError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{routeError}</span>
                </div>
              )}

              {indoorRoute && indoorRoute.feasible && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#087F8C] dark:text-[#D3E94D] flex items-center gap-1.5">
                        <Accessibility className="w-4 h-4" />
                        {indoorRoute.accessibility_compatibility}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-[#17211F]/70 dark:text-[#F7F8F3]/70">
                        {indoorRoute.total_distance_m}m · ~{indoorRoute.estimated_minutes} min
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70">
                      Step-by-Step Indoor Directions
                    </h3>
                    <ol className="space-y-2">
                      {indoorRoute.steps.map((step, i) => (
                        <li
                          key={step.edge_id + i}
                          onClick={() => {
                            if (step.floor_id) setActiveFloorId(step.floor_id);
                          }}
                          className="p-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10 flex items-start gap-3 cursor-pointer hover:border-[#087F8C]"
                        >
                          <span className="w-6 h-6 rounded-lg bg-[#087F8C] text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {step.maneuver === 'lift' ? <ArrowUpDown className="w-3.5 h-3.5" /> : i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#17211F] dark:text-[#F7F8F3]">{step.instruction}</p>
                            <p className="text-[11px] font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60 mt-0.5">
                              {step.distance_m}m · {step.step_free ? 'Step-free' : 'Includes stairs'}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const dest = data.nodes.find((n) => n.id === destNodeId);
                      if (dest) {
                        setConfirmedLandmarkId(dest.id);
                        if (dest.floor_id) setActiveFloorId(dest.floor_id);
                      }
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-[#087F8C] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#066974]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm Arrival at Destination Landmark
                  </button>
                </div>
              )}

              {!indoorRoute && !routeError && (
                <div className="p-4 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] text-xs text-[#17211F]/70 dark:text-[#F7F8F3]/70 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-[#087F8C]" />
                  Select any indoor landmark or destination to calculate a multi-floor route.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
