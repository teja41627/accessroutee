import React, { useEffect, useState } from 'react';
import {
  ArrowUp,
  ArrowUpDown,
  Train,
  Footprints,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
  SkipForward,
  AlertTriangle,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import type { ComputedRoute, UserProfile } from '../types.ts';

interface ActiveNavigationOverlayProps {
  route: ComputedRoute;
  destinationName: string;
  destinationVenueId?: string | null;
  profile: UserProfile;
  onStepPositionChange: (coord: [number, number]) => void;
  onSimulateLiftOutage: () => Promise<void>;
  onOpenIndoorVenue: (venueId: string) => void;
  onEndJourney: (completed: boolean) => void;
}

export const ActiveNavigationOverlay: React.FC<ActiveNavigationOverlayProps> = ({
  route,
  destinationName,
  destinationVenueId,
  profile,
  onStepPositionChange,
  onSimulateLiftOutage,
  onOpenIndoorVenue,
  onEndJourney,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(profile.audio_instructions);
  const [simulatingOutage, setSimulatingOutage] = useState(false);

  const steps = route.steps;
  const currentStep = steps[stepIndex] || steps[steps.length - 1];
  const arrived = stepIndex >= steps.length - 1;

  // Speak instruction when step changes
  useEffect(() => {
    if (!currentStep) return;
    const coord = currentStep.coordinates[0] || currentStep.coordinates[1];
    if (coord) onStepPositionChange(coord);

    if (voiceEnabled && !paused && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = profile.simplified_guidance
        ? `${currentStep.to_name}. ${currentStep.distance_m} meters.`
        : currentStep.instruction;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.96;
      window.speechSynthesis.speak(utter);
    }

    if ('vibrate' in navigator && !paused) {
      navigator.vibrate?.(45);
    }
  }, [stepIndex, currentStep, voiceEnabled, paused, profile.simplified_guidance, onStepPositionChange]);

  // Auto-advance simulation timer
  useEffect(() => {
    if (!autoPlay || paused || arrived) return;
    const t = window.setInterval(() => {
      setStepIndex((idx) => (idx < steps.length - 1 ? idx + 1 : idx));
    }, 3200);
    return () => window.clearInterval(t);
  }, [autoPlay, paused, arrived, steps.length]);

  const remainingDistance = steps
    .slice(stepIndex)
    .reduce((acc, s) => acc + s.distance_m, 0);
  const remainingSeconds = steps
    .slice(stepIndex)
    .reduce((acc, s) => acc + s.estimated_seconds, 0);
  const remainingMin = Math.max(1, Math.round(remainingSeconds / 60));
  const etaDate = new Date(Date.now() + remainingSeconds * 1000);
  const etaLabel = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const renderManeuverIcon = () => {
    if (!currentStep) return <ArrowUp className="w-7 h-7" />;
    if (currentStep.maneuver === 'lift') return <ArrowUpDown className="w-7 h-7" />;
    if (currentStep.maneuver === 'transit') return <Train className="w-7 h-7" />;
    if (currentStep.maneuver === 'ramp' || currentStep.maneuver === 'crossing')
      return <Footprints className="w-7 h-7" />;
    return <ArrowUp className="w-7 h-7" />;
  };

  return (
    <>
      {/* Top Turn-by-Turn Instruction Banner */}
      <div
        className="fixed top-3 left-3 right-3 md:left-6 md:right-auto md:w-[440px] z-30 rounded-2xl bg-[#102B27] text-white shadow-2xl border border-white/15 p-4"
        role="region"
        aria-live="polite"
        aria-label="Active Turn-by-Turn Instruction"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-[#087F8C] text-[#D3E94D] flex items-center justify-center shrink-0">
            {renderManeuverIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-semibold text-[#D3E94D] tabular-nums">
                Step {Math.min(stepIndex + 1, steps.length)} of {steps.length} · {currentStep?.distance_m ?? 0} m
              </span>
              <span className="text-[11px] text-white/70">Simulated Route Run</span>
            </div>
            <p className="text-base md:text-lg font-bold leading-snug mt-0.5">
              {currentStep?.instruction || `Arrive at ${destinationName}`}
            </p>
            {currentStep?.warning && (
              <p className="mt-1.5 text-xs text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {currentStep.warning}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Active Navigation Control Dock */}
      <div className="fixed bottom-20 md:bottom-5 left-3 right-3 md:left-6 md:right-auto md:w-[440px] z-30 rounded-2xl bg-white dark:bg-[#102B27] shadow-2xl border border-[#17211F]/15 dark:border-white/15 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#087F8C] dark:text-[#D3E94D]">
              {remainingMin} min <span className="text-sm font-normal text-[#17211F]/65 dark:text-[#F7F8F3]/65">({remainingDistance} m)</span>
            </div>
            <div className="text-xs text-[#17211F]/70 dark:text-[#F7F8F3]/70">
              ETA {etaLabel} · {destinationName}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVoiceEnabled((v) => !v)}
              aria-label={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
              className="w-11 h-11 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10 flex items-center justify-center"
            >
              {voiceEnabled ? <Volume2 className="w-5 h-5 text-[#087F8C]" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Resume navigation' : 'Pause navigation'}
              className="w-11 h-11 rounded-xl bg-[#F7F8F3] dark:bg-[#0D1917] border border-[#17211F]/10 dark:border-white/10 flex items-center justify-center"
            >
              {paused ? <Play className="w-5 h-5 text-[#087F8C]" /> : <Pause className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Simulation & Live Disruption Test Controls */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (arrived) {
                onEndJourney(true);
              } else {
                setStepIndex((i) => Math.min(steps.length - 1, i + 1));
                onStepPositionChange(steps[Math.min(steps.length - 1, stepIndex + 1)].coordinates[1]);
              }
            }}
            className="min-h-[44px] px-3 rounded-xl bg-[#087F8C] text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#066974]"
          >
            {arrived ? <CheckCircle2 className="w-4 h-4" /> : <SkipForward className="w-4 h-4" />}
            {arrived ? 'Complete Arrival' : 'Simulate Next Step'}
          </button>

          <button
            type="button"
            onClick={() => setAutoPlay((a) => !a)}
            className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
              autoPlay
                ? 'bg-[#D3E94D] text-[#102B27] border-[#102B27]'
                : 'bg-[#F7F8F3] dark:bg-[#0D1917] border-[#17211F]/15 dark:border-white/15'
            }`}
          >
            {autoPlay ? 'Auto-Simulating...' : 'Auto-Simulate'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#17211F]/10 dark:border-white/10">
          {destinationVenueId && (
            <button
              type="button"
              onClick={() => onOpenIndoorVenue(destinationVenueId)}
              className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#102B27] dark:bg-[#D3E94D] text-white dark:text-[#102B27] text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Building2 className="w-4 h-4" />
              Indoor Venue Map
            </button>
          )}
          <button
            type="button"
            disabled={simulatingOutage}
            onClick={async () => {
              setSimulatingOutage(true);
              try {
                await onSimulateLiftOutage();
              } finally {
                setSimulatingOutage(false);
              }
            }}
            className="flex-1 min-h-[40px] px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-amber-100"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {simulatingOutage ? 'Updating...' : 'Simulate Lift Outage'}
          </button>
          <button
            type="button"
            onClick={() => onEndJourney(false)}
            className="min-h-[40px] px-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-red-100"
          >
            <Square className="w-3.5 h-3.5" />
            End
          </button>
        </div>
      </div>
    </>
  );
};
