import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Copy, Maximize, Minimize, Monitor, Trophy } from 'lucide-react';
import { PoomsaeJudgeBreakdownItem, PoomsaeSideScoreSummary, RingPoomsaeSelection, RingStatus, RingTimerState, RingWinnerBroadcast } from '../types';
import { cn, formatBoutNumber } from '../lib/utils';
import { getPlayerLogoOrFlag } from '../lib/teamLogos';
import { formatPoomsaeScore } from '../lib/poomsaeScoring';

interface PoomsaeScreenViewProps {
  ring: RingStatus;
  availableRings?: RingStatus[];
  namingMode: 'number' | 'alphabet';
  boutNumberingMode?: 'numeric' | 'alphanumeric';
  currentEventId?: string | null;
  teamLogos?: Record<string, string>;
  winnerBanner?: RingWinnerBroadcast | null;
  timerState?: RingTimerState | null;
  defaultTimerSeconds?: number;
  poomsaeSelection?: RingPoomsaeSelection | null;
  getStageForBout?: (boutId: string | number, categoryName: string) => string;
  onSelectRing?: (ringNumber: number) => void;
  onBack?: () => void;
  canSwitchRing?: boolean;
  isStandalone?: boolean;
  winnerDisplaySeconds?: number;
  showFinalScore?: boolean;
  showJudgeBreakdown?: boolean;
  blueScoreSummary?: PoomsaeSideScoreSummary | null;
  redScoreSummary?: PoomsaeSideScoreSummary | null;
}

function formatTimerMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function cleanText(text?: string | null): string {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (!trimmed || trimmed === '---' || trimmed.toUpperCase() === 'TBD' || trimmed.toUpperCase() === 'BYE') {
    return trimmed === 'BYE' ? 'BYE' : '';
  }
  return trimmed;
}

function TaekwondoKickSilhouette({ side, className }: { side: 'left' | 'right'; className?: string }) {
  return (
    <svg
      viewBox="0 0 220 260"
      fill="currentColor"
      aria-hidden="true"
      className={cn(
        'pointer-events-none select-none',
        side === 'right' && '-scale-x-100',
        className
      )}
    >
      {/* Dynamic high-kick martial artist silhouette */}
      <circle cx="94" cy="48" r="16" />
      <path d="M88 67c-10 4-19 16-24 31l-22 14c-5 3-6 9-3 14 3 4 9 5 14 2l22-14 8 36-18 68c-2 8 3 16 11 18 7 2 15-3 17-10l18-56 59-72c5-6 4-15-2-20-6-5-15-4-20 2l-43 49-5-26 24-22c4-4 5-10 1-14-4-5-10-5-15-1l-18 16c-5-7-10-12-14-15z" />
      <path d="M126 112l66-62c6-5 15-5 20 1 5 6 5 15-1 20l-68 62-17-21z" />
    </svg>
  );
}

function ClubLogoEmblem({
  club,
  name,
  directLogo,
  teamLogos,
  variant,
  reserveSlot = false,
  compact = false
}: {
  club?: string | null;
  name?: string | null;
  directLogo?: string | null;
  teamLogos?: Record<string, string>;
  variant: 'blue' | 'red';
  reserveSlot?: boolean;
  compact?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [club, name, directLogo]);

  const cleanClub = cleanText(club);
  const cleanName = cleanText(name);
  const hasInfo = Boolean(cleanClub || cleanName || directLogo);

  const resolvedUrl = hasInfo
    ? getPlayerLogoOrFlag(cleanClub, cleanName, teamLogos, directLogo, true)
    : null;

  const sizeClass = compact
    ? 'w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 xl:w-32 xl:h-32'
    : 'w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 xl:w-40 xl:h-40';

  if (!hasInfo) {
    if (!reserveSlot) return null;
    return <div aria-hidden="true" className={cn(sizeClass, 'shrink-0')} />;
  }

  const initials = (cleanClub || cleanName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <div
      className={cn(
        sizeClass,
        'shrink-0 flex items-center justify-center overflow-hidden p-2 backdrop-blur-md transition-transform',
        variant === 'blue'
          ? 'bg-gradient-to-b from-[#06183a]/90 to-[#020b20]/95 border-2 border-cyan-400/70 shadow-[0_0_28px_rgba(34,211,238,0.35)]'
          : 'bg-gradient-to-b from-[#3d0409]/90 to-[#1a0104]/95 border-2 border-red-400/70 shadow-[0_0_28px_rgba(248,113,113,0.35)]'
      )}
      style={{
        clipPath: 'polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)'
      }}
    >
      {resolvedUrl && !imgError ? (
        <img
          src={resolvedUrl}
          alt={cleanClub || cleanName || 'Club Logo'}
          onError={() => setImgError(true)}
          className="w-full h-full object-contain select-none pointer-events-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
        />
      ) : (
        <span className={cn(compact ? 'text-xl sm:text-3xl lg:text-4xl' : 'text-2xl sm:text-4xl', 'font-black tracking-wider text-white/90 uppercase select-none')}>
          {initials || 'TKD'}
        </span>
      )}
    </div>
  );
}

function PoomsaeJudgeBreakdownTable({
  breakdown,
  variant
}: {
  breakdown?: PoomsaeJudgeBreakdownItem[] | null;
  variant: 'blue' | 'red';
}) {
  if (!breakdown || breakdown.length === 0) return null;

  const isSevenJudges = breakdown.length >= 7;

  return (
    <div
      className={cn(
        'w-full max-w-2xl xl:max-w-3xl px-2 sm:px-3 py-2 sm:py-2.5 lg:py-3 rounded-xl border-2 shadow-[0_8px_28px_rgba(0,0,0,0.5)] shrink-0',
        variant === 'blue'
          ? 'bg-[#0354b8]/95 border-cyan-300/65'
          : 'bg-[#a81119]/95 border-red-300/65'
      )}
    >
      <div
        className={cn(
          'grid gap-1.5 sm:gap-2',
          breakdown.length === 3
            ? 'grid-cols-3'
            : breakdown.length === 7
              ? 'grid-cols-7'
              : 'grid-cols-5'
        )}
      >
        {/* Header Row: Referee / Judge 1..N */}
        {breakdown.map((item) => (
          <div
            key={`hdr-${item.judgeNumber}`}
            className={cn(
              'h-8 sm:h-10 lg:h-11 px-1.5 rounded-[6px] bg-gradient-to-b from-[#fde047] via-[#facc15] to-[#eab308] border border-amber-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.45)] flex items-center justify-center text-slate-950 font-black tracking-tight leading-none whitespace-nowrap overflow-hidden',
              isSevenJudges ? 'text-[10px] sm:text-xs md:text-sm lg:text-base' : 'text-xs sm:text-base md:text-lg lg:text-xl'
            )}
          >
            {item.label}
          </div>
        ))}

        {/* Accuracy Row */}
        {breakdown.map((item) => (
          <div
            key={`acc-${item.judgeNumber}`}
            className={cn(
              'h-10 sm:h-12 md:h-14 lg:h-16 px-1.5 rounded-[6px] flex items-center justify-center font-black tabular-nums leading-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.14)]',
              isSevenJudges ? 'text-base sm:text-xl md:text-2xl lg:text-3xl' : 'text-xl sm:text-3xl md:text-4xl lg:text-[2.5rem]',
              !item.submitted
                ? 'bg-white/80 text-slate-400'
                : item.droppedAccuracy
                  ? 'bg-slate-400/80 text-slate-900 line-through decoration-slate-950 decoration-[3px]'
                  : 'bg-white text-slate-950'
            )}
          >
            {item.submitted && item.accuracy !== null ? item.accuracy.toFixed(1) : '--'}
          </div>
        ))}

        {/* Presentation Row */}
        {breakdown.map((item) => (
          <div
            key={`pres-${item.judgeNumber}`}
            className={cn(
              'h-10 sm:h-12 md:h-14 lg:h-16 px-1.5 rounded-[6px] flex items-center justify-center font-black tabular-nums leading-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.14)]',
              isSevenJudges ? 'text-base sm:text-xl md:text-2xl lg:text-3xl' : 'text-xl sm:text-3xl md:text-4xl lg:text-[2.5rem]',
              !item.submitted
                ? 'bg-white/80 text-slate-400'
                : item.droppedPresentation
                  ? 'bg-slate-400/80 text-slate-900 line-through decoration-slate-950 decoration-[3px]'
                  : 'bg-white text-slate-950'
            )}
          >
            {item.submitted && item.presentation !== null ? item.presentation.toFixed(1) : '--'}
          </div>
        ))}
      </div>
    </div>
  );
}

export const PoomsaeScreenView: React.FC<PoomsaeScreenViewProps> = ({
  ring,
  availableRings = [],
  namingMode,
  boutNumberingMode = 'alphanumeric',
  currentEventId,
  teamLogos = {},
  winnerBanner,
  timerState,
  defaultTimerSeconds = 90,
  poomsaeSelection,
  getStageForBout,
  onSelectRing,
  onBack,
  canSwitchRing = false,
  isStandalone = false,
  winnerDisplaySeconds = 5,
  showFinalScore = false,
  showJudgeBreakdown = true,
  blueScoreSummary = null,
  redScoreSummary = null
}) => {
  const showBreakdownTable = showFinalScore && showJudgeBreakdown !== false;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeWinner, setActiveWinner] = useState<RingWinnerBroadcast | null>(null);
  const [winnerProgressStarted, setWinnerProgressStarted] = useState(false);
  const [liveTimerOverride, setLiveTimerOverride] = useState<RingTimerState | null>(null);
  const [livePoomsaeOverride, setLivePoomsaeOverride] = useState<RingPoomsaeSelection | null>(null);
  const [liveDefaultSeconds, setLiveDefaultSeconds] = useState<number>(defaultTimerSeconds);
  const [timerTickNow, setTimerTickNow] = useState<number>(() => Date.now());
  const lastShownConfirmedAtRef = useRef<number>(0);
  const hasMountedRef = useRef<boolean>(false);
  const prevRingRef = useRef<number>(ring.ringNumber);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winnerDisplaySecondsRef = useRef<number>(winnerDisplaySeconds);

  useEffect(() => {
    winnerDisplaySecondsRef.current = winnerDisplaySeconds;
  }, [winnerDisplaySeconds]);

  useEffect(() => {
    setLiveDefaultSeconds(defaultTimerSeconds);
  }, [defaultTimerSeconds]);

  useEffect(() => {
    setLiveTimerOverride(timerState ?? null);
  }, [timerState, ring.ringNumber]);

  useEffect(() => {
    setLivePoomsaeOverride(poomsaeSelection ?? null);
  }, [poomsaeSelection, ring.ringNumber]);

  const effectiveDisplayMs =
    winnerDisplaySeconds <= 0 ? 0 : Math.max(1000, Number(winnerDisplaySeconds) * 1000);

  const ringName =
    namingMode === 'number'
      ? ring.ringNumber.toString()
      : String.fromCharCode(64 + ring.ringNumber);

  const triggerWinnerPopup = (banner: RingWinnerBroadcast) => {
    const durationSec = Number(winnerDisplaySecondsRef.current ?? 5);
    if (durationSec <= 0) return;
    const durationMs = Math.max(1000, durationSec * 1000);

    if (!banner || Number(banner.ringNumber) !== Number(ring.ringNumber)) return;
    if (banner.confirmedAt <= lastShownConfirmedAtRef.current) return;

    lastShownConfirmedAtRef.current = banner.confirmedAt;
    setActiveWinner(banner);
    setWinnerProgressStarted(false);

    requestAnimationFrame(() => {
      setWinnerProgressStarted(true);
    });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActiveWinner(null);
      setWinnerProgressStarted(false);
    }, durationMs);
  };

  // Trigger 5-second winner popup window whenever a winner confirmation arrives via Firestore prop
  useEffect(() => {
    const isInitialMount = !hasMountedRef.current;
    hasMountedRef.current = true;

    if (!winnerBanner || Number(winnerBanner.ringNumber) !== Number(ring.ringNumber)) return;
    if (winnerBanner.confirmedAt <= lastShownConfirmedAtRef.current) {
      return;
    }

    // On initial load, skip old stale results (>15s); while already open, always trigger immediately regardless of clock skew
    if (isInitialMount && Math.abs(Date.now() - winnerBanner.confirmedAt) > 15000) {
      lastShownConfirmedAtRef.current = winnerBanner.confirmedAt;
      return;
    }

    triggerWinnerPopup(winnerBanner);
  }, [winnerBanner, ring.ringNumber, currentEventId]);

  // Also listen via BroadcastChannel and localStorage 'storage' event for instant (<10ms) same-browser cross-tab popup trigger
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('tkd_winner_popup');
        channel.onmessage = (event) => {
          const payload = event.data as RingWinnerBroadcast | undefined;
          if (payload && Number(payload.ringNumber) === Number(ring.ringNumber)) {
            triggerWinnerPopup(payload);
          }
        };
      }
    } catch {
      // ignore BroadcastChannel unsupported errors
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tkd_ring_winner_banners' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Record<string, RingWinnerBroadcast>;
          const banner = parsed?.[String(ring.ringNumber)];
          if (banner && Math.abs(Date.now() - banner.confirmedAt) <= 15000) {
            triggerWinnerPopup(banner);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [ring.ringNumber]);

  // Listen for instant same-browser timer updates, poomsae selection & default duration changes
  useEffect(() => {
    let timerChannel: BroadcastChannel | null = null;
    let settingChannel: BroadcastChannel | null = null;
    let poomsaeChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        timerChannel = new BroadcastChannel('tkd_ring_timers');
        timerChannel.onmessage = (event) => {
          const payload = event.data as Record<string, RingTimerState> | undefined;
          const nextForRing = payload?.[String(ring.ringNumber)];
          if (nextForRing) {
            setLiveTimerOverride(nextForRing);
          }
        };
        settingChannel = new BroadcastChannel('tkd_match_timer_setting');
        settingChannel.onmessage = (event) => {
          const secs = Number(event.data);
          if (!isNaN(secs) && secs > 0) {
            setLiveDefaultSeconds(secs);
          }
        };
        poomsaeChannel = new BroadcastChannel('tkd_ring_poomsae_selection');
        poomsaeChannel.onmessage = (event) => {
          const payload = event.data as Record<string, RingPoomsaeSelection> | undefined;
          const nextForRing = payload?.[String(ring.ringNumber)];
          if (nextForRing) {
            setLivePoomsaeOverride(nextForRing);
          }
        };
      }
    } catch {
      // ignore BroadcastChannel errors
    }

    const handleTimerStorage = (e: StorageEvent) => {
      if (e.key === 'tkd_ring_timers' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Record<string, RingTimerState>;
          const nextForRing = parsed?.[String(ring.ringNumber)];
          if (nextForRing) setLiveTimerOverride(nextForRing);
        } catch {}
      } else if (e.key === 'tkd_match_timer_seconds' && e.newValue) {
        try {
          const secs = Number(JSON.parse(e.newValue));
          if (!isNaN(secs) && secs > 0) setLiveDefaultSeconds(secs);
        } catch {}
      } else if (e.key === 'tkd_ring_poomsae_selection' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Record<string, RingPoomsaeSelection>;
          const nextForRing = parsed?.[String(ring.ringNumber)];
          if (nextForRing) setLivePoomsaeOverride(nextForRing);
        } catch {}
      }
    };
    window.addEventListener('storage', handleTimerStorage);

    return () => {
      if (timerChannel) timerChannel.close();
      if (settingChannel) settingChannel.close();
      if (poomsaeChannel) poomsaeChannel.close();
      window.removeEventListener('storage', handleTimerStorage);
    };
  }, [ring.ringNumber]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Only reset active popup if the user manually switches to a different ring
  useEffect(() => {
    if (prevRingRef.current !== ring.ringNumber) {
      prevRingRef.current = ring.ringNumber;
      setActiveWinner(null);
      setWinnerProgressStarted(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [ring.ringNumber]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error enabling fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const [copiedScreen2Url, setCopiedScreen2Url] = useState(false);

  const handleCopyCourtUrl = (screenNum: 1 | 2 = showFinalScore ? 2 : 1) => {
    const viewQuery = screenNum === 2 ? 'poomsae2' : 'poomsae';
    const url = `${window.location.origin}${window.location.pathname}?view=${viewQuery}&ring=${ring.ringNumber}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        if (screenNum === 2) {
          setCopiedScreen2Url(true);
          setTimeout(() => setCopiedScreen2Url(false), 2000);
        } else {
          setCopiedUrl(true);
          setTimeout(() => setCopiedUrl(false), 2000);
        }
      }).catch(() => {});
    }
  };

  const current = ring.currentBout || null;

  const effectiveBoutMode: 'numeric' | 'alphanumeric' =
    boutNumberingMode === 'numeric' ? 'numeric' : 'alphanumeric';

  const displayBoutNumber = activeWinner
    ? formatBoutNumber(ring.ringNumber, activeWinner.boutNumber, effectiveBoutMode)
    : current?.bout
      ? formatBoutNumber(ring.ringNumber, current.bout, effectiveBoutMode)
      : '---';

  const displayCategory = activeWinner
    ? cleanText(activeWinner.category)
    : cleanText(current?.category);

  const displayStage = activeWinner
    ? cleanText(activeWinner.stage) ||
      (getStageForBout && activeWinner.boutNumber
        ? getStageForBout(String(activeWinner.boutNumber), activeWinner.category || '')
        : '')
    : current?.bout && getStageForBout
      ? getStageForBout(String(current.bout), current.category || '')
      : '';

  const privacyMode = activeWinner ? Boolean(activeWinner.privacyMode) : Boolean(current?.privacy_mode);

  const blueName = activeWinner
    ? privacyMode
      ? '---'
      : cleanText(activeWinner.blueName)
    : privacyMode
      ? '---'
      : cleanText(current?.blue_name);
  const blueClub = activeWinner ? cleanText(activeWinner.blueClub) : cleanText(current?.blue_club);
  const blueLogo = activeWinner ? activeWinner.blueLogo : current?.blue_logo || current?.blue_flag;

  const redName = activeWinner
    ? privacyMode
      ? '---'
      : cleanText(activeWinner.redName)
    : privacyMode
      ? '---'
      : cleanText(current?.red_name);
  const redClub = activeWinner ? cleanText(activeWinner.redClub) : cleanText(current?.red_club);
  const redLogo = activeWinner ? activeWinner.redLogo : current?.red_logo || current?.red_flag;

  const isSoloPoomsae = activeWinner
    ? activeWinner.winnerSide === 'Completed' || (!redName && Boolean(blueName))
    : Boolean(
        current &&
          (current.category?.toUpperCase().includes('INDIVIDUAL POOMSAE') ||
            current.category?.toUpperCase().includes('FREESTYLE') ||
            (current.category?.toUpperCase().includes('POOMSAE') && !redName))
      );

  const winnerDisplayText = activeWinner
    ? activeWinner.winnerSide === 'No Winner'
      ? 'NO WINNER · DOUBLE NO-SHOW'
      : activeWinner.winnerSide === 'Completed'
        ? `${privacyMode ? '---' : cleanText(activeWinner.winnerName) || 'PERFORMER'} COMPLETE`
        : `${privacyMode ? '---' : cleanText(activeWinner.winnerName) || (activeWinner.winnerSide === 'Blue' ? 'CHUNG' : 'HONG')} WIN`
    : '';

  const winnerIsRed = activeWinner?.winnerSide === 'Red';
  const winnerIsNoWinner = activeWinner?.winnerSide === 'No Winner';
  const hasActiveMatch = Boolean(current || activeWinner);

  const effectiveTimer = liveTimerOverride ?? timerState ?? null;
  const currentBoutKey = current ? `${current.eventId || ''}_${current.bout}` : 'idle';
  const isTimerForCurrentBout =
    !effectiveTimer?.boutKey ||
    effectiveTimer.boutKey === 'idle' ||
    effectiveTimer.boutKey === currentBoutKey ||
    Boolean(current?.bout && effectiveTimer.boutKey.endsWith(`_${current.bout}`));
  const isTimerRunning = Boolean(
    effectiveTimer && isTimerForCurrentBout && effectiveTimer.isRunning && effectiveTimer.startedAt
  );

  useEffect(() => {
    if (!isTimerRunning) return;
    setTimerTickNow(Date.now());
    const id = setInterval(() => {
      setTimerTickNow(Date.now());
    }, 200);
    return () => clearInterval(id);
  }, [isTimerRunning]);

  const displayedTimerSeconds = (() => {
    const fallback = Math.max(1, Number(liveDefaultSeconds) || 90);
    if (!effectiveTimer || !isTimerForCurrentBout) return fallback;
    if (effectiveTimer.isRunning && effectiveTimer.startedAt) {
      const elapsedSec = (timerTickNow - effectiveTimer.startedAt) / 1000;
      return Math.max(0, Math.ceil(effectiveTimer.remainingSeconds - elapsedSec));
    }
    return Math.max(0, Math.ceil(effectiveTimer.remainingSeconds));
  })();
  const isTimerExpired = Boolean(effectiveTimer && isTimerForCurrentBout && displayedTimerSeconds === 0);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-[#040915] text-white select-none overflow-hidden',
        isFullscreen || isStandalone
          ? 'w-screen h-screen rounded-none'
          : 'w-full min-h-[76vh] md:min-h-[84vh] rounded-2xl border border-slate-800/80 shadow-2xl'
      )}
    >
      {/* Top Utility Bar (Hidden in Fullscreen) — clean controls without crossed-out title text */}
      {!isFullscreen && (
        <div className="bg-[#060d1e] border-b border-blue-500/20 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 z-30">
          <div className="flex items-center gap-2.5 sm:gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0e1a33] hover:bg-[#16274a] border border-white/10 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
            )}
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-lg shadow-red-900/40">
              {ringName}
            </div>

            {canSwitchRing && availableRings.length > 1 && onSelectRing && (
              <div className="flex items-center gap-1.5 bg-[#0e1a33] border border-white/10 rounded-xl px-2.5 py-1.5">
                <Monitor size={13} className="text-cyan-400" />
                <select
                  value={ring.ringNumber}
                  onChange={(e) => onSelectRing(Number(e.target.value))}
                  className="bg-transparent text-white text-xs font-black outline-none cursor-pointer"
                >
                  {availableRings.map((r) => {
                    const rLabel =
                      namingMode === 'number'
                        ? r.ringNumber.toString()
                        : String.fromCharCode(64 + r.ringNumber);
                    return (
                      <option key={r.ringNumber} value={r.ringNumber} className="bg-[#060d1e] text-white">
                        Ring {rLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleCopyCourtUrl(1)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border",
                !showFinalScore
                  ? "bg-blue-600 hover:bg-blue-500 text-white border-blue-400/40 shadow-sm"
                  : "bg-[#0e1a33] hover:bg-[#16274a] border-white/15 text-slate-200"
              )}
              title="Copy dedicated URL for Court Screen 1 monitor"
            >
              {copiedUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedUrl ? 'Copied' : 'Screen 1 URL'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopyCourtUrl(2)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border",
                showFinalScore
                  ? "bg-purple-600 hover:bg-purple-500 text-white border-purple-400/40 shadow-sm"
                  : "bg-[#0e1a33] hover:bg-[#16274a] border-white/15 text-slate-200"
              )}
              title="Copy dedicated URL for Poomsae Screen 2 monitor"
            >
              {copiedScreen2Url ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedScreen2Url ? 'Copied' : 'Screen 2 URL'}</span>
            </button>

            <button
              type="button"
              onClick={toggleFullScreen}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer shadow-lg shadow-blue-900/40"
              title="Enter Fullscreen"
            >
              <Maximize size={14} />
              <span className="hidden sm:inline">Fullscreen</span>
            </button>
          </div>
        </div>
      )}

      {/* Exit Fullscreen floating button on hover when fullscreen */}
      {isFullscreen && (
        <button
          type="button"
          onClick={toggleFullScreen}
          className="fixed top-3 right-3 z-50 p-2.5 bg-black/60 hover:bg-black/90 text-white/70 hover:text-white rounded-xl border border-white/20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          title="Exit Fullscreen"
        >
          <Minimize size={18} />
        </button>
      )}

      {/* Broadcast Match Header Bar (Glossy Dark Navy with Blue & Red Side Accents) */}
      <div
        className="relative px-4 sm:px-8 md:px-12 py-2.5 sm:py-3.5 border-y border-white/10 shrink-0 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0b162c 0%, #050a16 100%)'
        }}
      >
        {/* Left glossy diagonal blue stripes */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-0 inset-y-0 w-28 md:w-44 pointer-events-none opacity-85"
          style={{
            background:
              'linear-gradient(125deg, #0ea5e9 0%, #0284c7 14%, transparent 15%, #0369a1 22%, #0284c7 34%, transparent 35%, rgba(14,165,233,0.18) 52%, transparent 72%)'
          }}
        />
        {/* Right glossy diagonal red stripes */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute right-0 inset-y-0 w-28 md:w-44 pointer-events-none opacity-85"
          style={{
            background:
              'linear-gradient(235deg, #ef4444 0%, #dc2626 14%, transparent 15%, #b91c1c 22%, #dc2626 34%, transparent 35%, rgba(239,68,68,0.18) 52%, transparent 72%)'
          }}
        />

        <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-5">
          {/* Left: RING */}
          <div className="shrink-0 flex items-center pl-1 sm:pl-6">
            <span className="text-sm sm:text-xl md:text-2xl font-black uppercase tracking-wider text-white whitespace-nowrap drop-shadow">
              RING {ringName}
            </span>
          </div>

          {/* Center: FULL CATEGORY NAME */}
          <div className="flex-1 text-center min-w-0 px-1 sm:px-2">
            <span
              className={cn(
                'font-black uppercase tracking-wider text-white block break-words whitespace-normal leading-tight drop-shadow',
                (displayCategory || '').length > 55
                  ? 'text-xs sm:text-base md:text-lg'
                  : (displayCategory || '').length > 35
                    ? 'text-xs sm:text-lg md:text-xl'
                    : 'text-sm sm:text-xl md:text-2xl'
              )}
            >
              {displayCategory || 'WAITING FOR MATCH'}
            </span>
          </div>

          {/* Right: STAGE */}
          <div className="shrink-0 text-right pr-1 sm:pr-6">
            <span className="text-xs sm:text-lg md:text-xl font-black uppercase tracking-wider text-amber-300 whitespace-nowrap block drop-shadow">
              {displayStage || ''}
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Arena */}
      <div
        className={cn(
          'relative flex-1 grid min-h-0 overflow-hidden',
          isSoloPoomsae ? 'grid-cols-1' : 'grid-cols-2'
        )}
      >
        {/* TOP-CENTER BOUT NUMBER PLAQUE + SELECTED POOMSAE DISPLAY */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center w-full max-w-[92%] sm:max-w-[78%]">
          <div
            className="px-8 sm:px-14 md:px-18 py-2 sm:py-3 bg-[#070f22]/95 border-x border-b border-amber-400/70 shadow-[0_6px_28px_rgba(0,0,0,0.85),0_0_20px_rgba(251,191,36,0.22)] flex items-center justify-center"
            style={{
              clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)'
            }}
          >
            <span className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-widest text-amber-400 whitespace-nowrap leading-none drop-shadow-[0_2px_8px_rgba(251,191,36,0.45)]">
              {displayBoutNumber}
            </span>
          </div>

          {(() => {
            const effectiveSel = livePoomsaeOverride ?? poomsaeSelection ?? null;
            const currentBoutKeySel = current ? `${current.eventId || ''}_${current.bout}` : 'idle';
            const isSelValid =
              effectiveSel &&
              (!effectiveSel.boutKey ||
                effectiveSel.boutKey === 'idle' ||
                effectiveSel.boutKey === currentBoutKeySel ||
                Boolean(current?.bout && effectiveSel.boutKey.endsWith(`_${current.bout}`)));
            const p1 = isSelValid ? cleanText(effectiveSel?.poomsae1) : '';
            const p2 = isSelValid ? cleanText(effectiveSel?.poomsae2) : '';
            if (!p1 && !p2) return null;
            return (
              <div className="mt-1.5 sm:mt-2 px-4 sm:px-7 py-1.5 sm:py-2 bg-[#060f24]/92 border border-cyan-300/60 shadow-[0_8px_32px_rgba(0,0,0,0.75),0_0_22px_rgba(34,211,238,0.25)] backdrop-blur-md flex flex-col items-center justify-center gap-1 text-center"
                style={{
                  clipPath: 'polygon(2% 0%, 98% 0%, 100% 22%, 100% 78%, 98% 100%, 2% 100%, 0% 78%, 0% 22%)'
                }}
              >
                {p1 && (
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                    <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase tracking-widest text-cyan-300">
                      Poomsae 1:
                    </span>
                    <span className="text-sm sm:text-base md:text-lg lg:text-xl font-black uppercase tracking-wide text-white break-words whitespace-normal drop-shadow leading-tight">
                      {p1}
                    </span>
                  </div>
                )}
                {p1 && p2 && (
                  <div aria-hidden="true" className="w-3/4 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                )}
                {p2 && (
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                    <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase tracking-widest text-amber-300">
                      Poomsae 2:
                    </span>
                    <span className="text-sm sm:text-base md:text-lg lg:text-xl font-black uppercase tracking-wide text-white break-words whitespace-normal drop-shadow leading-tight">
                      {p2}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* CHUNG / BLUE SIDE */}
        <div
          className={cn(
            'relative flex flex-col items-center justify-center px-3 sm:px-6 text-center overflow-hidden',
            showBreakdownTable
              ? 'pt-24 pb-16 sm:pt-28 sm:pb-20'
              : showFinalScore
                ? 'pt-28 pb-18 sm:pt-36 sm:pb-22'
                : 'pt-36 pb-20 sm:pt-44 sm:pb-24'
          )}
          style={{
            background:
              'radial-gradient(circle at 80% 50%, #0ea5e9 0%, #0369c4 32%, #023b88 68%, #021d52 100%)'
          }}
        >
          {/* Decorative cyber corner halftone / diagonal sheen */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(rgba(125,211,252,0.7) 1.5px, transparent 1.5px)',
              backgroundSize: '14px 14px',
              maskImage: 'linear-gradient(135deg, transparent 55%, black 100%)'
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-24 pointer-events-none opacity-35"
            style={{
              background:
                'repeating-linear-gradient(-45deg, rgba(56,189,248,0.25) 0px, rgba(56,189,248,0.25) 2px, transparent 2px, transparent 16px)'
            }}
          />

          {/* Left Taekwondo Athlete Silhouette */}
          <TaekwondoKickSilhouette
            side="left"
            className="absolute left-1 sm:left-3 top-6 sm:top-10 w-28 sm:w-40 md:w-48 h-auto text-sky-300/20"
          />

          {/* Center Content Stack */}
          <div className={cn('relative z-10 flex flex-col items-center justify-center w-full max-w-[94%]', showBreakdownTable ? 'gap-2 sm:gap-2.5 lg:gap-3' : showFinalScore ? 'gap-2.5 sm:gap-3.5' : 'mt-2 sm:mt-4 gap-3 sm:gap-4')}>
            <ClubLogoEmblem
              club={blueClub}
              name={blueName}
              directLogo={blueLogo}
              teamLogos={teamLogos}
              variant="blue"
              reserveSlot={hasActiveMatch}
              compact={showBreakdownTable}
            />

            {/* Club Name Angled Bar */}
            <div className={cn('w-full px-2 shrink-0', showFinalScore ? 'max-w-2xl xl:max-w-3xl' : 'max-w-lg sm:max-w-xl')}>
              <div
                className={cn(
                  'relative flex items-center justify-center px-7 sm:px-11 bg-gradient-to-r from-[#04183b] via-[#093275] to-[#04183b] border border-cyan-300/70 shadow-[0_0_24px_rgba(6,182,212,0.45)]',
                  showBreakdownTable
                    ? 'min-h-[2.75rem] sm:min-h-[3.25rem] md:min-h-[3.75rem] lg:min-h-[4.25rem] py-1.5'
                    : showFinalScore
                      ? 'min-h-[3.25rem] sm:min-h-[3.75rem] md:min-h-[4.5rem] py-1.5'
                      : 'min-h-[3.25rem] sm:min-h-[3.75rem] md:min-h-[4.25rem] py-1.5'
                )}
                style={{
                  clipPath: 'polygon(4% 0%, 100% 0%, 96% 100%, 0% 100%)'
                }}
              >
                <p
                  className={cn(
                    'w-full font-black text-white uppercase tracking-wider break-words whitespace-normal leading-tight drop-shadow',
                    showFinalScore
                      ? (blueClub || '').length > 32
                        ? 'text-xs sm:text-base md:text-lg lg:text-xl'
                        : (blueClub || '').length > 22
                          ? 'text-sm sm:text-lg md:text-xl lg:text-2xl'
                          : 'text-base sm:text-xl md:text-2xl lg:text-[1.65rem]'
                      : (blueClub || '').length > 32
                        ? 'text-xs sm:text-base md:text-lg'
                        : (blueClub || '').length > 22
                          ? 'text-xs sm:text-lg md:text-xl'
                          : 'text-sm sm:text-xl md:text-2xl'
                  )}
                >
                  {blueClub || (hasActiveMatch ? '---' : 'CHUNG CLUB')}
                </p>
              </div>
              {/* Center flare divider */}
              <div className={cn('mx-auto h-[2px] w-4/5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_12px_#67e8f9]', showBreakdownTable ? 'mt-1.5' : 'mt-2 sm:mt-2.5')} />
            </div>

            {/* Player Name Chamfered Frame */}
            <div className={cn('w-full px-1 shrink-0', showFinalScore ? 'max-w-2xl xl:max-w-3xl' : 'max-w-lg sm:max-w-xl')}>
              <div
                className={cn(
                  'relative flex items-center justify-center px-6 sm:px-10 bg-gradient-to-b from-[#031538]/95 via-[#052359]/90 to-[#020d26]/95 border-2 border-cyan-400/80 shadow-[0_0_32px_rgba(34,211,238,0.4),inset_0_0_22px_rgba(14,165,233,0.28)]',
                  showBreakdownTable
                    ? 'min-h-[4.75rem] sm:min-h-[6rem] md:min-h-[7.25rem] lg:min-h-[8.5rem] py-2.5'
                    : showFinalScore
                      ? 'min-h-[6rem] sm:min-h-[7.5rem] md:min-h-[9rem] lg:min-h-[10.5rem] py-3'
                      : 'min-h-[6.5rem] sm:min-h-[7.5rem] md:min-h-[9.5rem] lg:min-h-[10.5rem] py-3'
                )}
                style={{
                  clipPath: 'polygon(4% 0%, 96% 0%, 100% 22%, 100% 78%, 96% 100%, 4% 100%, 0% 78%, 0% 22%)'
                }}
              >
                <h2
                  className={cn(
                    'font-black italic text-white uppercase tracking-wide break-words whitespace-normal leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]',
                    showBreakdownTable
                      ? (blueName || '').length > 36
                        ? 'text-base sm:text-xl md:text-2xl lg:text-3xl'
                        : (blueName || '').length > 22
                          ? 'text-lg sm:text-2xl md:text-3xl lg:text-4xl'
                          : 'text-xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.35rem]'
                      : (blueName || '').length > 36
                        ? 'text-base sm:text-xl md:text-2xl lg:text-3xl'
                        : (blueName || '').length > 22
                          ? 'text-lg sm:text-2xl md:text-3xl lg:text-4xl'
                          : 'text-2xl sm:text-4xl md:text-5xl lg:text-[3.25rem]'
                  )}
                >
                  {blueName || (hasActiveMatch ? '---' : 'READY')}
                </h2>
              </div>
            </div>

            {/* Poomsae Screen 2: Clean Official Final Score Display + Judge Breakdown Table */}
            {showFinalScore && hasActiveMatch && (
              <>
                <div className="w-full max-w-lg sm:max-w-xl lg:max-w-2xl px-1 shrink-0">
                  <div
                    className={cn(
                      'px-6 bg-[#020d26]/92 border-2 border-cyan-300/80 shadow-[0_0_28px_rgba(34,211,238,0.35)] flex flex-col items-center justify-center',
                      showBreakdownTable ? 'py-2 sm:py-2.5 lg:py-3' : 'py-3 sm:py-4'
                    )}
                    style={{
                      clipPath: 'polygon(6% 0%, 94% 0%, 100% 28%, 100% 72%, 94% 100%, 6% 100%, 0% 72%, 0% 28%)'
                    }}
                  >
                    <span className="text-xs sm:text-sm md:text-base font-black uppercase tracking-[0.24em] text-cyan-300">
                      Final Score
                    </span>
                    <span
                      className={cn(
                        'font-mono font-black text-white tabular-nums tracking-tight leading-none mt-1 drop-shadow-[0_3px_12px_rgba(0,0,0,0.8)]',
                        showBreakdownTable
                          ? 'text-3xl sm:text-5xl md:text-6xl lg:text-[4.25rem] xl:text-[4.75rem]'
                          : 'text-4xl sm:text-6xl md:text-7xl xl:text-[5.25rem]'
                      )}
                    >
                      {blueScoreSummary?.finalTotal !== null && blueScoreSummary?.finalTotal !== undefined
                        ? formatPoomsaeScore(blueScoreSummary.finalTotal)
                        : '-.--'}
                    </span>
                    {blueScoreSummary?.p1Total !== null &&
                      blueScoreSummary?.p1Total !== undefined &&
                      blueScoreSummary?.p2Total !== null &&
                      blueScoreSummary?.p2Total !== undefined && (
                        <div className="mt-1.5 flex items-center gap-2.5 text-xs sm:text-sm md:text-base font-mono font-bold text-cyan-200/90 tabular-nums">
                          <span>P1: {formatPoomsaeScore(blueScoreSummary.p1Total)}</span>
                          <span aria-hidden="true">·</span>
                          <span>P2: {formatPoomsaeScore(blueScoreSummary.p2Total)}</span>
                        </div>
                      )}
                  </div>
                </div>
                {showBreakdownTable && (
                  <PoomsaeJudgeBreakdownTable
                    breakdown={blueScoreSummary?.judgeBreakdown}
                    variant="blue"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* HONG / RED SIDE */}
        {!isSoloPoomsae && (
          <div
            className={cn(
              'relative flex flex-col items-center justify-center px-3 sm:px-6 text-center overflow-hidden',
              showBreakdownTable
                ? 'pt-24 pb-16 sm:pt-28 sm:pb-20'
                : showFinalScore
                  ? 'pt-28 pb-18 sm:pt-36 sm:pb-22'
                  : 'pt-36 pb-20 sm:pt-44 sm:pb-24'
            )}
            style={{
              background:
                'radial-gradient(circle at 20% 50%, #ef4444 0%, #b91c1c 34%, #7f090d 68%, #450306 100%)'
            }}
          >
            {/* Decorative cyber corner halftone / diagonal sheen */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(252,165,165,0.75) 1.5px, transparent 1.5px)',
                backgroundSize: '14px 14px',
                maskImage: 'linear-gradient(225deg, transparent 55%, black 100%)'
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-0 w-24 pointer-events-none opacity-35"
              style={{
                background:
                  'repeating-linear-gradient(45deg, rgba(248,113,113,0.25) 0px, rgba(248,113,113,0.25) 2px, transparent 2px, transparent 16px)'
              }}
            />

            {/* Right Taekwondo Athlete Silhouette */}
            <TaekwondoKickSilhouette
              side="right"
              className="absolute right-1 sm:right-3 top-6 sm:top-10 w-28 sm:w-40 md:w-48 h-auto text-red-300/20"
            />

            {/* Center Content Stack */}
            <div className={cn('relative z-10 flex flex-col items-center justify-center w-full max-w-[94%]', showBreakdownTable ? 'gap-2 sm:gap-2.5 lg:gap-3' : showFinalScore ? 'gap-2.5 sm:gap-3.5' : 'mt-2 sm:mt-4 gap-3 sm:gap-4')}>
              <ClubLogoEmblem
                club={redClub}
                name={redName}
                directLogo={redLogo}
                teamLogos={teamLogos}
                variant="red"
                reserveSlot={hasActiveMatch}
                compact={showBreakdownTable}
              />

              {/* Club Name Angled Bar */}
              <div className={cn('w-full px-2 shrink-0', showFinalScore ? 'max-w-2xl xl:max-w-3xl' : 'max-w-lg sm:max-w-xl')}>
                <div
                  className={cn(
                    'relative flex items-center justify-center px-7 sm:px-11 bg-gradient-to-r from-[#450609] via-[#8c0c14] to-[#450609] border border-red-300/70 shadow-[0_0_24px_rgba(239,68,68,0.45)]',
                    showBreakdownTable
                      ? 'min-h-[2.75rem] sm:min-h-[3.25rem] md:min-h-[3.75rem] lg:min-h-[4.25rem] py-1.5'
                      : showFinalScore
                        ? 'min-h-[3.25rem] sm:min-h-[3.75rem] md:min-h-[4.5rem] py-1.5'
                        : 'min-h-[3.25rem] sm:min-h-[3.75rem] md:min-h-[4.25rem] py-1.5'
                  )}
                  style={{
                    clipPath: 'polygon(4% 0%, 100% 0%, 96% 100%, 0% 100%)'
                  }}
                >
                  <p
                    className={cn(
                      'w-full font-black text-white uppercase tracking-wider break-words whitespace-normal leading-tight drop-shadow',
                      showFinalScore
                        ? (redClub || '').length > 32
                          ? 'text-xs sm:text-base md:text-lg lg:text-xl'
                          : (redClub || '').length > 22
                            ? 'text-sm sm:text-lg md:text-xl lg:text-2xl'
                            : 'text-base sm:text-xl md:text-2xl lg:text-[1.65rem]'
                        : (redClub || '').length > 32
                          ? 'text-xs sm:text-base md:text-lg'
                          : (redClub || '').length > 22
                            ? 'text-xs sm:text-lg md:text-xl'
                            : 'text-sm sm:text-xl md:text-2xl'
                    )}
                  >
                    {redClub || (hasActiveMatch ? '---' : 'HONG CLUB')}
                  </p>
                </div>
                {/* Center flare divider */}
                <div className={cn('mx-auto h-[2px] w-4/5 bg-gradient-to-r from-transparent via-red-300 to-transparent shadow-[0_0_12px_#fca5a5]', showBreakdownTable ? 'mt-1.5' : 'mt-2 sm:mt-2.5')} />
              </div>

              {/* Player Name Chamfered Frame */}
              <div className={cn('w-full px-1 shrink-0', showFinalScore ? 'max-w-2xl xl:max-w-3xl' : 'max-w-lg sm:max-w-xl')}>
                <div
                  className={cn(
                    'relative flex items-center justify-center px-6 sm:px-10 bg-gradient-to-b from-[#3d0307]/95 via-[#68070e]/90 to-[#240103]/95 border-2 border-red-400/80 shadow-[0_0_32px_rgba(248,113,113,0.4),inset_0_0_22px_rgba(239,68,68,0.28)]',
                    showBreakdownTable
                      ? 'min-h-[4.75rem] sm:min-h-[6rem] md:min-h-[7.25rem] lg:min-h-[8.5rem] py-2.5'
                      : showFinalScore
                        ? 'min-h-[6rem] sm:min-h-[7.5rem] md:min-h-[9rem] lg:min-h-[10.5rem] py-3'
                        : 'min-h-[6.5rem] sm:min-h-[7.5rem] md:min-h-[9.5rem] lg:min-h-[10.5rem] py-3'
                  )}
                  style={{
                    clipPath: 'polygon(4% 0%, 96% 0%, 100% 22%, 100% 78%, 96% 100%, 4% 100%, 0% 78%, 0% 22%)'
                  }}
                >
                  <h2
                    className={cn(
                      'font-black italic text-white uppercase tracking-wide break-words whitespace-normal leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]',
                      showBreakdownTable
                        ? (redName || '').length > 36
                          ? 'text-base sm:text-xl md:text-2xl lg:text-3xl'
                          : (redName || '').length > 22
                            ? 'text-lg sm:text-2xl md:text-3xl lg:text-4xl'
                            : 'text-xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.35rem]'
                        : (redName || '').length > 36
                          ? 'text-base sm:text-xl md:text-2xl lg:text-3xl'
                          : (redName || '').length > 22
                            ? 'text-lg sm:text-2xl md:text-3xl lg:text-4xl'
                            : 'text-2xl sm:text-4xl md:text-5xl lg:text-[3.25rem]'
                    )}
                  >
                    {redName || (hasActiveMatch ? '---' : 'READY')}
                  </h2>
                </div>
              </div>

              {/* Poomsae Screen 2: Clean Official Final Score Display + Judge Breakdown Table */}
              {showFinalScore && hasActiveMatch && (
                <>
                  <div className="w-full max-w-lg sm:max-w-xl lg:max-w-2xl px-1 shrink-0">
                    <div
                      className={cn(
                        'px-6 bg-[#240103]/92 border-2 border-red-300/80 shadow-[0_0_28px_rgba(248,113,113,0.35)] flex flex-col items-center justify-center',
                        showBreakdownTable ? 'py-2 sm:py-2.5 lg:py-3' : 'py-3 sm:py-4'
                      )}
                      style={{
                        clipPath: 'polygon(6% 0%, 94% 0%, 100% 28%, 100% 72%, 94% 100%, 6% 100%, 0% 72%, 0% 28%)'
                      }}
                    >
                      <span className="text-xs sm:text-sm md:text-base font-black uppercase tracking-[0.24em] text-red-200">
                        Final Score
                      </span>
                      <span
                        className={cn(
                          'font-mono font-black text-white tabular-nums tracking-tight leading-none mt-1 drop-shadow-[0_3px_12px_rgba(0,0,0,0.8)]',
                          showBreakdownTable
                            ? 'text-3xl sm:text-5xl md:text-6xl lg:text-[4.25rem] xl:text-[4.75rem]'
                            : 'text-4xl sm:text-6xl md:text-7xl xl:text-[5.25rem]'
                        )}
                      >
                        {redScoreSummary?.finalTotal !== null && redScoreSummary?.finalTotal !== undefined
                          ? formatPoomsaeScore(redScoreSummary.finalTotal)
                          : '-.--'}
                      </span>
                      {redScoreSummary?.p1Total !== null &&
                        redScoreSummary?.p1Total !== undefined &&
                        redScoreSummary?.p2Total !== null &&
                        redScoreSummary?.p2Total !== undefined && (
                          <div className="mt-1.5 flex items-center gap-2.5 text-xs sm:text-sm md:text-base font-mono font-bold text-red-200/90 tabular-nums">
                            <span>P1: {formatPoomsaeScore(redScoreSummary.p1Total)}</span>
                            <span aria-hidden="true">·</span>
                            <span>P2: {formatPoomsaeScore(redScoreSummary.p2Total)}</span>
                          </div>
                        )}
                    </div>
                  </div>
                  {showBreakdownTable && (
                    <PoomsaeJudgeBreakdownTable
                      breakdown={redScoreSummary?.judgeBreakdown}
                      variant="red"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Glowing Vertical Center Energy Divider */}
        {!isSoloPoomsae && (
          <div
            aria-hidden="true"
            className="hidden sm:block absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[3px] z-20 pointer-events-none bg-white/95 shadow-[0_0_18px_4px_rgba(255,255,255,0.85),-6px_0_24px_rgba(56,189,248,0.8),6px_0_24px_rgba(248,113,113,0.8)]"
          />
        )}

        {/* BOTTOM-CENTER TIMER PLAQUE (Straddling divider right above MY-TKD footer) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div
            className={cn(
              'px-8 sm:px-14 md:px-16 py-2 sm:py-3 bg-[#060f24]/95 border-x-2 border-t-2 flex items-center justify-center gap-2.5 sm:gap-3.5 transition-colors',
              isTimerExpired
                ? 'border-red-400/90 shadow-[0_-6px_30px_rgba(239,68,68,0.45),0_0_24px_rgba(239,68,68,0.35)]'
                : isTimerRunning
                  ? 'border-emerald-400/85 shadow-[0_-6px_30px_rgba(16,185,129,0.35),0_0_24px_rgba(34,211,238,0.28)]'
                  : 'border-cyan-400/75 shadow-[0_-6px_28px_rgba(0,0,0,0.85),0_0_20px_rgba(34,211,238,0.22)]'
            )}
            style={{
              clipPath: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)'
            }}
          >
            <Clock
              size={22}
              className={cn(
                'hidden sm:block shrink-0',
                isTimerExpired
                  ? 'text-red-400 animate-pulse'
                  : isTimerRunning
                    ? 'text-emerald-400 animate-pulse'
                    : 'text-cyan-300'
              )}
            />
            <span
              className={cn(
                'font-mono text-2xl sm:text-4xl md:text-5xl font-black tabular-nums tracking-[0.08em] leading-none whitespace-nowrap drop-shadow-[0_3px_12px_rgba(0,0,0,0.85)]',
                isTimerExpired
                  ? 'text-red-400 animate-pulse'
                  : isTimerRunning
                    ? 'text-emerald-300'
                    : 'text-white'
              )}
            >
              {formatTimerMMSS(displayedTimerSeconds)}
            </span>
          </div>
        </div>

        {/* WINNER POPUP MODAL */}
        {activeWinner && (() => {
          const winnerLogo = activeWinner.winnerSide === 'Red' ? activeWinner.redLogo : activeWinner.blueLogo;
          const displayCat = cleanText(activeWinner.category);
          return (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/25 backdrop-blur-[1px] pointer-events-auto">
              <div
                className={cn(
                  'relative w-[92%] sm:w-[84%] lg:w-[78%] min-h-[54%] max-h-[70%] px-6 sm:px-10 pt-16 pb-8 border-2 border-white/90 rounded-2xl flex flex-col items-center justify-center text-center overflow-hidden shadow-[0_25px_85px_rgba(0,0,0,0.9)]',
                  winnerIsNoWinner
                    ? 'bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 shadow-[0_0_80px_rgba(245,158,11,0.45)]'
                    : winnerIsRed
                      ? 'bg-gradient-to-b from-[#e60000] via-[#c40000] to-[#990000] shadow-[0_0_80px_rgba(255,0,0,0.7)]'
                      : 'bg-gradient-to-b from-[#1a75ff] via-[#0052cc] to-[#003d99] shadow-[0_0_80px_rgba(0,82,204,0.7)]'
                )}
              >
                {/* Top Header: Ring & Bout */}
                <div className="absolute top-3.5 sm:top-4 left-0 right-0 flex items-center justify-center gap-2 text-xs sm:text-sm font-black uppercase tracking-widest text-white/95 px-4 drop-shadow">
                  <span>RING {ringName}</span>
                  <span aria-hidden="true">•</span>
                  <span>BOUT {formatBoutNumber(ring.ringNumber, activeWinner.boutNumber, effectiveBoutMode)}</span>
                  {activeWinner.winType && (
                    <>
                      <span aria-hidden="true">•</span>
                      <span>{activeWinner.winType}</span>
                    </>
                  )}
                </div>

                {/* Category Name */}
                {displayCat && (
                  <div className="absolute top-9 sm:top-10 left-4 right-4 text-[11px] sm:text-xs md:text-sm font-bold uppercase tracking-wider text-cyan-200/95 truncate px-4 drop-shadow">
                    {displayCat}
                  </div>
                )}

                {/* Center Content: Logo + Winner Label + Athlete Name + Club */}
                <div className="flex flex-col items-center justify-center max-w-[94%] gap-2.5 sm:gap-3 mt-4">
                  {/* Logo / Emblem / Trophy */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl p-1.5 bg-black/35 border-2 border-white/55 shadow-xl flex items-center justify-center overflow-hidden">
                    {winnerLogo ? (
                      <img src={winnerLogo} alt="Winner Logo" className="w-full h-full object-contain drop-shadow" />
                    ) : (
                      <Trophy
                        size={30}
                        className="text-amber-300 drop-shadow-[0_2px_8px_rgba(251,191,36,0.6)]"
                      />
                    )}
                  </div>

                  {/* Winner Side / Status Label */}
                  <span className="text-xs sm:text-sm font-black uppercase tracking-[0.24em] text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                    {winnerIsNoWinner
                      ? 'DOUBLE NO-SHOW'
                      : activeWinner.winnerSide === 'Completed'
                        ? 'PERFORMER COMPLETE'
                        : winnerIsRed
                          ? 'RED WINNER'
                          : 'BLUE WINNER'}
                  </span>

                  {/* Athlete Name (Large Italic Uppercase) */}
                  <h1
                    className={cn(
                      'font-black italic text-white uppercase tracking-wide drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] leading-tight break-words whitespace-normal max-w-full',
                      cleanText(activeWinner.winnerName).length > 34
                        ? 'text-xl sm:text-2xl md:text-3xl'
                        : cleanText(activeWinner.winnerName).length > 22
                          ? 'text-2xl sm:text-3xl md:text-4xl'
                          : 'text-2xl sm:text-4xl md:text-5xl'
                    )}
                  >
                    {cleanText(activeWinner.winnerName) || 'WINNER'}
                  </h1>

                  {/* Club Name (Gold/Yellow) */}
                  {cleanText(activeWinner.winnerClub) && (
                    <p
                      className={cn(
                        'font-black text-amber-200 uppercase tracking-wider drop-shadow-[0_3px_10px_rgba(0,0,0,0.8)] break-words whitespace-normal max-w-full leading-tight',
                        cleanText(activeWinner.winnerClub).length > 30
                          ? 'text-sm sm:text-lg md:text-xl'
                          : 'text-base sm:text-xl md:text-2xl'
                      )}
                    >
                      {cleanText(activeWinner.winnerClub)}
                    </p>
                  )}
                </div>

                {/* Configurable Countdown Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/30">
                  <div
                    className="h-full bg-white transition-all ease-linear"
                    style={{
                      width: winnerProgressStarted ? '0%' : '100%',
                      transitionDuration: `${effectiveDisplayMs || 5000}ms`
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bottom Broadcast Footer Bar with MY-TKD Wordmark */}
      <div
        className="relative shrink-0 h-11 sm:h-14 border-t border-white/10 flex items-center justify-center px-6 sm:px-14 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #071329 0%, #030814 100%)'
        }}
      >
        {/* Subtle bottom-left blue edge & bottom-right red edge accents */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-24 sm:w-44 bg-gradient-to-r from-blue-600/25 to-transparent pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 bottom-0 w-24 sm:w-44 bg-gradient-to-l from-red-600/25 to-transparent pointer-events-none"
        />

        <div className="relative z-10 w-full max-w-5xl flex items-center justify-center gap-4 sm:gap-8">
          <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-white/60 to-white/80" />
          <div className="flex items-center gap-2 px-3 py-1">
            <span className="text-base sm:text-xl md:text-2xl font-black italic tracking-[0.22em] text-white uppercase drop-shadow-[0_2px_8px_rgba(255,255,255,0.25)]">
              MY-<span className="text-red-500">TKD</span>
            </span>
          </div>
          <div className="flex-1 h-[1.5px] bg-gradient-to-l from-transparent via-white/60 to-white/80" />
        </div>
      </div>
    </div>
  );
};
