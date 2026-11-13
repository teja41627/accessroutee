import React, { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  LngLatBounds,
  type StyleSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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

const BENGALURU_CENTER: [number, number] = [77.596, 12.9756];

function buildMapStyle(darkMode: boolean, highContrast: boolean): StyleSpecification {
  const tileUrl = darkMode
    ? 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    : 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: '© OpenStreetMap · © CARTO · Simulated Bengaluru Network',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': highContrast
            ? darkMode
              ? '#000000'
              : '#FFFFFF'
            : darkMode
            ? '#0F1F1C'
            : '#EFEFE9',
        },
      },
      {
        id: 'basemap-tiles',
        type: 'raster',
        source: 'basemap',
        paint: {
          'raster-opacity': highContrast ? 0.45 : 0.95,
          'raster-saturation': highContrast ? -0.6 : 0,
        },
      },
    ],
  };
}

function getMarkerColors(opStatus: string, verStatus: string) {
  if (opStatus === 'unavailable' || verStatus === 'reported_unavailable') {
    return { bg: '#DC2626', ring: '#FEE2E2', label: 'Unavailable' };
  }
  if (verStatus === 'unknown' || opStatus === 'unknown') {
    return { bg: '#64748B', ring: '#F1F5F9', label: 'Unknown' };
  }
  if (verStatus === 'unverified' || opStatus === 'degraded') {
    return { bg: '#D97706', ring: '#FEF3C7', label: 'Unverified' };
  }
  return { bg: '#087F8C', ring: '#D3E94D', label: 'Verified' };
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

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const simMarkerRef = useRef<Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  // Initialize MapLibre instance once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildMapStyle(darkMode, highContrast),
      center: BENGALURU_CENTER,
      zoom: 14.3,
      pitch: 0,
      attributionControl: { compact: true },
    });

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map style on theme/contrast change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setMapLoaded(false);
    map.setStyle(buildMapStyle(darkMode, highContrast));
    map.once('styledata', () => setMapLoaded(true));
  }, [darkMode, highContrast]);

  // Handle pick location clicks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: MapMouseEvent) => {
      if (pickLocationMode && onMapPickLocation) {
        onMapPickLocation(e.lngLat.lat, e.lngLat.lng);
      }
    };
    map.on('click', handler);
    map.getCanvas().style.cursor = pickLocationMode ? 'crosshair' : '';
    return () => {
      map.off('click', handler);
      if (map.getCanvas()) map.getCanvas().style.cursor = '';
    };
  }, [pickLocationMode, onMapPickLocation]);

  // Fly to requested target
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToTarget) return;
    map.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? 16,
      duration: 650,
    });
  }, [flyToTarget]);

  // Draw GeoJSON network corridors, clusters source, and route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const edgeFeatures = outdoorEdges.map((e) => {
      const status = e.asset_status || e.operational_status;
      let kind = 'accessible';
      if (status === 'unavailable') kind = 'blocked';
      else if (e.step_free === 0) kind = 'stairs';
      else if (e.edge_type === 'metro_line') kind = 'metro';
      else if (e.edge_type === 'bus_link') kind = 'bus';

      return {
        type: 'Feature' as const,
        properties: { kind, edge_type: e.edge_type },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [e.from_lng, e.from_lat],
            [e.to_lng, e.to_lat],
          ],
        },
      };
    });

    const edgeData = { type: 'FeatureCollection' as const, features: edgeFeatures };
    if (map.getSource('ar-network')) {
      (map.getSource('ar-network') as GeoJSONSource).setData(edgeData);
    } else {
      map.addSource('ar-network', { type: 'geojson', data: edgeData });
      map.addLayer({
        id: 'ar-network-metro',
        type: 'line',
        source: 'ar-network',
        filter: ['==', ['get', 'kind'], 'metro'],
        paint: {
          'line-color': '#6366F1',
          'line-width': 3.5,
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.75,
        },
      });
      map.addLayer({
        id: 'ar-network-accessible',
        type: 'line',
        source: 'ar-network',
        filter: ['==', ['get', 'kind'], 'accessible'],
        paint: {
          'line-color': '#087F8C',
          'line-width': 3,
          'line-opacity': 0.55,
        },
      });
      map.addLayer({
        id: 'ar-network-blocked',
        type: 'line',
        source: 'ar-network',
        filter: ['==', ['get', 'kind'], 'blocked'],
        paint: {
          'line-color': '#DC2626',
          'line-width': 4,
          'line-dasharray': [1, 1],
          'line-opacity': 0.85,
        },
      });
    }

    // Active Route Polyline
    const routeData =
      activeRoute && activeRoute.feasible && activeRoute.geometry.length >= 2
        ? {
            type: 'FeatureCollection' as const,
            features: [
              {
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'LineString' as const, coordinates: activeRoute.geometry },
              },
            ],
          }
        : { type: 'FeatureCollection' as const, features: [] };

    if (map.getSource('ar-active-route')) {
      (map.getSource('ar-active-route') as GeoJSONSource).setData(routeData);
    } else {
      map.addSource('ar-active-route', { type: 'geojson', data: routeData });
      map.addLayer({
        id: 'ar-active-route-casing',
        type: 'line',
        source: 'ar-active-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#102B27',
          'line-width': 9,
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'ar-active-route-line',
        type: 'line',
        source: 'ar-active-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#D3E94D',
          'line-width': 5,
          'line-opacity': 1,
        },
      });
    }

    if (activeRoute && activeRoute.feasible && activeRoute.geometry.length >= 2) {
      const bounds = new LngLatBounds();
      for (const coord of activeRoute.geometry) bounds.extend(coord);
      map.fitBounds(bounds, { padding: { top: 140, bottom: 260, left: 60, right: 60 }, maxZoom: 15.8, duration: 700 });
    }
  }, [mapLoaded, outdoorEdges, activeRoute]);

  // Render interactive category markers + clustering summary when zoomed out
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const filteredPlaces = places.filter((p) => {
      if (stepFreeOnly && p.operational_status !== 'operational') return false;
      if (verifiedOnly && p.verification_status !== 'verified') return false;
      if (selectedCategory === 'all' || selectedCategory === 'accessible') {
        return selectedCategory === 'accessible' ? p.verification_status === 'verified' && p.operational_status === 'operational' : true;
      }
      if (selectedCategory === 'lift' || selectedCategory === 'ramp') return false;
      return p.category === selectedCategory;
    });

    const filteredAssets = assets.filter((a) => {
      if (stepFreeOnly && a.operational_status !== 'operational') return false;
      if (verifiedOnly && a.verification_status !== 'verified') return false;
      if (selectedCategory === 'lift') return a.asset_type === 'lift';
      if (selectedCategory === 'ramp') return a.asset_type === 'ramp';
      if (selectedCategory === 'toilet') return a.asset_type === 'toilet';
      if (selectedCategory === 'parking') return a.asset_type === 'parking_bay';
      if (selectedCategory === 'all') return a.asset_type === 'lift' || a.asset_type === 'ramp' || a.asset_type === 'crossing';
      return false;
    });

    const createPin = (
      lng: number,
      lat: number,
      glyph: string,
      title: string,
      opStatus: string,
      verStatus: string,
      isSelected: boolean,
      onClick: () => void
    ) => {
      const { bg, ring, label } = getMarkerColors(opStatus, verStatus);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', `${title} — ${label}`);
      btn.className = 'group relative flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D3E94D]';
      btn.style.width = isSelected ? '44px' : '38px';
      btn.style.height = isSelected ? '44px' : '38px';
      btn.style.borderRadius = '9999px';
      btn.style.backgroundColor = bg;
      btn.style.color = '#FFFFFF';
      btn.style.border = `3px solid ${isSelected ? '#D3E94D' : '#FFFFFF'}`;
      btn.style.boxShadow = '0 4px 12px rgba(16, 43, 39, 0.28)';
      btn.style.fontWeight = '700';
      btn.style.fontSize = glyph.length > 1 ? '11px' : '13px';
      btn.style.cursor = 'pointer';
      btn.textContent = glyph;

      // Status micro-symbol (never color alone!)
      const badge = document.createElement('span');
      badge.style.position = 'absolute';
      badge.style.top = '-4px';
      badge.style.right = '-4px';
      badge.style.width = '16px';
      badge.style.height = '16px';
      badge.style.borderRadius = '9999px';
      badge.style.backgroundColor = ring;
      badge.style.color = '#102B27';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '800';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.border = '1.5px solid #102B27';
      badge.textContent = opStatus === 'unavailable' ? '!' : verStatus === 'verified' ? '✓' : '?';
      btn.appendChild(badge);

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClick();
      });

      const marker = new Marker({ element: btn }).setLngLat([lng, lat]).addTo(map);
      markersRef.current.push(marker);
    };

    for (const p of filteredPlaces) {
      createPin(
        p.lng,
        p.lat,
        getCategoryGlyph(p.category),
        p.name,
        p.operational_status,
        p.verification_status,
        p.id === selectedPlaceId,
        () => onSelectPlace(p)
      );
    }

    for (const a of filteredAssets) {
      createPin(
        a.lng,
        a.lat,
        getCategoryGlyph(a.asset_type),
        a.name,
        a.operational_status,
        a.verification_status,
        false,
        () => onSelectAsset(a)
      );
    }

    if (showIncidents) {
      for (const inc of incidents.filter((i) => i.status !== 'resolved')) {
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', `Incident ${inc.report_code}: ${inc.title}`);
        el.style.width = '30px';
        el.style.height = '30px';
        el.style.borderRadius = '8px';
        el.style.backgroundColor = inc.severity === 'critical' || inc.severity === 'high' ? '#DC2626' : '#D97706';
        el.style.color = '#FFFFFF';
        el.style.border = '2px solid #FFFFFF';
        el.style.boxShadow = '0 3px 10px rgba(0,0,0,0.28)';
        el.style.fontWeight = '800';
        el.style.fontSize = '13px';
        el.style.cursor = 'pointer';
        el.textContent = '⚠';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onSelectIncident(inc);
        });
        const m = new Marker({ element: el }).setLngLat([inc.lng, inc.lat]).addTo(map);
        markersRef.current.push(m);
      }
    }
  }, [
    places,
    assets,
    incidents,
    selectedCategory,
    selectedPlaceId,
    stepFreeOnly,
    verifiedOnly,
    showIncidents,
    onSelectPlace,
    onSelectAsset,
    onSelectIncident,
  ]);

  // Render live/simulated passenger location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (simMarkerRef.current) {
      simMarkerRef.current.remove();
      simMarkerRef.current = null;
    }

    const pos: [number, number] = simulatedPosition || [77.6062, 12.9754];
    const el = document.createElement('div');
    el.setAttribute('aria-label', 'Current passenger position');
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.borderRadius = '9999px';
    el.style.backgroundColor = '#087F8C';
    el.style.border = '3px solid #D3E94D';
    el.style.boxShadow = '0 0 0 6px rgba(8, 127, 140, 0.25)';

    simMarkerRef.current = new Marker({ element: el }).setLngLat(pos).addTo(map);
  }, [simulatedPosition]);

  const handleLocateMe = () => {
    setLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          // If far outside Bengaluru demo corridor, keep user centered on demo hub with gentle notice
          const isNearBlr =
            Math.abs(pos.coords.latitude - 12.9756) < 0.2 && Math.abs(pos.coords.longitude - 77.596) < 0.2;
          mapRef.current?.flyTo({
            center: isNearBlr ? [pos.coords.longitude, pos.coords.latitude] : [77.6062, 12.9754],
            zoom: 15.8,
            duration: 600,
          });
        },
        () => {
          setLocating(false);
          mapRef.current?.flyTo({ center: [77.6062, 12.9754], zoom: 15.5, duration: 600 });
        },
        { timeout: 3000 }
      );
    } else {
      setLocating(false);
      mapRef.current?.flyTo({ center: [77.6062, 12.9754], zoom: 15.5, duration: 600 });
    }
  };

  const handleRecenter = () => {
    mapRef.current?.flyTo({ center: BENGALURU_CENTER, zoom: 14.3, duration: 600 });
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" aria-label="Interactive Accessibility Map of Central Bengaluru" />

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
