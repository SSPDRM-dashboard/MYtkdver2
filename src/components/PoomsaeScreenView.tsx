import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Maximize, Minimize, Monitor } from 'lucide-react';
import { RingStatus, RingWinnerBroadcast } from '../types';
import { cn, formatBoutNumber } from '../lib/utils';
import { getPlayerLogoOrFlag } from '../lib/teamLogos';

interface PoomsaeScreenViewProps {
  ring: RingStatus;
  availableRings?: RingStatus[];
  namingMode: 'number' | 'alphabet';
  boutNumberingMode?: 'numeric' | 'alphanumeric';
  currentEventId?: string | null;
  teamLogos?: Record<string, string>;
  winnerBanner?: RingWinnerBroadcast | null;
  getStageForBout?: (boutId: string | number, categoryName: string) => string;
  onSelectRing?: (ringNumber: number) => void;
  onBack?: () => void;
  canSwitchRing?: boolean;
  isStandalone?: boolean;
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
  reserveSlot = false
}: {
  club?: string | null;
  name?: string | null;
  directLogo?: string | null;
  teamLogos?: Record<string, string>;
  variant: 'blue' | 'red';
  reserveSlot?: boolean;
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

  if (!hasInfo) {
    if (!reserveSlot) return null;
    return (
      <div
        aria-hidden="true"
        className="w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 shrink-0"
      />
    );
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
        'w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36 shrink-0 flex items-center justify-center overflow-hidden p-2.5 backdrop-blur-md transition-transform',
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
        <span className="text-2xl sm:text-4xl font-black tracking-wider text-white/90 uppercase select-none">
          {initials || 'TKD'}
        </span>
      )}
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
  getStageForBout,
  onSelectRing,
  onBack,
  canSwitchRing = false,
  isStandalone = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeWinner, setActiveWinner] = useState<RingWinnerBroadcast | null>(null);
  const [winnerProgressStarted, setWinnerProgressStarted] = useState(false);
  const lastShownConfirmedAtRef = useRef<number>(0);
  const hasMountedRef = useRef<boolean>(false);
  const prevRingRef = useRef<number>(ring.ringNumber);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ringName =
    namingMode === 'number'
      ? ring.ringNumber.toString()
      : String.fromCharCode(64 + ring.ringNumber);

  const triggerWinnerPopup = (banner: RingWinnerBroadcast) => {
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
    }, 5000);
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

  const handleCopyCourtUrl = () => {
    const url = `${window.location.origin}${window.location.pathname}?view=poomsae&ring=${ring.ringNumber}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }).catch(() => {});
    }
  };

  const current =
    ring.currentBout && (!currentEventId || !ring.currentBout.eventId || ring.currentBout.eventId === currentEventId)
      ? ring.currentBout
      : null;

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
    ? activeWinner.winnerSide === 'Completed'
      ? `${privacyMode ? '---' : cleanText(activeWinner.winnerName) || 'PERFORMER'} COMPLETE`
      : `${privacyMode ? '---' : cleanText(activeWinner.winnerName) || (activeWinner.winnerSide === 'Blue' ? 'CHUNG' : 'HONG')} WIN`
    : '';

  const winnerIsRed = activeWinner?.winnerSide === 'Red';
  const hasActiveMatch = Boolean(current || activeWinner);

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
              onClick={handleCopyCourtUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0e1a33] hover:bg-[#16274a] border border-white/15 text-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Copy dedicated URL for this court's monitor"
            >
              {copiedUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedUrl ? 'URL Copied' : 'Court Screen URL'}</span>
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

        <div className="relative z-10 grid grid-cols-12 items-center gap-2">
          {/* Left: RING */}
          <div className="col-span-3 sm:col-span-3 flex items-center gap-3 min-w-0 pl-1 sm:pl-6">
            <span className="text-sm sm:text-xl md:text-2xl font-black uppercase tracking-wider text-white whitespace-nowrap drop-shadow">
              RING {ringName}
            </span>
          </div>

          {/* Center: CATEGORY */}
          <div className="col-span-6 sm:col-span-6 text-center min-w-0 px-2">
            <span className="text-sm sm:text-xl md:text-2xl font-black uppercase tracking-wider text-white truncate block drop-shadow">
              {displayCategory || 'WAITING FOR MATCH'}
            </span>
          </div>

          {/* Right: STAGE */}
          <div className="col-span-3 sm:col-span-3 text-right min-w-0 pr-1 sm:pr-6">
            <span className="text-xs sm:text-lg md:text-xl font-black uppercase tracking-wider text-amber-300 truncate block drop-shadow">
              {displayStage || ''}
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Arena */}
      <div
        className={cn(
          'relative flex-1 grid min-h-0 overflow-hidden',
          isSoloPoomsae ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
        )}
      >
        {/* TOP-CENTER BOUT NUMBER PLAQUE (Moved down from header bar to top-center of arena as requested) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div
            className="px-6 sm:px-10 md:px-12 py-1.5 sm:py-2 bg-[#070f22]/95 border-x border-b border-amber-400/70 shadow-[0_6px_28px_rgba(0,0,0,0.85),0_0_20px_rgba(251,191,36,0.22)] flex items-center justify-center"
            style={{
              clipPath: 'polygon(0% 0%, 100% 0%, 88% 100%, 12% 100%)'
            }}
          >
            <span className="text-base sm:text-xl md:text-2xl font-black uppercase tracking-widest text-amber-400 whitespace-nowrap drop-shadow-[0_2px_8px_rgba(251,191,36,0.45)]">
              {displayBoutNumber !== '---' ? `BOUT ${displayBoutNumber}` : 'BOUT ---'}
            </span>
          </div>
        </div>

        {/* CHUNG / BLUE SIDE */}
        <div
          className="relative flex flex-col items-center justify-center px-4 sm:px-8 pt-14 pb-6 sm:pt-14 sm:pb-8 text-center overflow-hidden"
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
          <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-[92%] gap-3 sm:gap-4 mt-2 sm:mt-4">
            <ClubLogoEmblem
              club={blueClub}
              name={blueName}
              directLogo={blueLogo}
              teamLogos={teamLogos}
              variant="blue"
              reserveSlot={hasActiveMatch}
            />

            {/* Club Name Angled Bar */}
            <div className="w-full max-w-md sm:max-w-lg px-2 shrink-0">
              <div
                className="relative h-10 sm:h-12 md:h-14 flex items-center justify-center px-6 sm:px-10 bg-gradient-to-r from-[#04183b] via-[#093275] to-[#04183b] border border-cyan-300/70 shadow-[0_0_24px_rgba(6,182,212,0.45)]"
                style={{
                  clipPath: 'polygon(5% 0%, 100% 0%, 95% 100%, 0% 100%)'
                }}
              >
                <p className="w-full text-sm sm:text-xl md:text-2xl font-black text-white uppercase tracking-wider truncate drop-shadow">
                  {blueClub || (hasActiveMatch ? '---' : 'CHUNG CLUB')}
                </p>
              </div>
              {/* Center flare divider */}
              <div className="mx-auto mt-2 sm:mt-2.5 h-[2px] w-4/5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_12px_#67e8f9]" />
            </div>

            {/* Player Name Chamfered Frame */}
            <div className="w-full max-w-lg sm:max-w-xl px-1 shrink-0">
              <div
                className="relative h-24 sm:h-28 md:h-36 lg:h-40 flex items-center justify-center px-5 sm:px-10 bg-gradient-to-b from-[#031538]/95 via-[#052359]/90 to-[#020d26]/95 border-2 border-cyan-400/80 shadow-[0_0_32px_rgba(34,211,238,0.4),inset_0_0_22px_rgba(14,165,233,0.28)]"
                style={{
                  clipPath: 'polygon(4% 0%, 96% 0%, 100% 22%, 100% 78%, 96% 100%, 4% 100%, 0% 78%, 0% 22%)'
                }}
              >
                <h2
                  className={cn(
                    'font-black italic text-white uppercase tracking-wide break-words leading-tight line-clamp-2 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]',
                    (blueName || '').length > 22
                      ? 'text-lg sm:text-2xl md:text-3xl lg:text-4xl'
                      : 'text-2xl sm:text-4xl md:text-5xl lg:text-[3.25rem]'
                  )}
                >
                  {blueName || (hasActiveMatch ? '---' : 'READY')}
                </h2>
              </div>
            </div>
          </div>
        </div>

        {/* HONG / RED SIDE */}
        {!isSoloPoomsae && (
          <div
            className="relative flex flex-col items-center justify-center px-4 sm:px-8 pt-14 pb-6 sm:pt-14 sm:pb-8 text-center overflow-hidden"
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
            <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-[92%] gap-3 sm:gap-4 mt-2 sm:mt-4">
              <ClubLogoEmblem
                club={redClub}
                name={redName}
                directLogo={redLogo}
                teamLogos={teamLogos}
                variant="red"
                reserveSlot={hasActiveMatch}
              />

              {/* Club Name Angled Bar */}
              <div className="w-full max-w-md sm:max-w-lg px-2 shrink-0">
                <div
                  className="relative h-10 sm:h-12 md:h-14 flex items-center justify-center px-6 sm:px-10 bg-gradient-to-r from-[#450609] via-[#8c0c14] to-[#450609] border border-red-300/70 shadow-[0_0_24px_rgba(239,68,68,0.45)]"
                  style={{
                    clipPath: 'polygon(5% 0%, 100% 0%, 95% 100%, 0% 100%)'
                  }}
                >
                  <p className="w-full text-sm sm:text-xl md:text-2xl font-black text-white uppercase tracking-wider truncate drop-shadow">
                    {redClub || (hasActiveMatch ? '---' : 'HONG CLUB')}
                  </p>
                </div>
                {/* Center flare divider */}
                <div className="mx-auto mt-2 sm:mt-2.5 h-[2px] w-4/5 bg-gradient-to-r from-transparent via-red-300 to-transparent shadow-[0_0_12px_#fca5a5]" />
              </div>

              {/* Player Name Chamfered Frame */}
              <div className="w-full max-w-lg sm:max-w-xl px-1 shrink-0">
                <div
                  className="relative h-24 sm:h-28 md:h-36 lg:h-40 flex items-center justify-center px-5 sm:px-10 bg-gradient-to-b from-[#3d0307]/95 via-[#68070e]/90 to-[#240103]/95 border-2 border-red-400/80 shadow-[0_0_32px_rgba(248,113,113,0.4),inset_0_0_22px_rgba(239,68,68,0.28)]"
                  style={{
                    clipPath: 'polygon(4% 0%, 96% 0%, 100% 22%, 100% 78%, 96% 100%, 4% 100%, 0% 78%, 0% 22%)'
                  }}
                >
                  <h2
                    className={cn(
                      'font-black italic text-white uppercase tracking-wide break-words leading-tight line-clamp-2 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]',
                      (redName || '').length > 22
                        ? 'text-lg sm:text-2xl md:text-3xl lg:text-4xl'
                        : 'text-2xl sm:text-4xl md:text-5xl lg:text-[3.25rem]'
                    )}
                  >
                    {redName || (hasActiveMatch ? '---' : 'READY')}
                  </h2>
                </div>
              </div>
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

        {/* 5-SECOND WINNER POPUP WINDOW (Matches bright winner color box across lower-center arena, leaving logos visible above) */}
        {activeWinner && (
          <div className="absolute inset-x-4 sm:inset-x-12 md:inset-x-24 lg:inset-x-36 top-[40%] bottom-[13%] z-40 flex items-center justify-center pointer-events-none">
            <div
              className={cn(
                'relative w-full h-full border-2 flex flex-col items-center justify-center px-6 sm:px-12 py-6 text-center overflow-hidden shadow-[0_25px_85px_rgba(0,0,0,0.85)]',
                winnerIsRed
                  ? 'bg-gradient-to-b from-[#ff1a1a] via-[#e60000] to-[#c40000] border-white/85 shadow-[0_0_65px_rgba(255,0,0,0.65)]'
                  : 'bg-gradient-to-b from-[#1e88ff] via-[#0066ff] to-[#0044cc] border-white/85 shadow-[0_0_65px_rgba(0,102,255,0.65)]'
              )}
            >
              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-black text-white uppercase tracking-wide drop-shadow-[0_4px_12px_rgba(0,0,0,0.65)] leading-tight break-words max-w-full">
                {winnerDisplayText}
              </h1>

              {cleanText(activeWinner.winnerClub) && (
                <p className="mt-2 sm:mt-4 text-lg sm:text-3xl md:text-4xl font-black text-white uppercase tracking-wider drop-shadow-[0_3px_10px_rgba(0,0,0,0.6)] break-words max-w-full">
                  {cleanText(activeWinner.winnerClub)}
                </p>
              )}

              {/* 5-Second Countdown Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/25">
                <div
                  className="h-full bg-white transition-all ease-linear"
                  style={{
                    width: winnerProgressStarted ? '0%' : '100%',
                    transitionDuration: '5000ms'
                  }}
                />
              </div>
            </div>
          </div>
        )}
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
