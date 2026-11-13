/// <reference types="google.maps" />
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  Crosshair,
  Layers,
  SlidersHorizontal,
  AlertOctagon,
  Navigation,
  Moon,
  Sun,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import type { Asset, ComputedRoute, Incident, Place } from '../types.ts';

interface OutdoorEdgeGeo {
  id: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  edge_type: string;
  step_free: number;
  operational_status: string;
  asset_status?: string | null;
}

interface InteractiveMapProps {
  mapsApiKey: string;
  configLoaded: boolean;
  places: Place[];
  assets: Asset[];
  incidents: Incident[];
  outdoorEdges: OutdoorEdgeGeo[];
  selectedCategory: string;
  selectedPlaceId: string | null;
  activeRoute: ComputedRoute | null;
  simulatedPosition: [number, number] | null; // [lng, lat]
  darkMode: boolean;
  highContrast: boolean;
  stepFreeOnly: boolean;
  verifiedOnly: boolean;
  showIncidents: boolean;
  pickLocationMode: boolean;
  onToggleDarkMode: () => void;
  onToggleHighContrast: () => void;
  onToggleStepFreeOnly: () => void;
  onToggleVerifiedOnly: () => void;
  onToggleShowIncidents: () => void;
  onSelectPlace: (place: Place) => void;
  onSelectAsset: (asset: Asset) => void;
  onSelectIncident: (incident: Incident) => void;
  onMapPickLocation?: (lat: number, lng: number) => void;
  onOpenContribute: () => void;
  onOpenDirections: () => void;
  flyToTarget: { lat: number; lng: number; zoom?: number } | null;
}

const BENGALURU_CENTER = { lat: 12.9756, lng: 77.596 };

function getMarkerColors(opStatus: string, verStatus: string) {
  if (opStatus === 'unavailable' || verStatus === 'reported_unavailable') {
    return { bg: '#DC2626', ring: '#FEE2E2', label: 'Unavailable', badgeText: '!' };
  }
  if (verStatus === 'unknown' || opStatus === 'unknown') {
    return { bg: '#64748B', ring: '#F1F5F9', label: 'Unknown', badgeText: '?' };
  }
  if (verStatus === 'unverified' || opStatus === 'degraded') {
    return { bg: '#D97706', ring: '#FEF3C7', label: 'Unverified', badgeText: '?' };
  }
  return { bg: '#087F8C', ring: '#D3E94D', label: 'Verified', badgeText: '✓' };
}

function getCategoryGlyph(category: string): string {
  switch (category) {
    case 'station':
      return 'M';
    case 'bus_stop':
      return 'B';
    case 'hospital':
      return 'H';
    case 'toilet':
      return 'WC';
    case 'parking':
      return 'P';
    case 'venue':
      return 'V';
    case 'lift':
      return 'L';
    case 'ramp':
      return 'R';
    case 'crossing':
      return 'X';
    default:
      return '•';
  }
}

interface NetworkAndRouteLayerProps {
  outdoorEdges: OutdoorEdgeGeo[];
  activeRoute: ComputedRoute | null;
  highContrast: boolean;
  pickLocationMode: boolean;
  flyToTarget: { lat: number; lng: number; zoom?: number } | null;
  onMapReady: (map: google.maps.Map | null) => void;
}

const MapNetworkAndRouteLayer: React.FC<NetworkAndRouteLayerProps> = ({
  outdoorEdges,
  activeRoute,
  highContrast,
  pickLocationMode,
  flyToTarget,
  onMapReady,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');

  useEffect(() => {
    onMapReady(map);
    return () => onMapReady(null);
  }, [map, onMapReady]);

  useEffect(() => {
    if (!map) return;
    map.setOptions({
      draggableCursor: pickLocationMode ? 'crosshair' : undefined,
    });
  }, [map, pickLocationMode]);

  useEffect(() => {
    if (!map || !flyToTarget) return;
    map.panTo({ lat: flyToTarget.lat, lng: flyToTarget.lng });
    if (flyToTarget.zoom) {
      map.setZoom(flyToTarget.zoom);
    }
  }, [map, flyToTarget]);

  // Draw outdoor accessibility corridors & blocked links
  useEffect(() => {
    if (!map || !mapsLib) return;

    const created: google.maps.Polyline[] = [];

    for (const edge of outdoorEdges) {
      const status = edge.asset_status || edge.operational_status;
      const isBlocked = status === 'unavailable';
      const isMetro = edge.edge_type === 'metro_line';
      const isStairs = edge.step_free === 0;

      if (isStairs && !isBlocked) continue;

      let strokeColor = '#087F8C';
      let strokeOpacity = highContrast ? 0.85 : 0.55;
      let strokeWeight = highContrast ? 4.5 : 3.5;
      let icons: google.maps.IconSequence[] | undefined;

      if (isBlocked) {
        strokeColor = '#DC2626';
        strokeOpacity = 0;
        strokeWeight = 4;
        icons = [
          {
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.95, scale: 3, strokeColor: '#DC2626' },
            offset: '0',
            repeat: '12px',
          },
        ];
      } else if (isMetro) {
        strokeColor = '#6366F1';
        strokeOpacity = 0;
        strokeWeight = 3.5;
        icons = [
          {
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, scale: 3, strokeColor: '#6366F1' },
            offset: '0',
            repeat: '16px',
          },
        ];
      }

      const line = new mapsLib.Polyline({
        path: [
          { lat: edge.from_lat, lng: edge.from_lng },
          { lat: edge.to_lat, lng: edge.to_lng },
        ],
        geodesic: true,
        strokeColor,
        strokeOpacity,
        strokeWeight,
        icons,
        zIndex: isBlocked ? 15 : 5,
        clickable: false,
        map,
      });
      created.push(line);
    }

    return () => {
      for (const l of created) l.setMap(null);
    };
  }, [map, mapsLib, outdoorEdges, highContrast]);

  // Draw active computed accessible route polyline + fit bounds
  useEffect(() => {
    if (!map || !mapsLib) return;
    if (!activeRoute || !activeRoute.feasible || activeRoute.geometry.length < 2) {
      return;
    }

    const path = activeRoute.geometry.map(([lng, lat]) => ({ lat, lng }));

    const casing = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: '#102B27',
      strokeOpacity: 0.92,
      strokeWeight: 9,
      zIndex: 40,
      clickable: false,
      map,
    });

    const highlight = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: '#D3E94D',
      strokeOpacity: 1,
      strokeWeight: 5,
      zIndex: 41,
      clickable: false,
      map,
    });

    if (coreLib) {
      const bounds = new coreLib.LatLngBounds();
      for (const pt of path) bounds.extend(pt);
      map.fitBounds(bounds, { top: 140, bottom: 260, left: 60, right: 60 });
    }

    return () => {
      casing.setMap(null);
      highlight.setMap(null);
    };
  }, [map, mapsLib, coreLib, activeRoute]);

  return null;
};

const MapStatusBanner: React.FC = () => {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [status]);

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="absolute bottom-24 left-4 z-20 max-w-xs rounded-xl bg-amber-50 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 shadow-lg flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>Google Maps tiles failed to load. Check network or API quota.</span>
      </div>
    );
  }
  return null;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  mapsApiKey,
  configLoaded,
  places,
  assets,
  incidents,
  outdoorEdges,
  selectedCategory,
  selectedPlaceId,
  activeRoute,
  simulatedPosition,
  darkMode,
  highContrast,
  stepFreeOnly,
  verifiedOnly,
  showIncidents,
  pickLocationMode,
  onToggleDarkMode,
  onToggleHighContrast,
  onToggleStepFreeOnly,
  onToggleVerifiedOnly,
  onToggleShowIncidents,
  onSelectPlace,
  onSelectAsset,
  onSelectIncident,
  onMapPickLocation,
  onOpenContribute,
  onOpenDirections,
  flyToTarget,
}) => {
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  const filteredPlaces = useMemo(
    () =>
      places.filter((p) => {
        if (stepFreeOnly && p.operational_status !== 'operational') return false;
        if (verifiedOnly && p.verification_status !== 'verified') return false;
        if (selectedCategory === 'all' || selectedCategory === 'accessible') {
          return selectedCategory === 'accessible'
            ? p.verification_status === 'verified' && p.operational_status === 'operational'
            : true;
        }
        if (selectedCategory === 'lift' || selectedCategory === 'ramp') return false;
        return p.category === selectedCategory;
      }),
    [places, stepFreeOnly, verifiedOnly, selectedCategory]
  );

  const filteredAssets = useMemo(
    () =>
      assets.filter((a) => {
        if (stepFreeOnly && a.operational_status !== 'operational') return false;
        if (verifiedOnly && a.verification_status !== 'verified') return false;
        if (selectedCategory === 'lift') return a.asset_type === 'lift';
        if (selectedCategory === 'ramp') return a.asset_type === 'ramp';
        if (selectedCategory === 'toilet') return a.asset_type === 'toilet';
        if (selectedCategory === 'parking') return a.asset_type === 'parking_bay';
        if (selectedCategory === 'all') {
          return a.asset_type === 'lift' || a.asset_type === 'ramp' || a.asset_type === 'crossing';
        }
        return false;
      }),
    [assets, stepFreeOnly, verifiedOnly, selectedCategory]
  );

  const visibleIncidents = useMemo(
    () => (showIncidents ? incidents.filter((i) => i.status !== 'resolved') : []),
    [showIncidents, incidents]
  );

  const handleLocateMe = () => {
    setLocating(true);
    const centerOn = (lat: number, lng: number, zoom = 15.8) => {
      mapInstanceRef.current?.panTo({ lat, lng });
      mapInstanceRef.current?.setZoom(zoom);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          const isNearBlr =
            Math.abs(pos.coords.latitude - 12.9756) < 0.2 && Math.abs(pos.coords.longitude - 77.596) < 0.2;
          if (isNearBlr) {
            centerOn(pos.coords.latitude, pos.coords.longitude, 15.8);
          } else {
            centerOn(12.9754, 77.6062, 15.5);
          }
        },
        () => {
          setLocating(false);
          centerOn(12.9754, 77.6062, 15.5);
        },
        { timeout: 3000 }
      );
    } else {
      setLocating(false);
      centerOn(12.9754, 77.6062, 15.5);
    }
  };

  const handleRecenter = () => {
    mapInstanceRef.current?.panTo(BENGALURU_CENTER);
    mapInstanceRef.current?.setZoom(14.3);
  };

  const passengerPos = simulatedPosition
    ? { lat: simulatedPosition[1], lng: simulatedPosition[0] }
    : { lat: 12.9754, lng: 77.6062 };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#EFEFE9] dark:bg-[#0F1F1C]">
      {!configLoaded ? (
        <div className="w-full h-full flex items-center justify-center text-sm font-medium text-[#17211F]/70 dark:text-[#F7F8F3]/70">
          Initializing Google Maps Platform...
        </div>
      ) : !mapsApiKey ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
          <div className="max-w-md rounded-2xl bg-white dark:bg-[#102B27] border border-[#17211F]/10 dark:border-white/15 p-5 shadow-lg space-y-2">
            <h2 className="text-base font-bold">Google Maps API Key Required</h2>
            <p className="text-xs text-[#17211F]/75 dark:text-[#F7F8F3]/75 leading-relaxed">
              The Bengaluru accessibility database, routing engine, and AI chatbot are active, but no Google Maps API key
              was detected in the runtime environment. Restart the server or verify the Maps key secret in AI Studio.
            </p>
          </div>
        </div>
      ) : (
        <APIProvider apiKey={mapsApiKey} language="en" region="IN" libraries={['marker', 'maps', 'core']}>
          <GoogleMap
            mapId="DEMO_MAP_ID"
            colorScheme={darkMode ? 'DARK' : 'LIGHT'}
            defaultCenter={BENGALURU_CENTER}
            defaultZoom={14.3}
            gestureHandling="greedy"
            disableDefaultUI={true}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            className="w-full h-full"
            style={{ width: '100%', height: '100%' }}
            onClick={(e) => {
              if (pickLocationMode && onMapPickLocation && e.detail.latLng) {
                onMapPickLocation(e.detail.latLng.lat, e.detail.latLng.lng);
              }
            }}
          >
            <MapNetworkAndRouteLayer
              outdoorEdges={outdoorEdges}
              activeRoute={activeRoute}
              highContrast={highContrast}
              pickLocationMode={pickLocationMode}
              flyToTarget={flyToTarget}
              onMapReady={(m) => {
                mapInstanceRef.current = m;
              }}
            />

            <MapStatusBanner />

            {/* Place Markers */}
            {filteredPlaces.map((p) => {
              const { bg, ring, label, badgeText } = getMarkerColors(p.operational_status, p.verification_status);
              const isSelected = p.id === selectedPlaceId;
              const glyph = getCategoryGlyph(p.category);
              return (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  title={`${p.name} — ${label}`}
                  zIndex={isSelected ? 50 : 20}
                  onClick={() => onSelectPlace(p)}
                >
                  <button
                    type="button"
                    aria-label={`${p.name} — ${label}`}
                    style={{
                      width: isSelected ? 44 : 38,
                      height: isSelected ? 44 : 38,
                      backgroundColor: bg,
                      borderColor: isSelected ? '#D3E94D' : highContrast ? '#102B27' : '#FFFFFF',
                    }}
                    className="relative flex items-center justify-center rounded-full text-white font-bold text-xs border-[3px] shadow-lg cursor-pointer transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D3E94D]"
                  >
                    <span>{glyph}</span>
                    <span
                      style={{ backgroundColor: ring }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[#102B27] text-[10px] font-extrabold flex items-center justify-center border border-[#102B27]"
                    >
                      {badgeText}
                    </span>
                  </button>
                </AdvancedMarker>
              );
            })}

            {/* Asset Markers */}
            {filteredAssets.map((a) => {
              const { bg, ring, label, badgeText } = getMarkerColors(a.operational_status, a.verification_status);
              const glyph = getCategoryGlyph(a.asset_type);
              return (
                <AdvancedMarker
                  key={a.id}
                  position={{ lat: a.lat, lng: a.lng }}
                  title={`${a.name} — ${label}`}
                  zIndex={18}
                  onClick={() => onSelectAsset(a)}
                >
                  <button
                    type="button"
                    aria-label={`${a.name} — ${label}`}
                    style={{
                      backgroundColor: bg,
                      borderColor: highContrast ? '#102B27' : '#FFFFFF',
                    }}
                    className="relative w-9 h-9 flex items-center justify-center rounded-full text-white font-bold text-[11px] border-[3px] shadow-md cursor-pointer hover:scale-105 focus:outline-none"
                  >
                    <span>{glyph}</span>
                    <span
                      style={{ backgroundColor: ring }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[#102B27] text-[10px] font-extrabold flex items-center justify-center border border-[#102B27]"
                    >
                      {badgeText}
                    </span>
                  </button>
                </AdvancedMarker>
              );
            })}

            {/* Active Incident Markers */}
            {visibleIncidents.map((inc) => (
              <AdvancedMarker
                key={inc.id}
                position={{ lat: inc.lat, lng: inc.lng }}
                title={`Incident ${inc.report_code}: ${inc.title}`}
                zIndex={30}
                onClick={() => onSelectIncident(inc)}
              >
                <button
                  type="button"
                  aria-label={`Incident ${inc.report_code}: ${inc.title}`}
                  style={{
                    backgroundColor:
                      inc.severity === 'critical' || inc.severity === 'high' ? '#DC2626' : '#D97706',
                  }}
                  className="w-8 h-8 rounded-lg text-white font-extrabold text-xs border-2 border-white shadow-md flex items-center justify-center cursor-pointer hover:scale-105"
                >
                  ⚠
                </button>
              </AdvancedMarker>
            ))}

            {/* Current / Simulated Passenger Position */}
            <AdvancedMarker
              position={passengerPos}
              title="Current passenger position"
              zIndex={45}
            >
              <div
                aria-label="Current passenger position"
                className="w-5 h-5 rounded-full bg-[#087F8C] border-[3px] border-[#D3E94D] shadow-[0_0_0_6px_rgba(8,127,140,0.28)]"
              />
            </AdvancedMarker>
          </GoogleMap>
        </APIProvider>
      )}

      {pickLocationMode && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-[#102B27] text-white text-xs font-medium shadow-lg">
          Tap anywhere on the map to set the exact issue location
        </div>
      )}

      {/* Floating Right Map Controls */}
      <div className="absolute right-3 md:right-5 top-36 md:top-24 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleLocateMe}
          aria-label="Center on current location"
          title="Current location"
          className="w-11 h-11 rounded-xl bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] shadow-md border border-[#17211F]/10 dark:border-white/10 flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-[#173934] transition-colors"
        >
          <Crosshair className={`w-5 h-5 ${locating ? 'animate-spin text-[#087F8C]' : ''}`} />
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recenter Bengaluru corridor"
          title="Recenter map"
          className="w-11 h-11 rounded-xl bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] shadow-md border border-[#17211F]/10 dark:border-white/10 flex items-center justify-center hover:bg-[#F7F8F3] dark:hover:bg-[#173934] transition-colors"
        >
          <Compass className="w-5 h-5" />
        </button>

        {/* Map Layers Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setLayersOpen((v) => !v);
              setFiltersOpen(false);
            }}
            aria-label="Map layers and appearance"
            aria-expanded={layersOpen}
            title="Map layers"
            className={`w-11 h-11 rounded-xl shadow-md border flex items-center justify-center transition-colors ${
              layersOpen
                ? 'bg-[#087F8C] text-white border-[#087F8C]'
                : 'bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] border-[#17211F]/10 dark:border-white/10'
            }`}
          >
            <Layers className="w-5 h-5" />
          </button>

          {layersOpen && (
            <div className="absolute right-13 top-0 w-56 rounded-2xl bg-white dark:bg-[#102B27] border border-[#17211F]/10 dark:border-white/15 shadow-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70 px-1">Map Layers</p>
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="w-full min-h-[40px] px-2.5 rounded-xl flex items-center justify-between text-xs font-medium hover:bg-[#F7F8F3] dark:hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  {darkMode ? <Moon className="w-4 h-4 text-[#D3E94D]" /> : <Sun className="w-4 h-4 text-[#087F8C]" />}
                  {darkMode ? 'Dark Map Theme' : 'Light Map Theme'}
                </span>
                <span className="text-[#087F8C] dark:text-[#D3E94D]">{darkMode ? 'On' : 'Off'}</span>
              </button>
              <button
                type="button"
                onClick={onToggleHighContrast}
                className="w-full min-h-[40px] px-2.5 rounded-xl flex items-center justify-between text-xs font-medium hover:bg-[#F7F8F3] dark:hover:bg-white/10"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#087F8C]" />
                  High Contrast
                </span>
                <span className="text-[#087F8C] dark:text-[#D3E94D]">{highContrast ? 'On' : 'Off'}</span>
              </button>
              <div className="pt-2 border-t border-[#17211F]/10 dark:border-white/10 text-[11px] space-y-1 px-1 text-[#17211F]/75 dark:text-[#F7F8F3]/75">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 rounded bg-[#087F8C]" /> Step-free corridor
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 rounded bg-[#6366F1]" /> Metro Purple Line
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 rounded bg-[#DC2626]" /> Disrupted / Blocked
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Accessibility Filters Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setFiltersOpen((v) => !v);
              setLayersOpen(false);
            }}
            aria-label="Accessibility map filters"
            aria-expanded={filtersOpen}
            title="Accessibility filters"
            className={`w-11 h-11 rounded-xl shadow-md border flex items-center justify-center transition-colors ${
              filtersOpen || stepFreeOnly || verifiedOnly
                ? 'bg-[#087F8C] text-white border-[#087F8C]'
                : 'bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] border-[#17211F]/10 dark:border-white/10'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>

          {filtersOpen && (
            <div className="absolute right-13 top-0 w-60 rounded-2xl bg-white dark:bg-[#102B27] border border-[#17211F]/10 dark:border-white/15 shadow-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70 px-1">Accessibility Filters</p>
              <label className="flex items-center justify-between px-2 py-2 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 cursor-pointer text-xs font-medium">
                <span>Operational step-free only</span>
                <input
                  type="checkbox"
                  checked={stepFreeOnly}
                  onChange={onToggleStepFreeOnly}
                  className="w-4 h-4 accent-[#087F8C]"
                />
              </label>
              <label className="flex items-center justify-between px-2 py-2 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 cursor-pointer text-xs font-medium">
                <span>Verified status only</span>
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={onToggleVerifiedOnly}
                  className="w-4 h-4 accent-[#087F8C]"
                />
              </label>
              <label className="flex items-center justify-between px-2 py-2 rounded-xl hover:bg-[#F7F8F3] dark:hover:bg-white/10 cursor-pointer text-xs font-medium">
                <span>Show active incidents</span>
                <input
                  type="checkbox"
                  checked={showIncidents}
                  onChange={onToggleShowIncidents}
                  className="w-4 h-4 accent-[#087F8C]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Report Issue Shortcut */}
        <button
          type="button"
          onClick={onOpenContribute}
          aria-label="Report accessibility issue"
          title="Report issue"
          className="w-11 h-11 rounded-xl bg-white dark:bg-[#102B27] text-amber-700 dark:text-amber-300 shadow-md border border-[#17211F]/10 dark:border-white/10 flex items-center justify-center hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
        >
          <AlertOctagon className="w-5 h-5" />
        </button>

        {/* Directions Shortcut */}
        <button
          type="button"
          onClick={onOpenDirections}
          aria-label="Open accessible journey planner"
          title="Directions"
          className="w-11 h-11 rounded-xl bg-[#087F8C] text-white shadow-lg flex items-center justify-center hover:bg-[#066974] transition-colors"
        >
          <Navigation className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
