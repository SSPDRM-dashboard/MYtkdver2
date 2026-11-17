import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Minus, Plus, Send, Clock } from 'lucide-react';
import {
  PoomsaeJudgeScore,
  RingPoomsaeScoringTarget,
  RingPoomsaeSelection,
  RingStatus,
} from '../types';
import { cn, formatBoutNumber } from '../lib/utils';
import {
  buildPoomsaeJudgeScoreDocId,
  clampAccuracy,
  clampPresentation,
  round1,
  round2,
} from '../lib/poomsaeScoring';

interface JudgeScoringViewProps {
  ring: RingStatus;
  availableRings: RingStatus[];
  namingMode: 'number' | 'alphabet';
  boutNumberingMode?: 'numeric' | 'alphanumeric';
  currentEventId?: string | null;
  currentEventName?: string;
  currentEventDate?: string;
  judgeNumber: number;
  defaultJudgeCount: 3 | 5 | 7;
  scoringTarget?: RingPoomsaeScoringTarget | null;
  poomsaeSelection?: RingPoomsaeSelection | null;
  existingScores: PoomsaeJudgeScore[];
  onSelectRing: (ringNumber: number) => void;
  onSelectJudge: (judgeNumber: number) => void;
  onSubmitScore: (score: PoomsaeJudgeScore) => Promise<void> | void;
  onReportPresence?: (ringNumber: number, judgeNumber: number, online: boolean, sessionId: string) => void;
  onBack?: () => void;
}

function cleanText(text?: string | null): string {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (!trimmed || trimmed === '---' || trimmed.toUpperCase() === 'TBD') return '';
  return trimmed;
}

export const JudgeScoringView: React.FC<JudgeScoringViewProps> = ({
  ring,
  availableRings,
  namingMode,
  boutNumberingMode = 'alphanumeric',
  currentEventId,
  currentEventName = '',
  currentEventDate = '',
  judgeNumber,
  defaultJudgeCount,
  scoringTarget,
  poomsaeSelection,
  existingScores,
  onSelectRing,
  onSelectJudge,
  onSubmitScore,
  onReportPresence,
  onBack,
}) => {
  const effectiveJudgeCount: 3 | 5 | 7 = scoringTarget?.judgeCount || defaultJudgeCount || 5;
  const ringName =
    namingMode === 'number' ? String(ring.ringNumber) : String.fromCharCode(64 + ring.ringNumber);

  const current = ring.currentBout || null;

  const currentBoutKey = current ? `${current.eventId || currentEventId || 'default'}_${current.bout}` : 'idle';
  const targetMatchesBout =
    !scoringTarget?.boutKey ||
    scoringTarget.boutKey === 'idle' ||
    scoringTarget.boutKey === currentBoutKey ||
    Boolean(current?.bout && scoringTarget.boutKey.endsWith(`_${current.bout}`));

  const controllerPoomsae: 1 | 2 =
    targetMatchesBout && scoringTarget?.activePoomsae ? scoringTarget.activePoomsae : 1;

  const [manualPoomsae, setManualPoomsae] = useState<1 | 2 | null>(null);

  useEffect(() => {
    setManualPoomsae(null);
  }, [currentBoutKey]);

  const activePoomsae: 1 | 2 = manualPoomsae !== null ? manualPoomsae : controllerPoomsae;

  const blueName = current?.privacy_mode ? 'Athlete (PDPA)' : cleanText(current?.blue_name);
  const redName = current?.privacy_mode ? 'Athlete (PDPA)' : cleanText(current?.red_name);
  const blueClub = cleanText(current?.blue_club);
  const redClub = cleanText(current?.red_club);
  const hasRedCompetitor = Boolean(redName && redName.toUpperCase() !== 'BYE');

  const [livePoomsaeOverride, setLivePoomsaeOverride] = useState<RingPoomsaeSelection | null>(null);

  useEffect(() => {
    setLivePoomsaeOverride(poomsaeSelection ?? null);
  }, [poomsaeSelection, ring.ringNumber]);

  useEffect(() => {
    let poomsaeChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        poomsaeChannel = new BroadcastChannel('tkd_ring_poomsae_selection');
        poomsaeChannel.onmessage = (event) => {
          const payload = event.data as Record<string, RingPoomsaeSelection> | undefined;
          const nextForRing = payload?.[String(ring.ringNumber)];
          if (nextForRing) {
            setLivePoomsaeOverride(nextForRing);
          }
        };
      }
    } catch {}

    const handleSelectionStorage = (e: StorageEvent) => {
      if (e.key === 'tkd_ring_poomsae_selection' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Record<string, RingPoomsaeSelection>;
          const nextForRing = parsed?.[String(ring.ringNumber)];
          if (nextForRing) setLivePoomsaeOverride(nextForRing);
        } catch {}
      }
    };
    window.addEventListener('storage', handleSelectionStorage);

    return () => {
      if (poomsaeChannel) poomsaeChannel.close();
      window.removeEventListener('storage', handleSelectionStorage);
    };
  }, [ring.ringNumber]);

  const effectiveSelection = livePoomsaeOverride ?? poomsaeSelection ?? null;
  const isSelectionValid =
    effectiveSelection &&
    (!effectiveSelection.boutKey ||
      effectiveSelection.boutKey === 'idle' ||
      effectiveSelection.boutKey === currentBoutKey ||
      Boolean(current?.bout && effectiveSelection.boutKey.endsWith(`_${current.bout}`)));
  const poomsae1Name = isSelectionValid ? cleanText(effectiveSelection?.poomsae1) : '';
  const poomsae2Name = isSelectionValid ? cleanText(effectiveSelection?.poomsae2) : '';
  const poomsaeFormName = activePoomsae === 1 ? poomsae1Name : poomsae2Name;

  const activeBoutNumberFormatted = current?.bout
    ? formatBoutNumber(ring.ringNumber, current.bout, boutNumberingMode === 'numeric' ? 'numeric' : 'alphanumeric')
    : '---';

  const clearedAtThreshold =
    targetMatchesBout && scoringTarget?.clearedAt ? scoringTarget.clearedAt : 0;

  // Existing submissions for blue and red
  const existingBlue = useMemo(() => {
    if (!current) return null;
    const expectedId = buildPoomsaeJudgeScoreDocId({
      ringNumber: ring.ringNumber,
      eventId: current.eventId || currentEventId || 'default',
      boutNumber: current.bout,
      side: 'blue',
      poomsaeNo: activePoomsae,
      judgeNumber,
    });
    const found = existingScores.find((s) => s.id === expectedId);
    if (!found) return null;
    if (clearedAtThreshold > 0 && found.submittedAt < clearedAtThreshold) return null;
    return found;
  }, [current, ring.ringNumber, currentEventId, activePoomsae, judgeNumber, existingScores, clearedAtThreshold]);

  const existingRed = useMemo(() => {
    if (!current || !hasRedCompetitor) return null;
    const expectedId = buildPoomsaeJudgeScoreDocId({
      ringNumber: ring.ringNumber,
      eventId: current.eventId || currentEventId || 'default',
      boutNumber: current.bout,
      side: 'red',
      poomsaeNo: activePoomsae,
      judgeNumber,
    });
    const found = existingScores.find((s) => s.id === expectedId);
    if (!found) return null;
    if (clearedAtThreshold > 0 && found.submittedAt < clearedAtThreshold) return null;
    return found;
  }, [current, hasRedCompetitor, ring.ringNumber, currentEventId, activePoomsae, judgeNumber, existingScores, clearedAtThreshold]);

  // Blue state (WT 4-row layout: Accuracy 4.0 + 3 Presentation criteria 2.0 each)
  const [blueAcc, setBlueAcc] = useState<number>(4.0);
  const [blueSp, setBlueSp] = useState<number>(2.0); // Speed & Power
  const [blueRt, setBlueRt] = useState<number>(2.0); // Rhythm / Tempo / Softness / Power
  const [blueEe, setBlueEe] = useState<number>(2.0); // Expression of Energy
  const [isSubmittingBlue, setIsSubmittingBlue] = useState(false);
  const [blueSubmitSuccessAt, setBlueSubmitSuccessAt] = useState<number | null>(null);

  // Red state
  const [redAcc, setRedAcc] = useState<number>(4.0);
  const [redSp, setRedSp] = useState<number>(2.0);
  const [redRt, setRedRt] = useState<number>(2.0);
  const [redEe, setRedEe] = useState<number>(2.0);
  const [isSubmittingRed, setIsSubmittingRed] = useState(false);
  const [redSubmitSuccessAt, setRedSubmitSuccessAt] = useState<number | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const contextKey = `${currentBoutKey}_${activePoomsae}_${judgeNumber}_${clearedAtThreshold}`;

  const blueSubmitSuccessAtRef = React.useRef<number | null>(null);
  const redSubmitSuccessAtRef = React.useRef<number | null>(null);
  const prevBlueSubmittedRef = React.useRef<number | undefined>(undefined);
  const prevRedSubmittedRef = React.useRef<number | undefined>(undefined);

  // Full reset ONLY when bout / P1-P2 / judge / clear threshold changes
  useEffect(() => {
    if (existingBlue) {
      setBlueAcc(clampAccuracy(existingBlue.accuracy));
      const pres = clampPresentation(existingBlue.presentation);
      const split = round1(pres / 3);
      setBlueSp(split);
      setBlueRt(split);
      setBlueEe(clampPresentation(pres - split - split));
      setBlueSubmitSuccessAt(existingBlue.submittedAt);
      blueSubmitSuccessAtRef.current = existingBlue.submittedAt;
      prevBlueSubmittedRef.current = existingBlue.submittedAt;
    } else {
      setBlueAcc(4.0);
      setBlueSp(2.0);
      setBlueRt(2.0);
      setBlueEe(2.0);
      setBlueSubmitSuccessAt(null);
      blueSubmitSuccessAtRef.current = null;
      prevBlueSubmittedRef.current = undefined;
    }

    if (existingRed) {
      setRedAcc(clampAccuracy(existingRed.accuracy));
      const pres = clampPresentation(existingRed.presentation);
      const split = round1(pres / 3);
      setRedSp(split);
      setRedRt(split);
      setRedEe(clampPresentation(pres - split - split));
      setRedSubmitSuccessAt(existingRed.submittedAt);
      redSubmitSuccessAtRef.current = existingRed.submittedAt;
      prevRedSubmittedRef.current = existingRed.submittedAt;
    } else {
      setRedAcc(4.0);
      setRedSp(2.0);
      setRedRt(2.0);
      setRedEe(2.0);
      setRedSubmitSuccessAt(null);
      redSubmitSuccessAtRef.current = null;
      prevRedSubmittedRef.current = undefined;
    }
    setSubmitError(null);
  }, [contextKey]);

  // Independent sync for Blue submission updates (NEVER touches Red state)
  useEffect(() => {
    const nextSub = existingBlue?.submittedAt;
    const prevSub = prevBlueSubmittedRef.current;
    prevBlueSubmittedRef.current = nextSub;

    if (nextSub === prevSub) return;

    if (existingBlue) {
      if (existingBlue.submittedAt !== blueSubmitSuccessAtRef.current) {
        setBlueAcc(clampAccuracy(existingBlue.accuracy));
        const pres = clampPresentation(existingBlue.presentation);
        const split = round1(pres / 3);
        setBlueSp(split);
        setBlueRt(split);
        setBlueEe(clampPresentation(pres - split - split));
      }
      setBlueSubmitSuccessAt(existingBlue.submittedAt);
      blueSubmitSuccessAtRef.current = existingBlue.submittedAt;
    } else if (prevSub !== undefined) {
      // Explicitly cleared remotely -> reset Blue only
      setBlueAcc(4.0);
      setBlueSp(2.0);
      setBlueRt(2.0);
      setBlueEe(2.0);
      setBlueSubmitSuccessAt(null);
      blueSubmitSuccessAtRef.current = null;
    }
  }, [existingBlue?.submittedAt]);

  // Independent sync for Red submission updates (NEVER touches Blue state)
  useEffect(() => {
    const nextSub = existingRed?.submittedAt;
    const prevSub = prevRedSubmittedRef.current;
    prevRedSubmittedRef.current = nextSub;

    if (nextSub === prevSub) return;

    if (existingRed) {
      if (existingRed.submittedAt !== redSubmitSuccessAtRef.current) {
        setRedAcc(clampAccuracy(existingRed.accuracy));
        const pres = clampPresentation(existingRed.presentation);
        const split = round1(pres / 3);
        setRedSp(split);
        setRedRt(split);
        setRedEe(clampPresentation(pres - split - split));
      }
      setRedSubmitSuccessAt(existingRed.submittedAt);
      redSubmitSuccessAtRef.current = existingRed.submittedAt;
    } else if (prevSub !== undefined) {
      // Explicitly cleared remotely -> reset Red only
      setRedAcc(4.0);
      setRedSp(2.0);
      setRedRt(2.0);
      setRedEe(2.0);
      setRedSubmitSuccessAt(null);
      redSubmitSuccessAtRef.current = null;
    }
  }, [existingRed?.submittedAt]);

  const tabSessionIdRef = React.useRef<string>('');
  if (!tabSessionIdRef.current) {
    try {
      const existingTabId = sessionStorage.getItem('tkd_judge_tab_session_id');
      if (existingTabId) {
        tabSessionIdRef.current = existingTabId;
      } else {
        const nextTabId = `js_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        sessionStorage.setItem('tkd_judge_tab_session_id', nextTabId);
        tabSessionIdRef.current = nextTabId;
      }
    } catch {
      tabSessionIdRef.current = `js_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  useEffect(() => {
    if (!onReportPresence) return;
    const rNum = ring.ringNumber;
    const jNum = judgeNumber;
    const sid = tabSessionIdRef.current;

    onReportPresence(rNum, jNum, true, sid);
    const interval = setInterval(() => {
      onReportPresence(rNum, jNum, true, sid);
    }, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        onReportPresence(rNum, jNum, true, sid);
      }
    };
    const handleLeave = () => {
      onReportPresence(rNum, jNum, false, sid);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleLeave);
    window.addEventListener('beforeunload', handleLeave);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleLeave);
      window.removeEventListener('beforeunload', handleLeave);
      onReportPresence(rNum, jNum, false, sid);
    };
  }, [ring.ringNumber, judgeNumber, onReportPresence]);

  const isJudgeStandby = judgeNumber > effectiveJudgeCount;

  const bluePresTotal = clampPresentation(round1(blueSp + blueRt + blueEe));
  const redPresTotal = clampPresentation(round1(redSp + redRt + redEe));

  const handleAdjustCriterion = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    delta: number,
    maxVal: number = 2.0
  ) => {
    setter((prev) => Math.max(0, Math.min(maxVal, round1(prev + delta))));
  };

  const handleManualSubmitSide = async (side: 'blue' | 'red') => {
    if (!current || isJudgeStandby) return;
    const isBlue = side === 'blue';
    if (isBlue) setIsSubmittingBlue(true);
    else setIsSubmittingRed(true);
    setSubmitError(null);

    try {
      const eventIdStr = String(current.eventId || currentEventId || 'default');
      const boutStr = String(current.bout);
      const docId = buildPoomsaeJudgeScoreDocId({
        ringNumber: ring.ringNumber,
        eventId: eventIdStr,
        boutNumber: boutStr,
        side,
        poomsaeNo: activePoomsae,
        judgeNumber,
      });

      const accClean = clampAccuracy(isBlue ? blueAcc : redAcc);
      const presClean = isBlue ? bluePresTotal : redPresTotal;
      const nowMs = Date.now();

      if (isBlue) blueSubmitSuccessAtRef.current = nowMs;
      else redSubmitSuccessAtRef.current = nowMs;

      const payload: PoomsaeJudgeScore = {
        id: docId,
        ringNumber: ring.ringNumber,
        eventId: eventIdStr,
        eventName: currentEventName,
        eventDate: currentEventDate,
        boutNumber: boutStr,
        boutKey: `${eventIdStr}_${boutStr}`,
        side,
        poomsaeNo: activePoomsae,
        judgeNumber,
        accuracy: accClean,
        presentation: presClean,
        total: round2(accClean + presClean),
        submittedAt: nowMs,
      };

      await onSubmitScore(payload);
      if (isBlue) setBlueSubmitSuccessAt(nowMs);
      else setRedSubmitSuccessAt(nowMs);
    } catch (err: any) {
      setSubmitError(err?.message || `Failed to submit ${side} score. Please retry.`);
    } finally {
      if (isBlue) setIsSubmittingBlue(false);
      else setIsSubmittingRed(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-28"
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(4, 58, 148, 0.55) 0%, rgba(8, 25, 62, 0.85) 48%, rgba(62, 8, 16, 0.85) 52%, rgba(138, 14, 24, 0.55) 100%)'
      }}
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-5 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer shrink-0"
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 min-h-[44px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ring</span>
              <select
                value={ring.ringNumber}
                onChange={(e) => onSelectRing(Number(e.target.value))}
                className="bg-transparent text-white font-black text-sm outline-none cursor-pointer"
                aria-label="Select Ring"
              >
                {(availableRings.length > 0 ? availableRings : [ring]).map((r) => {
                  const lbl =
                    namingMode === 'number'
                      ? String(r.ringNumber)
                      : String.fromCharCode(64 + r.ringNumber);
                  return (
                    <option key={r.ringNumber} value={r.ringNumber} className="bg-slate-900 text-white">
                      {lbl}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-red-600/20 border border-red-500/40 rounded-xl px-2.5 py-1.5 min-h-[44px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-300">Judge</span>
              <select
                value={judgeNumber}
                onChange={(e) => onSelectJudge(Number(e.target.value))}
                className="bg-transparent text-white font-black text-sm outline-none cursor-pointer"
                aria-label="Select Judge Number"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <option key={j} value={j} className="bg-slate-900 text-white">
                    J{j}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Poomsae Switcher P1 / P2 */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setManualPoomsae(1)}
                className={cn(
                  'min-h-[38px] px-3 py-1 rounded-lg text-xs font-black uppercase transition-colors cursor-pointer',
                  activePoomsae === 1 ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                )}
              >
                P1
              </button>
              <button
                type="button"
                onClick={() => setManualPoomsae(2)}
                className={cn(
                  'min-h-[38px] px-3 py-1 rounded-lg text-xs font-black uppercase transition-colors cursor-pointer',
                  activePoomsae === 2 ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                )}
              >
                P2
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
              <span className="font-mono font-bold text-amber-300 text-sm tabular-nums">
                {activeBoutNumberFormatted}
              </span>
              <span>·</span>
              <span>{effectiveJudgeCount} Judges</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 pt-4 space-y-4">
        {/* WT Official Display Banner (Matching Photo Layout) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center space-y-1 shadow-md">
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-slate-300 uppercase tracking-widest">
            <span>Bout {activeBoutNumberFormatted}</span>
            <span>·</span>
            <span className="text-amber-300">
              {poomsaeFormName ? poomsaeFormName : `Poomsae ${activePoomsae}`}
            </span>
            <span>·</span>
            <span>{cleanText(current?.category) || 'Match Category'}</span>
          </div>
        </div>

        {isJudgeStandby && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 text-center space-y-1">
            <p className="text-sm font-bold text-amber-300">Judge {judgeNumber} on Standby</p>
            <p className="text-xs text-amber-100/80">
              Ring {ringName} is currently configured for {effectiveJudgeCount} Judges.
            </p>
          </div>
        )}

        {/* SIDE-BY-SIDE DUAL BLUE & RED WT 4-ROW SCORING PANELS */}
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          {/* ================= BLUE (CHUNG) SIDE ================= */}
          <div className="rounded-3xl bg-gradient-to-b from-[#0b459e] via-[#072d6e] to-[#041d4a] border-2 border-cyan-400/75 p-4 sm:p-6 space-y-5 shadow-[0_10px_34px_rgba(2,132,199,0.28)] flex flex-col justify-between">
            <div className="space-y-4">
              {/* Athlete Header */}
              <div className="bg-[#0e52ba]/70 border border-cyan-300/45 rounded-2xl p-4 space-y-1 shadow-inner">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-cyan-200">
                  <span>Chung (Blue)</span>
                  <span className="font-mono font-bold text-amber-300">Judge {judgeNumber}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  {blueName || 'Waiting for Blue Athlete'}
                </h2>
                <div className="flex flex-wrap items-end justify-between gap-2 pt-0.5">
                  <p className="text-xs sm:text-sm font-semibold text-blue-100/90 uppercase tracking-wide min-w-0">
                    {blueClub || '\u00A0'}
                  </p>
                  <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg bg-[#041b45]/80 border border-cyan-300/40 shrink-0 max-w-full">
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors',
                        activePoomsae === 1 ? 'bg-amber-400/15' : 'opacity-70'
                      )}
                    >
                      <span
                        className={cn(
                          'text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0',
                          activePoomsae === 1 ? 'text-amber-300' : 'text-cyan-200/80'
                        )}
                      >
                        Poomsae 1
                      </span>
                      {poomsae1Name && (
                        <>
                          <span className="text-cyan-300/50">:</span>
                          <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-white truncate max-w-[165px] sm:max-w-[230px]">
                            {poomsae1Name}
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors',
                        activePoomsae === 2 ? 'bg-amber-400/15' : 'opacity-70'
                      )}
                    >
                      <span
                        className={cn(
                          'text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0',
                          activePoomsae === 2 ? 'text-amber-300' : 'text-cyan-200/80'
                        )}
                      >
                        Poomsae 2
                      </span>
                      {poomsae2Name && (
                        <>
                          <span className="text-cyan-300/50">:</span>
                          <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-white truncate max-w-[165px] sm:max-w-[230px]">
                            {poomsae2Name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* WT 4-Row Scoring Grid */}
              <div className="space-y-3">
                {/* 1. Accuracy (4.0) */}
                <div className="rounded-2xl bg-[#041b45]/85 border border-cyan-400/30 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Accuracy</h3>
                      <p className="text-[10px] text-blue-200/75">Max 4.0 • Deduct errors by -0.1 / -0.3</p>
                    </div>
                    <span className="font-mono text-2xl font-black text-cyan-300 tabular-nums">
                      {blueAcc.toFixed(1)} <span className="text-xs font-bold text-blue-200/70">/ 4.0</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 grid-rows-2 gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setBlueAcc((prev) => clampAccuracy(prev - 0.1))}
                      className="col-start-1 row-start-1 row-span-2 min-h-[90px] rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 font-black text-sm active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <span>-0.1 Minor</span>
                    </button>
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setBlueAcc((prev) => clampAccuracy(prev - 0.3))}
                      className="col-start-2 row-start-1 min-h-[42px] rounded-xl bg-purple-500/25 hover:bg-purple-500/35 border border-purple-400/50 text-purple-200 font-black text-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <span>-0.3 Major</span>
                    </button>
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setBlueAcc((prev) => clampAccuracy(prev + 0.1))}
                      className="col-start-2 row-start-2 min-h-[42px] rounded-xl bg-[#0a3175] hover:bg-[#0e429c] border border-blue-300/30 text-slate-100 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <Plus size={12} />
                      <span>+0.1 Undo</span>
                    </button>
                  </div>
                </div>

                {/* 2. Speed & Power (2.0) */}
                <div className="rounded-2xl bg-[#041b45]/85 border border-cyan-400/30 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Speed &amp; Power</h3>
                    <p className="text-[10px] text-blue-200/75">Max 2.0</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueSp, -0.1)}
                      className="w-10 h-10 rounded-xl bg-[#0a3175] hover:bg-[#0e429c] border border-blue-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-12 text-center font-mono text-xl font-black text-emerald-300 tabular-nums">
                      {blueSp.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueSp, 0.1)}
                      className="w-10 h-10 rounded-xl bg-[#0a3175] hover:bg-[#0e429c] border border-blue-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* 3. Rhythm / Tempo / Softness / Power (2.0) */}
                <div className="rounded-2xl bg-[#041b45]/85 border border-cyan-400/30 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Rhythm / Tempo / Softness</h3>
                    <p className="text-[10px] text-blue-200/75">Max 2.0</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueRt, -0.1)}
                      className="w-10 h-10 rounded-xl bg-[#0a3175] hover:bg-[#0e429c] border border-blue-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-12 text-center font-mono text-xl font-black text-emerald-300 tabular-nums">
                      {blueRt.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueRt, 0.1)}
                      className="w-10 h-10 rounded-xl bg-[#0a3175] hover:bg-[#0e429c] border border-blue-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* 4. Expression of Energy (2.0) */}
                <div className="rounded-2xl bg-[#041b45]/85 border border-cyan-400/30 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Expression of Energy</h3>
                    <p className="text-[10px] text-blue-200/75">Max 2.0</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueEe, -0.1)}
                      className="w-10 h-10 rounded-xl bg-[#0a3175] hover:bg-[#0e429c] border border-blue-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-12 text-center font-mono text-xl font-black text-emerald-300 tabular-nums">
                      {blueEe.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueEe, 0.1)}
                      className="w-10 h-10 rounded-xl bg-[#0a3175] hover:bg-[#0e429c] border border-blue-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Blue Submit Button */}
            <div className="pt-4 border-t border-cyan-400/35 flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200/80">
                  Accuracy + Presentation = Blue Total / 10.0
                </div>
                <div className="flex flex-wrap items-baseline gap-1.5 font-mono font-black tabular-nums">
                  <span className="text-base sm:text-lg text-cyan-300" title="Accuracy">
                    {blueAcc.toFixed(1)}
                  </span>
                  <span className="text-xs sm:text-sm text-blue-200/70">+</span>
                  <span className="text-base sm:text-lg text-emerald-300" title="Presentation">
                    {bluePresTotal.toFixed(1)}
                  </span>
                  <span className="text-xs sm:text-sm text-blue-200/70">=</span>
                  <span className="text-2xl sm:text-3xl text-amber-300">
                    {round2(blueAcc + bluePresTotal).toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={!current || isJudgeStandby || isSubmittingBlue}
                onClick={() => handleManualSubmitSide('blue')}
                className={cn(
                  'min-h-[48px] px-6 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 shadow-lg',
                  blueSubmitSuccessAt && (!existingBlue || blueSubmitSuccessAt >= existingBlue.submittedAt)
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                )}
              >
                {blueSubmitSuccessAt ? (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Submitted</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>{isSubmittingBlue ? 'Sending...' : 'Submit Blue'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ================= RED (HONG) SIDE ================= */}
          <div className="rounded-3xl bg-gradient-to-b from-[#99121a] via-[#6b0b12] to-[#47050a] border-2 border-red-400/75 p-4 sm:p-6 space-y-5 shadow-[0_10px_34px_rgba(220,38,38,0.28)] flex flex-col justify-between">
            {hasRedCompetitor ? (
              <div className="space-y-4">
                {/* Athlete Header */}
                <div className="bg-[#b51821]/70 border border-red-300/45 rounded-2xl p-4 space-y-1 shadow-inner">
                  <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-red-200">
                    <span>Hong (Red)</span>
                    <span className="font-mono font-bold text-amber-300">Judge {judgeNumber}</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                    {redName || 'Waiting for Red Athlete'}
                  </h2>
                  <div className="flex flex-wrap items-end justify-between gap-2 pt-0.5">
                    <p className="text-xs sm:text-sm font-semibold text-red-100/90 uppercase tracking-wide min-w-0">
                      {redClub || '\u00A0'}
                    </p>
                    <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg bg-[#3d060b]/80 border border-red-300/40 shrink-0 max-w-full">
                      <div
                        className={cn(
                          'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors',
                          activePoomsae === 1 ? 'bg-amber-400/15' : 'opacity-70'
                        )}
                      >
                        <span
                          className={cn(
                            'text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0',
                            activePoomsae === 1 ? 'text-amber-300' : 'text-red-200/80'
                          )}
                        >
                          Poomsae 1
                        </span>
                        {poomsae1Name && (
                          <>
                            <span className="text-red-300/50">:</span>
                            <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-white truncate max-w-[165px] sm:max-w-[230px]">
                              {poomsae1Name}
                            </span>
                          </>
                        )}
                      </div>
                      <div
                        className={cn(
                          'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors',
                          activePoomsae === 2 ? 'bg-amber-400/15' : 'opacity-70'
                        )}
                      >
                        <span
                          className={cn(
                            'text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0',
                            activePoomsae === 2 ? 'text-amber-300' : 'text-red-200/80'
                          )}
                        >
                          Poomsae 2
                        </span>
                        {poomsae2Name && (
                          <>
                            <span className="text-red-300/50">:</span>
                            <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-white truncate max-w-[165px] sm:max-w-[230px]">
                              {poomsae2Name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* WT 4-Row Scoring Grid */}
                <div className="space-y-3">
                  {/* 1. Accuracy (4.0) */}
                  <div className="rounded-2xl bg-[#3d060b]/85 border border-red-400/30 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Accuracy</h3>
                        <p className="text-[10px] text-red-200/75">Max 4.0 • Deduct errors by -0.1 / -0.3</p>
                      </div>
                      <span className="font-mono text-2xl font-black text-red-200 tabular-nums">
                        {redAcc.toFixed(1)} <span className="text-xs font-bold text-red-200/70">/ 4.0</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 grid-rows-2 gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => setRedAcc((prev) => clampAccuracy(prev - 0.3))}
                        className="col-start-1 row-start-1 min-h-[42px] rounded-xl bg-purple-500/25 hover:bg-purple-500/35 border border-purple-400/50 text-purple-200 font-black text-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <span>-0.3 Major</span>
                      </button>
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => setRedAcc((prev) => clampAccuracy(prev + 0.1))}
                        className="col-start-1 row-start-2 min-h-[42px] rounded-xl bg-[#660f16] hover:bg-[#85141e] border border-red-300/30 text-slate-100 font-bold text-xs cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Plus size={12} />
                        <span>+0.1 Undo</span>
                      </button>
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => setRedAcc((prev) => clampAccuracy(prev - 0.1))}
                        className="col-start-2 row-start-1 row-span-2 min-h-[90px] rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 font-black text-sm active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <span>-0.1 Minor</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Speed & Power (2.0) */}
                  <div className="rounded-2xl bg-[#3d060b]/85 border border-red-400/30 p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Speed &amp; Power</h3>
                      <p className="text-[10px] text-red-200/75">Max 2.0</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedSp, -0.1)}
                        className="w-10 h-10 rounded-xl bg-[#660f16] hover:bg-[#85141e] border border-red-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-12 text-center font-mono text-xl font-black text-emerald-300 tabular-nums">
                        {redSp.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedSp, 0.1)}
                        className="w-10 h-10 rounded-xl bg-[#660f16] hover:bg-[#85141e] border border-red-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* 3. Rhythm / Tempo / Softness / Power (2.0) */}
                  <div className="rounded-2xl bg-[#3d060b]/85 border border-red-400/30 p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Rhythm / Tempo / Softness</h3>
                      <p className="text-[10px] text-red-200/75">Max 2.0</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedRt, -0.1)}
                        className="w-10 h-10 rounded-xl bg-[#660f16] hover:bg-[#85141e] border border-red-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-12 text-center font-mono text-xl font-black text-emerald-300 tabular-nums">
                        {redRt.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedRt, 0.1)}
                        className="w-10 h-10 rounded-xl bg-[#660f16] hover:bg-[#85141e] border border-red-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* 4. Expression of Energy (2.0) */}
                  <div className="rounded-2xl bg-[#3d060b]/85 border border-red-400/30 p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Expression of Energy</h3>
                      <p className="text-[10px] text-red-200/75">Max 2.0</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedEe, -0.1)}
                        className="w-10 h-10 rounded-xl bg-[#660f16] hover:bg-[#85141e] border border-red-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="w-12 text-center font-mono text-xl font-black text-emerald-300 tabular-nums">
                        {redEe.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedEe, 0.1)}
                        className="w-10 h-10 rounded-xl bg-[#660f16] hover:bg-[#85141e] border border-red-300/30 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 my-auto">
                <p className="text-lg font-bold text-red-100/80">Single Competitor (BYE)</p>
                <p className="text-xs text-red-200/60">No red competitor assigned for this bout.</p>
              </div>
            )}

            {/* Red Submit Button */}
            {hasRedCompetitor && (
              <div className="pt-4 border-t border-red-400/35 flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-red-200/80">
                    Accuracy + Presentation = Red Total / 10.0
                  </div>
                  <div className="flex flex-wrap items-baseline gap-1.5 font-mono font-black tabular-nums">
                    <span className="text-base sm:text-lg text-red-200" title="Accuracy">
                      {redAcc.toFixed(1)}
                    </span>
                    <span className="text-xs sm:text-sm text-red-200/70">+</span>
                    <span className="text-base sm:text-lg text-emerald-300" title="Presentation">
                      {redPresTotal.toFixed(1)}
                    </span>
                    <span className="text-xs sm:text-sm text-red-200/70">=</span>
                    <span className="text-2xl sm:text-3xl text-amber-300">
                      {round2(redAcc + redPresTotal).toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!current || isJudgeStandby || isSubmittingRed}
                  onClick={() => handleManualSubmitSide('red')}
                  className={cn(
                    'min-h-[48px] px-6 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 shadow-lg',
                    redSubmitSuccessAt && (!existingRed || redSubmitSuccessAt >= existingRed.submittedAt)
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  )}
                >
                  {redSubmitSuccessAt ? (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Submitted</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>{isSubmittingRed ? 'Sending...' : 'Submit Red'}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {submitError && (
          <div className="rounded-xl bg-red-950/80 border border-red-500/50 px-4 py-3 text-xs font-semibold text-red-200 text-center">
            {submitError}
          </div>
        )}
      </main>
    </div>
  );
};
