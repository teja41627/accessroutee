import React, { useEffect, useState } from 'react';
import {
  Building2,
  ClipboardCheck,
  QrCode,
  Map as MapIcon,
  ShieldAlert,
  Plus,
  CheckCircle2,
  RotateCcw,
  Save,
  UploadCloud,
  Download,
  UserCheck,
} from 'lucide-react';
import type {
  Asset,
  AuditLogEntry,
  Floor,
  Incident,
  IncidentStatus,
  MapEdge,
  MapNode,
  OperatorRecord,
  Organisation,
  UserProfile,
  Venue,
} from '../types.ts';

interface BusinessViewProps {
  profile: UserProfile;
  organisations: Organisation[];
  operators: Array<OperatorRecord & { name: string }>;
  venues: Venue[];
  assets: Asset[];
  incidents: Incident[];
  onSwitchUser: (userId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenIndoorVenue: (venueId: string) => void;
}

export const BusinessView: React.FC<BusinessViewProps> = ({
  profile,
  organisations,
  operators,
  venues,
  assets,
  incidents,
  onSwitchUser,
  onRefresh,
  onOpenIndoorVenue,
}) => {
  const [tab, setTab] = useState<'overview' | 'incidents' | 'venues' | 'editor' | 'qr'>('incidents');
  const [overviewData, setOverviewData] = useState<{
    authorised: boolean;
    metrics: { openIncidents: number; pendingReports: number; resolvedIncidents: number; resolutionRatePct: number };
    auditLogs: AuditLogEntry[];
  } | null>(null);

  // Passenger access request state
  const [reqOrg, setReqOrg] = useState('BMRCL Accessibility Operations (Simulated)');
  const [reqNote, setReqNote] = useState('');
  const [reqMessage, setReqMessage] = useState<string | null>(null);

  // Incident workflow state
  const [incFilter, setIncFilter] = useState<string>('all');
  const [resolutionText, setResolutionText] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Venue management state
  const [newVenueOpen, setNewVenueOpen] = useState(false);
  const [venueForm, setVenueForm] = useState({ name: '', category: 'venue', address: '', description: '' });

  // Indoor editor state
  const [editorVenueId, setEditorVenueId] = useState<string>(venues[0]?.id || 'venue-ubcity');
  const [editorData, setEditorData] = useState<{
    venue: Venue;
    floors: Floor[];
    nodes: MapNode[];
    edges: MapEdge[];
  } | null>(null);
  const [editorFloorId, setEditorFloorId] = useState<string>('');
  const [editorTool, setEditorTool] = useState<'select' | 'add_node' | 'connect' | 'move'>('select');
  const [newNodeType, setNewNodeType] = useState<string>('lift');
  const [newNodeName, setNewNodeName] = useState<string>('Accessible Lift C');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectEdgeType, setConnectEdgeType] = useState<string>('corridor');

  // QR generator state
  const [qrVenueId, setQrVenueId] = useState<string>(venues[0]?.id || 'venue-ubcity');
  const [qrResult, setQrResult] = useState<{
    venueName: string;
    token: string;
    payload: string;
    dataUrl: string;
    svg: string;
  } | null>(null);

  const loadOverview = () => {
    fetch(`/api/business/overview?userId=${encodeURIComponent(profile.id)}`)
      .then((r) => r.json())
      .then(setOverviewData)
      .catch(() => {});
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, incidents.length]);

  useEffect(() => {
    if (!editorVenueId || tab !== 'editor') return;
    fetch(`/api/venues/${editorVenueId}/indoor`)
      .then((r) => r.json())
      .then((d) => {
        setEditorData(d);
        if (d.floors?.[0] && !d.floors.some((f: Floor) => f.id === editorFloorId)) {
          setEditorFloorId(d.floors[0].id);
        }
      });
  }, [editorVenueId, tab, editorFloorId]);

  useEffect(() => {
    if (!qrVenueId || tab !== 'qr') return;
    fetch(`/api/venues/${qrVenueId}/qr`)
      .then((r) => r.json())
      .then(setQrResult)
      .catch(() => {});
  }, [qrVenueId, tab]);

  const handleTransition = async (incidentId: string, nextStatus: IncidentStatus, defaultNote: string) => {
    setActionBusy(incidentId);
    setBannerMsg(null);
    try {
      const note = resolutionText[incidentId]?.trim() || defaultNote;
      const res = await fetch(`/api/incidents/${incidentId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorUserId: profile.id,
          nextStatus,
          note,
          resolutionNotes: nextStatus === 'resolved' ? note : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transition failed');
      setBannerMsg(`Updated ${data.incident.report_code} to "${nextStatus.replace('_', ' ')}". Graph & map synced.`);
      await onRefresh();
      loadOverview();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'Update error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleResetDemo = async () => {
    setBannerMsg(null);
    const res = await fetch('/api/admin/reset-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUserId: profile.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBannerMsg(data.error || 'Reset failed');
      return;
    }
    setBannerMsg(data.message);
    await onRefresh();
    loadOverview();
  };

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueForm.name.trim()) return;
    const res = await fetch('/api/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorUserId: profile.id,
        organisationId: profile.operator?.organisation_id || 'org-civic',
        ...venueForm,
      }),
    });
    if (res.ok) {
      setVenueForm({ name: '', category: 'venue', address: '', description: '' });
      setNewVenueOpen(false);
      await onRefresh();
    }
  };

  const sendEditorAction = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/venues/${editorVenueId}/indoor-editor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUserId: profile.id, action, payload }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEditorData(updated);
      if (action === 'publish' || action === 'save_draft') {
        setBannerMsg(
          action === 'publish'
            ? 'Indoor map published — now live in Explore!'
            : 'Indoor map draft saved.'
        );
        await onRefresh();
      }
    }
  };

  // Ordinary passenger view: public venue directory + Request Operator Access + 1-click demo switch
  if (!profile.operator) {
    return (
      <div className="h-full overflow-y-auto bg-[#F7F8F3] dark:bg-[#0D1917] pb-24 md:pb-10">
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-[#17211F] dark:text-[#F7F8F3]">
                  Business &amp; Venue Operator Portal
                </h1>
                <p className="text-sm text-[#17211F]/70 dark:text-[#F7F8F3]/70 mt-1">
                  Signed in as <strong>{profile.display_name}</strong> (Passenger). Operator tools require organisation authorisation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSwitchUser('user-op-priya')}
                className="min-h-[44px] px-4 rounded-xl bg-[#087F8C] text-white text-xs font-semibold inline-flex items-center gap-2 shrink-0 hover:bg-[#066974]"
              >
                <UserCheck className="w-4 h-4" />
                Switch to Operator (Priya Menon)
              </button>
            </div>
          </div>

          {/* Public Venue & Organisation Directory */}
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3">
            <h2 className="text-base font-bold">Published Venue Maps &amp; Civic Organisations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {venues.map((v) => (
                <div key={v.id} className="p-4 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10 space-y-2">
                  <div className="text-sm font-bold">{v.name}</div>
                  <p className="text-xs text-[#17211F]/70 dark:text-[#F7F8F3]/70">{v.address}</p>
                  <button
                    type="button"
                    onClick={() => onOpenIndoorVenue(v.id)}
                    className="min-h-[38px] px-3 rounded-lg bg-[#102B27] dark:bg-[#D3E94D] text-white dark:text-[#102B27] text-xs font-semibold"
                  >
                    Open Indoor Map
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Request Organisation Access */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await fetch('/api/business/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: profile.id, organisationName: reqOrg, roleNote: reqNote }),
              });
              const d = await res.json();
              setReqMessage(d.message);
            }}
            className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3"
          >
            <h2 className="text-base font-bold">Request Organisation Access</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={reqOrg}
                onChange={(e) => setReqOrg(e.target.value)}
                className="min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
              >
                {organisations.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={reqNote}
                onChange={(e) => setReqNote(e.target.value)}
                placeholder="Role or venue responsibility note..."
                className="min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-xl bg-[#102B27] text-white text-xs font-semibold"
            >
              Submit Access Request
            </button>
            {reqMessage && <p className="text-xs text-[#087F8C] dark:text-[#D3E94D]">{reqMessage}</p>}
          </form>
        </div>
      </div>
    );
  }

  const filteredIncidents = incidents.filter((i) => (incFilter === 'all' ? true : i.status === incFilter));
  const editorFloorNodes = editorData?.nodes.filter((n) => n.floor_id === editorFloorId) || [];
  const editorFloorNodeIds = new Set(editorFloorNodes.map((n) => n.id));
  const editorFloorEdges =
    editorData?.edges.filter((e) => editorFloorNodeIds.has(e.from_node_id) && editorFloorNodeIds.has(e.to_node_id)) || [];
  const selectedEditorNode = editorData?.nodes.find((n) => n.id === selectedNodeId) || null;

  return (
    <div className="h-full overflow-y-auto bg-[#F7F8F3] dark:bg-[#0D1917] pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
        {/* Operator Header */}
        <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#087F8C] dark:text-[#D3E94D]">
              {profile.operator.organisation_name} · {profile.operator.title}
            </div>
            <h1 className="text-xl font-bold text-[#17211F] dark:text-[#F7F8F3]">
              AccessRoute Operations &amp; Venue Console
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(profile.role === 'admin' || profile.operator.role === 'manager' || profile.operator.role === 'admin') && (
              <button
                type="button"
                onClick={handleResetDemo}
                className="min-h-[40px] px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Demo Network
              </button>
            )}
            <button
              type="button"
              onClick={() => onSwitchUser('user-aarav')}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold"
            >
              Switch to Passenger (Aarav)
            </button>
          </div>
        </div>

        {bannerMsg && (
          <div className="px-4 py-3 rounded-xl bg-[#087F8C]/10 border border-[#087F8C] text-xs font-semibold text-[#102B27] dark:text-[#D3E94D]">
            {bannerMsg}
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Managed Venues', val: venues.length },
            { label: 'Managed Assets', val: assets.length },
            { label: 'Open Incidents', val: overviewData?.metrics.openIncidents ?? 0 },
            { label: 'Pending Reports', val: overviewData?.metrics.pendingReports ?? 0 },
            { label: 'Resolution Rate', val: `${overviewData?.metrics.resolutionRatePct ?? 0}%` },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-4"
            >
              <div className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">{kpi.label}</div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-[#17211F] dark:text-[#F7F8F3]">
                {kpi.val}
              </div>
            </div>
          ))}
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'incidents', label: 'Incident Dashboard', icon: ShieldAlert },
            { id: 'venues', label: 'Venues & Assets', icon: Building2 },
            { id: 'editor', label: 'Indoor Map Editor', icon: MapIcon },
            { id: 'qr', label: 'QR Codes', icon: QrCode },
            { id: 'overview', label: 'Audit & Operators', icon: ClipboardCheck },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`min-h-[42px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 border transition-colors ${
                  active
                    ? 'bg-[#087F8C] text-white border-[#087F8C]'
                    : 'bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] border-[#17211F]/10 dark:border-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* INCIDENT DASHBOARD */}
        {tab === 'incidents' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold">Live Incident Queue</h2>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'resolved', 'reopened'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setIncFilter(st)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold capitalize ${
                      incFilter === st
                        ? 'bg-[#102B27] text-white dark:bg-[#D3E94D] dark:text-[#102B27]'
                        : 'bg-[#F7F8F3] dark:bg-[#0D1917] text-[#17211F]/75 dark:text-[#F7F8F3]/75'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-[#17211F]/10 dark:divide-white/10">
              {filteredIncidents.map((inc) => (
                <div key={inc.id} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#087F8C] dark:text-[#D3E94D]">{inc.report_code}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold capitalize">{inc.severity}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize font-semibold">{inc.status.replace('_', ' ')}</span>
                      {inc.asset_name && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#17211F]/70 dark:text-[#F7F8F3]/70">{inc.asset_name}</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm font-bold text-[#17211F] dark:text-[#F7F8F3]">{inc.title}</div>
                    <p className="text-xs text-[#17211F]/75 dark:text-[#F7F8F3]/75">{inc.description}</p>
                    {inc.resolution_notes && (
                      <p className="text-xs text-[#087F8C] dark:text-[#D3E94D]">Resolution: {inc.resolution_notes}</p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={resolutionText[inc.id] || ''}
                      onChange={(e) => setResolutionText((r) => ({ ...r, [inc.id]: e.target.value }))}
                      placeholder="Operator note / resolution evidence..."
                      className="min-h-[40px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs w-full sm:w-52"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {inc.status !== 'verified' && inc.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={actionBusy === inc.id}
                          onClick={() => handleTransition(inc.id, 'verified', 'Verified by operations lead.')}
                          className="min-h-[40px] px-3 rounded-xl bg-[#102B27] text-white text-xs font-semibold"
                        >
                          Verify
                        </button>
                      )}
                      {inc.status !== 'assigned' && inc.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={actionBusy === inc.id}
                          onClick={() => handleTransition(inc.id, 'assigned', 'Assigned to field engineer.')}
                          className="min-h-[40px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold"
                        >
                          Assign
                        </button>
                      )}
                      {inc.status !== 'resolved' ? (
                        <button
                          type="button"
                          disabled={actionBusy === inc.id}
                          onClick={() =>
                            handleTransition(
                              inc.id,
                              'resolved',
                              'Inspected, repaired, and verified step-free operational.'
                            )
                          }
                          className="min-h-[40px] px-3 rounded-xl bg-[#087F8C] text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionBusy === inc.id}
                          onClick={() => handleTransition(inc.id, 'reopened', 'Reopened for follow-up inspection.')}
                          className="min-h-[40px] px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-semibold"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VENUES MANAGEMENT */}
        {tab === 'venues' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Managed Venues</h2>
              <button
                type="button"
                onClick={() => setNewVenueOpen((v) => !v)}
                className="min-h-[40px] px-3.5 rounded-xl bg-[#087F8C] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Create Venue
              </button>
            </div>

            {newVenueOpen && (
              <form onSubmit={handleCreateVenue} className="p-4 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Venue Name"
                    value={venueForm.name}
                    onChange={(e) => setVenueForm((f) => ({ ...f, name: e.target.value }))}
                    className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/15 text-sm"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Street Address, Bengaluru"
                    value={venueForm.address}
                    onChange={(e) => setVenueForm((f) => ({ ...f, address: e.target.value }))}
                    className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/15 text-sm"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Accessibility overview..."
                  value={venueForm.description}
                  onChange={(e) => setVenueForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full p-3 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/15 text-sm"
                />
                <button type="submit" className="min-h-[40px] px-4 rounded-xl bg-[#102B27] text-white text-xs font-semibold">
                  Save New Venue
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {venues.map((v) => (
                <div key={v.id} className="p-4 rounded-2xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold">{v.name}</div>
                      <div className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">{v.address}</div>
                    </div>
                    <span className="text-xs font-semibold text-[#087F8C] dark:text-[#D3E94D]">
                      {v.published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-[#17211F]/80 dark:text-[#F7F8F3]/80">{v.description}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditorVenueId(v.id);
                        setTab('editor');
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-[#087F8C] text-white text-xs font-semibold"
                    >
                      Edit Indoor Map
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQrVenueId(v.id);
                        setTab('qr');
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/15 text-xs font-semibold"
                    >
                      QR Code
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INDOOR MAP EDITOR */}
        {tab === 'editor' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={editorVenueId}
                  onChange={(e) => {
                    setEditorVenueId(e.target.value);
                    setEditorFloorId('');
                    setSelectedNodeId(null);
                  }}
                  className="min-h-[40px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 text-xs font-semibold"
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                {editorData?.floors.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setEditorFloorId(f.id)}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold ${
                      editorFloorId === f.id
                        ? 'bg-[#102B27] text-white dark:bg-[#D3E94D] dark:text-[#102B27]'
                        : 'bg-[#F7F8F3] dark:bg-[#0D1917]'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenIndoorVenue(editorVenueId)}
                  className="min-h-[38px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 text-xs font-semibold"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => sendEditorAction('save_draft', {})}
                  className="min-h-[38px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" /> Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => sendEditorAction('publish', {})}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#087F8C] text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  <UploadCloud className="w-3.5 h-3.5" /> Publish to Explore
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Editor Canvas */}
              <div className="lg:col-span-8 space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'select', label: 'Select / Edit' },
                    { id: 'add_node', label: 'Click Canvas to Add Node' },
                    { id: 'move', label: 'Move Selected Node' },
                    { id: 'connect', label: 'Connect Two Nodes' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setEditorTool(m.id as typeof editorTool);
                        setConnectFromId(null);
                      }}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border ${
                        editorTool === m.id
                          ? 'bg-[#087F8C] text-white border-[#087F8C]'
                          : 'bg-[#F7F8F3] dark:bg-[#0D1917] border-[#17211F]/10'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 aspect-[4/3] w-full overflow-hidden">
                  <svg
                    viewBox="0 0 600 450"
                    className="w-full h-full cursor-crosshair"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const xNorm = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
                      const yNorm = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
                      if (editorTool === 'add_node' && editorFloorId) {
                        sendEditorAction('add_node', {
                          floorId: editorFloorId,
                          nodeType: newNodeType,
                          name: newNodeName,
                          xNorm,
                          yNorm,
                          stepFree: newNodeType !== 'stairs',
                          wheelchairAccessible: newNodeType !== 'stairs',
                        });
                      } else if (editorTool === 'move' && selectedNodeId) {
                        sendEditorAction('move_node', { nodeId: selectedNodeId, xNorm, yNorm });
                      }
                    }}
                  >
                    <rect x="30" y="30" width="540" height="390" rx="16" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
                    {editorFloorEdges.map((edge) => {
                      const f = editorFloorNodes.find((n) => n.id === edge.from_node_id);
                      const t = editorFloorNodes.find((n) => n.id === edge.to_node_id);
                      if (!f || !t) return null;
                      return (
                        <line
                          key={edge.id}
                          x1={(f.x_norm ?? 0.5) * 540 + 30}
                          y1={(f.y_norm ?? 0.5) * 390 + 30}
                          x2={(t.x_norm ?? 0.5) * 540 + 30}
                          y2={(t.y_norm ?? 0.5) * 390 + 30}
                          stroke={edge.has_stairs ? '#94A3B8' : '#087F8C'}
                          strokeWidth="4"
                          strokeDasharray={edge.has_stairs ? '5 4' : undefined}
                        />
                      );
                    })}

                    {editorFloorNodes.map((n) => {
                      const cx = (n.x_norm ?? 0.5) * 540 + 30;
                      const cy = (n.y_norm ?? 0.5) * 390 + 30;
                      const isSel = n.id === selectedNodeId || n.id === connectFromId;
                      return (
                        <g
                          key={n.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            if (editorTool === 'connect') {
                              if (!connectFromId) {
                                setConnectFromId(n.id);
                              } else if (connectFromId !== n.id) {
                                sendEditorAction('connect_nodes', {
                                  fromNodeId: connectFromId,
                                  toNodeId: n.id,
                                  edgeType: connectEdgeType,
                                });
                                setConnectFromId(null);
                              }
                            } else {
                              setSelectedNodeId(n.id);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={cx}
                            cy={cy}
                            r={14}
                            fill={n.node_type === 'stairs' ? '#64748B' : '#087F8C'}
                            stroke={isSel ? '#D3E94D' : '#FFFFFF'}
                            strokeWidth={isSel ? 4 : 2.5}
                          />
                          <text x={cx} y={cy + 27} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="currentColor">
                            {n.name.slice(0, 22)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>

              {/* Editor Inspector */}
              <div className="lg:col-span-4 space-y-4 bg-[#F7F8F3] dark:bg-[#0D1917] rounded-2xl p-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-bold">New Node Settings</h3>
                  <select
                    value={newNodeType}
                    onChange={(e) => setNewNodeType(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/15 text-xs"
                  >
                    <option value="lift">Lift</option>
                    <option value="ramp">Ramp</option>
                    <option value="stairs">Stairs</option>
                    <option value="corridor">Corridor</option>
                    <option value="entrance">Entrance</option>
                    <option value="exit">Exit</option>
                    <option value="toilet">Accessible Toilet</option>
                    <option value="landmark">Landmark</option>
                  </select>
                  <input
                    type="text"
                    value={newNodeName}
                    onChange={(e) => setNewNodeName(e.target.value)}
                    placeholder="Node name"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/15 text-xs"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-[#17211F]/10">
                  <h3 className="text-xs font-bold">Connect Edge Type</h3>
                  <select
                    value={connectEdgeType}
                    onChange={(e) => setConnectEdgeType(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#102B27] border border-[#17211F]/15 text-xs"
                  >
                    <option value="corridor">Step-Free Corridor</option>
                    <option value="ramp">Accessible Ramp</option>
                    <option value="lift_shaft">Lift Shaft</option>
                    <option value="staircase">Staircase</option>
                  </select>
                </div>

                {selectedEditorNode && (
                  <div className="space-y-2 pt-2 border-t border-[#17211F]/10">
                    <h3 className="text-xs font-bold">Selected Node Attributes</h3>
                    <div className="text-xs font-semibold">{selectedEditorNode.name}</div>
                    <label className="flex items-center justify-between text-xs">
                      <span>Step-free</span>
                      <input
                        type="checkbox"
                        checked={selectedEditorNode.step_free}
                        onChange={(e) =>
                          sendEditorAction('update_node', {
                            nodeId: selectedEditorNode.id,
                            stepFree: e.target.checked,
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span>Wheelchair accessible</span>
                      <input
                        type="checkbox"
                        checked={selectedEditorNode.wheelchair_accessible}
                        onChange={(e) =>
                          sendEditorAction('update_node', {
                            nodeId: selectedEditorNode.id,
                            wheelchairAccessible: e.target.checked,
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span>Tactile paving</span>
                      <input
                        type="checkbox"
                        checked={selectedEditorNode.has_tactile_paving}
                        onChange={(e) =>
                          sendEditorAction('update_node', {
                            nodeId: selectedEditorNode.id,
                            hasTactilePaving: e.target.checked,
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QR CODES */}
        {tab === 'qr' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Published Venue QR Codes</h2>
                <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                  Scanning any generated QR code opens the exact venue indoor navigation map.
                </p>
              </div>
              <select
                value={qrVenueId}
                onChange={(e) => setQrVenueId(e.target.value)}
                className="min-h-[42px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 text-sm font-semibold"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {qrResult && (
              <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-2xl bg-[#F7F8F3] dark:bg-[#0D1917]">
                <img
                  src={qrResult.dataUrl}
                  alt={`QR Code for ${qrResult.venueName}`}
                  className="w-44 h-44 rounded-xl bg-white p-2 border border-[#17211F]/10"
                />
                <div className="space-y-2.5">
                  <div className="text-base font-bold">{qrResult.venueName}</div>
                  <div className="text-xs font-mono text-[#17211F]/70 dark:text-[#F7F8F3]/70">
                    Token: {qrResult.token}
                  </div>
                  <div className="text-xs font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60 break-all">
                    URI: {qrResult.payload}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={qrResult.dataUrl}
                      download={`${qrResult.token}.png`}
                      className="min-h-[40px] px-3.5 rounded-xl bg-[#102B27] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" /> Download PNG
                    </a>
                    <button
                      type="button"
                      onClick={() => onOpenIndoorVenue(qrVenueId)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-[#087F8C] text-white text-xs font-semibold"
                    >
                      Test Open Venue Map
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AUDIT & OPERATORS */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3">
              <h2 className="text-base font-bold">Authorised Operators (5 Simulated)</h2>
              <div className="divide-y divide-[#17211F]/10 dark:divide-white/10">
                {operators.map((op) => (
                  <div key={op.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{op.name}</div>
                      <div className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                        {op.title} · {op.organisation_name}
                      </div>
                    </div>
                    <span className="text-xs font-mono capitalize text-[#087F8C] dark:text-[#D3E94D]">{op.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3">
              <h2 className="text-base font-bold">Audit History</h2>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(overviewData?.auditLogs || []).map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] text-xs flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold text-[#087F8C] dark:text-[#D3E94D]">{log.action}</span>
                      <span className="ml-2 text-[#17211F]/70 dark:text-[#F7F8F3]/70">
                        by {log.actor_name || log.actor_user_id}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[#17211F]/55 dark:text-[#F7F8F3]/55">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
