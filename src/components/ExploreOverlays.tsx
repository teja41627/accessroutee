import React, { useEffect, useState } from 'react';
import {
  Search,
  Mic,
  QrCode,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Navigation,
  Bookmark,
  AlertOctagon,
  Building2,
  X,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type { Asset, Incident, Place, SavedPlace, UserProfile } from '../types.ts';

interface ExploreOverlaysProps {
  places: Place[];
  assets: Asset[];
  incidents: Incident[];
  savedPlaces: SavedPlace[];
  activeProfile: UserProfile;
  selectedCategory: string;
  selectedPlace: Place | null;
  selectedAsset: Asset | null;
  selectedIncident: Incident | null;
  unreadNotifications: number;
  onSelectCategory: (cat: string) => void;
  onSelectPlace: (place: Place | null) => void;
  onSelectAsset: (asset: Asset | null) => void;
  onSelectIncident: (inc: Incident | null) => void;
  onOpenAsk: () => void;
  onOpenQr: () => void;
  onOpenYou: () => void;
  onStartDirectionsToNode: (nodeId: string, label: string) => void;
  onOpenIndoorVenue: (venueId: string) => void;
  onSavePlace: (place: Place) => Promise<void>;
  onReportIssueFor: (opts: { placeId?: string | null; assetId?: string | null; lat: number; lng: number }) => void;
  onSimulateLiftOutage: (assetId: string) => Promise<void>;
}

const CATEGORIES = [
  { id: 'ask', label: 'Ask AccessRoute' },
  { id: 'accessible', label: 'Accessible Places' },
  { id: 'station', label: 'Metro' },
  { id: 'bus_stop', label: 'Bus Stops' },
  { id: 'hospital', label: 'Hospitals' },
  { id: 'lift', label: 'Lifts' },
  { id: 'ramp', label: 'Ramps' },
  { id: 'toilet', label: 'Accessible Toilets' },
  { id: 'parking', label: 'Parking' },
];

function StatusRow({ op, ver }: { op: string; ver: string }) {
  if (op === 'unavailable' || ver === 'reported_unavailable') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Reported unavailable
      </span>
    );
  }
  if (ver === 'unknown' || op === 'unknown') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <HelpCircle className="w-4 h-4 shrink-0" />
        Unknown accessibility status
      </span>
    );
  }
  if (ver === 'unverified' || op === 'degraded') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Unverified / Caution
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F8C] dark:text-[#D3E94D]">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      Verified accessible
    </span>
  );
}

export const ExploreOverlays: React.FC<ExploreOverlaysProps> = ({
  places,
  assets,
  savedPlaces,
  activeProfile,
  selectedCategory,
  selectedPlace,
  selectedAsset,
  selectedIncident,
  unreadNotifications,
  onSelectCategory,
  onSelectPlace,
  onSelectAsset,
  onSelectIncident,
  onOpenAsk,
  onOpenQr,
  onOpenYou,
  onStartDirectionsToNode,
  onOpenIndoorVenue,
  onSavePlace,
  onReportIssueFor,
  onSimulateLiftOutage,
}) => {
  const [searchText, setSearchText] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(['UB City', 'MG Road Metro', "St. Martha's"]);
  const [listening, setListening] = useState(false);
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchText.trim().toLowerCase()), 180);
    return () => clearTimeout(t);
  }, [searchText]);

  const matchingPlaces = debouncedQuery
    ? places.filter(
        (p) =>
          p.name.toLowerCase().includes(debouncedQuery) ||
          p.address.toLowerCase().includes(debouncedQuery) ||
          p.category.toLowerCase().includes(debouncedQuery)
      )
    : [];

  const matchingAssets = debouncedQuery
    ? assets.filter(
        (a) =>
          a.name.toLowerCase().includes(debouncedQuery) ||
          a.asset_type.toLowerCase().includes(debouncedQuery)
      )
    : [];

  const handleVoiceSearch = () => {
    const Win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        start: () => void;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        start: () => void;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
      };
    };
    const SR = Win.SpeechRecognition || Win.webkitSpeechRecognition;
    if (!SR) {
      onOpenAsk();
      return;
    }
    const rec = new SR();
    rec.lang = 'en-IN';
    setListening(true);
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      setSearchText(transcript);
      setSearchFocused(true);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const isSaved = selectedPlace ? savedPlaces.some((s) => s.place_id === selectedPlace.id) : false;

  const initials = activeProfile.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Top Floating Search Bar + Category Rail */}
      <div className="absolute top-3 left-3 right-3 md:left-4 md:right-auto md:w-[540px] z-30 space-y-2.5 pointer-events-none">
        <div className="pointer-events-auto relative">
          <div className="flex items-center gap-1.5 bg-white dark:bg-[#102B27] rounded-2xl shadow-lg border border-[#17211F]/10 dark:border-white/15 px-3 py-1.5">
            <Search className="w-5 h-5 text-[#087F8C] shrink-0 ml-1" />
            <input
              type="text"
              value={searchText}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setSearchText(e.target.value);
                setSearchFocused(true);
              }}
              aria-label="Search places, stations, entrances"
              placeholder="Search places, stations, entrances..."
              className="flex-1 min-h-[42px] bg-transparent text-sm text-[#17211F] dark:text-[#F7F8F3] placeholder:text-[#17211F]/50 dark:placeholder:text-[#F7F8F3]/50 focus:outline-none"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                aria-label="Clear search"
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleVoiceSearch}
              aria-label="Voice input search"
              title="Voice input"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                listening ? 'bg-[#D3E94D] text-[#102B27]' : 'hover:bg-[#F7F8F3] dark:hover:bg-white/10'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenQr}
              aria-label="Scan venue or landmark QR code"
              title="QR Scanner"
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
            >
              <QrCode className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenYou}
              aria-label={`Profile: ${activeProfile.display_name}`}
              title={`${activeProfile.display_name} (${activeProfile.role})`}
              className="relative w-9 h-9 rounded-full bg-[#102B27] dark:bg-[#D3E94D] text-white dark:text-[#102B27] text-xs font-bold flex items-center justify-center shrink-0"
            >
              {initials}
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadNotifications}
                </span>
              )}
            </button>
          </div>

          {/* Autocomplete Dropdown */}
          {searchFocused && (
            <div className="mt-1.5 bg-white dark:bg-[#102B27] rounded-2xl shadow-xl border border-[#17211F]/10 dark:border-white/15 overflow-hidden max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#17211F]/10 dark:border-white/10 text-[11px] font-semibold text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                <span>{debouncedQuery ? 'Matching Network Locations' : 'Saved & Recent Destinations'}</span>
                <button type="button" onClick={() => setSearchFocused(false)} className="text-[#087F8C] dark:text-[#D3E94D]">
                  Done
                </button>
              </div>

              {!debouncedQuery ? (
                <div className="p-2 space-y-1">
                  {savedPlaces.map((sp) => {
                    const p = places.find((pl) => pl.id === sp.place_id);
                    if (!p) return null;
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          onSelectPlace(p);
                          setSearchFocused(false);
                        }}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Bookmark className="w-4 h-4 text-[#087F8C] shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{sp.label}</div>
                            <div className="text-[11px] text-[#17211F]/60 dark:text-[#F7F8F3]/60 truncate">{p.address}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setSearchText(term)}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 flex items-center gap-2.5 text-left text-xs text-[#17211F]/80 dark:text-[#F7F8F3]/80"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#17211F]/50 dark:text-[#F7F8F3]/50" />
                      {term}
                    </button>
                  ))}
                </div>
              ) : matchingPlaces.length === 0 && matchingAssets.length === 0 ? (
                <div className="p-5 text-center text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                  No matching places, stations, or accessible assets found for “{searchText}”.
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {matchingPlaces.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelectPlace(p);
                        if (!recentSearches.includes(p.name)) {
                          setRecentSearches((r) => [p.name, ...r.slice(0, 3)]);
                        }
                        setSearchFocused(false);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 flex items-center justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{p.name}</div>
                        <div className="text-[11px] text-[#17211F]/65 dark:text-[#F7F8F3]/65 truncate">{p.address}</div>
                      </div>
                      <StatusRow op={p.operational_status} ver={p.verification_status} />
                    </button>
                  ))}
                  {matchingAssets.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        onSelectAsset(a);
                        setSearchFocused(false);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 flex items-center justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{a.name}</div>
                        <div className="text-[11px] text-[#17211F]/65 dark:text-[#F7F8F3]/65 capitalize">{a.asset_type.replace('_', ' ')}</div>
                      </div>
                      <StatusRow op={a.operational_status} ver={a.verification_status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Horizontal Category Chips */}
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map((cat) => {
            const isAsk = cat.id === 'ask';
            const isActive = !isAsk && selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  if (isAsk) {
                    onOpenAsk();
                  } else {
                    onSelectCategory(isActive ? 'all' : cat.id);
                  }
                }}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 shadow-sm border flex items-center gap-1.5 transition-colors ${
                  isAsk
                    ? 'bg-[#102B27] text-[#D3E94D] border-[#102B27] hover:opacity-95'
                    : isActive
                    ? 'bg-[#087F8C] text-white border-[#087F8C]'
                    : 'bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] border-[#17211F]/10 dark:border-white/15 hover:border-[#087F8C]'
                }`}
              >
                {isAsk && <MessageSquare className="w-3.5 h-3.5" />}
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Marker Detail Bottom Sheet / Card */}
      {(selectedPlace || selectedAsset || selectedIncident) && (
        <div
          className="absolute bottom-0 md:bottom-4 left-0 right-0 md:left-4 md:right-auto md:w-[420px] z-30 bg-white dark:bg-[#102B27] rounded-t-3xl md:rounded-2xl shadow-2xl border border-[#17211F]/10 dark:border-white/15 p-4 md:p-5 space-y-3"
          role="dialog"
          aria-label="Location Accessibility Details"
        >
          <div className="md:hidden w-10 h-1.5 bg-[#17211F]/20 dark:bg-white/20 rounded-full mx-auto -mt-1" />

          {selectedPlace && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#17211F]/60 dark:text-[#F7F8F3]/60 capitalize">
                    {selectedPlace.category.replace('_', ' ')} · Simulated Bengaluru Demo
                  </div>
                  <h2 className="text-lg font-bold text-[#17211F] dark:text-[#F7F8F3] leading-snug">
                    {selectedPlace.name}
                  </h2>
                  <p className="text-xs text-[#17211F]/70 dark:text-[#F7F8F3]/70 mt-0.5">{selectedPlace.address}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPlace(null)}
                  aria-label="Close detail sheet"
                  className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-y border-[#17211F]/10 dark:border-white/10">
                <StatusRow op={selectedPlace.operational_status} ver={selectedPlace.verification_status} />
                <span className="text-[11px] font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                  Updated {new Date(selectedPlace.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <p className="text-sm text-[#17211F]/85 dark:text-[#F7F8F3]/85 leading-relaxed">
                {selectedPlace.accessibility_summary}
              </p>

              <div className="text-[11px] text-[#17211F]/60 dark:text-[#F7F8F3]/60 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#087F8C]" />
                Source: {selectedPlace.data_source}
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
                {selectedPlace.primary_node_id && (
                  <button
                    type="button"
                    onClick={() => onStartDirectionsToNode(selectedPlace.primary_node_id!, selectedPlace.name)}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#087F8C] text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#066974]"
                  >
                    <Navigation className="w-4 h-4" />
                    Directions
                  </button>
                )}
                {selectedPlace.venue_id && (
                  <button
                    type="button"
                    onClick={() => onOpenIndoorVenue(selectedPlace.venue_id!)}
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#102B27] dark:bg-[#D3E94D] text-white dark:text-[#102B27] text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Building2 className="w-4 h-4" />
                    Indoor Map
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSavePlace(selectedPlace)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[#087F8C] text-[#087F8C]' : ''}`} />
                  {isSaved ? 'Saved' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReportIssueFor({
                      placeId: selectedPlace.id,
                      lat: selectedPlace.lat,
                      lng: selectedPlace.lng,
                    })
                  }
                  className="min-h-[44px] px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <AlertOctagon className="w-4 h-4" />
                  Report Issue
                </button>
              </div>
            </>
          )}

          {selectedAsset && !selectedPlace && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#17211F]/60 dark:text-[#F7F8F3]/60 capitalize">
                    Infrastructure Asset · {selectedAsset.asset_type.replace('_', ' ')}
                  </div>
                  <h2 className="text-lg font-bold text-[#17211F] dark:text-[#F7F8F3]">{selectedAsset.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectAsset(null)}
                  aria-label="Close asset sheet"
                  className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center justify-between py-2 border-y border-[#17211F]/10 dark:border-white/10">
                <StatusRow op={selectedAsset.operational_status} ver={selectedAsset.verification_status} />
                <span className="text-[11px] font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                  {selectedAsset.data_source}
                </span>
              </div>

              <p className="text-sm text-[#17211F]/85 dark:text-[#F7F8F3]/85">{selectedAsset.accessibility_notes}</p>

              <div className="flex flex-wrap gap-2 pt-1">
                {selectedAsset.node_id && (
                  <button
                    type="button"
                    onClick={() => onStartDirectionsToNode(selectedAsset.node_id!, selectedAsset.name)}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#087F8C] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-4 h-4" />
                    Directions
                  </button>
                )}
                {selectedAsset.asset_type === 'lift' && selectedAsset.operational_status === 'operational' && (
                  <button
                    type="button"
                    disabled={simBusy}
                    onClick={async () => {
                      setSimBusy(true);
                      try {
                        await onSimulateLiftOutage(selectedAsset.id);
                      } finally {
                        setSimBusy(false);
                      }
                    }}
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {simBusy ? 'Triggering...' : 'Simulate Outage'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onReportIssueFor({
                      assetId: selectedAsset.id,
                      placeId: selectedAsset.place_id,
                      lat: selectedAsset.lat,
                      lng: selectedAsset.lng,
                    })
                  }
                  className="min-h-[44px] px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <AlertOctagon className="w-4 h-4" />
                  Report Issue
                </button>
              </div>
            </>
          )}

          {selectedIncident && !selectedPlace && !selectedAsset && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                    {selectedIncident.report_code} · {selectedIncident.category} · {selectedIncident.severity}
                  </div>
                  <h2 className="text-lg font-bold text-[#17211F] dark:text-[#F7F8F3]">{selectedIncident.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectIncident(null)}
                  aria-label="Close incident sheet"
                  className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-[#17211F]/80 dark:text-[#F7F8F3]/80">{selectedIncident.description}</p>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#17211F]/10 dark:border-white/10">
                <span className="font-semibold capitalize text-[#087F8C] dark:text-[#D3E94D]">
                  Status: {selectedIncident.status.replace('_', ' ')}
                </span>
                <span className="text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                  Reported by {selectedIncident.reporter_name || 'Citizen'}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};
