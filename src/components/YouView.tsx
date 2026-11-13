import React, { useState } from 'react';
import {
  User,
  Bell,
  Bookmark,
  History,
  FileText,
  Sliders,
  Trash2,
  Check,
  Navigation,
  Shield,
  Sun,
  Moon,
} from 'lucide-react';
import type {
  Incident,
  JourneyRecord,
  NotificationRecord,
  Place,
  SavedPlace,
  UserProfile,
} from '../types.ts';

interface YouViewProps {
  profile: UserProfile;
  allUsers: Array<{ id: string; name: string; role: string; operator_title?: string | null; organisation_name?: string | null }>;
  places: Place[];
  savedPlaces: SavedPlace[];
  journeys: JourneyRecord[];
  incidents: Incident[];
  notifications: NotificationRecord[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSwitchUser: (userId: string) => Promise<void>;
  onSaveProfile: (patch: Partial<UserProfile>) => Promise<void>;
  onDeleteProfile: () => Promise<void>;
  onRemoveSavedPlace: (id: string) => Promise<void>;
  onLaunchSavedRoute: (routeJson: string) => void;
  onSelectPlaceOnMap: (place: Place) => void;
  onMarkNotificationsRead: () => Promise<void>;
}

export const YouView: React.FC<YouViewProps> = ({
  profile,
  allUsers,
  places,
  savedPlaces,
  journeys,
  incidents,
  notifications,
  darkMode,
  onToggleDarkMode,
  onSwitchUser,
  onSaveProfile,
  onDeleteProfile,
  onRemoveSavedPlace,
  onLaunchSavedRoute,
  onSelectPlaceOnMap,
  onMarkNotificationsRead,
}) => {
  const [section, setSection] = useState<'prefs' | 'saved' | 'history' | 'reports' | 'notifications'>('prefs');
  const [form, setForm] = useState({
    display_name: profile.display_name,
    language: profile.language,
    step_free: profile.step_free,
    avoid_stairs: profile.avoid_stairs,
    wheelchair_accessible: profile.wheelchair_accessible,
    max_walking_m: profile.max_walking_m,
    prefer_fewer_transfers: profile.prefer_fewer_transfers,
    audio_instructions: profile.audio_instructions,
    visual_instructions: profile.visual_instructions,
    simplified_guidance: profile.simplified_guidance,
    optional_accessibility_notes: profile.optional_accessibility_notes,
    high_contrast: profile.high_contrast,
    large_text: profile.large_text,
    reduced_motion: profile.reduced_motion,
  });
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [privacyShareReports, setPrivacyShareReports] = useState(true);

  const myIncidents = incidents.filter((i) => i.reporter_user_id === profile.id);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveProfile(form);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F7F8F3] dark:bg-[#0D1917] pb-24 md:pb-10">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        {/* Top Profile Header + Demo Account Switcher */}
        <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#087F8C] text-white flex items-center justify-center font-bold text-base shrink-0">
              {profile.display_name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#17211F] dark:text-[#F7F8F3]">{profile.display_name}</h1>
              <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                {profile.email} · {profile.operator ? `${profile.operator.title} (${profile.operator.organisation_name})` : 'Passenger Account'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-[#17211F]/70 dark:text-[#F7F8F3]/70">
              Active Demo Profile:
              <select
                value={profile.id}
                onChange={(e) => onSwitchUser(e.target.value)}
                className="ml-2 min-h-[40px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold"
              >
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.operator_title ? `Operator: ${u.operator_title}` : 'Passenger'})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="min-h-[40px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {darkMode ? <Sun className="w-4 h-4 text-[#D3E94D]" /> : <Moon className="w-4 h-4 text-[#087F8C]" />}
              {darkMode ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'prefs', label: 'Preferences & Accessibility', icon: Sliders },
            { id: 'saved', label: `Saved (${savedPlaces.length})`, icon: Bookmark },
            { id: 'history', label: `Journeys (${journeys.length})`, icon: History },
            { id: 'reports', label: `My Reports (${myIncidents.length})`, icon: FileText },
            { id: 'notifications', label: `Alerts${unreadCount ? ` (${unreadCount})` : ''}`, icon: Bell },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id as typeof section)}
                className={`min-h-[42px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 border transition-colors ${
                  active
                    ? 'bg-[#102B27] text-white border-[#102B27] dark:bg-[#D3E94D] dark:text-[#102B27]'
                    : 'bg-white dark:bg-[#102B27] text-[#17211F] dark:text-[#F7F8F3] border-[#17211F]/10 dark:border-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {section === 'prefs' && (
          <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Functional Routing Requirements */}
            <div className="lg:col-span-7 bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
              <h2 className="text-base font-bold text-[#17211F] dark:text-[#F7F8F3]">
                Routing &amp; Accessibility Requirements
              </h2>
              <p className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                These functional constraints govern how the graph engine computes every route.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { key: 'step_free', label: 'Step-free route required' },
                  { key: 'avoid_stairs', label: 'Avoid all stairs' },
                  { key: 'wheelchair_accessible', label: 'Wheelchair clearance (85cm+)' },
                  { key: 'prefer_fewer_transfers', label: 'Prefer fewer transfers' },
                  { key: 'audio_instructions', label: 'Audio voice instructions' },
                  { key: 'visual_instructions', label: 'Visual turn cues' },
                  { key: 'simplified_guidance', label: 'Simplified plain guidance' },
                ].map((item) => {
                  const k = item.key as keyof typeof form;
                  return (
                    <label
                      key={item.key}
                      className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10 flex items-center justify-between gap-2 cursor-pointer text-xs font-medium"
                    >
                      <span>{item.label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(form[k])}
                        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))}
                        className="w-4 h-4 accent-[#087F8C]"
                      />
                    </label>
                  );
                })}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span>Maximum walking / rolling distance</span>
                  <span className="font-mono tabular-nums text-[#087F8C] dark:text-[#D3E94D]">
                    {form.max_walking_m} m
                  </span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={2500}
                  step={100}
                  value={form.max_walking_m}
                  onChange={(e) => setForm((f) => ({ ...f, max_walking_m: Number(e.target.value) }))}
                  className="w-full accent-[#087F8C]"
                />
              </div>

              <div className="pt-2 border-t border-[#17211F]/10 dark:border-white/10 space-y-3">
                <h3 className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70">
                  Optional Personal Notes (Kept separate from routing rules)
                </h3>
                <textarea
                  rows={2}
                  value={form.optional_accessibility_notes}
                  onChange={(e) => setForm((f) => ({ ...f, optional_accessibility_notes: e.target.value }))}
                  placeholder="Optional personal mobility or support preferences..."
                  className="w-full p-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                />
              </div>
            </div>

            {/* Identity, Display & Privacy */}
            <div className="lg:col-span-5 bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-4">
              <h2 className="text-base font-bold text-[#17211F] dark:text-[#F7F8F3]">
                Profile, Display &amp; Privacy
              </h2>

              <div>
                <label className="block text-xs font-semibold mb-1">Display Name</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Language</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/15 dark:border-white/15 text-sm"
                >
                  <option>English (India)</option>
                  <option>Kannada (ಕನ್ನಡ)</option>
                  <option>Hindi (हिन्दी)</option>
                  <option>Tamil (தமிழ்)</option>
                </select>
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-[#17211F]/70 dark:text-[#F7F8F3]/70">App Accessibility</p>
                {[
                  { key: 'high_contrast', label: 'High contrast display' },
                  { key: 'large_text', label: 'Larger dynamic text' },
                  { key: 'reduced_motion', label: 'Reduced motion' },
                ].map((d) => {
                  const k = d.key as keyof typeof form;
                  return (
                    <label
                      key={d.key}
                      className="min-h-[42px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] flex items-center justify-between text-xs font-medium cursor-pointer"
                    >
                      <span>{d.label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(form[k])}
                        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))}
                        className="w-4 h-4 accent-[#087F8C]"
                      />
                    </label>
                  );
                })}

                <label className="min-h-[42px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] flex items-center justify-between text-xs font-medium cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#087F8C]" />
                    Show my name on public reports
                  </span>
                  <input
                    type="checkbox"
                    checked={privacyShareReports}
                    onChange={(e) => setPrivacyShareReports(e.target.checked)}
                    className="w-4 h-4 accent-[#087F8C]"
                  />
                </label>
              </div>

              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#087F8C] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#066974]"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Saving...' : savedToast ? 'Preferences Saved' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={onDeleteProfile}
                  className="min-h-[44px] px-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear / Delete
                </button>
              </div>
            </div>
          </form>
        )}

        {section === 'saved' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3">
            <h2 className="text-base font-bold">Saved Places &amp; Routes</h2>
            {savedPlaces.length === 0 ? (
              <p className="text-sm text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                No saved places yet. Save any station, venue, or route from Explore.
              </p>
            ) : (
              <div className="divide-y divide-[#17211F]/10 dark:divide-white/10">
                {savedPlaces.map((sp) => {
                  const place = places.find((p) => p.id === sp.place_id);
                  return (
                    <div key={sp.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{sp.label}</div>
                        <div className="text-xs text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                          {place?.address || 'Saved accessible route'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sp.route_json && (
                          <button
                            type="button"
                            onClick={() => onLaunchSavedRoute(sp.route_json!)}
                            className="min-h-[38px] px-3 rounded-xl bg-[#087F8C] text-white text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Navigation className="w-3.5 h-3.5" /> Plan Route
                          </button>
                        )}
                        {place && (
                          <button
                            type="button"
                            onClick={() => onSelectPlaceOnMap(place)}
                            className="min-h-[38px] px-3 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] text-xs font-semibold"
                          >
                            View on Map
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveSavedPlace(sp.id)}
                          aria-label={`Remove ${sp.label}`}
                          className="min-h-[38px] px-2.5 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === 'history' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3">
            <h2 className="text-base font-bold">Journey History</h2>
            {journeys.length === 0 ? (
              <p className="text-sm text-[#17211F]/65 dark:text-[#F7F8F3]/65">No journeys recorded yet.</p>
            ) : (
              <div className="divide-y divide-[#17211F]/10 dark:divide-white/10">
                {journeys.map((j) => (
                  <div key={j.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">
                        {j.origin_label} → {j.destination_label}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                        {j.distance_m}m · {j.duration_min} min · {j.walking_m}m walk · {j.route_mode.replace('_', ' ')}
                      </div>
                    </div>
                    <span className="text-xs font-semibold capitalize text-[#087F8C] dark:text-[#D3E94D]">
                      {j.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'reports' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3">
            <h2 className="text-base font-bold">Submitted Accessibility Reports</h2>
            {myIncidents.length === 0 ? (
              <p className="text-sm text-[#17211F]/65 dark:text-[#F7F8F3]/65">
                You haven&apos;t submitted any accessibility reports under this profile yet.
              </p>
            ) : (
              <div className="divide-y divide-[#17211F]/10 dark:divide-white/10">
                {myIncidents.map((inc) => (
                  <div key={inc.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono text-[#17211F]/60 dark:text-[#F7F8F3]/60">
                        {inc.report_code} · {inc.category}
                      </div>
                      <div className="text-sm font-semibold">{inc.title}</div>
                      {inc.resolution_notes && (
                        <div className="text-xs text-[#087F8C] dark:text-[#D3E94D] mt-0.5">{inc.resolution_notes}</div>
                      )}
                    </div>
                    <span className="text-xs font-semibold capitalize px-2.5 py-1 rounded-lg bg-[#F7F8F3] dark:bg-[#0D1917]">
                      {inc.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'notifications' && (
          <div className="bg-white dark:bg-[#102B27] rounded-2xl border border-[#17211F]/10 dark:border-white/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Route &amp; Disruption Notifications</h2>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkNotificationsRead}
                  className="text-xs font-semibold text-[#087F8C] dark:text-[#D3E94D]"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-[#17211F]/65 dark:text-[#F7F8F3]/65">No notifications.</p>
            ) : (
              <div className="divide-y divide-[#17211F]/10 dark:divide-white/10">
                {notifications.map((n) => (
                  <div key={n.id} className={`py-3 ${n.read ? 'opacity-70' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{n.title}</span>
                      <span className="text-[11px] font-mono text-[#17211F]/55 dark:text-[#F7F8F3]/55">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-[#17211F]/75 dark:text-[#F7F8F3]/75 mt-1">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
