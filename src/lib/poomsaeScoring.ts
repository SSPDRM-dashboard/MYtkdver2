import { PoomsaeJudgeScore } from '../types';

export interface PoomsaePanelScoreResult {
  judgeCount: 3 | 5 | 7;
  submittedCount: number;
  expectedCount: number;
  isComplete: boolean;
  dropsApplied: boolean;
  avgAccuracy: number;
  avgPresentation: number;
  totalScore: number;
  droppedAccuracyMinJudge: number | null;
  droppedAccuracyMaxJudge: number | null;
  droppedPresentationMinJudge: number | null;
  droppedPresentationMaxJudge: number | null;
}

export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function round1(val: number): number {
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

export function clampAccuracy(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(4.0, round1(val)));
}

export function clampPresentation(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(6.0, round1(val)));
}

/**
 * Picks 1 lowest index and 1 highest index from an array of numbers,
 * ensuring minIdx !== maxIdx even when all elements are equal.
 */
function findMinMaxIndices(values: number[]): { minIdx: number; maxIdx: number } {
  if (values.length < 2) {
    return { minIdx: -1, maxIdx: -1 };
  }

  let minIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[minIdx]) {
      minIdx = i;
    }
  }

  let maxIdx = minIdx === 0 ? 1 : 0;
  for (let i = 0; i < values.length; i++) {
    if (i === minIdx) continue;
    if (values[i] >= values[maxIdx]) {
      maxIdx = i;
    }
  }

  return { minIdx, maxIdx };
}

/**
 * Computes World Taekwondo Sport Poomsae score from judge submissions:
 * - 3 Judges: Average all 3 Accuracy + Average all 3 Presentation (drop nothing).
 * - 5 Judges: Drop 1 highest & 1 lowest Accuracy (avg middle 3) + Drop 1 highest & 1 lowest Presentation (avg middle 3).
 * - 7 Judges: Drop 1 highest & 1 lowest Accuracy (avg middle 5) + Drop 1 highest & 1 lowest Presentation (avg middle 5).
 */
export function calculatePoomsaePanelScore(
  judgeScores: PoomsaeJudgeScore[],
  judgeCount: 3 | 5 | 7
): PoomsaePanelScoreResult {
  const activeScores = judgeScores
    .filter((s) => s.judgeNumber >= 1 && s.judgeNumber <= judgeCount)
    .sort((a, b) => a.judgeNumber - b.judgeNumber);

  const submittedCount = activeScores.length;
  const isComplete = submittedCount >= judgeCount;

  if (submittedCount === 0) {
    return {
      judgeCount,
      submittedCount: 0,
      expectedCount: judgeCount,
      isComplete: false,
      dropsApplied: false,
      avgAccuracy: 0,
      avgPresentation: 0,
      totalScore: 0,
      droppedAccuracyMinJudge: null,
      droppedAccuracyMaxJudge: null,
      droppedPresentationMinJudge: null,
      droppedPresentationMaxJudge: null,
    };
  }

  const accValues = activeScores.map((s) => clampAccuracy(s.accuracy));
  const presValues = activeScores.map((s) => clampPresentation(s.presentation));

  // For 3 judges, never drop high/low.
  // For 5 or 7 judges, drop 1 high and 1 low once all expected judges submit (or at least 3 scores exist for live preview).
  const shouldDrop = (judgeCount === 5 || judgeCount === 7) && submittedCount >= judgeCount;

  let droppedAccMinIdx = -1;
  let droppedAccMaxIdx = -1;
  let droppedPresMinIdx = -1;
  let droppedPresMaxIdx = -1;

  if (shouldDrop) {
    const accDrop = findMinMaxIndices(accValues);
    const presDrop = findMinMaxIndices(presValues);
    droppedAccMinIdx = accDrop.minIdx;
    droppedAccMaxIdx = accDrop.maxIdx;
    droppedPresMinIdx = presDrop.minIdx;
    droppedPresMaxIdx = presDrop.maxIdx;
  }

  const keptAcc = accValues.filter((_, idx) => idx !== droppedAccMinIdx && idx !== droppedAccMaxIdx);
  const keptPres = presValues.filter((_, idx) => idx !== droppedPresMinIdx && idx !== droppedPresMaxIdx);

  const avgAccuracyRaw = keptAcc.length > 0 ? keptAcc.reduce((sum, v) => sum + v, 0) / keptAcc.length : 0;
  const avgPresentationRaw = keptPres.length > 0 ? keptPres.reduce((sum, v) => sum + v, 0) / keptPres.length : 0;

  const avgAccuracy = round2(avgAccuracyRaw);
  const avgPresentation = round2(avgPresentationRaw);
  const totalScore = round2(avgAccuracyRaw + avgPresentationRaw);

  return {
    judgeCount,
    submittedCount,
    expectedCount: judgeCount,
    isComplete,
    dropsApplied: shouldDrop,
    avgAccuracy,
    avgPresentation,
    totalScore,
    droppedAccuracyMinJudge: droppedAccMinIdx >= 0 ? activeScores[droppedAccMinIdx].judgeNumber : null,
    droppedAccuracyMaxJudge: droppedAccMaxIdx >= 0 ? activeScores[droppedAccMaxIdx].judgeNumber : null,
    droppedPresentationMinJudge: droppedPresMinIdx >= 0 ? activeScores[droppedPresMinIdx].judgeNumber : null,
    droppedPresentationMaxJudge: droppedPresMaxIdx >= 0 ? activeScores[droppedPresMaxIdx].judgeNumber : null,
  };
}

export function formatPoomsaeScore(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '0.00';
  return Number(val).toFixed(2);
}

export function sanitizeDocSegment(input: string | number | null | undefined): string {
  const raw = String(input ?? 'none').trim() || 'none';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function buildPoomsaeJudgeScoreDocId(params: {
  ringNumber: number;
  eventId?: string | null;
  boutNumber: string | number;
  side: 'blue' | 'red';
  poomsaeNo: 1 | 2;
  judgeNumber: number;
}): string {
  return [
    `r${params.ringNumber}`,
    sanitizeDocSegment(params.eventId || 'default'),
    sanitizeDocSegment(params.boutNumber || 'idle'),
    params.side,
    `p${params.poomsaeNo}`,
    `j${params.judgeNumber}`,
  ].join('_');
}
