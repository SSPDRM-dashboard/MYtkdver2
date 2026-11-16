export interface EventData {
  id: string;
  name: string;
  eventDate: string;
  sheetUrl: string;
  winnerSheetUrl?: string; // Standard docs.google.com URL for CSV export
  ringQuantity: number;
  createdAt: Date;
}

export interface BoutMapping {
  id: string;
  eventId: string;
  eventName: string;
  categoryName: string;
  sourceBout: string;
  nextBout: string;
  slot: 'Chung' | 'Hong';
}

export interface MatchData {
  ring: number;
  originalRing?: number;
  bout: string | number;
  blue_name: string;
  blue_club: string;
  red_name: string;
  red_club: string;
  category: string;
  privacy_mode: boolean;
  eventId?: string | null;
  blue_inspected?: boolean;
  red_inspected?: boolean;
  blue_signature?: string;
  red_signature?: string;
  blue_checklist?: string[];
  red_checklist?: string[];
  inspectedAt?: number;
  points?: {
    r1Blue?: string;
    r1Red?: string;
    r2Blue?: string;
    r2Red?: string;
    r3Blue?: string;
    r3Red?: string;
    r1Winner?: 'Blue' | 'Red' | '';
    r2Winner?: 'Blue' | 'Red' | '';
    r3Winner?: 'Blue' | 'Red' | '';
  };
  isManuallyEdited?: boolean;
  allowCompleted?: boolean;
  isTransferred?: boolean;
  transferredToRing?: number;
  blue_logo?: string;
  blue_flag?: string;
  red_logo?: string;
  red_flag?: string;
}

export interface AdminBoutOverride {
  id: string;
  eventId: string;
  eventName: string;
  eventDate?: string;
  bout: string;
  ring?: number;
  originalRing?: number;
  transferredToRing?: number;
  isTransferred?: boolean;
  blue_name?: string;
  blue_club?: string;
  red_name?: string;
  red_club?: string;
  blue_logo?: string;
  blue_flag?: string;
  red_logo?: string;
  red_flag?: string;
  category?: string;
  isManuallyEdited?: boolean;
  updatedAt: number;
}

export interface RingStatus {
  ringNumber: number;
  totalBouts?: number;
  nextBoutNumber?: number;
  currentBout: MatchData | null;
  onDeck: MatchData | null;
  inTheHole: MatchData | null;
  isFinalBouts?: boolean;
  eventId?: string | null;
  version?: number;
  updatedAt?: number;
  suspendedBouts?: MatchData[];
  isDeleted?: boolean;
}

export interface MatchHistoryItem {
  id: string;
  bout: string;
  category: string;
  winner: string;
  winnerClub?: string;
  winnerSide?: 'Blue' | 'Red';
  blue_name?: string;
  blue_club?: string;
  red_name?: string;
  red_club?: string;
  blue_logo?: string;
  red_logo?: string;
  winner_logo?: string;
  eventId: string;
  ring?: number;
  syncedAt?: string | Date | any;
  winType?: string;
  points?: any;
}

export interface RingWinnerBroadcast {
  ringNumber: number;
  eventId?: string | null;
  boutNumber: string | number;
  category: string;
  stage?: string;
  winnerSide: 'Blue' | 'Red' | 'Completed';
  winnerName: string;
  winnerClub: string;
  blueName: string;
  blueClub: string;
  blueLogo?: string;
  redName: string;
  redClub: string;
  redLogo?: string;
  privacyMode?: boolean;
  winType?: string;
  confirmedAt: number;
}

export interface RingTimerState {
  ringNumber: number;
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  startedAt?: number | null;
  boutKey?: string;
  updatedAt: number;
}

export interface RingPoomsaeSelection {
  ringNumber: number;
  poomsae1: string;
  poomsae2: string;
  boutKey?: string;
  updatedAt: number;
}

export interface PoomsaeJudgeScore {
  id: string;
  ringNumber: number;
  eventId: string;
  eventName?: string;
  eventDate?: string;
  boutNumber: string;
  boutKey: string;
  side: 'blue' | 'red';
  poomsaeNo: 1 | 2;
  judgeNumber: number;
  accuracy: number;
  presentation: number;
  speedPower?: number;
  rhythmTempo?: number;
  expressionEnergy?: number;
  total: number;
  submittedAt: number;
}

export interface RingPoomsaeScoringTarget {
  ringNumber: number;
  judgeCount: 3 | 5 | 7;
  activeSide: 'blue' | 'red';
  activePoomsae: 1 | 2;
  showFinalScoreOnScreen: boolean;
  boutKey?: string;
  clearedAt?: number;
  updatedAt: number;
}

export interface PoomsaeSideScoreSummary {
  p1Total: number | null;
  p2Total: number | null;
  finalTotal: number | null;
  p1Complete: boolean;
  p2Complete: boolean;
}

