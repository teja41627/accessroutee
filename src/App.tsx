import React, { useCallback, useEffect, useState } from 'react';
import { Compass, User, PlusCircle, Briefcase, AlertTriangle } from 'lucide-react';
import { InteractiveMap } from './components/InteractiveMap.tsx';
import { ExploreOverlays } from './components/ExploreOverlays.tsx';
import { JourneyPlannerSheet } from './components/JourneyPlannerSheet.tsx';
import { ActiveNavigationOverlay } from './components/ActiveNavigationOverlay.tsx';
import { IndoorNavigationModal } from './components/IndoorNavigationModal.tsx';
import { AskAssistantModal } from './components/AskAssistantModal.tsx';
import { QrScannerModal } from './components/QrScannerModal.tsx';
import { YouView } from './components/YouView.tsx';
import { ContributeView } from './components/ContributeView.tsx';
import { BusinessView } from './components/BusinessView.tsx';
import type { AskAction } from './server/assistant.ts';
import type {
  Asset,
  ComputedRoute,
  Incident,
  JourneyRecord,
  NotificationRecord,
  OperatorRecord,
  Organisation,
  Place,
  SavedPlace,
  UserProfile,
  Venue,
} from './types.ts';

type TabId = 'explore' | 'you' | 'contribute' | 'business';

interface BootstrapPayload {
  activeProfile: UserProfile;
  users: Array<{ id: string; name: string; role: string; operator_title?: string | null; organisation_name?: string | null }>;
  places: Place[];
  assets: Asset[];
  venues: Venue[];
  organisations: Organisation[];
  operators: Array<OperatorRecord & { name: string }>;
  incidents: Incident[];
  savedPlaces: SavedPlace[];
  journeys: JourneyRecord[];
  notifications: NotificationRecord[];
  outdoorEdges: Array<{
    id: string;
    from_lat: number;
    from_lng: number;
    to_lat: number;
    to_lng: number;
    edge_type: string;
    step_free: number;
    operational_status: string;
    asset_status?: string | null;
  }>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('explore');
  const [userId, setUserId] = useState<string>('user-aarav');
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Map & Explore UI states
  const [darkMode, setDarkMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stepFreeOnly, setStepFreeOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showIncidents, setShowIncidents] = useState(true);

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // Journey Planner & Active Navigation
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [originNodeId, setOriginNodeId] = useState('node-mg-street');
  const [destinationNodeId, setDestinationNodeId] = useState('node-ub-ent-north');
  const [previewRoute, setPreviewRoute] = useState<ComputedRoute | null>(null);
  const [plannerRefreshKey, setPlannerRefreshKey] = useState(0);

  const [activeNav, setActiveNav] = useState<{
    route: ComputedRoute;
    destinationName: string;
    destinationVenueId: string | null;
    journeyId: string | null;
  } | null>(null);
  const [simulatedPosition, setSimulatedPosition] = useState<[number, number] | null>(null);
  const [disruptionAlert, setDisruptionAlert] = useState<string | null>(null);

  // Modals & Deep Links
  const [askOpen, setAskOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [indoorModal, setIndoorModal] = useState<{ venueId: string; nodeId?: string | null } | null>(null);
  const [pickLocationMode, setPickLocationMode] = useState(false);
  const [contributePrefill, setContributePrefill] = useState<{
    placeId?: string | null;
    assetId?: string | null;
    category?: string;
    lat?: number;
    lng?: number;
  } | null>(null);

  const loadBootstrap = useCallback(async (targetUserId = userId) => {
    try {
      setLoadError(null);
      const res = await fetch(`/api/bootstrap?userId=${encodeURIComponent(targetUserId)}`);
      if (!res.ok) throw new Error('Unable to load AccessRoute network');
      const payload = (await res.json()) as BootstrapPayload;
      setData(payload);
      // Keep open detail sheets synced with fresh DB state
      setSelectedPlace((prev) => (prev ? payload.places.find((p) => p.id === prev.id) || null : null));
      setSelectedAsset((prev) => (prev ? payload.assets.find((a) => a.id === prev.id) || null : null));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadBootstrap(userId);
  }, [userId, loadBootstrap]);

  // Apply theme & accessibility document classes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.classList.toggle('ar-high-contrast', Boolean(data?.activeProfile.high_contrast));
    root.classList.toggle('ar-large-text', Boolean(data?.activeProfile.large_text));
    root.classList.toggle('ar-reduced-motion', Boolean(data?.activeProfile.reduced_motion));
  }, [darkMode, data?.activeProfile]);

  const handleSwitchUser = async (nextId: string) => {
    setUserId(nextId);
    await loadBootstrap(nextId);
  };

  const handleSaveProfile = async (patch: Partial<UserProfile>) => {
    await fetch(`/api/profile/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await loadBootstrap(userId);
  };

  const handleDeleteProfile = async () => {
    const res = await fetch(`/api/profile/${userId}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.fallbackUserId && d.fallbackUserId !== userId) {
      setUserId(d.fallbackUserId);
      await loadBootstrap(d.fallbackUserId);
    } else {
      await loadBootstrap(userId);
    }
  };

  const handleSavePlace = async (place: Place) => {
    await fetch('/api/saved-places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, placeId: place.id, label: place.name }),
    });
    await loadBootstrap(userId);
  };

  const handleStartNavigation = async (
    route: ComputedRoute,
    destinationName: string,
    destinationVenueId: string | null
  ) => {
    const res = await fetch('/api/journeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        originLabel: route.steps[0]?.from_name || 'Origin',
        originNodeId,
        destinationLabel: destinationName,
        destinationNodeId,
        routeMode: route.mode,
        distanceM: route.total_distance_m,
        durationMin: route.estimated_minutes,
        walkingM: route.walking_distance_m,
        status: 'active',
      }),
    });
    const jData = await res.json();
    setPlannerOpen(false);
    setSelectedPlace(null);
    setSelectedAsset(null);
    setActiveNav({
      route,
      destinationName,
      destinationVenueId,
      journeyId: jData.journey?.id || null,
    });
    if (route.geometry[0]) {
      setSimulatedPosition(route.geometry[0]);
    }
  };

  const handleEndJourney = async (completed: boolean) => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (activeNav?.journeyId) {
      await fetch(`/api/journeys/${activeNav.journeyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: completed ? 'completed' : 'cancelled' }),
      });
    }
    setActiveNav(null);
    setPreviewRoute(null);
    setSimulatedPosition(null);
    await loadBootstrap(userId);
  };

  const handleSimulateLiftOutage = async (assetId = 'asset-mg-lift') => {
    await fetch('/api/disruptions/simulate-lift-outage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUserId: userId, assetId }),
    });
    await loadBootstrap(userId);
    setPlannerRefreshKey((k) => k + 1);

    // If actively navigating, immediately recalculate via real graph engine!
    if (activeNav && data?.activeProfile) {
      const p = data.activeProfile;
      const planRes = await fetch('/api/routes/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originNodeId,
          destinationNodeId,
          constraints: {
            stepFree: p.step_free,
            avoidStairs: p.avoid_stairs,
            wheelchairAccessible: p.wheelchair_accessible,
            maxWalkingM: p.max_walking_m,
            preferFewerTransfers: p.prefer_fewer_transfers,
          },
        }),
      });
      const plan = await planRes.json();
      const nextBest = (plan.routes as ComputedRoute[])?.find((r) => r.feasible);
      if (nextBest) {
        setActiveNav((prev) => (prev ? { ...prev, route: nextBest } : null));
        setDisruptionAlert(
          `Lift outage detected! Route automatically recalculated via ${nextBest.label} (${nextBest.estimated_minutes} min, step-free).`
        );
      } else {
        setDisruptionAlert(
          'Lift outage detected! No step-free bypass fits current walking limits — inspect Journey Planner for options.'
        );
      }
    } else {
      setDisruptionAlert('Simulated Lift Outage recorded on MG Road Metro Concourse Lift. Graph routes updated.');
    }
    setTimeout(() => setDisruptionAlert(null), 7000);
  };

  const handleAskAction = (action: AskAction) => {
    setActiveTab('explore');
    if (action.type === 'filter_category' && action.category) {
      setSelectedCategory(action.category);
      if (action.placeId && data) {
        const found = data.places.find((p) => p.id === action.placeId);
        if (found) {
          setSelectedPlace(found);
          setFlyToTarget({ lat: found.lat, lng: found.lng, zoom: 16 });
        }
      }
    } else if (action.type === 'select_place' && action.placeId && data) {
      const found = data.places.find((p) => p.id === action.placeId);
      if (found) {
        setSelectedPlace(found);
        setFlyToTarget({ lat: found.lat, lng: found.lng, zoom: 16 });
      }
    } else if (action.type === 'plan_route') {
      if (action.originNodeId) setOriginNodeId(action.originNodeId);
      if (action.destinationNodeId) setDestinationNodeId(action.destinationNodeId);
      setSelectedPlace(null);
      setPlannerOpen(true);
    } else if (action.type === 'open_contribute') {
      setContributePrefill({ category: action.incidentCategory });
      setActiveTab('contribute');
    } else if (action.type === 'open_venue' && action.venueId) {
      setIndoorModal({ venueId: action.venueId });
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F7F8F3] dark:bg-[#0D1917]">
        <div className="w-72 space-y-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#087F8C] text-white font-bold text-lg flex items-center justify-center mx-auto">
            AR
          </div>
          <div className="text-sm font-semibold text-[#17211F] dark:text-[#F7F8F3]">
            Loading AccessRoute Bengaluru Network...
          </div>
          <div className="h-2 rounded-full bg-[#17211F]/10 dark:bg-white/10 overflow-hidden">
            <div className="h-full w-1/2 bg-[#087F8C] animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F7F8F3] dark:bg-[#0D1917] p-6">
        <div className="max-w-sm bg-white dark:bg-[#102B27] rounded-2xl p-6 border border-[#17211F]/10 space-y-3 text-center">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{loadError || 'Unable to load'}</p>
          <button
            type="button"
            onClick={() => loadBootstrap(userId)}
            className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] text-white text-sm font-semibold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const unreadNotifs = data.notifications.filter((n) => !n.read).length;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#F7F8F3] dark:bg-[#0D1917] text-[#17211F] dark:text-[#F7F8F3]">
      {/* Live Disruption Toast Banner */}
      {disruptionAlert && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[92%] px-4 py-3 rounded-2xl bg-[#102B27] text-white border border-[#D3E94D] shadow-2xl flex items-center gap-3 text-xs font-medium"
        >
          <AlertTriangle className="w-5 h-5 text-[#D3E94D] shrink-0" />
          <span className="flex-1">{disruptionAlert}</span>
          <button type="button" onClick={() => setDisruptionAlert(null)} className="text-[#D3E94D] font-bold px-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Canvas */}
      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'explore' && (
          <div className="w-full h-full relative">
            <InteractiveMap
              places={data.places}
              assets={data.assets}
              incidents={data.incidents}
              outdoorEdges={data.outdoorEdges}
              selectedCategory={selectedCategory}
              selectedPlaceId={selectedPlace?.id || null}
              activeRoute={activeNav ? activeNav.route : previewRoute}
              simulatedPosition={simulatedPosition}
              darkMode={darkMode}
              highContrast={data.activeProfile.high_contrast}
              stepFreeOnly={stepFreeOnly}
              verifiedOnly={verifiedOnly}
              showIncidents={showIncidents}
              pickLocationMode={pickLocationMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              onToggleHighContrast={() => handleSaveProfile({ high_contrast: !data.activeProfile.high_contrast })}
              onToggleStepFreeOnly={() => setStepFreeOnly((v) => !v)}
              onToggleVerifiedOnly={() => setVerifiedOnly((v) => !v)}
              onToggleShowIncidents={() => setShowIncidents((v) => !v)}
              onSelectPlace={(p) => {
                setSelectedAsset(null);
                setSelectedIncident(null);
                setSelectedPlace(p);
                setFlyToTarget({ lat: p.lat, lng: p.lng, zoom: 16 });
              }}
              onSelectAsset={(a) => {
                setSelectedPlace(null);
                setSelectedIncident(null);
                setSelectedAsset(a);
                setFlyToTarget({ lat: a.lat, lng: a.lng, zoom: 16.5 });
              }}
              onSelectIncident={(inc) => {
                setSelectedPlace(null);
                setSelectedAsset(null);
                setSelectedIncident(inc);
                setFlyToTarget({ lat: inc.lat, lng: inc.lng, zoom: 16.5 });
              }}
              onMapPickLocation={(lat, lng) => {
                setPickLocationMode(false);
                setContributePrefill((prev) => ({ ...(prev || {}), lat, lng }));
                setActiveTab('contribute');
              }}
              onOpenContribute={() => {
                setContributePrefill(
                  selectedPlace
                    ? { placeId: selectedPlace.id, lat: selectedPlace.lat, lng: selectedPlace.lng }
                    : null
                );
                setActiveTab('contribute');
              }}
              onOpenDirections={() => {
                setSelectedPlace(null);
                setSelectedAsset(null);
                setPlannerOpen(true);
              }}
              flyToTarget={flyToTarget}
            />

            {!activeNav && (
              <ExploreOverlays
                places={data.places}
                assets={data.assets}
                incidents={data.incidents}
                savedPlaces={data.savedPlaces}
                activeProfile={data.activeProfile}
                selectedCategory={selectedCategory}
                selectedPlace={selectedPlace}
                selectedAsset={selectedAsset}
                selectedIncident={selectedIncident}
                unreadNotifications={unreadNotifs}
                onSelectCategory={setSelectedCategory}
                onSelectPlace={(p) => {
                  setSelectedAsset(null);
                  setSelectedIncident(null);
                  setSelectedPlace(p);
                  if (p) setFlyToTarget({ lat: p.lat, lng: p.lng, zoom: 16 });
                }}
                onSelectAsset={(a) => {
                  setSelectedPlace(null);
                  setSelectedIncident(null);
                  setSelectedAsset(a);
                  if (a) setFlyToTarget({ lat: a.lat, lng: a.lng, zoom: 16.5 });
                }}
                onSelectIncident={setSelectedIncident}
                onOpenAsk={() => setAskOpen(true)}
                onOpenQr={() => setQrOpen(true)}
                onOpenYou={() => setActiveTab('you')}
                onStartDirectionsToNode={(nodeId) => {
                  setDestinationNodeId(nodeId);
                  setSelectedPlace(null);
                  setSelectedAsset(null);
                  setPlannerOpen(true);
                }}
                onOpenIndoorVenue={(venueId) => setIndoorModal({ venueId })}
                onSavePlace={handleSavePlace}
                onReportIssueFor={(opts) => {
                  setContributePrefill(opts);
                  setActiveTab('contribute');
                }}
                onSimulateLiftOutage={handleSimulateLiftOutage}
              />
            )}

            <JourneyPlannerSheet
              open={plannerOpen && !activeNav}
              places={data.places}
              profile={data.activeProfile}
              originNodeId={originNodeId}
              destinationNodeId={destinationNodeId}
              onChangeOriginNode={setOriginNodeId}
              onChangeDestinationNode={setDestinationNodeId}
              onClose={() => {
                setPlannerOpen(false);
                setPreviewRoute(null);
              }}
              onPreviewRoute={setPreviewRoute}
              onStartNavigation={handleStartNavigation}
              onSaveRoute={async (label, routeJson, placeId) => {
                await fetch('/api/saved-places', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId, placeId, label, routeJson }),
                });
                await loadBootstrap(userId);
              }}
              refreshKey={plannerRefreshKey}
            />

            {activeNav && (
              <ActiveNavigationOverlay
                route={activeNav.route}
                destinationName={activeNav.destinationName}
                destinationVenueId={activeNav.destinationVenueId}
                profile={data.activeProfile}
                onStepPositionChange={setSimulatedPosition}
                onSimulateLiftOutage={() => handleSimulateLiftOutage('asset-mg-lift')}
                onOpenIndoorVenue={(venueId) => setIndoorModal({ venueId })}
                onEndJourney={handleEndJourney}
              />
            )}
          </div>
        )}

        {activeTab === 'you' && (
          <YouView
            profile={data.activeProfile}
            allUsers={data.users}
            places={data.places}
            savedPlaces={data.savedPlaces}
            journeys={data.journeys}
            incidents={data.incidents}
            notifications={data.notifications}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            onSwitchUser={handleSwitchUser}
            onSaveProfile={handleSaveProfile}
            onDeleteProfile={handleDeleteProfile}
            onRemoveSavedPlace={async (id) => {
              await fetch(`/api/saved-places/${id}`, { method: 'DELETE' });
              await loadBootstrap(userId);
            }}
            onLaunchSavedRoute={(routeJson) => {
              try {
                const parsed = JSON.parse(routeJson) as { origin?: string; destination?: string };
                if (parsed.origin) setOriginNodeId(parsed.origin);
                if (parsed.destination) setDestinationNodeId(parsed.destination);
                setActiveTab('explore');
                setPlannerOpen(true);
              } catch {
                setActiveTab('explore');
              }
            }}
            onSelectPlaceOnMap={(place) => {
              setActiveTab('explore');
              setSelectedPlace(place);
              setFlyToTarget({ lat: place.lat, lng: place.lng, zoom: 16 });
            }}
            onMarkNotificationsRead={async () => {
              await fetch('/api/notifications/mark-all-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
              });
              await loadBootstrap(userId);
            }}
          />
        )}

        {activeTab === 'contribute' && (
          <ContributeView
            userId={userId}
            places={data.places}
            assets={data.assets}
            incidents={data.incidents}
            prefill={contributePrefill}
            onSubmitted={async () => {
              await loadBootstrap(userId);
              setPlannerRefreshKey((k) => k + 1);
            }}
            onPickOnMap={() => {
              setPickLocationMode(true);
              setActiveTab('explore');
            }}
          />
        )}

        {activeTab === 'business' && (
          <BusinessView
            profile={data.activeProfile}
            organisations={data.organisations}
            operators={data.operators}
            venues={data.venues}
            assets={data.assets}
            incidents={data.incidents}
            onSwitchUser={handleSwitchUser}
            onRefresh={async () => {
              await loadBootstrap(userId);
              setPlannerRefreshKey((k) => k + 1);
            }}
            onOpenIndoorVenue={(venueId) => setIndoorModal({ venueId })}
          />
        )}
      </main>

      {/* Modals */}
      <AskAssistantModal
        open={askOpen}
        userId={userId}
        onClose={() => setAskOpen(false)}
        onExecuteAction={handleAskAction}
      />

      <QrScannerModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onResolved={(res) => {
          setActiveTab('explore');
          setIndoorModal({ venueId: res.venueId, nodeId: res.nodeId });
        }}
      />

      <IndoorNavigationModal
        venueId={indoorModal?.venueId || null}
        initialNodeId={indoorModal?.nodeId}
        profile={data.activeProfile}
        onClose={() => setIndoorModal(null)}
        onOpenQrScanner={() => setQrOpen(true)}
      />

      {/* Primary 4-Tab Bottom Navigation Bar */}
      <nav
        aria-label="Primary AccessRoute Navigation"
        className="shrink-0 z-40 bg-white/95 dark:bg-[#102B27]/95 backdrop-blur-md border-t border-[#17211F]/10 dark:border-white/10"
      >
        <div className="max-w-xl mx-auto grid grid-cols-4 h-16">
          {[
            { id: 'explore', label: 'Explore', icon: Compass },
            { id: 'you', label: 'You', icon: User, badge: unreadNotifs },
            { id: 'contribute', label: 'Contribute', icon: PlusCircle },
            { id: 'business', label: 'Business', icon: Briefcase },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as TabId)}
                aria-current={active ? 'page' : undefined}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'text-[#087F8C] dark:text-[#D3E94D]'
                    : 'text-[#17211F]/65 dark:text-[#F7F8F3]/65 hover:text-[#17211F] dark:hover:text-white'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 1.9} />
                  {item.badge ? (
                    <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
