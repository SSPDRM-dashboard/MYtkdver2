import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Minus, Plus, RotateCcw, Send, Clock } from 'lucide-react';
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

  const isSelectionValid =
    poomsaeSelection &&
    (!poomsaeSelection.boutKey ||
      poomsaeSelection.boutKey === 'idle' ||
      poomsaeSelection.boutKey === currentBoutKey ||
      Boolean(current?.bout && poomsaeSelection.boutKey.endsWith(`_${current.bout}`)));
  const poomsaeFormName = isSelectionValid
    ? activePoomsae === 1
      ? cleanText(poomsaeSelection?.poomsae1)
      : cleanText(poomsaeSelection?.poomsae2)
    : '';

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

  useEffect(() => {
    if (existingBlue) {
      setBlueAcc(clampAccuracy(existingBlue.accuracy));
      const pres = clampPresentation(existingBlue.presentation);
      // distribute across 3 criteria if not stored separately
      const split = round1(pres / 3);
      setBlueSp(split);
      setBlueRt(split);
      setBlueEe(clampPresentation(pres - split - split));
      setBlueSubmitSuccessAt(existingBlue.submittedAt);
    } else {
      setBlueAcc(4.0);
      setBlueSp(2.0);
      setBlueRt(2.0);
      setBlueEe(2.0);
      setBlueSubmitSuccessAt(null);
    }

    if (existingRed) {
      setRedAcc(clampAccuracy(existingRed.accuracy));
      const pres = clampPresentation(existingRed.presentation);
      const split = round1(pres / 3);
      setRedSp(split);
      setRedRt(split);
      setRedEe(clampPresentation(pres - split - split));
      setRedSubmitSuccessAt(existingRed.submittedAt);
    } else {
      setRedAcc(4.0);
      setRedSp(2.0);
      setRedRt(2.0);
      setRedEe(2.0);
      setRedSubmitSuccessAt(null);
    }
    setSubmitError(null);
  }, [contextKey, existingBlue?.submittedAt, existingRed?.submittedAt]);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-28">
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
          <div className="rounded-3xl bg-gradient-to-br from-blue-950/70 via-slate-900 to-slate-900 border-2 border-cyan-500/50 p-4 sm:p-6 space-y-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              {/* Athlete Header */}
              <div className="bg-blue-900/40 border border-cyan-500/30 rounded-2xl p-4 space-y-1">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-cyan-300">
                  <span>Chung (Blue)</span>
                  <span className="font-mono font-bold text-amber-300">Judge {judgeNumber}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  {blueName || 'Waiting for Blue Athlete'}
                </h2>
                {blueClub && (
                  <p className="text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-wide">
                    {blueClub}
                  </p>
                )}
              </div>

              {/* WT 4-Row Scoring Grid */}
              <div className="space-y-3">
                {/* 1. Accuracy (4.0) */}
                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Accuracy</h3>
                      <p className="text-[10px] text-slate-400">Max 4.0 • Deduct errors by -0.1 / -0.3</p>
                    </div>
                    <span className="font-mono text-2xl font-black text-cyan-300 tabular-nums">
                      {blueAcc.toFixed(1)} <span className="text-xs font-bold text-slate-500">/ 4.0</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setBlueAcc((prev) => clampAccuracy(prev - 0.1))}
                      className="min-h-[44px] rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-black text-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <span>-0.1 Minor</span>
                    </button>
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setBlueAcc((prev) => clampAccuracy(prev - 0.3))}
                      className="min-h-[44px] rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-purple-200 font-black text-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <span>-0.3 Major</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setBlueAcc((prev) => clampAccuracy(prev + 0.1))}
                      className="min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Plus size={12} />
                      <span>+0.1 Undo</span>
                    </button>
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => setBlueAcc(4.0)}
                      className="min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      <RotateCcw size={12} />
                      <span>Reset 4.0</span>
                    </button>
                  </div>
                </div>

                {/* 2. Speed & Power (2.0) */}
                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Speed &amp; Power</h3>
                    <p className="text-[10px] text-slate-400">Max 2.0</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueSp, -0.1)}
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
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
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* 3. Rhythm / Tempo / Softness / Power (2.0) */}
                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Rhythm / Tempo / Softness</h3>
                    <p className="text-[10px] text-slate-400">Max 2.0</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueRt, -0.1)}
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
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
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* 4. Expression of Energy (2.0) */}
                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Expression of Energy</h3>
                    <p className="text-[10px] text-slate-400">Max 2.0</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!current || isJudgeStandby}
                      onClick={() => handleAdjustCriterion(setBlueEe, -0.1)}
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
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
                      className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Blue Submit Button */}
            <div className="pt-4 border-t border-blue-900/50 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Blue Total / 10.0</div>
                <div className="font-mono text-2xl font-black text-amber-300 tabular-nums">
                  {round2(blueAcc + bluePresTotal).toFixed(2)}
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
          <div className="rounded-3xl bg-gradient-to-br from-red-950/70 via-slate-900 to-slate-900 border-2 border-red-500/50 p-4 sm:p-6 space-y-5 shadow-xl flex flex-col justify-between">
            {hasRedCompetitor ? (
              <div className="space-y-4">
                {/* Athlete Header */}
                <div className="bg-red-900/40 border border-red-500/30 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-red-300">
                    <span>Hong (Red)</span>
                    <span className="font-mono font-bold text-amber-300">Judge {judgeNumber}</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                    {redName || 'Waiting for Red Athlete'}
                  </h2>
                  {redClub && (
                    <p className="text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-wide">
                      {redClub}
                    </p>
                  )}
                </div>

                {/* WT 4-Row Scoring Grid */}
                <div className="space-y-3">
                  {/* 1. Accuracy (4.0) */}
                  <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Accuracy</h3>
                        <p className="text-[10px] text-slate-400">Max 4.0 • Deduct errors by -0.1 / -0.3</p>
                      </div>
                      <span className="font-mono text-2xl font-black text-red-300 tabular-nums">
                        {redAcc.toFixed(1)} <span className="text-xs font-bold text-slate-500">/ 4.0</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => setRedAcc((prev) => clampAccuracy(prev - 0.3))}
                        className="min-h-[44px] rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-purple-200 font-black text-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <span>-0.3 Major</span>
                      </button>
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => setRedAcc((prev) => clampAccuracy(prev - 0.1))}
                        className="min-h-[44px] rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-black text-xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <span>-0.1 Minor</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => setRedAcc(4.0)}
                        className="min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                      >
                        <RotateCcw size={12} />
                        <span>Reset 4.0</span>
                      </button>
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => setRedAcc((prev) => clampAccuracy(prev + 0.1))}
                        className="min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus size={12} />
                        <span>+0.1 Undo</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Speed & Power (2.0) */}
                  <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Speed &amp; Power</h3>
                      <p className="text-[10px] text-slate-400">Max 2.0</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedSp, -0.1)}
                        className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
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
                        className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* 3. Rhythm / Tempo / Softness / Power (2.0) */}
                  <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Rhythm / Tempo / Softness</h3>
                      <p className="text-[10px] text-slate-400">Max 2.0</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedRt, -0.1)}
                        className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
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
                        className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* 4. Expression of Energy (2.0) */}
                  <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Expression of Energy</h3>
                      <p className="text-[10px] text-slate-400">Max 2.0</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!current || isJudgeStandby}
                        onClick={() => handleAdjustCriterion(setRedEe, -0.1)}
                        className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
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
                        className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black flex items-center justify-center cursor-pointer disabled:opacity-40"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center space-y-2 my-auto">
                <p className="text-lg font-bold text-slate-400">Single Competitor (BYE)</p>
                <p className="text-xs text-slate-500">No red competitor assigned for this bout.</p>
              </div>
            )}

            {/* Red Submit Button */}
            {hasRedCompetitor && (
              <div className="pt-4 border-t border-red-900/50 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Red Total / 10.0</div>
                  <div className="font-mono text-2xl font-black text-amber-300 tabular-nums">
                    {round2(redAcc + redPresTotal).toFixed(2)}
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
