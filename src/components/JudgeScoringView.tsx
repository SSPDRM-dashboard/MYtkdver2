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

  // Presentation score grid options (Photo 2: 16 options in 2 rows of 8)
  const PRESENTATION_ROW_1 = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
  const PRESENTATION_ROW_2 = [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];

  const extractPresSplit = (score?: PoomsaeJudgeScore | null) => {
    if (!score) return { sp: 2.0, rt: 2.0, ee: 2.0 };
    if (
      typeof score.speedPower === 'number' &&
      typeof score.rhythmTempo === 'number' &&
      typeof score.expressionEnergy === 'number'
    ) {
      return {
        sp: round1(score.speedPower),
        rt: round1(score.rhythmTempo),
        ee: round1(score.expressionEnergy),
      };
    }
    const pres = clampPresentation(score.presentation);
    const split = Math.min(2.0, Math.max(0.5, round1(pres / 3)));
    return {
      sp: split,
      rt: split,
      ee: clampPresentation(round1(pres - split - split)),
    };
  };

  // Blue state (Step 1: Accuracy -> Step 2: Presentation)
  const [blueStep, setBlueStep] = useState<'accuracy' | 'presentation'>('accuracy');
  const [blueAcc, setBlueAcc] = useState<number>(4.0);
  const [blueSp, setBlueSp] = useState<number>(2.0); // Speed & Power
  const [blueRt, setBlueRt] = useState<number>(2.0); // Rhythm / Tempo / Softness
  const [blueEe, setBlueEe] = useState<number>(2.0); // Expression of Energy
  const [isSubmittingBlue, setIsSubmittingBlue] = useState(false);
  const [blueSubmitSuccessAt, setBlueSubmitSuccessAt] = useState<number | null>(null);

  // Red state (Step 1: Accuracy -> Step 2: Presentation)
  const [redStep, setRedStep] = useState<'accuracy' | 'presentation'>('accuracy');
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
      const { sp, rt, ee } = extractPresSplit(existingBlue);
      setBlueSp(sp);
      setBlueRt(rt);
      setBlueEe(ee);
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
      const { sp, rt, ee } = extractPresSplit(existingRed);
      setRedSp(sp);
      setRedRt(rt);
      setRedEe(ee);
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
    setBlueStep('accuracy');
    setRedStep('accuracy');
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
        const { sp, rt, ee } = extractPresSplit(existingBlue);
        setBlueSp(sp);
        setBlueRt(rt);
        setBlueEe(ee);
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
      setBlueStep('accuracy');
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
        const { sp, rt, ee } = extractPresSplit(existingRed);
        setRedSp(sp);
        setRedRt(rt);
        setRedEe(ee);
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
      setRedStep('accuracy');
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
  const isBlueLocked = Boolean(
    existingBlue || (blueSubmitSuccessAt && (!existingBlue || blueSubmitSuccessAt >= existingBlue.submittedAt))
  );
  const isRedLocked = Boolean(
    existingRed || (redSubmitSuccessAt && (!existingRed || redSubmitSuccessAt >= existingRed.submittedAt))
  );

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
    if ((isBlue && isBlueLocked) || (!isBlue && isRedLocked)) return;
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
        speedPower: isBlue ? blueSp : redSp,
        rhythmTempo: isBlue ? blueRt : redRt,
        expressionEnergy: isBlue ? blueEe : redEe,
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

      <main className="flex-1 w-full max-w-7xl mx-auto px-1.5 sm:px-4 md:px-6 pt-2 sm:pt-4 space-y-2.5 sm:space-y-4">
        {/* WT Official Display Banner (Matching Photo Layout) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 text-center space-y-1 shadow-md">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[10px] sm:text-xs font-bold text-slate-300 uppercase tracking-widest">
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
          <div className="rounded-xl sm:rounded-2xl border border-amber-500/40 bg-amber-950/40 p-2.5 sm:p-4 text-center space-y-1">
            <p className="text-xs sm:text-sm font-bold text-amber-300">Judge {judgeNumber} on Standby</p>
            <p className="text-[10px] sm:text-xs text-amber-100/80">
              Ring {ringName} is currently configured for {effectiveJudgeCount} Judges.
            </p>
          </div>
        )}

        {/* SIDE-BY-SIDE DUAL BLUE & RED WT SCORING PANELS (ALWAYS SIDE BY SIDE ON HP & IPAD) */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-4 md:gap-6 items-stretch">
          {/* ================= BLUE (CHUNG) SIDE ================= */}
          <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#003882] via-[#002456] to-[#001333] border-2 border-[#00a2e8] p-2 sm:p-4 md:p-5 space-y-2 sm:space-y-4 shadow-[0_0_24px_rgba(0,162,232,0.35)] flex flex-col justify-between min-w-0">
            <div className="space-y-2 sm:space-y-4 min-w-0">
              {/* Athlete Header */}
              <div className="bg-[#004299]/70 border border-[#00a2e8]/40 rounded-xl sm:rounded-2xl p-2 sm:p-3.5 space-y-0.5 sm:space-y-1 shadow-inner min-w-0">
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-black uppercase tracking-wider">
                  <span className="text-[#40c4ff]">Chung (Blue)</span>
                  <span className="font-mono font-bold text-yellow-400">J{judgeNumber}</span>
                </div>
                <h2 className="text-xs sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight break-words leading-tight line-clamp-2">
                  {blueName || 'Waiting for Blue Athlete'}
                </h2>
                <div className="flex flex-wrap items-end justify-between gap-1 pt-0.5 min-w-0">
                  <p className="text-[9px] sm:text-xs md:text-sm font-bold text-[#00a2e8] uppercase tracking-wide truncate max-w-full">
                    {blueClub || '\u00A0'}
                  </p>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#001333]/90 border border-[#00a2e8]/40 shrink-0">
                    <button
                      type="button"
                      onClick={() => setManualPoomsae(1)}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] sm:text-xs font-black uppercase transition-all cursor-pointer',
                        activePoomsae === 1 ? 'bg-yellow-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                      )}
                    >
                      P1
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualPoomsae(2)}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] sm:text-xs font-black uppercase transition-all cursor-pointer',
                        activePoomsae === 2 ? 'bg-yellow-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                      )}
                    >
                      P2
                    </button>
                  </div>
                </div>
              </div>

              {/* Conditional Layout: Photo 1 (Accuracy) vs Photo 2 (Presentation) */}
              {blueStep === 'accuracy' ? (
                /* PHOTO 1: ACCURACY LAYOUT */
                <div className="space-y-2 sm:space-y-4">
                  <div className="rounded-xl sm:rounded-2xl bg-[#001f4d]/90 border border-[#00a2e8]/40 p-2 sm:p-4 space-y-2 sm:space-y-3.5 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs sm:text-sm md:text-base font-black text-white uppercase tracking-wider">Accuracy</h3>
                        <p className="text-[8px] sm:text-[10px] text-cyan-200/75 leading-tight">Max 4.0 • Deduct -0.1 / -0.3</p>
                      </div>
                      <div className="flex items-baseline gap-0.5 sm:gap-1 font-mono tabular-nums">
                        <span className="text-xl sm:text-3xl md:text-4xl font-black text-[#00a2e8]">{blueAcc.toFixed(1)}</span>
                        <span className="text-[10px] sm:text-sm font-bold text-cyan-200/70">/ 4.0</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 grid-rows-2 gap-1.5 sm:gap-2.5">
                      {/* -0.1 Minor (Left tall button, spans 2 rows) */}
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby || isBlueLocked}
                        onClick={() => setBlueAcc((prev) => clampAccuracy(prev - 0.1))}
                        className="col-start-1 row-start-1 row-span-2 min-h-[76px] sm:min-h-[96px] rounded-xl sm:rounded-2xl bg-[#33352f] hover:bg-[#3f4139] border-2 border-[#b5a642]/60 text-[#fde047] font-black text-xs sm:text-base md:text-lg active:scale-[0.98] transition-all cursor-pointer flex flex-col items-center justify-center p-1 shadow-md disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation"
                      >
                        <span className="text-xs sm:text-base md:text-xl font-black tracking-wide">-0.1 Minor</span>
                      </button>

                      {/* -0.3 Major (Right top) */}
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby || isBlueLocked}
                        onClick={() => setBlueAcc((prev) => clampAccuracy(prev - 0.3))}
                        className="col-start-2 row-start-1 min-h-[36px] sm:min-h-[44px] rounded-lg sm:rounded-xl bg-[#4b1d7d] hover:bg-[#5c2499] border border-[#a855f7]/60 text-white font-black text-[10px] sm:text-xs md:text-sm active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center p-1 shadow-md disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation"
                      >
                        <span>-0.3 Major</span>
                      </button>

                      {/* +0.1 Undo (Right bottom) */}
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby || isBlueLocked}
                        onClick={() => setBlueAcc((prev) => clampAccuracy(prev + 0.1))}
                        className="col-start-2 row-start-2 min-h-[36px] sm:min-h-[44px] rounded-lg sm:rounded-xl bg-[#0055b3] hover:bg-[#0066d6] border border-[#38bdf8]/60 text-white font-black text-[10px] sm:text-xs md:text-sm active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-0.5 p-1 shadow-md disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation"
                      >
                        <Plus size={12} strokeWidth={3} />
                        <span>+0.1 Undo</span>
                      </button>
                    </div>
                  </div>

                  {/* Giant PRESENTATION Button (Photo 1) */}
                  <button
                    type="button"
                    disabled={!current || isJudgeStandby}
                    onClick={() => setBlueStep('presentation')}
                    className="w-full min-h-[48px] sm:min-h-[64px] md:min-h-[76px] rounded-xl sm:rounded-2xl md:rounded-3xl bg-gradient-to-r from-[#0052cc] via-[#0073e6] to-[#0052cc] hover:from-[#0066ff] hover:to-[#0052cc] border-2 border-[#00a2e8] text-white font-black text-xs sm:text-lg md:text-2xl uppercase tracking-wider sm:tracking-widest shadow-[0_0_24px_rgba(0,162,232,0.7)] active:scale-[0.98] transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 p-2 disabled:opacity-40 select-none touch-manipulation"
                  >
                    <span>PRESENTATION</span>
                    {blueSubmitSuccessAt && (!existingBlue || blueSubmitSuccessAt >= existingBlue.submittedAt) && (
                      <span className="text-[9px] sm:text-xs font-bold bg-emerald-500/30 border border-emerald-400 px-1.5 sm:px-2.5 py-0.5 rounded-full text-emerald-200">
                        ✓ SUBMITTED ({round2(blueAcc + bluePresTotal).toFixed(2)})
                      </span>
                    )}
                  </button>
                </div>
              ) : (
                /* PHOTO 2: PRESENTATION LAYOUT */
                <div className="space-y-2 sm:space-y-3">
                  {/* Top back navigation */}
                  <div className="flex items-center justify-between pb-0.5">
                    <button
                      type="button"
                      onClick={() => setBlueStep('accuracy')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#00173d] hover:bg-[#002456] border border-[#00a2e8]/50 text-cyan-200 hover:text-white font-black text-[9px] sm:text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm select-none touch-manipulation"
                    >
                      <ArrowLeft size={12} />
                      <span>&lt; Accuracy ({blueAcc.toFixed(1)})</span>
                    </button>
                    <span className="font-mono text-[9px] sm:text-xs font-black text-cyan-300">
                      Pres: {bluePresTotal.toFixed(1)} / 6.0
                    </span>
                  </div>

                  {/* 1. Speed & Power (16 buttons) */}
                  <div className="rounded-xl sm:rounded-2xl bg-[#001f4d]/85 border border-[#00a2e8]/40 p-1.5 sm:p-3 space-y-1 shadow-inner">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">Speed &amp; Power</h3>
                      <span className="font-mono text-[9px] sm:text-xs font-bold text-cyan-300">{blueSp.toFixed(1)}</span>
                    </div>
                    <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                      {PRESENTATION_ROW_1.map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={!current || isJudgeStandby || isBlueLocked}
                          onClick={() => setBlueSp(val)}
                          className={cn(
                            'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                            blueSp === val
                              ? 'bg-[#00a2e8] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(0,162,232,1)] scale-105 z-10'
                              : 'bg-[#041b45]/90 border border-cyan-400/30 text-white/90 hover:border-cyan-300 hover:bg-[#072d6e]'
                          )}
                        >
                          {val.toFixed(1)}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                      {PRESENTATION_ROW_2.map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={!current || isJudgeStandby || isBlueLocked}
                          onClick={() => setBlueSp(val)}
                          className={cn(
                            'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                            blueSp === val
                              ? 'bg-[#00a2e8] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(0,162,232,1)] scale-105 z-10'
                              : 'bg-[#041b45]/90 border border-cyan-400/30 text-white/90 hover:border-cyan-300 hover:bg-[#072d6e]'
                          )}
                        >
                          {val.toFixed(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Rhythm / Tempo / Softness (16 buttons) */}
                  <div className="rounded-xl sm:rounded-2xl bg-[#001f4d]/85 border border-[#00a2e8]/40 p-1.5 sm:p-3 space-y-1 shadow-inner">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">Rhythm / Tempo</h3>
                      <span className="font-mono text-[9px] sm:text-xs font-bold text-cyan-300">{blueRt.toFixed(1)}</span>
                    </div>
                    <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                      {PRESENTATION_ROW_1.map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={!current || isJudgeStandby || isBlueLocked}
                          onClick={() => setBlueRt(val)}
                          className={cn(
                            'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                            blueRt === val
                              ? 'bg-[#00a2e8] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(0,162,232,1)] scale-105 z-10'
                              : 'bg-[#041b45]/90 border border-cyan-400/30 text-white/90 hover:border-cyan-300 hover:bg-[#072d6e]'
                          )}
                        >
                          {val.toFixed(1)}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                      {PRESENTATION_ROW_2.map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={!current || isJudgeStandby || isBlueLocked}
                          onClick={() => setBlueRt(val)}
                          className={cn(
                            'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                            blueRt === val
                              ? 'bg-[#00a2e8] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(0,162,232,1)] scale-105 z-10'
                              : 'bg-[#041b45]/90 border border-cyan-400/30 text-white/90 hover:border-cyan-300 hover:bg-[#072d6e]'
                          )}
                        >
                          {val.toFixed(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Expression of Energy (16 buttons) */}
                  <div className="rounded-xl sm:rounded-2xl bg-[#001f4d]/85 border border-[#00a2e8]/40 p-1.5 sm:p-3 space-y-1 shadow-inner">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">Expression of Energy</h3>
                      <span className="font-mono text-[9px] sm:text-xs font-bold text-cyan-300">{blueEe.toFixed(1)}</span>
                    </div>
                    <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                      {PRESENTATION_ROW_1.map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={!current || isJudgeStandby || isBlueLocked}
                          onClick={() => setBlueEe(val)}
                          className={cn(
                            'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                            blueEe === val
                              ? 'bg-[#00a2e8] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(0,162,232,1)] scale-105 z-10'
                              : 'bg-[#041b45]/90 border border-cyan-400/30 text-white/90 hover:border-cyan-300 hover:bg-[#072d6e]'
                          )}
                        >
                          {val.toFixed(1)}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                      {PRESENTATION_ROW_2.map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={!current || isJudgeStandby || isBlueLocked}
                          onClick={() => setBlueEe(val)}
                          className={cn(
                            'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                            blueEe === val
                              ? 'bg-[#00a2e8] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(0,162,232,1)] scale-105 z-10'
                              : 'bg-[#041b45]/90 border border-cyan-400/30 text-white/90 hover:border-cyan-300 hover:bg-[#072d6e]'
                          )}
                        >
                          {val.toFixed(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PHOTO 2: Bottom Bar (Math display + SUBMIT button) */}
                  <div className="pt-2 sm:pt-3 border-t border-cyan-400/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[7.5px] sm:text-[10px] md:text-xs font-bold uppercase tracking-wider text-cyan-200/90 truncate">
                        ACCURACY + PRESENTATION = BLUE TOTAL / 10.0
                      </div>
                      <div className="flex flex-wrap items-baseline gap-1 sm:gap-1.5 font-mono font-black tabular-nums">
                        <span className="text-xs sm:text-base md:text-xl text-[#00a2e8]" title="Accuracy">
                          {blueAcc.toFixed(1)}
                        </span>
                        <span className="text-[10px] sm:text-xs text-white">+</span>
                        <span className="text-xs sm:text-base md:text-xl text-[#00a2e8]" title="Presentation">
                          {bluePresTotal.toFixed(1)}
                        </span>
                        <span className="text-[10px] sm:text-xs text-white">=</span>
                        <span className="text-sm sm:text-2xl md:text-3xl text-yellow-400">
                          {round2(blueAcc + bluePresTotal).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setBlueStep('accuracy')}
                        className="min-h-[36px] sm:min-h-[46px] px-2.5 sm:px-3 rounded-lg sm:rounded-xl border border-cyan-400/40 bg-slate-900/80 hover:bg-slate-800 text-cyan-200 font-bold text-[9px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer select-none touch-manipulation"
                        title="Return to Accuracy screen"
                      >
                        <ArrowLeft size={11} />
                        <span className="hidden sm:inline">Accuracy</span>
                      </button>

                      <button
                        type="button"
                        disabled={!current || isJudgeStandby || isSubmittingBlue || isBlueLocked}
                        onClick={() => handleManualSubmitSide('blue')}
                        className={cn(
                          'flex-1 sm:flex-initial min-h-[36px] sm:min-h-[48px] px-3 sm:px-6 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shadow-lg select-none touch-manipulation',
                          isBlueLocked
                            ? 'bg-gradient-to-r from-emerald-500 to-green-600 border border-emerald-300 text-white shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                            : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-400 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                        )}
                      >
                        {isBlueLocked ? (
                          <>
                            <CheckCircle2 size={14} />
                            <span>SUBMITTED (LOCKED)</span>
                          </>
                        ) : (
                          <>
                            <Send size={13} />
                            <span>{isSubmittingBlue ? '...' : 'SUBMIT'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ================= RED (HONG) SIDE ================= */}
          <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#800a12] via-[#52050b] to-[#2e0205] border-2 border-[#ed1c24] p-2 sm:p-4 md:p-5 space-y-2 sm:space-y-4 shadow-[0_0_24px_rgba(237,28,36,0.35)] flex flex-col justify-between min-w-0">
            {hasRedCompetitor ? (
              <div className="space-y-2 sm:space-y-4 min-w-0">
                {/* Athlete Header */}
                <div className="bg-[#9e0c16]/70 border border-[#ed1c24]/40 rounded-xl sm:rounded-2xl p-2 sm:p-3.5 space-y-0.5 sm:space-y-1 shadow-inner min-w-0">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-black uppercase tracking-wider">
                    <span className="text-[#ff6b6b]">Hong (Red)</span>
                    <span className="font-mono font-bold text-yellow-400">J{judgeNumber}</span>
                  </div>
                  <h2 className="text-xs sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight break-words leading-tight line-clamp-2">
                    {redName || 'Waiting for Red Athlete'}
                  </h2>
                  <div className="flex flex-wrap items-end justify-between gap-1 pt-0.5 min-w-0">
                    <p className="text-[9px] sm:text-xs md:text-sm font-bold text-[#ff8a8a] uppercase tracking-wide truncate max-w-full">
                      {redClub || '\u00A0'}
                    </p>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-[#2e0205]/90 border border-[#ed1c24]/40 shrink-0">
                      <button
                        type="button"
                        onClick={() => setManualPoomsae(1)}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[9px] sm:text-xs font-black uppercase transition-all cursor-pointer',
                          activePoomsae === 1 ? 'bg-yellow-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                        )}
                      >
                        P1
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualPoomsae(2)}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[9px] sm:text-xs font-black uppercase transition-all cursor-pointer',
                          activePoomsae === 2 ? 'bg-yellow-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                        )}
                      >
                        P2
                      </button>
                    </div>
                  </div>
                </div>

                {/* Conditional Layout: Photo 1 (Accuracy) vs Photo 2 (Presentation) */}
                {redStep === 'accuracy' ? (
                  /* PHOTO 1: ACCURACY LAYOUT */
                  <div className="space-y-2 sm:space-y-4">
                    <div className="rounded-xl sm:rounded-2xl bg-[#380307]/90 border border-[#ed1c24]/40 p-2 sm:p-4 space-y-2 sm:space-y-3.5 shadow-inner">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xs sm:text-sm md:text-base font-black text-white uppercase tracking-wider">Accuracy</h3>
                          <p className="text-[8px] sm:text-[10px] text-red-200/75 leading-tight">Max 4.0 • Deduct -0.1 / -0.3</p>
                        </div>
                        <div className="flex items-baseline gap-0.5 sm:gap-1 font-mono tabular-nums">
                          <span className="text-xl sm:text-3xl md:text-4xl font-black text-white">{redAcc.toFixed(1)}</span>
                          <span className="text-[10px] sm:text-sm font-bold text-red-200/70">/ 4.0</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 sm:gap-2.5">
                        {/* -0.3 Major (Left top) */}
                        <button
                          type="button"
                          disabled={!current || isJudgeStandby || isRedLocked}
                          onClick={() => setRedAcc((prev) => clampAccuracy(prev - 0.3))}
                          className="col-start-1 row-start-1 min-h-[36px] sm:min-h-[44px] rounded-lg sm:rounded-xl bg-[#730814] hover:bg-[#8c0a18] border border-[#f43f5e]/60 text-white font-black text-[10px] sm:text-xs md:text-sm active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center p-1 shadow-md disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation"
                        >
                          <span>-0.3 Major</span>
                        </button>

                        {/* +0.1 Undo (Left bottom) */}
                        <button
                          type="button"
                          disabled={!current || isJudgeStandby || isRedLocked}
                          onClick={() => setRedAcc((prev) => clampAccuracy(prev + 0.1))}
                          className="col-start-1 row-start-2 min-h-[36px] sm:min-h-[44px] rounded-lg sm:rounded-xl bg-[#a10e1a] hover:bg-[#bf111f] border border-[#f87171]/60 text-white font-black text-[10px] sm:text-xs md:text-sm active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-0.5 p-1 shadow-md disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation"
                        >
                          <Plus size={12} strokeWidth={3} />
                          <span>+0.1 Undo</span>
                        </button>

                        {/* -0.1 Minor (Right tall button, spans 2 rows) */}
                        <button
                          type="button"
                          disabled={!current || isJudgeStandby || isRedLocked}
                          onClick={() => setRedAcc((prev) => clampAccuracy(prev - 0.1))}
                          className="col-start-2 row-start-1 row-span-2 min-h-[76px] sm:min-h-[96px] rounded-xl sm:rounded-2xl bg-[#593006] hover:bg-[#6e3c08] border-2 border-[#f59e0b]/60 text-[#fef08a] font-black text-xs sm:text-base md:text-lg active:scale-[0.98] transition-all cursor-pointer flex flex-col items-center justify-center p-1 shadow-md disabled:opacity-40 disabled:cursor-not-allowed select-none touch-manipulation"
                        >
                          <span className="text-xs sm:text-base md:text-xl font-black tracking-wide">-0.1 Minor</span>
                        </button>
                      </div>
                    </div>

                    {/* Giant PRESENTATION Button (Photo 1) */}
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setRedStep('presentation')}
                      className="w-full min-h-[48px] sm:min-h-[64px] md:min-h-[76px] rounded-xl sm:rounded-2xl md:rounded-3xl bg-gradient-to-r from-[#b30e19] via-[#d61322] to-[#b30e19] hover:from-[#e61727] hover:to-[#b30e19] border-2 border-[#ed1c24] text-white font-black text-xs sm:text-lg md:text-2xl uppercase tracking-wider sm:tracking-widest shadow-[0_0_24px_rgba(237,28,36,0.7)] active:scale-[0.98] transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 p-2 disabled:opacity-40 select-none touch-manipulation"
                    >
                      <span>PRESENTATION</span>
                      {redSubmitSuccessAt && (!existingRed || redSubmitSuccessAt >= existingRed.submittedAt) && (
                        <span className="text-[9px] sm:text-xs font-bold bg-emerald-500/30 border border-emerald-400 px-1.5 sm:px-2.5 py-0.5 rounded-full text-emerald-200">
                          ✓ SUBMITTED ({round2(redAcc + redPresTotal).toFixed(2)})
                        </span>
                      )}
                    </button>
                  </div>
                ) : (
                  /* PHOTO 2: PRESENTATION LAYOUT */
                  <div className="space-y-2 sm:space-y-3">
                    {/* Top back navigation */}
                    <div className="flex items-center justify-between pb-0.5">
                      <button
                        type="button"
                        onClick={() => setRedStep('accuracy')}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2e0205] hover:bg-[#47050a] border border-[#ed1c24]/50 text-red-200 hover:text-white font-black text-[9px] sm:text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm select-none touch-manipulation"
                      >
                        <ArrowLeft size={12} />
                        <span>&lt; Accuracy ({redAcc.toFixed(1)})</span>
                      </button>
                      <span className="font-mono text-[9px] sm:text-xs font-black text-red-200">
                        Pres: {redPresTotal.toFixed(1)} / 6.0
                      </span>
                    </div>

                    {/* 1. Speed & Power (16 buttons) */}
                    <div className="rounded-xl sm:rounded-2xl bg-[#380307]/85 border border-[#ed1c24]/40 p-1.5 sm:p-3 space-y-1 shadow-inner">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">Speed &amp; Power</h3>
                        <span className="font-mono text-[9px] sm:text-xs font-bold text-red-200">{redSp.toFixed(1)}</span>
                      </div>
                      <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                        {PRESENTATION_ROW_1.map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!current || isJudgeStandby || isRedLocked}
                            onClick={() => setRedSp(val)}
                            className={cn(
                              'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                              redSp === val
                                ? 'bg-[#ed1c24] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(237,28,36,1)] scale-105 z-10'
                                : 'bg-[#260305]/90 border border-red-400/30 text-white/90 hover:border-red-300 hover:bg-[#52050b]'
                            )}
                          >
                            {val.toFixed(1)}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                        {PRESENTATION_ROW_2.map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!current || isJudgeStandby || isRedLocked}
                            onClick={() => setRedSp(val)}
                            className={cn(
                              'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                              redSp === val
                                ? 'bg-[#ed1c24] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(237,28,36,1)] scale-105 z-10'
                                : 'bg-[#260305]/90 border border-red-400/30 text-white/90 hover:border-red-300 hover:bg-[#52050b]'
                            )}
                          >
                            {val.toFixed(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Rhythm / Tempo / Softness (16 buttons) */}
                    <div className="rounded-xl sm:rounded-2xl bg-[#380307]/85 border border-[#ed1c24]/40 p-1.5 sm:p-3 space-y-1 shadow-inner">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">Rhythm / Tempo</h3>
                        <span className="font-mono text-[9px] sm:text-xs font-bold text-red-200">{redRt.toFixed(1)}</span>
                      </div>
                      <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                        {PRESENTATION_ROW_1.map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!current || isJudgeStandby || isRedLocked}
                            onClick={() => setRedRt(val)}
                            className={cn(
                              'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                              redRt === val
                                ? 'bg-[#ed1c24] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(237,28,36,1)] scale-105 z-10'
                                : 'bg-[#260305]/90 border border-red-400/30 text-white/90 hover:border-red-300 hover:bg-[#52050b]'
                            )}
                          >
                            {val.toFixed(1)}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                        {PRESENTATION_ROW_2.map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!current || isJudgeStandby || isRedLocked}
                            onClick={() => setRedRt(val)}
                            className={cn(
                              'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                              redRt === val
                                ? 'bg-[#ed1c24] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(237,28,36,1)] scale-105 z-10'
                                : 'bg-[#260305]/90 border border-red-400/30 text-white/90 hover:border-red-300 hover:bg-[#52050b]'
                            )}
                          >
                            {val.toFixed(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 3. Expression of Energy (16 buttons) */}
                    <div className="rounded-xl sm:rounded-2xl bg-[#380307]/85 border border-[#ed1c24]/40 p-1.5 sm:p-3 space-y-1 shadow-inner">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">Expression of Energy</h3>
                        <span className="font-mono text-[9px] sm:text-xs font-bold text-red-200">{redEe.toFixed(1)}</span>
                      </div>
                      <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                        {PRESENTATION_ROW_1.map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!current || isJudgeStandby || isRedLocked}
                            onClick={() => setRedEe(val)}
                            className={cn(
                              'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                              redEe === val
                                ? 'bg-[#ed1c24] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(237,28,36,1)] scale-105 z-10'
                                : 'bg-[#260305]/90 border border-red-400/30 text-white/90 hover:border-red-300 hover:bg-[#52050b]'
                            )}
                          >
                            {val.toFixed(1)}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-8 gap-0.5 sm:gap-1.5">
                        {PRESENTATION_ROW_2.map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!current || isJudgeStandby || isRedLocked}
                            onClick={() => setRedEe(val)}
                            className={cn(
                              'h-7 sm:h-8 md:h-9 rounded font-black text-[8px] sm:text-[11px] md:text-xs p-0 transition-all cursor-pointer flex items-center justify-center tabular-nums leading-none overflow-hidden select-none touch-manipulation active:scale-95 disabled:opacity-40',
                              redEe === val
                                ? 'bg-[#ed1c24] text-white border sm:border-2 border-white shadow-[0_0_12px_rgba(237,28,36,1)] scale-105 z-10'
                                : 'bg-[#260305]/90 border border-red-400/30 text-white/90 hover:border-red-300 hover:bg-[#52050b]'
                            )}
                          >
                            {val.toFixed(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* PHOTO 2: Bottom Bar (Math display + SUBMIT button) */}
                    <div className="pt-2 sm:pt-3 border-t border-red-400/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-[7.5px] sm:text-[10px] md:text-xs font-bold uppercase tracking-wider text-red-200/90 truncate">
                          ACCURACY + PRESENTATION = RED TOTAL / 10.0
                        </div>
                        <div className="flex flex-wrap items-baseline gap-1 sm:gap-1.5 font-mono font-black tabular-nums">
                          <span className="text-xs sm:text-base md:text-xl text-white" title="Accuracy">
                            {redAcc.toFixed(1)}
                          </span>
                          <span className="text-[10px] sm:text-xs text-red-200/70">+</span>
                          <span className="text-xs sm:text-base md:text-xl text-white" title="Presentation">
                            {redPresTotal.toFixed(1)}
                          </span>
                          <span className="text-[10px] sm:text-xs text-red-200/70">=</span>
                          <span className="text-sm sm:text-2xl md:text-3xl text-yellow-400">
                            {round2(redAcc + redPresTotal).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRedStep('accuracy')}
                          className="min-h-[36px] sm:min-h-[46px] px-2.5 sm:px-3 rounded-lg sm:rounded-xl border border-red-400/40 bg-slate-900/80 hover:bg-slate-800 text-red-200 font-bold text-[9px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer select-none touch-manipulation"
                          title="Return to Accuracy screen"
                        >
                          <ArrowLeft size={11} />
                          <span className="hidden sm:inline">Accuracy</span>
                        </button>

                        <button
                          type="button"
                          disabled={!current || isJudgeStandby || isSubmittingRed || isRedLocked}
                          onClick={() => handleManualSubmitSide('red')}
                          className={cn(
                            'flex-1 sm:flex-initial min-h-[36px] sm:min-h-[48px] px-3 sm:px-6 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shadow-lg select-none touch-manipulation',
                            isRedLocked
                              ? 'bg-gradient-to-r from-emerald-500 to-green-600 border border-emerald-300 text-white shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                              : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-400 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                          )}
                        >
                          {isRedLocked ? (
                            <>
                              <CheckCircle2 size={14} />
                              <span>SUBMITTED (LOCKED)</span>
                            </>
                          ) : (
                            <>
                              <Send size={13} />
                              <span>{isSubmittingRed ? '...' : 'SUBMIT'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 my-auto">
                <p className="text-base sm:text-lg font-bold text-red-100/80">Single Competitor (BYE)</p>
                <p className="text-[10px] sm:text-xs text-red-200/60">No red competitor assigned for this bout.</p>
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
