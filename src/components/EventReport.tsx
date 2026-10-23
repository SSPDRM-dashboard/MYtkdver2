import React, { useState, useEffect, useMemo, useRef } from 'react';
import { EventData, MatchHistoryItem, RingStatus, MatchData } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Download, RefreshCw, Trophy, Medal, Building2, Search, Upload, Trash2, FileSpreadsheet, X, Plus, Swords, Sparkles, Crown, Award, Filter, User, Edit2, RotateCcw, Check, Users, UserCheck, ChevronDown, ChevronUp, ChevronRight, Printer, ArrowUpDown, Shield } from 'lucide-react';
import Papa from 'papaparse';
import { getBoutNumber, isBoutMatch, cn, isPoomsaeCategory, isPlayoffBout } from '../lib/utils';

export interface PlayerRosterEntry {
  name: string;
  normalizedName: string;
  club: string;
  categories: string[];
  disciplines: ('Kyorugi' | 'Poomsae')[];
  divisions: string[];
  matchCount: number;
  bouts: string[];
}

export interface ClubPlayerSummary {
  club: string;
  totalUniquePlayers: number;
  totalEntries: number;
  kyorugiPlayersCount: number;
  poomsaePlayersCount: number;
  bothDisciplinesCount: number;
  divisionsBreakdown: Record<string, number>;
  players: PlayerRosterEntry[];
}

interface EventReportProps {
  currentEventId: string | null;
  events: EventData[];
  matchHistory?: MatchHistoryItem[];
  backupData?: Record<string, { mappings: any[], matches: any[] }>;
  isAdmin?: boolean;
  rings?: RingStatus[];
  boutQueue?: { id: string; data: MatchData }[];
  athletes?: any[];
}

interface RawMatch {
  date?: string;
  event: string;
  category: string;
  matchNoStr: string;
  matchNo: number;
  blueName: string;
  blueClub: string;
  redName: string;
  redClub: string;
  winner: string;
  winnerClub?: string;
  r1Blue?: number;
  r1Red?: number;
}

interface WinnerResult {
  place: '1st' | '2nd' | '3rd' | '4th';
  name: string;
  club: string;
}

interface CategoryResult {
  category: string;
  gold: WinnerResult | null;
  silver: WinnerResult | null;
  bronzes: WinnerResult[];
  isCustomEdited?: boolean;
}

interface PlacingsOverride {
  gold?: { name: string; club: string } | null;
  silver?: { name: string; club: string } | null;
  bronzes?: Array<{ place: '3rd' | '4th'; name: string; club: string }>;
}

export function isValidClub(club?: string | null): boolean {
  if (!club) return false;
  const trimmed = club.trim();
  if (!trimmed) return false;
  const cleaned = trimmed.replace(/^['"`\s\-_/\\.,]+|['"`\s\-_/\\.,]+$/g, '').trim().toLowerCase();
  if (!cleaned) return false;
  const invalid = [
    '-', '--', '---', '—', '–', 'bye', 'none', 'n/a', 'na', 'null', 'undefined',
    'tbd', 'tba', 'no club', 'no competitor', 'unknown', 'unknown club', 'no team'
  ];
  return !invalid.includes(cleaned);
}

export function isValidAthlete(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  const cleaned = trimmed.replace(/^['"`\s\-_/\\.,]+|['"`\s\-_/\\.,]+$/g, '').trim().toLowerCase();
  if (!cleaned) return false;
  const invalid = [
    '-', '--', '---', '—', '–', 'bye', 'none', 'n/a', 'na', 'null', 'undefined',
    'tbd', 'tba', 'no competitor', 'walkover', 'w/o', 'wo', 'completed', 'winner blue', 'winner red'
  ];
  return !invalid.includes(cleaned);
}

export function getCategoryDivision(category?: string | null): string {
  if (!category) return 'Other';
  const cat = category.toUpperCase().trim();
  if (cat.includes('SUPER CADET') || cat.includes('SUPER-CADET') || cat.includes('SUPER_CADET') ||
      cat.includes('U6') || cat.includes('U8') || cat.includes('U10') || cat.includes('U11') || cat.includes('U12') ||
      cat.includes('YEARS OLD') || cat.includes('YEARS-OLD') || cat.includes('CHILDREN')) return 'Super Cadet';
  if (cat.includes('SUPER JUNIOR') || cat.includes('SUPER-JUNIOR') || cat.includes('SUPER_JUNIOR')) return 'Super Junior';
  if (cat.includes('CADET') || cat.includes('12 - 14') || cat.includes('12-14') || cat.includes('BELOW 33KG')) return 'Cadet';
  if (cat.includes('JUNIOR') || cat.includes('15 - 17') || cat.includes('15-17')) return 'Junior';
  if (cat.includes('SENIOR') || cat.includes('OPEN') || cat.includes('18+') || cat.includes('18 - 35') || cat.includes('16-35') || cat.includes('16 - 35')) return 'Senior';
  if (cat.includes('NOVICE')) return 'Novice';
  if (cat.includes('VETERAN') || cat.includes('MASTER') || cat.includes('35+')) return 'Master / Veteran';
  return 'Other';
}

export function cleanAthleteName(name?: string | null): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s*\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBracketPlaceholder(name?: string | null): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (['bye', '---', '--', '-', 'tbd', 'tba', 'none', 'n/a', 'na', 'null', 'undefined', 'no competitor', 'walkover', 'w/o', 'wo', 'winner blue', 'winner red', 'completed', 'unknown'].includes(lower)) {
    return true;
  }
  if (/^(winner|loser|w|w\/o)\s*(of|\/o)?\s*(bout|match)?\s*[a-z0-9_-]+/i.test(trimmed)) return true;
  if (/^(?:bout|match)\s*[a-z0-9_-]+$/i.test(trimmed)) return true;
  if (/^[\[\(][a-z0-9_-]+[\]\)]$/i.test(trimmed)) return true;
  return false;
}

export function namesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ca = cleanAthleteName(a);
  const cb = cleanAthleteName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  
  if (ca.startsWith(cb + ' ') || ca.endsWith(' ' + cb) || cb.startsWith(ca + ' ') || cb.endsWith(' ' + ca)) {
    return true;
  }
  
  const commonStopWords = new Set(['bin', 'binti', 'bt', 'anak', 'ak', 'a/l', 'a/p', 'al', 'ap', 'mohd', 'muhd', 'muhammad']);
  const wordsA = ca.split(' ').filter(w => w.length > 0 && !commonStopWords.has(w));
  const wordsB = cb.split(' ').filter(w => w.length > 0 && !commonStopWords.has(w));

  if (wordsA.length > 0 && wordsB.length > 0) {
    const common = wordsA.filter(w => wordsB.includes(w));
    if (common.length >= Math.min(wordsA.length, wordsB.length) && common.length >= 2) {
      return true;
    }
  }

  return false;
}

export function getMatchParticipants(m: RawMatch): {
  winnerName: string;
  winnerClub: string;
  loserName: string;
  loserClub: string;
  isCompleted: boolean;
} {
  let winnerRaw = (m.winner || '').trim();

  // If winner wasn't explicitly saved as a string, check if point scores determine the winner
  if (!winnerRaw && m.r1Blue !== undefined && m.r1Red !== undefined && !isNaN(m.r1Blue) && !isNaN(m.r1Red)) {
    if (m.r1Blue > m.r1Red && isValidAthlete(m.blueName)) {
      winnerRaw = m.blueName;
    } else if (m.r1Red > m.r1Blue && isValidAthlete(m.redName)) {
      winnerRaw = m.redName;
    }
  }

  // If it's a solo performance with a recorded score
  if (!winnerRaw && isValidAthlete(m.blueName) && (!isValidAthlete(m.redName) || m.redName === '---') && m.r1Blue !== undefined && !isNaN(m.r1Blue)) {
    winnerRaw = m.blueName;
  }

  if (!winnerRaw || winnerRaw === '-' || winnerRaw.toLowerCase() === 'bye') {
    return { winnerName: '', winnerClub: '', loserName: '', loserClub: '', isCompleted: false };
  }
  const wLower = winnerRaw.toLowerCase();
  
  const isBlueWin = 
    wLower === 'winner blue' || wLower === 'blue' || wLower === 'chong' || wLower === 'b' || wLower === 'completed' ||
    namesMatch(wLower, m.blueName) ||
    (m.blueName && m.blueName.toLowerCase().includes(wLower));

  const isRedWin = 
    wLower === 'winner red' || wLower === 'red' || wLower === 'hong' || wLower === 'r' ||
    namesMatch(wLower, m.redName) ||
    (m.redName && m.redName.toLowerCase().includes(wLower));

  if (isBlueWin && !isRedWin) {
    return {
      winnerName: m.blueName,
      winnerClub: m.blueClub || m.winnerClub || '',
      loserName: isValidAthlete(m.redName) ? m.redName : '',
      loserClub: isValidAthlete(m.redName) ? m.redClub : '',
      isCompleted: true
    };
  } else if (isRedWin && !isBlueWin) {
    return {
      winnerName: m.redName,
      winnerClub: m.redClub || m.winnerClub || '',
      loserName: isValidAthlete(m.blueName) ? m.blueName : '',
      loserClub: isValidAthlete(m.blueName) ? m.blueClub : '',
      isCompleted: true
    };
  } else {
    if (namesMatch(winnerRaw, m.blueName)) {
      return {
        winnerName: m.blueName,
        winnerClub: m.blueClub || m.winnerClub || '',
        loserName: isValidAthlete(m.redName) ? m.redName : '',
        loserClub: isValidAthlete(m.redName) ? m.redClub : '',
        isCompleted: true
      };
    } else if (namesMatch(winnerRaw, m.redName)) {
      return {
        winnerName: m.redName,
        winnerClub: m.redClub || m.winnerClub || '',
        loserName: isValidAthlete(m.blueName) ? m.blueName : '',
        loserClub: isValidAthlete(m.blueName) ? m.blueClub : '',
        isCompleted: true
      };
    } else {
      const isRedLoser = m.blueName && namesMatch(m.blueName, winnerRaw);
      const isBlueLoser = m.redName && namesMatch(m.redName, winnerRaw);
      return {
        winnerName: winnerRaw,
        winnerClub: (isRedLoser ? m.blueClub : (isBlueLoser ? m.redClub : m.winnerClub)) || m.winnerClub || m.blueClub || m.redClub || '',
        loserName: isRedLoser ? m.redName : (isBlueLoser ? m.blueName : (m.redName || m.blueName)),
        loserClub: isRedLoser ? m.redClub : (isBlueLoser ? m.blueClub : (m.redClub || m.blueClub)),
        isCompleted: true
      };
    }
  }
}

export function computeCategoryResults(matchList: RawMatch[], placementOption: 'a' | 'b'): CategoryResult[] {
  const extractBoutRef = (text: string): string | null => {
    const trimmed = text.trim();
    const patterns = [
      /^winner\s+(?:of\s+)?(?:bout\s+|match\s+)?([A-Za-z0-9_-]+)$/i,
      /^w(?:\s+of\s+|\s+)?(?:bout\s+|match\s+)?([A-Za-z0-9_-]+)$/i,
      /^w\/o\s+(?:bout\s+|match\s+)?([A-Za-z0-9_-]+)$/i,
      /^\[([A-Za-z0-9_-]+)\]$/i,
      /^\(([A-Za-z0-9_-]+)\)$/i,
      /^(?:bout|match)\s+([A-Za-z0-9_-]+)$/i,
    ];
    for (const p of patterns) {
      const match = trimmed.match(p);
      if (match && match[1]) {
        let b = match[1].trim();
        if (b.toUpperCase().startsWith("BOUT")) b = b.substring(4).trim();
        if (b.toUpperCase().startsWith("MATCH")) b = b.substring(5).trim();
        return b;
      }
    }
    return null;
  };

  // Helper to recursively unwrap "WINNER OF X" into the actual player name
  const resolveParticipant = (name: string, fallbackClub: string, category: string, currentMatchNoStr: string, visited: Set<string> = new Set()): { name: string, club: string } => {
    const sourceBoutRaw = extractBoutRef(name);
    if (!sourceBoutRaw) return { name: name.trim(), club: fallbackClub };
    
    const sourceBoutStr = sourceBoutRaw;
    if (visited.has(sourceBoutStr.toUpperCase())) return { name: name.trim(), club: fallbackClub };
    visited.add(sourceBoutStr.toUpperCase());

    // Attempt 1: Exact match with Ring Prefix injected
    let preferredSourceBoutStr = sourceBoutStr;
    const isPureNumeric = /^\d+$/.test(sourceBoutStr);
    const ringPrefixMatch = currentMatchNoStr.match(/^[A-Z]+/i);

    if (isPureNumeric && ringPrefixMatch) {
       const pref = ringPrefixMatch[0];
       const numAsInt = parseInt(sourceBoutStr, 10);
       const paddedNum = numAsInt < 10 ? `0${numAsInt}` : numAsInt.toString();
       preferredSourceBoutStr = `${pref.toUpperCase()}${paddedNum}`;
    }

    // First criteria: Exact match with intelligent Ring prefix applied
    let sourceMatch = matchList.find(m => m.category === category && m.matchNoStr.toUpperCase() === preferredSourceBoutStr.toUpperCase());
    
    // Fallback criteria: Use lenient boolean check across the category
    if (!sourceMatch) {
       sourceMatch = matchList.find(m => m.category === category && isBoutMatch(m.matchNoStr, sourceBoutStr));
    }

    if (!sourceMatch || !sourceMatch.winner || sourceMatch.winner === '-') {
      return { name: name.trim(), club: fallbackClub };
    }

    // Find who won the source match
    const p = getMatchParticipants(sourceMatch);
    if (p.isCompleted && p.winnerName) {
      return resolveParticipant(p.winnerName, p.winnerClub || fallbackClub, category, sourceMatch.matchNoStr, visited);
    }
    return { name: sourceMatch.winner, club: fallbackClub };
  };

  // Multi-pass resolution over matches to resolve chains of bracket advancements
  let resolvedMatches = [...matchList];
  for (let pass = 0; pass < 3; pass++) {
    resolvedMatches = resolvedMatches.map(m => {
      const blueResolved = resolveParticipant(m.blueName, m.blueClub, m.category, m.matchNoStr, new Set());
      const redResolved = resolveParticipant(m.redName, m.redClub, m.category, m.matchNoStr, new Set());
      const winnerResolved = resolveParticipant(m.winner, '', m.category, m.matchNoStr, new Set());

      let newWinner = m.winner;
      const rawWinnerL = m.winner.trim().toLowerCase();
      if (rawWinnerL === m.blueName.trim().toLowerCase() || rawWinnerL === 'winner blue' || rawWinnerL === 'blue' || rawWinnerL === 'chong') {
        newWinner = blueResolved.name;
      } else if (rawWinnerL === m.redName.trim().toLowerCase() || rawWinnerL === 'winner red' || rawWinnerL === 'red' || rawWinnerL === 'hong') {
        newWinner = redResolved.name;
      } else if (winnerResolved.name !== m.winner) {
        newWinner = winnerResolved.name;
      }

      return {
        ...m,
        blueName: blueResolved.name,
        blueClub: blueResolved.club || m.blueClub,
        redName: redResolved.name,
        redClub: redResolved.club || m.redClub,
        winner: newWinner
      };
    });
  }

  const categories = Array.from(new Set(resolvedMatches.map(m => m.category))).filter((c): c is string => !!c);
  const results: CategoryResult[] = [];

  categories.forEach((cat: string) => {
    const catMatches = resolvedMatches.filter(m => m.category === cat);
    if (catMatches.length === 0) return;

    // 1. Check if this category is a Solo Leaderboard (Cut-off system where athletes perform individually)
    // In a 1v1 bracket, bouts have Red competitors (apart from Byes in preliminary rounds).
    // A category is a Solo Leaderboard ONLY if there are NO head-to-head bouts at all.
    const hasAnyHeadToHead = catMatches.some(m => 
      isValidAthlete(m.redName) && 
      m.redName.trim() !== '---' && 
      !m.redName.toUpperCase().includes('BYE')
    );
    const isSoloLeaderboard = !hasAnyHeadToHead;

    if (isSoloLeaderboard) {
      // Poomsae Cut-off / Single Player Leaderboard Logic
      const leaderboard: Array<{ name: string; club: string; score: number }> = [];

      catMatches.forEach(m => {
        if (isValidAthlete(m.blueName)) {
          const score = (m.r1Blue !== undefined && !isNaN(m.r1Blue)) 
            ? m.r1Blue 
            : ((m.winner && m.winner !== '-') ? 1 : 0);
          leaderboard.push({ name: m.blueName.trim(), club: (m.blueClub || '').trim(), score });
        }
        if (isValidAthlete(m.redName) && m.redName.trim() !== '---' && !m.redName.toUpperCase().includes('BYE')) {
          const score = (m.r1Red !== undefined && !isNaN(m.r1Red)) 
            ? m.r1Red 
            : ((m.winner && m.winner !== '-') ? 1 : 0);
          leaderboard.push({ name: m.redName.trim(), club: (m.redClub || '').trim(), score });
        }
      });

      // Sort descending by score
      leaderboard.sort((a, b) => b.score - a.score);

      // Deduplicate unique athletes (take highest score)
      const uniqueLeaderboard: Array<{ name: string; club: string; score: number }> = [];
      const seenAthletes = new Set<string>();
      for (const entry of leaderboard) {
        const key = cleanAthleteName(entry.name);
        if (!seenAthletes.has(key)) {
          seenAthletes.add(key);
          uniqueLeaderboard.push(entry);
        }
      }

      const bronzes: WinnerResult[] = [];
      if (uniqueLeaderboard.length >= 3) {
        bronzes.push({ place: '3rd', name: uniqueLeaderboard[2].name, club: isValidClub(uniqueLeaderboard[2].club) ? uniqueLeaderboard[2].club : '' });
      }
      if (uniqueLeaderboard.length >= 4) {
        if (placementOption === 'b') {
          bronzes.push({ place: '4th', name: uniqueLeaderboard[3].name, club: isValidClub(uniqueLeaderboard[3].club) ? uniqueLeaderboard[3].club : '' });
        } else {
          bronzes.push({ place: '3rd', name: uniqueLeaderboard[3].name, club: isValidClub(uniqueLeaderboard[3].club) ? uniqueLeaderboard[3].club : '' });
        }
      }

      results.push({
        category: cat,
        gold: uniqueLeaderboard.length >= 1 ? { place: '1st', name: uniqueLeaderboard[0].name, club: isValidClub(uniqueLeaderboard[0].club) ? uniqueLeaderboard[0].club : '' } : null,
        silver: uniqueLeaderboard.length >= 2 ? { place: '2nd', name: uniqueLeaderboard[1].name, club: isValidClub(uniqueLeaderboard[1].club) ? uniqueLeaderboard[1].club : '' } : null,
        bronzes
      });
      return;
    }

    // 2. Head-to-Head Bracket Category (Poomsae Bracket or Kyorugi Bracket)
    // Follows AGENTS.md Tournament Placement Guidelines:
    // 1. Identify Final: Find by category and the match with the highest bout_number (excluding 3rd-place playoff).
    // 2. Assign 1st/2nd: Winner = 1st (Gold), Loser = 2nd (Silver).
    // 3. Identify Semi-Finals: Find the two matches that fed into the Final (or preceding bouts).
    // 4. Assign 3rd/4th:
    //    - If third_place_match exists: Winner = 3rd, Loser = 4th.
    //    - If not:
    //        - Option A (Joint 3rd): Both Losers = 3rd.
    //        - Option B (Playoff ranking): 1st Semi Loser = 3rd, 2nd Semi Loser = 4th.

    // A. Check if any match is explicitly named as a bronze / 3rd-place playoff
    let thirdPlaceMatch = catMatches.find(m => catMatches.length > 1 && isPlayoffBout(m.matchNoStr));

    // Candidate matches for the Final (excluding explicitly named playoff match)
    const nonPlayoffMatches = catMatches.filter(m => m !== thirdPlaceMatch);
    if (nonPlayoffMatches.length === 0) {
      results.push({ category: cat, gold: null, silver: null, bronzes: [] });
      return;
    }

    // Sort descending by matchNo (highest bout number is candidate Final)
    nonPlayoffMatches.sort((a, b) => b.matchNo - a.matchNo);
    
    // Check if any match explicitly has "FINAL" in its bout code/label (and not SEMI/QUARTER)
    const explicitFinal = nonPlayoffMatches.find(m => {
      const u = m.matchNoStr.toUpperCase();
      return u.includes('FINAL') && !u.includes('SEMI') && !u.includes('QUARTER') && !u.includes('1/2') && !u.includes('1/4');
    });

    let finalMatch = explicitFinal || nonPlayoffMatches[0];

    // Collect Semi-Final Losers using feeder analysis and preceding bouts
    const semiLosers: Array<{ name: string; club: string }> = [];
    const finalRes = getMatchParticipants(finalMatch);
    const goldName = finalRes.isCompleted ? finalRes.winnerName : '';
    const goldClub = finalRes.isCompleted ? finalRes.winnerClub : '';
    const silverName = finalRes.isCompleted ? finalRes.loserName : '';
    const silverClub = finalRes.isCompleted ? finalRes.loserClub : '';

    const otherMatches = catMatches.filter(m => m !== finalMatch);

    // Feeder Match Discovery: Find matches where Gold or Silver competed earlier
    if (isValidAthlete(goldName)) {
      const goldFeeder = otherMatches.find(m => {
        const p = getMatchParticipants(m);
        return p.isCompleted && (
          namesMatch(p.winnerName, goldName) || 
          namesMatch(m.blueName, goldName) || 
          namesMatch(m.redName, goldName)
        );
      });
      if (goldFeeder) {
        const p = getMatchParticipants(goldFeeder);
        if (isValidAthlete(p.loserName) && !namesMatch(p.loserName, goldName) && !namesMatch(p.loserName, silverName)) {
          if (!semiLosers.some(sl => namesMatch(sl.name, p.loserName))) {
            semiLosers.push({ name: p.loserName, club: p.loserClub });
          }
        }
      }
    }

    if (isValidAthlete(silverName)) {
      const silverFeeder = otherMatches.find(m => {
        const p = getMatchParticipants(m);
        return p.isCompleted && (
          namesMatch(p.winnerName, silverName) || 
          namesMatch(m.blueName, silverName) || 
          namesMatch(m.redName, silverName)
        );
      });
      if (silverFeeder) {
        const p = getMatchParticipants(silverFeeder);
        if (isValidAthlete(p.loserName) && !namesMatch(p.loserName, goldName) && !namesMatch(p.loserName, silverName)) {
          if (!semiLosers.some(sl => namesMatch(sl.name, p.loserName))) {
            semiLosers.push({ name: p.loserName, club: p.loserClub });
          }
        }
      }
    }

    // Preceding bouts in category (AGENTS.md: "Look at the two bouts immediately preceding the Final")
    const precedingMatches = otherMatches
      .filter(m => m !== thirdPlaceMatch)
      .sort((a, b) => b.matchNo - a.matchNo);

    for (const m of precedingMatches) {
      if (semiLosers.length >= 2) break;
      const p = getMatchParticipants(m);
      if (p.isCompleted && isValidAthlete(p.loserName)) {
        const isGoldOrSilver = namesMatch(p.loserName, goldName) || namesMatch(p.loserName, silverName);
        const alreadyAdded = semiLosers.some(sl => namesMatch(sl.name, p.loserName));
        if (!isGoldOrSilver && !alreadyAdded) {
          semiLosers.push({ name: p.loserName, club: p.loserClub });
        }
      }
    }

    // Feeder pairing check for 3rd-Place Playoff:
    // If thirdPlaceMatch was not identified by name, but we have 2 semi-final losers,
    // check if there is a bout played BETWEEN those two semi-final losers
    if (!thirdPlaceMatch && semiLosers.length >= 2) {
      const pairedMatch = otherMatches.find(m => {
        return (
          (namesMatch(m.blueName, semiLosers[0].name) && namesMatch(m.redName, semiLosers[1].name)) ||
          (namesMatch(m.blueName, semiLosers[1].name) && namesMatch(m.redName, semiLosers[0].name))
        );
      });
      if (pairedMatch) {
        thirdPlaceMatch = pairedMatch;
        // If pairedMatch was mistakenly picked as finalMatch, promote the next highest as Final
        if (finalMatch === pairedMatch) {
          const altFinal = nonPlayoffMatches.find(m => m !== pairedMatch);
          if (altFinal) finalMatch = altFinal;
        }
      }
    }

    // Assign 3rd & 4th Places
    const bronzes: WinnerResult[] = [];
    if (thirdPlaceMatch) {
      const tpRes = getMatchParticipants(thirdPlaceMatch);
      if (tpRes.isCompleted && isValidAthlete(tpRes.winnerName)) {
        bronzes.push({ place: '3rd', name: tpRes.winnerName.trim(), club: isValidClub(tpRes.winnerClub) ? tpRes.winnerClub.trim() : '' });
        if (isValidAthlete(tpRes.loserName)) {
          bronzes.push({ place: '4th', name: tpRes.loserName.trim(), club: isValidClub(tpRes.loserClub) ? tpRes.loserClub.trim() : '' });
        }
      } else {
        // Playoff not completed or pending: fallback to semi-final losers
        if (semiLosers.length >= 1 && isValidAthlete(semiLosers[0].name)) {
          bronzes.push({ place: '3rd', name: semiLosers[0].name.trim(), club: isValidClub(semiLosers[0].club) ? semiLosers[0].club.trim() : '' });
        }
        if (semiLosers.length >= 2 && isValidAthlete(semiLosers[1].name)) {
          bronzes.push({ place: (placementOption === 'b' ? '4th' : '3rd'), name: semiLosers[1].name.trim(), club: isValidClub(semiLosers[1].club) ? semiLosers[1].club.trim() : '' });
        }
      }
    } else if (placementOption === 'b') {
      // Option B without an explicit playoff match: Rank the 2 semi-finalists as 3rd and 4th
      if (semiLosers.length >= 1 && isValidAthlete(semiLosers[0].name)) {
        bronzes.push({ place: '3rd', name: semiLosers[0].name.trim(), club: isValidClub(semiLosers[0].club) ? semiLosers[0].club.trim() : '' });
      }
      if (semiLosers.length >= 2 && isValidAthlete(semiLosers[1].name)) {
        bronzes.push({ place: '4th', name: semiLosers[1].name.trim(), club: isValidClub(semiLosers[1].club) ? semiLosers[1].club.trim() : '' });
      }
    } else {
      // Option A (Joint 3rd): Both semi-final losers are awarded Joint 3rd
      semiLosers.forEach(sl => {
        if (isValidAthlete(sl.name)) {
          bronzes.push({ place: '3rd', name: sl.name.trim(), club: isValidClub(sl.club) ? sl.club.trim() : '' });
        }
      });
    }

    results.push({
      category: cat,
      gold: isValidAthlete(goldName) ? { place: '1st', name: goldName.trim(), club: isValidClub(goldClub) ? goldClub.trim() : '' } : null,
      silver: isValidAthlete(silverName) ? { place: '2nd', name: silverName.trim(), club: isValidClub(silverClub) ? silverClub.trim() : '' } : null,
      bronzes
    });
  });

  return results.sort((a, b) => a.category.localeCompare(b.category));
}

function computeClubStandings(results: CategoryResult[]) {
  const pointsTracker: Record<string, { gold: number, silver: number, bronze: number, points: number }> = {};

  results.forEach(res => {
    if (res.gold && isValidAthlete(res.gold.name) && isValidClub(res.gold.club)) {
      const clubKey = res.gold.club.trim();
      if (!pointsTracker[clubKey]) pointsTracker[clubKey] = { gold: 0, silver: 0, bronze: 0, points: 0 };
      pointsTracker[clubKey].gold += 1;
      pointsTracker[clubKey].points += 7;
    }
    if (res.silver && isValidAthlete(res.silver.name) && isValidClub(res.silver.club)) {
      const clubKey = res.silver.club.trim();
      if (!pointsTracker[clubKey]) pointsTracker[clubKey] = { gold: 0, silver: 0, bronze: 0, points: 0 };
      pointsTracker[clubKey].silver += 1;
      pointsTracker[clubKey].points += 3;
    }
    res.bronzes.forEach(b => {
      if (isValidAthlete(b.name) && isValidClub(b.club)) {
        const clubKey = b.club.trim();
        if (!pointsTracker[clubKey]) pointsTracker[clubKey] = { gold: 0, silver: 0, bronze: 0, points: 0 };
        pointsTracker[clubKey].bronze += 1;
        pointsTracker[clubKey].points += 1;
      }
    });
  });

  const standingsArr = Object.keys(pointsTracker)
    .filter(club => isValidClub(club))
    .map(club => ({
      club,
      ...pointsTracker[club]
    }));

  standingsArr.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gold !== a.gold) return b.gold - a.gold;
    if (b.silver !== a.silver) return b.silver - a.silver;
    return b.bronze - a.bronze;
  });

  return standingsArr;
}

export function EventReport({ currentEventId, events, matchHistory = [], backupData = {}, isAdmin, rings = [], boutQueue = [], athletes = [] }: EventReportProps) {
  const [activeTab, setActiveTab] = useState<'winners' | 'by-rank' | 'summary' | 'total-overall' | 'players'>('winners');
  const [discipline, setDiscipline] = useState<'kyorugi' | 'poomsae'>('kyorugi');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawSheetMatches, setRawSheetMatches] = useState<RawMatch[]>([]);
  const isFetchingRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState<'all' | 'name' | 'club' | 'category'>('all');
  // Category division filter: 'all' or specific division like 'Cadet', 'Junior', 'Senior', 'Super Cadet'
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  
  // Player Summary specific state
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerDisciplineFilter, setPlayerDisciplineFilter] = useState<'all' | 'kyorugi' | 'poomsae'>('all');
  const [playerDivisionFilter, setPlayerDivisionFilter] = useState<string>('all');
  const [playerSortBy, setPlayerSortBy] = useState<'players-desc' | 'players-asc' | 'entries-desc' | 'name-asc' | 'name-desc'>('players-desc');
  const [expandedClubs, setExpandedClubs] = useState<Record<string, boolean>>({});
  const [selectedClubModal, setSelectedClubModal] = useState<ClubPlayerSummary | null>(null);
  
  // Option A (Joint 3rd Place) vs Option B (3rd Place Playoff)
  const [placementOption, setPlacementOption] = useState<'a' | 'b'>('b');
  
  // Feature: Option to combine multiple events
  const [includeAllEvents, setIncludeAllEvents] = useState(false);

  // Admin role check
  const userIsAdmin = useMemo(() => {
    if (isAdmin !== undefined) return isAdmin;
    try {
      const savedUser = localStorage.getItem('tkd_user');
      return savedUser ? JSON.parse(savedUser)?.role === 'admin' : true;
    } catch {
      return true;
    }
  }, [isAdmin]);

  // Placings Overrides per event
  const [placingsOverrides, setPlacingsOverrides] = useState<Record<string, PlacingsOverride>>(() => {
    if (!currentEventId) return {};
    try {
      const saved = localStorage.getItem(`tkd_category_placings_overrides_${currentEventId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Reload overrides when currentEventId changes
  useEffect(() => {
    if (!currentEventId) return;
    try {
      const saved = localStorage.getItem(`tkd_category_placings_overrides_${currentEventId}`);
      setPlacingsOverrides(saved ? JSON.parse(saved) : {});
    } catch {
      setPlacingsOverrides({});
    }
  }, [currentEventId]);

  // Editing state for category placings
  const [editingCategory, setEditingCategory] = useState<CategoryResult | null>(null);
  const [editForm, setEditForm] = useState<{
    goldName: string;
    goldClub: string;
    silverName: string;
    silverClub: string;
    bronzes: Array<{ place: '3rd' | '4th'; name: string; club: string }>;
  }>({
    goldName: '',
    goldClub: '',
    silverName: '',
    silverClub: '',
    bronzes: []
  });
  const [customClubModes, setCustomClubModes] = useState<Record<string, boolean>>({});

  // Total Overall States
  interface UploadedFile {
    name: string;
    size: number;
    rowCount: number;
    data: Array<{
      club: string;
      gold: number;
      silver: number;
      bronze: number;
    }>;
  }

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [totalOverallSearch, setTotalOverallSearch] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const parseFiles = (files: File[]) => {
    const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) return;

    csvFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;

        Papa.parse<string[]>(text, {
          skipEmptyLines: 'greedy',
          complete: (results) => {
            if (results.data.length < 2) {
              setError(`File ${file.name} is empty or has no data row.`);
              return;
            }

            const headers = results.data[0].map(h => h.trim());
            
            // Look for columns containing keywords
            const findColumnIdx = (candidates: string[]) => {
              return headers.findIndex(h => {
                const cleaned = h.toLowerCase().replace(/[^a-z0-9]/g, '');
                return candidates.some(c => cleaned.includes(c) || c.includes(cleaned));
              });
            };

            const clubIdx = findColumnIdx(['club', 'state', 'team']);
            const goldIdx = findColumnIdx(['gold', '1st']);
            const silverIdx = findColumnIdx(['silver', '2nd']);
            const bronzeIdx = findColumnIdx(['bronze', '3rd']);

            if (clubIdx === -1 || goldIdx === -1 || silverIdx === -1 || bronzeIdx === -1) {
              setError(`Could not detect columns in ${file.name}. Expected headers like 'Club / State', 'Gold Medals', 'Silver Medals', 'Bronze Medals'. Detected headers: ${headers.join(', ')}`);
              return;
            }

            const dataRows: Array<{ club: string; gold: number; silver: number; bronze: number }> = [];

            for (let i = 1; i < results.data.length; i++) {
              const row = results.data[i];
              if (row.length <= Math.max(clubIdx, goldIdx, silverIdx, bronzeIdx)) continue;
              
              const clubName = row[clubIdx]?.trim();
              if (!clubName || !isValidClub(clubName)) continue;

              const goldVal = parseInt(row[goldIdx]?.replace(/,/g, '') || '0', 10) || 0;
              const silverVal = parseInt(row[silverIdx]?.replace(/,/g, '') || '0', 10) || 0;
              const bronzeVal = parseInt(row[bronzeIdx]?.replace(/,/g, '') || '0', 10) || 0;

              dataRows.push({
                club: clubName,
                gold: goldVal,
                silver: silverVal,
                bronze: bronzeVal
              });
            }

            setUploadedFiles(prev => {
              const filtered = prev.filter(f => f.name !== file.name);
              return [...filtered, {
                name: file.name,
                size: file.size,
                rowCount: dataRows.length,
                data: dataRows
              }];
            });
            setError(null);
          },
          error: (err) => {
            setError(`Error parsing ${file.name}: ${err.message}`);
          }
        });
      };
      reader.readAsText(file);
    });
  };

  const handleCSVFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      parseFiles(Array.from(e.target.files));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeUploadedFile = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const clearAllFiles = () => {
    setUploadedFiles([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const compiledStandings = useMemo(() => {
    const pointsTracker: Record<string, { gold: number, silver: number, bronze: number, points: number }> = {};
    
    uploadedFiles.forEach(file => {
      file.data.forEach(row => {
        if (!row.club || !isValidClub(row.club)) return;
        const existingKey = Object.keys(pointsTracker).find(k => k.toLowerCase().trim() === row.club.toLowerCase().trim());
        const key = existingKey || row.club.trim();
        
        if (!pointsTracker[key]) {
          pointsTracker[key] = { gold: 0, silver: 0, bronze: 0, points: 0 };
        }
        
        pointsTracker[key].gold += row.gold;
        pointsTracker[key].silver += row.silver;
        pointsTracker[key].bronze += row.bronze;
      });
    });

    const list = Object.keys(pointsTracker).map(club => {
      const data = pointsTracker[club];
      const points = data.gold * 7 + data.silver * 3 + data.bronze * 1;
      return {
        club,
        gold: data.gold,
        silver: data.silver,
        bronze: data.bronze,
        points
      };
    });

    list.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      return b.bronze - a.bronze;
    });

    return list;
  }, [uploadedFiles]);

  const filteredCompiledStandings = useMemo(() => {
    return compiledStandings.filter(item => 
      item.club.toLowerCase().includes(totalOverallSearch.toLowerCase())
    );
  }, [compiledStandings, totalOverallSearch]);

  const compiledSummary = useMemo(() => {
    let golds = 0;
    let silvers = 0;
    let bronzes = 0;
    compiledStandings.forEach(c => {
      golds += c.gold;
      silvers += c.silver;
      bronzes += c.bronze;
    });
    return {
      clubsCount: compiledStandings.length,
      golds,
      silvers,
      bronzes
    };
  }, [compiledStandings]);

  const downloadCompiledStandings = () => {
    if (compiledStandings.length === 0) return;
    const data = compiledStandings.map((c, i) => ({
      'Rank': i + 1,
      'Club / State': c.club,
      'Gold Medals': c.gold,
      'Silver Medals': c.silver,
      'Bronze Medals': c.bronze,
      'Total Points': c.points
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `aggregated_overall_standings_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchMatches = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const targetEvents = includeAllEvents 
        ? events 
        : events.filter(e => e.id === currentEventId);

      const getValidUrl = (e?: EventData | null) => {
        const defaultUrl = 'https://docs.google.com/spreadsheets/d/14TrlxR_rk9S7WmdanXGLlE4Y-ry9TqY6_B6HYA0Uuus/edit?usp=sharing';
        if (!e) return defaultUrl;
        if (e.winnerSheetUrl && e.winnerSheetUrl.includes('docs.google.com/spreadsheets')) return e.winnerSheetUrl;
        if (e.sheetUrl && e.sheetUrl.includes('docs.google.com/spreadsheets')) return e.sheetUrl;
        return defaultUrl;
      };

      const eventsToFetch: EventData[] = targetEvents.length > 0
        ? targetEvents
        : [{
            id: currentEventId || 'default',
            name: 'Tournament',
            eventDate: new Date().toISOString().split('T')[0],
            sheetUrl: 'https://docs.google.com/spreadsheets/d/14TrlxR_rk9S7WmdanXGLlE4Y-ry9TqY6_B6HYA0Uuus/edit?usp=sharing',
            ringQuantity: 4,
            createdAt: new Date()
          }];

      const parsedSheetMatches: RawMatch[] = [];

      for (const event of eventsToFetch) {
        let activeUrl = getValidUrl(event);
        if (!activeUrl) continue;
        if (!activeUrl.includes('/export?')) {
          activeUrl = activeUrl.replace(/\/edit.*$/, '') + '/export?format=csv';
        }

        try {
          const response = await fetch(activeUrl);
          if (!response.ok) {
            console.warn(`Failed to fetch sheet data for event: ${event.name}`);
            continue;
          }
          const csvText = await response.text();

          await new Promise<void>((resolve) => {
            Papa.parse(csvText, {
              complete: (result) => {
                const rows = result.data as string[][];
                if (rows.length < 2) {
                  resolve();
                  return;
                }

                // Dynamic Header Resolution
                const headerRow = rows[0].map(h => (h || '').trim());
                const findCol = (regex: RegExp, fallback: number = -1): number => {
                  const idx = headerRow.findIndex(h => regex.test(h));
                  return idx !== -1 ? idx : fallback;
                };

                const dateCol = findCol(/^(?:timestamp|date|time)/i, 0);
                const eventCol = findCol(/^event/i, 1);
                const ringCol = findCol(/^ring/i, 2);
                const boutCol = findCol(/^(?:bout\b|bout\s*no|bout\s*#|match\b|match\s*no)/i, 3);
                const catCol = findCol(/^(?:category|division|class)/i, 4);
                const blueNameCol = findCol(/^blue\s*(?:player\s*)?name|^blue$/i, 5);
                const redNameCol = findCol(/^red\s*(?:player\s*)?name|^red$/i, 7);

                // Club detection: blue club is directly after blue name or matching club
                let blueClubCol = -1;
                if (blueNameCol !== -1 && blueNameCol + 1 < headerRow.length && /club|team|state/i.test(headerRow[blueNameCol + 1])) {
                  blueClubCol = blueNameCol + 1;
                } else {
                  blueClubCol = findCol(/^blue\s*(?:club|team)|club/i, 6);
                }

                let redClubCol = -1;
                if (redNameCol !== -1 && redNameCol + 1 < headerRow.length && /club|team|state/i.test(headerRow[redNameCol + 1])) {
                  redClubCol = redNameCol + 1;
                } else {
                  redClubCol = headerRow.findIndex((h, idx) => idx > blueClubCol && /club|team/i.test(h));
                  if (redClubCol === -1) redClubCol = 8;
                }

                const winnerCol = headerRow.findIndex(h => /^winner(?:\s*name)?$/i.test(h) && !/club/i.test(h));
                const winnerClubCol = headerRow.findIndex(h => /winner\s*club/i.test(h));

                const r1BlueCol = headerRow.findIndex(h => /blue\s*\(?r1\)?/i.test(h));
                const r1RedCol = headerRow.findIndex(h => /red\s*\(?r1\)?/i.test(h));

                for (let i = 1; i < rows.length; i++) {
                  const row = rows[i];
                  if (!row || row.length < 3) continue;

                  const rawCat = catCol !== -1 && row[catCol] ? row[catCol].trim() : '';
                  if (!rawCat || rawCat === '-' || rawCat.toUpperCase() === 'SKIPPED') continue;

                  const sheetEventName = eventCol !== -1 && row[eventCol] ? row[eventCol].trim() : '';
                  
                  if (!includeAllEvents && sheetEventName) {
                    const s = sheetEventName.toLowerCase();
                    const t = event.name.toLowerCase();
                    const tId = event.id.toLowerCase();
                    const isDirectMatch = s === t || s === tId || t.includes(s) || s.includes(t);
                    
                    if (!isDirectMatch) {
                      const isOtherEvent = events.some(other => 
                        other.id !== event.id && (
                          other.name.trim().toLowerCase() === s || 
                          other.name.trim().toLowerCase().includes(s)
                        )
                      );
                      if (isOtherEvent) continue;
                    }
                  }

                  const matchNoStr = boutCol !== -1 && row[boutCol] ? row[boutCol].trim() : '';
                  if (!matchNoStr || matchNoStr === '-' || matchNoStr.toUpperCase() === 'SKIPPED') continue;

                  const rawBlue = blueNameCol !== -1 && row[blueNameCol] ? row[blueNameCol].trim() : '';
                  const rawRed = redNameCol !== -1 && row[redNameCol] ? row[redNameCol].trim() : '';
                  const blueClub = blueClubCol !== -1 && row[blueClubCol] ? row[blueClubCol].trim() : '';
                  const redClub = redClubCol !== -1 && row[redClubCol] ? row[redClubCol].trim() : '';

                  const parsedWinner = winnerCol !== -1 && row[winnerCol] ? row[winnerCol].trim() : '';
                  const parsedWinnerClub = winnerClubCol !== -1 && row[winnerClubCol] ? row[winnerClubCol].trim() : '';

                  const r1Blue = r1BlueCol !== -1 && row[r1BlueCol] ? parseFloat(row[r1BlueCol]) : undefined;
                  const r1Red = r1RedCol !== -1 && row[r1RedCol] ? parseFloat(row[r1RedCol]) : undefined;

                  const rawDate = dateCol !== -1 && row[dateCol] ? row[dateCol].split(',')[0].trim() : '';
                  const matchDate = rawDate || event.eventDate || new Date().toISOString().split('T')[0];

                  let finalWinner = parsedWinner;
                  let finalWinnerClub = parsedWinnerClub;

                  if (!finalWinner && r1Blue !== undefined && r1Red !== undefined && !isNaN(r1Blue) && !isNaN(r1Red)) {
                    if (r1Blue > r1Red && isValidAthlete(rawBlue)) {
                      finalWinner = rawBlue;
                      finalWinnerClub = blueClub;
                    } else if (r1Red > r1Blue && isValidAthlete(rawRed)) {
                      finalWinner = rawRed;
                      finalWinnerClub = redClub;
                    }
                  }

                  const combinedItem: RawMatch = {
                    date: matchDate,
                    event: sheetEventName || event.name,
                    category: rawCat,
                    matchNoStr,
                    matchNo: getBoutNumber(matchNoStr),
                    blueName: rawBlue,
                    blueClub: blueClub,
                    redName: rawRed,
                    redClub: redClub,
                    winner: finalWinner ? finalWinner.trim() : '',
                    winnerClub: finalWinnerClub ? finalWinnerClub.trim() : '',
                    r1Blue,
                    r1Red
                  };

                  const existingIdx = parsedSheetMatches.findIndex(m => 
                    m.category.trim().toLowerCase() === rawCat.toLowerCase() && 
                    isBoutMatch(m.matchNoStr, matchNoStr)
                  );

                  if (existingIdx !== -1) {
                    parsedSheetMatches[existingIdx] = {
                      ...parsedSheetMatches[existingIdx],
                      date: matchDate || parsedSheetMatches[existingIdx].date,
                      blueName: rawBlue || parsedSheetMatches[existingIdx].blueName,
                      blueClub: blueClub || parsedSheetMatches[existingIdx].blueClub,
                      redName: rawRed || parsedSheetMatches[existingIdx].redName,
                      redClub: redClub || parsedSheetMatches[existingIdx].redClub,
                      winner: finalWinner || parsedSheetMatches[existingIdx].winner,
                      winnerClub: finalWinnerClub || parsedSheetMatches[existingIdx].winnerClub,
                      r1Blue: r1Blue !== undefined ? r1Blue : parsedSheetMatches[existingIdx].r1Blue,
                      r1Red: r1Red !== undefined ? r1Red : parsedSheetMatches[existingIdx].r1Red
                    };
                  } else {
                    parsedSheetMatches.push(combinedItem);
                  }
                }
                resolve();
              },
              error: (err) => {
                console.warn(`CSV Parse error on event ${event.name}:`, err);
                resolve();
              },
              skipEmptyLines: true
            });
          });
        } catch (fetchErr) {
          console.warn(`Fetch error for event ${event.name}:`, fetchErr);
        }
      }

      setRawSheetMatches(parsedSheetMatches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Only trigger network Google Sheets fetch on initial load or when currentEventId / includeAllEvents changes
  useEffect(() => {
    fetchMatches();
  }, [currentEventId, includeAllEvents]);

  // Dynamically compute and memoize all tournament matches from local and remote sources without network polling
  const matches = useMemo(() => {
    let combinedMatches: RawMatch[] = [];

    // 1. Try to load matches from local bracket record / backupData in the app first
    let effectiveBackup: Record<string, { mappings: any[]; matches: any[] }> = { ...(backupData || {}) };
    if (Object.keys(effectiveBackup).length === 0) {
      try {
        const savedBackup = localStorage.getItem('tkd_backup_data_v3');
        if (savedBackup) {
          effectiveBackup = JSON.parse(savedBackup);
        }
      } catch (_) {}
    }

    if (Object.keys(effectiveBackup).length > 0) {
      const targetIds = includeAllEvents 
        ? events.map(e => e.id)
        : (currentEventId ? [currentEventId] : []);
        
      targetIds.forEach(evId => {
        const evObj = events.find(e => e.id === evId);
        const evName = evObj?.name || 'Tournament Event';
        const evDate = evObj?.eventDate || '';

        Object.keys(effectiveBackup).forEach(key => {
          if (key.startsWith(`${evId}_`)) {
            const dataRing = effectiveBackup[key];
            if (dataRing && Array.isArray(dataRing.matches)) {
              dataRing.matches.forEach((m: any) => {
                if (!m.category || m.category === 'SKIPPED' || m.category === '-') return;

                const hist = (matchHistory || []).find(h => 
                  h.eventId === evId && 
                  isBoutMatch(h.bout, m.bout)
                );
                const winnerName = (hist && hist.winner) ? hist.winner : (m.winner || '');
                const winnerClubName = (hist && hist.winnerClub) ? hist.winnerClub : (m.winnerClub || '');
                
                const exists = combinedMatches.some(ex => 
                  ex.category.trim().toLowerCase() === m.category.trim().toLowerCase() && 
                  isBoutMatch(ex.matchNoStr, m.bout)
                );
                
                if (!exists) {
                  combinedMatches.push({
                    date: evDate,
                    event: evName,
                    category: m.category,
                    matchNoStr: m.bout.toString(),
                    matchNo: getBoutNumber(m.bout.toString()),
                    blueName: m.blue_name || '',
                    blueClub: m.blue_club || '',
                    redName: m.red_name || '',
                    redClub: m.red_club || '',
                    winner: winnerName,
                    winnerClub: winnerClubName,
                    r1Blue: hist && hist.points?.r1Blue ? parseFloat(hist.points.r1Blue) : (m.points?.r1Blue ? parseFloat(m.points.r1Blue) : undefined),
                    r1Red: hist && hist.points?.r1Red ? parseFloat(hist.points.r1Red) : (m.points?.r1Red ? parseFloat(m.points.r1Red) : undefined)
                  });
                }
              });
            }
          }
        });
      });
    }

    // 2. Also check active rings and boutQueue
    if (rings && rings.length > 0) {
      rings.forEach(ring => {
        const checkBout = (b: MatchData | null) => {
          if (!b || !b.category || b.category === 'SKIPPED' || b.category === '-') return;
          if (!includeAllEvents && currentEventId && b.eventId && b.eventId !== currentEventId) return;
          const evObj = events.find(e => e.id === (b.eventId || currentEventId));
          const evName = evObj?.name || 'Tournament Event';
          const evDate = evObj?.eventDate || '';
          const hist = (matchHistory || []).find(h => 
            (h.eventId === (b.eventId || currentEventId)) && isBoutMatch(h.bout, b.bout)
          );
          const winnerName = (hist && hist.winner) ? hist.winner : '';
          const winnerClub = (hist && hist.winnerClub) ? hist.winnerClub : '';
          const exists = combinedMatches.some(ex => 
            ex.category.trim().toLowerCase() === b.category.trim().toLowerCase() && 
            isBoutMatch(ex.matchNoStr, b.bout)
          );
          if (!exists) {
            combinedMatches.push({
              date: evDate,
              event: evName,
              category: b.category,
              matchNoStr: b.bout.toString(),
              matchNo: getBoutNumber(b.bout.toString()),
              blueName: b.blue_name || '',
              blueClub: b.blue_club || '',
              redName: b.red_name || '',
              redClub: b.red_club || '',
              winner: winnerName,
              winnerClub: winnerClub,
              r1Blue: hist && hist.points?.r1Blue ? parseFloat(hist.points.r1Blue) : (b.points?.r1Blue ? parseFloat(b.points.r1Blue) : undefined),
              r1Red: hist && hist.points?.r1Red ? parseFloat(hist.points.r1Red) : (b.points?.r1Red ? parseFloat(b.points.r1Red) : undefined)
            });
          }
        };
        checkBout(ring.currentBout);
        checkBout(ring.onDeck);
        checkBout(ring.inTheHole);
        if (Array.isArray(ring.suspendedBouts)) {
          ring.suspendedBouts.forEach(checkBout);
        }
      });
    }

    if (boutQueue && boutQueue.length > 0) {
      boutQueue.forEach(item => {
        const b = item.data;
        if (!b || !b.category || b.category === 'SKIPPED' || b.category === '-') return;
        if (!includeAllEvents && currentEventId && b.eventId && b.eventId !== currentEventId) return;
        const evObj = events.find(e => e.id === (b.eventId || currentEventId));
        const evName = evObj?.name || 'Tournament Event';
        const evDate = evObj?.eventDate || '';
        const hist = (matchHistory || []).find(h => 
          (h.eventId === (b.eventId || currentEventId)) && isBoutMatch(h.bout, b.bout)
        );
        const winnerName = (hist && hist.winner) ? hist.winner : '';
        const winnerClub = (hist && hist.winnerClub) ? hist.winnerClub : '';
        const exists = combinedMatches.some(ex => 
          ex.category.trim().toLowerCase() === b.category.trim().toLowerCase() && 
          isBoutMatch(ex.matchNoStr, b.bout)
        );
        if (!exists) {
          combinedMatches.push({
            date: evDate,
            event: evName,
            category: b.category,
            matchNoStr: b.bout.toString(),
            matchNo: getBoutNumber(b.bout.toString()),
            blueName: b.blue_name || '',
            blueClub: b.blue_club || '',
            redName: b.red_name || '',
            redClub: b.red_club || '',
            winner: winnerName,
            winnerClub: winnerClub,
            r1Blue: hist && hist.points?.r1Blue ? parseFloat(hist.points.r1Blue) : (b.points?.r1Blue ? parseFloat(b.points.r1Blue) : undefined),
            r1Red: hist && hist.points?.r1Red ? parseFloat(hist.points.r1Red) : (b.points?.r1Red ? parseFloat(b.points.r1Red) : undefined)
          });
        }
      });
    }

    // 3. Integrate rawSheetMatches
    rawSheetMatches.forEach(sheetItem => {
      const existingIdx = combinedMatches.findIndex(m => 
        m.category.trim().toLowerCase() === sheetItem.category.trim().toLowerCase() && 
        isBoutMatch(m.matchNoStr, sheetItem.matchNoStr)
      );

      if (existingIdx !== -1) {
        combinedMatches[existingIdx] = {
          ...combinedMatches[existingIdx],
          date: sheetItem.date || combinedMatches[existingIdx].date,
          blueName: sheetItem.blueName || combinedMatches[existingIdx].blueName,
          blueClub: sheetItem.blueClub || combinedMatches[existingIdx].blueClub,
          redName: sheetItem.redName || combinedMatches[existingIdx].redName,
          redClub: sheetItem.redClub || combinedMatches[existingIdx].redClub,
          winner: sheetItem.winner || combinedMatches[existingIdx].winner,
          winnerClub: sheetItem.winnerClub || combinedMatches[existingIdx].winnerClub,
          r1Blue: sheetItem.r1Blue !== undefined ? sheetItem.r1Blue : combinedMatches[existingIdx].r1Blue,
          r1Red: sheetItem.r1Red !== undefined ? sheetItem.r1Red : combinedMatches[existingIdx].r1Red
        };
      } else {
        combinedMatches.push(sheetItem);
      }
    });

    // 4. Final real-time sweep over all matches to retrieve any updated winners from matchHistory
    combinedMatches = combinedMatches.map(m => {
      const hist = (matchHistory || []).find(h => 
        isBoutMatch(h.bout, m.matchNoStr) && (
          !h.eventId || !currentEventId || h.eventId === currentEventId ||
          (events.find(e => e.id === h.eventId)?.name.toLowerCase() === m.event.toLowerCase())
        )
      );
      return {
        ...m,
        winner: (hist && hist.winner) ? hist.winner : m.winner,
        winnerClub: (hist && hist.winnerClub) ? hist.winnerClub : m.winnerClub,
        r1Blue: hist && hist.points?.r1Blue ? parseFloat(hist.points.r1Blue) : m.r1Blue,
        r1Red: hist && hist.points?.r1Red ? parseFloat(hist.points.r1Red) : m.r1Red
      };
    });

    return combinedMatches;
  }, [rawSheetMatches, backupData, rings, boutQueue, matchHistory, currentEventId, includeAllEvents, events]);

  // Auto-adjust discipline tab once when matches are loaded
  useEffect(() => {
    if (matches.length > 0) {
      const hasKyorugi = matches.some(m => !isPoomsaeCategory(m.category));
      const hasPoomsae = matches.some(m => isPoomsaeCategory(m.category));
      if (!hasKyorugi && hasPoomsae && discipline !== 'poomsae') {
        setDiscipline('poomsae');
      } else if (hasKyorugi && !hasPoomsae && discipline !== 'kyorugi') {
        setDiscipline('kyorugi');
      }
    }
  }, [matches, discipline]);

  const kyorugiMatches = useMemo(() => {
    return matches.filter(m => !isPoomsaeCategory(m.category));
  }, [matches]);

  const poomsaeMatches = useMemo(() => {
    return matches.filter(m => isPoomsaeCategory(m.category));
  }, [matches]);

  const kyorugiCategoryCount = useMemo(() => {
    return new Set(kyorugiMatches.map(m => m.category)).size;
  }, [kyorugiMatches]);

  const poomsaeCategoryCount = useMemo(() => {
    return new Set(poomsaeMatches.map(m => m.category)).size;
  }, [poomsaeMatches]);

  const activeMatches = useMemo(() => {
    return discipline === 'poomsae' ? poomsaeMatches : kyorugiMatches;
  }, [discipline, poomsaeMatches, kyorugiMatches]);

  const availableClubs = useMemo(() => {
    const clubsSet = new Set<string>();
    matches.forEach(m => {
      if (isValidClub(m.blueClub)) clubsSet.add(m.blueClub.trim());
      if (isValidClub(m.redClub)) clubsSet.add(m.redClub.trim());
    });
    (matchHistory || []).forEach(h => {
      if (isValidClub(h.blue_club)) clubsSet.add(h.blue_club.trim());
      if (isValidClub(h.red_club)) clubsSet.add(h.red_club.trim());
      if (isValidClub(h.winnerClub)) clubsSet.add(h.winnerClub.trim());
    });
    if (backupData) {
      Object.values(backupData).forEach(ringData => {
        ringData.matches?.forEach((m: any) => {
          if (isValidClub(m.blue_club)) clubsSet.add(m.blue_club.trim());
          if (isValidClub(m.red_club)) clubsSet.add(m.red_club.trim());
        });
      });
    }
    try {
      const savedAthletes = localStorage.getItem('tkd_athletes');
      if (savedAthletes) {
        const athletes = JSON.parse(savedAthletes);
        athletes.forEach((a: any) => {
          if (isValidClub(a.club)) clubsSet.add(a.club.trim());
        });
      }
    } catch (e) {}

    Object.values(placingsOverrides).forEach((ov: PlacingsOverride) => {
      if (ov.gold?.club && isValidClub(ov.gold.club)) clubsSet.add(ov.gold.club.trim());
      if (ov.silver?.club && isValidClub(ov.silver.club)) clubsSet.add(ov.silver.club.trim());
      ov.bronzes?.forEach(b => {
        if (b.club && isValidClub(b.club)) clubsSet.add(b.club.trim());
      });
    });

    return Array.from(clubsSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [matches, matchHistory, backupData, placingsOverrides]);

  const currentEv = useMemo(() => events.find(e => e.id === currentEventId), [events, currentEventId]);

  // Aggregate Unique Players per Club across the entire tournament
  const {
    clubSummaries,
    totalUniquePlayers,
    totalKyorugiPlayers,
    totalPoomsaePlayers,
    totalDualPlayers,
    totalEntriesAllClubs,
    allDivisionsList
  } = useMemo(() => {
    // 1. Build athlete -> club mapping to resolve missing clubs
    const athleteClubMap = new Map<string, string>();
    const registerAthleteClub = (athleteName?: string, clubName?: string) => {
      if (!athleteName || !isValidAthlete(athleteName)) return;
      if (isBracketPlaceholder(athleteName)) return;
      if (!clubName || !isValidClub(clubName)) return;
      const norm = cleanAthleteName(athleteName);
      if (norm && !athleteClubMap.has(norm)) {
        athleteClubMap.set(norm, clubName.trim());
      }
    };

    // Pre-populate with registered athletes if available
    (athletes || []).forEach((a: any) => {
      if (a.name && a.club) registerAthleteClub(a.name, a.club);
    });

    try {
      const savedAthletes = localStorage.getItem('tkd_athletes');
      if (savedAthletes) {
        JSON.parse(savedAthletes).forEach((a: any) => {
          if (a.name && a.club) registerAthleteClub(a.name, a.club);
        });
      }
    } catch {}

    // Pre-populate from matchHistory and backupData
    (matchHistory || []).forEach(h => {
      registerAthleteClub(h.blue_name, h.blue_club);
      registerAthleteClub(h.red_name, h.red_club);
      if (h.winner && h.winnerClub) registerAthleteClub(h.winner, h.winnerClub);
    });

    if (backupData) {
      Object.values(backupData).forEach(ringData => {
        ringData.matches?.forEach((m: any) => {
          registerAthleteClub(m.blue_name, m.blue_club);
          registerAthleteClub(m.red_name, m.red_club);
        });
      });
    }

    // Populate from matches
    matches.forEach(m => {
      registerAthleteClub(m.blueName, m.blueClub);
      registerAthleteClub(m.redName, m.redClub);
      if (m.winner && m.winnerClub) registerAthleteClub(m.winner, m.winnerClub);
    });

    // 2. Track unique players per club: clubName -> Map<normPlayerName, PlayerRecord>
    const clubMap = new Map<string, Map<string, {
      name: string;
      categories: Set<string>;
      disciplines: Set<'Kyorugi' | 'Poomsae'>;
      divisions: Set<string>;
      bouts: Set<string>;
    }>>();

    const addParticipant = (rawName?: string, rawClub?: string, category?: string, matchBout?: string) => {
      if (!rawName || !isValidAthlete(rawName) || isBracketPlaceholder(rawName)) return;
      const normName = cleanAthleteName(rawName);
      if (!normName) return;

      let resolvedClub = rawClub && isValidClub(rawClub) ? rawClub.trim() : (athleteClubMap.get(normName) || '');
      if (!resolvedClub || !isValidClub(resolvedClub)) {
        resolvedClub = 'Unattached / Independent';
      }

      if (!clubMap.has(resolvedClub)) {
        clubMap.set(resolvedClub, new Map());
      }

      const clubAthletes = clubMap.get(resolvedClub)!;
      if (!clubAthletes.has(normName)) {
        clubAthletes.set(normName, {
          name: rawName.trim(),
          categories: new Set(),
          disciplines: new Set(),
          divisions: new Set(),
          bouts: new Set(),
        });
      }

      const pRecord = clubAthletes.get(normName)!;
      if (category && category.trim() && category.trim() !== '-') {
        const cat = category.trim();
        pRecord.categories.add(cat);
        const isPoom = isPoomsaeCategory(cat);
        pRecord.disciplines.add(isPoom ? 'Poomsae' : 'Kyorugi');
        pRecord.divisions.add(getCategoryDivision(cat));
      }
      if (matchBout && matchBout.trim() && matchBout.trim() !== '-') {
        pRecord.bouts.add(matchBout.trim());
      }
    };

    // Process all matches in tournament
    matches.forEach(m => {
      addParticipant(m.blueName, m.blueClub, m.category, m.matchNoStr);
      addParticipant(m.redName, m.redClub, m.category, m.matchNoStr);
    });

    // Also include pre-registered athletes if any weren't in matches yet
    (athletes || []).forEach((a: any) => {
      if (a.name && isValidAthlete(a.name) && !isBracketPlaceholder(a.name)) {
        addParticipant(a.name, a.club, a.category, '');
      }
    });

    try {
      const savedAthletes = localStorage.getItem('tkd_athletes');
      if (savedAthletes) {
        JSON.parse(savedAthletes).forEach((a: any) => {
          if (a.name && isValidAthlete(a.name) && !isBracketPlaceholder(a.name)) {
            addParticipant(a.name, a.club, a.category, '');
          }
        });
      }
    } catch {}

    // 3. Compute summaries for each club
    const globalPlayerSet = new Set<string>();
    const globalKyorugiPlayerSet = new Set<string>();
    const globalPoomsaePlayerSet = new Set<string>();
    const globalDualPlayerSet = new Set<string>();
    const allDivisionsSet = new Set<string>();
    let totalEntriesSum = 0;

    const summaries: ClubPlayerSummary[] = [];

    clubMap.forEach((athletesMap, clubName) => {
      const roster: PlayerRosterEntry[] = [];
      let kyorugiCount = 0;
      let poomsaeCount = 0;
      let bothCount = 0;
      let clubTotalEntries = 0;
      const divBreakdown: Record<string, number> = {};

      athletesMap.forEach((data, normName) => {
        const catArray = Array.from(data.categories);
        const discArray = Array.from(data.disciplines);
        const divArray = Array.from(data.divisions);
        const boutArray = Array.from(data.bouts);

        const hasKyorugi = discArray.includes('Kyorugi');
        const hasPoomsae = discArray.includes('Poomsae');

        if (hasKyorugi) kyorugiCount++;
        if (hasPoomsae) poomsaeCount++;
        if (hasKyorugi && hasPoomsae) {
          bothCount++;
          globalDualPlayerSet.add(`${clubName}___${normName}`);
        }

        const entriesCount = catArray.length > 0 ? catArray.length : 1;
        clubTotalEntries += entriesCount;
        totalEntriesSum += entriesCount;

        divArray.forEach(div => {
          divBreakdown[div] = (divBreakdown[div] || 0) + 1;
          allDivisionsSet.add(div);
        });

        // Global sets for tournament metrics
        globalPlayerSet.add(`${clubName}___${normName}`);
        if (hasKyorugi) globalKyorugiPlayerSet.add(`${clubName}___${normName}`);
        if (hasPoomsae) globalPoomsaePlayerSet.add(`${clubName}___${normName}`);

        roster.push({
          name: data.name,
          normalizedName: normName,
          club: clubName,
          categories: catArray,
          disciplines: discArray,
          divisions: divArray,
          matchCount: boutArray.length,
          bouts: boutArray
        });
      });

      // Sort roster alphabetically
      roster.sort((a, b) => a.name.localeCompare(b.name));

      summaries.push({
        club: clubName,
        totalUniquePlayers: roster.length,
        totalEntries: clubTotalEntries,
        kyorugiPlayersCount: kyorugiCount,
        poomsaePlayersCount: poomsaeCount,
        bothDisciplinesCount: bothCount,
        divisionsBreakdown: divBreakdown,
        players: roster
      });
    });

    return {
      clubSummaries: summaries,
      totalUniquePlayers: globalPlayerSet.size,
      totalKyorugiPlayers: globalKyorugiPlayerSet.size,
      totalPoomsaePlayers: globalPoomsaePlayerSet.size,
      totalDualPlayers: globalDualPlayerSet.size,
      totalEntriesAllClubs: totalEntriesSum,
      allDivisionsList: Array.from(allDivisionsSet).sort()
    };
  }, [matches, athletes, matchHistory, backupData]);

  // Filtered and sorted summaries for the Player Summary table
  const filteredAndSortedClubSummaries = useMemo(() => {
    let result = clubSummaries.map(club => {
      let players = club.players;
      if (playerDisciplineFilter !== 'all') {
        const targetDisc = playerDisciplineFilter === 'kyorugi' ? 'Kyorugi' : 'Poomsae';
        players = players.filter(p => p.disciplines.includes(targetDisc));
      }
      if (playerDivisionFilter !== 'all') {
        players = players.filter(p => p.divisions.includes(playerDivisionFilter));
      }
      return {
        ...club,
        filteredPlayers: players,
        filteredPlayerCount: players.length
      };
    });

    if (playerDisciplineFilter !== 'all' || playerDivisionFilter !== 'all') {
      result = result.filter(c => c.filteredPlayerCount > 0);
    }

    if (playerSearchQuery.trim()) {
      const q = playerSearchQuery.trim().toLowerCase();
      result = result.filter(club => {
        const matchClub = club.club.toLowerCase().includes(q);
        const matchPlayer = club.filteredPlayers.some(p => p.name.toLowerCase().includes(q));
        return matchClub || matchPlayer;
      });
    }

    result.sort((a, b) => {
      if (playerSortBy === 'players-desc') {
        if (b.filteredPlayerCount !== a.filteredPlayerCount) {
          return b.filteredPlayerCount - a.filteredPlayerCount;
        }
        return b.totalEntries - a.totalEntries;
      }
      if (playerSortBy === 'players-asc') {
        return a.filteredPlayerCount - b.filteredPlayerCount;
      }
      if (playerSortBy === 'entries-desc') {
        return b.totalEntries - a.totalEntries;
      }
      if (playerSortBy === 'name-asc') {
        return a.club.localeCompare(b.club);
      }
      if (playerSortBy === 'name-desc') {
        return b.club.localeCompare(a.club);
      }
      return 0;
    });

    return result;
  }, [clubSummaries, playerDisciplineFilter, playerDivisionFilter, playerSearchQuery, playerSortBy]);

  // Toggle club expanded state
  const toggleClubExpanded = (clubName: string) => {
    setExpandedClubs(prev => ({
      ...prev,
      [clubName]: !prev[clubName]
    }));
  };

  const expandAllClubs = () => {
    const next: Record<string, boolean> = {};
    filteredAndSortedClubSummaries.forEach(c => { next[c.club] = true; });
    setExpandedClubs(next);
  };

  const collapseAllClubs = () => {
    setExpandedClubs({});
  };

  // CSV Exports for Player Summary
  const downloadClubPlayerSummaryCSV = () => {
    const csvRows = [
      ['Rank', 'Club / State Name', 'Total Unique Players', 'Kyorugi Players', 'Poomsae Players', 'Dual Discipline Players', 'Total Category Entries', 'Divisions Breakdown']
    ];

    filteredAndSortedClubSummaries.forEach((club, index) => {
      const divStr = Object.entries(club.divisionsBreakdown)
        .map(([div, cnt]) => `${div}: ${cnt}`)
        .join('; ');
      csvRows.push([
        (index + 1).toString(),
        `"${club.club.replace(/"/g, '""')}"`,
        club.filteredPlayerCount.toString(),
        club.kyorugiPlayersCount.toString(),
        club.poomsaePlayersCount.toString(),
        club.bothDisciplinesCount.toString(),
        club.totalEntries.toString(),
        `"${divStr.replace(/"/g, '""')}"`
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Tournament_Player_Summary_By_Club_${currentEv?.name ? currentEv.name.replace(/\s+/g, '_') : 'Event'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadFullRosterCSV = () => {
    const csvRows = [
      ['Club / State', 'Player Name', 'Disciplines', 'Categories Entered', 'Divisions', 'Total Bouts Scheduled', 'Bout Numbers']
    ];

    filteredAndSortedClubSummaries.forEach(club => {
      club.filteredPlayers.forEach(p => {
        csvRows.push([
          `"${club.club.replace(/"/g, '""')}"`,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.disciplines.join(', ')}"`,
          `"${p.categories.join('; ').replace(/"/g, '""')}"`,
          `"${p.divisions.join(', ')}"`,
          p.matchCount.toString(),
          `"${p.bouts.join(', ')}"`
        ]);
      });
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Tournament_Athlete_Roster_By_Club_${currentEv?.name ? currentEv.name.replace(/\s+/g, '_') : 'Event'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintSummary = () => {
    window.print();
  };

  const categoryResults = useMemo(() => {
    const rawResults = computeCategoryResults(activeMatches, placementOption);
    const presentCats = new Set(rawResults.map(r => r.category));

    const merged: CategoryResult[] = rawResults.map(res => {
      const override = placingsOverrides[res.category];
      if (!override) return res;

      return {
        ...res,
        gold: override.gold !== undefined ? (override.gold ? { place: '1st', name: override.gold.name.trim(), club: override.gold.club.trim() } : null) : res.gold,
        silver: override.silver !== undefined ? (override.silver ? { place: '2nd', name: override.silver.name.trim(), club: override.silver.club.trim() } : null) : res.silver,
        bronzes: override.bronzes !== undefined ? override.bronzes.map(b => ({ ...b, name: b.name.trim(), club: b.club.trim() })) : res.bronzes,
        isCustomEdited: true
      };
    });

    // Also include any overridden categories that might not be in activeMatches
    Object.keys(placingsOverrides).forEach(cat => {
      if (!presentCats.has(cat)) {
        const isPoom = isPoomsaeCategory(cat);
        if ((discipline === 'poomsae' && isPoom) || (discipline === 'kyorugi' && !isPoom)) {
          const ov: PlacingsOverride = placingsOverrides[cat];
          merged.push({
            category: cat,
            gold: ov.gold ? { place: '1st', name: ov.gold.name.trim(), club: ov.gold.club.trim() } : null,
            silver: ov.silver ? { place: '2nd', name: ov.silver.name.trim(), club: ov.silver.club.trim() } : null,
            bronzes: ov.bronzes ? ov.bronzes.map(b => ({ ...b, name: b.name.trim(), club: b.club.trim() })) : [],
            isCustomEdited: true
          });
        }
      }
    });

    return merged.sort((a, b) => a.category.localeCompare(b.category));
  }, [activeMatches, placementOption, placingsOverrides, discipline]);

  const handleOpenEditModal = (cat: CategoryResult) => {
    setEditingCategory(cat);
    let initialBronzes: Array<{ place: '3rd' | '4th'; name: string; club: string }> = [];
    if (cat.bronzes && cat.bronzes.length > 0) {
      initialBronzes = cat.bronzes.map(b => ({
        place: (b.place === '4th' ? '4th' : '3rd') as '3rd' | '4th',
        name: b.name || '',
        club: b.club || ''
      }));
    } else {
      if (placementOption === 'b') {
        initialBronzes = [
          { place: '3rd', name: '', club: '' },
          { place: '4th', name: '', club: '' }
        ];
      } else {
        initialBronzes = [
          { place: '3rd', name: '', club: '' },
          { place: '3rd', name: '', club: '' }
        ];
      }
    }

    setEditForm({
      goldName: cat.gold?.name || '',
      goldClub: cat.gold?.club || '',
      silverName: cat.silver?.name || '',
      silverClub: cat.silver?.club || '',
      bronzes: initialBronzes
    });
    setCustomClubModes({});
  };

  const handleSaveEditPlacings = () => {
    if (!editingCategory) return;
    
    const newOverrides: Record<string, PlacingsOverride> = {
      ...placingsOverrides,
      [editingCategory.category]: {
        gold: editForm.goldName.trim() ? { name: editForm.goldName.trim(), club: editForm.goldClub.trim() } : null,
        silver: editForm.silverName.trim() ? { name: editForm.silverName.trim(), club: editForm.silverClub.trim() } : null,
        bronzes: editForm.bronzes.filter(b => b.name.trim()).map(b => ({
          place: b.place,
          name: b.name.trim(),
          club: b.club.trim()
        }))
      }
    };

    setPlacingsOverrides(newOverrides);
    if (currentEventId) {
      localStorage.setItem(`tkd_category_placings_overrides_${currentEventId}`, JSON.stringify(newOverrides));
    }
    setEditingCategory(null);
  };

  const handleResetCategory = (categoryName: string) => {
    const newOverrides = { ...placingsOverrides };
    delete newOverrides[categoryName];
    setPlacingsOverrides(newOverrides);
    if (currentEventId) {
      localStorage.setItem(`tkd_category_placings_overrides_${currentEventId}`, JSON.stringify(newOverrides));
    }
  };

  const clubStandings = useMemo(() => {
    return computeClubStandings(categoryResults);
  }, [categoryResults]);

  const availableDivisions = useMemo(() => {
    const divs = new Set<string>();
    categoryResults.forEach(c => {
      const div = getCategoryDivision(c.category);
      if (div !== 'Other') divs.add(div);
    });
    if (categoryResults.some(c => getCategoryDivision(c.category) === 'Other')) {
      divs.add('Other');
    }
    const priority = ['Super Cadet', 'Super Junior', 'Cadet', 'Junior', 'Senior', 'Novice', 'Master / Veteran', 'Other'];
    return Array.from(divs).sort((a, b) => {
      const ia = priority.indexOf(a);
      const ib = priority.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [categoryResults]);

  const divisionStandingsMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeClubStandings>> = {};
    availableDivisions.forEach(div => {
      const divResults = categoryResults.filter(c => getCategoryDivision(c.category) === div);
      map[div] = computeClubStandings(divResults);
    });
    return map;
  }, [availableDivisions, categoryResults]);

  const activeDivisionStandings = useMemo(() => {
    if (selectedDivision === 'all') return clubStandings;
    return divisionStandingsMap[selectedDivision] || [];
  }, [selectedDivision, clubStandings, divisionStandingsMap]);

  const divisionChampions = useMemo(() => {
    return availableDivisions.map(div => {
      const standings = divisionStandingsMap[div] || [];
      const winner = standings.length > 0 ? standings[0] : null;
      const runnerUp = standings.length > 1 ? standings[1] : null;
      const thirdPlace = standings.length > 2 ? standings[2] : null;
      const divResults = categoryResults.filter(c => getCategoryDivision(c.category) === div);
      const completedCats = divResults.filter(c => c.gold !== null).length;
      return {
        division: div,
        winner,
        runnerUp,
        thirdPlace,
        standings,
        totalCategories: divResults.length,
        completedCategories: completedCats
      };
    });
  }, [availableDivisions, divisionStandingsMap, categoryResults]);

  const addDisciplineStandingsToTotalOverall = (disc: 'kyorugi' | 'poomsae') => {
    const targetMatches = disc === 'poomsae' ? poomsaeMatches : kyorugiMatches;
    const targetResults = computeCategoryResults(targetMatches, placementOption);
    const targetStandings = computeClubStandings(targetResults);
    if (targetStandings.length === 0) return;

    const currentEv = events.find(e => e.id === currentEventId);
    const name = `${currentEv?.name || 'Event'} - ${disc === 'kyorugi' ? 'Kyorugi' : 'Poomsae'} Standings`;

    setUploadedFiles(prev => {
      const filtered = prev.filter(f => f.name !== name);
      return [...filtered, {
        name,
        size: 0,
        rowCount: targetStandings.length,
        data: targetStandings.map(c => ({
          club: c.club,
          gold: c.gold,
          silver: c.silver,
          bronze: c.bronze
        }))
      }];
    });
    setActiveTab('total-overall');
  };

  const addDivisionStandingsToTotalOverall = (disc: 'kyorugi' | 'poomsae', div: string) => {
    const targetMatches = disc === 'poomsae' ? poomsaeMatches : kyorugiMatches;
    const targetResults = computeCategoryResults(targetMatches, placementOption);
    const divResults = div === 'all' ? targetResults : targetResults.filter(c => getCategoryDivision(c.category) === div);
    const targetStandings = computeClubStandings(divResults);
    if (targetStandings.length === 0) return;

    const currentEv = events.find(e => e.id === currentEventId);
    const name = `${currentEv?.name || 'Event'} - ${disc === 'kyorugi' ? 'Kyorugi' : 'Poomsae'} (${div === 'all' ? 'All' : div})`;

    setUploadedFiles(prev => {
      const filtered = prev.filter(f => f.name !== name);
      return [...filtered, {
        name,
        size: 0,
        rowCount: targetStandings.length,
        data: targetStandings.map(c => ({
          club: c.club,
          gold: c.gold,
          silver: c.silver,
          bronze: c.bronze
        }))
      }];
    });
    setActiveTab('total-overall');
  };

  const filteredCategories = useMemo(() => {
    return categoryResults.filter(c => {
      const q = searchQuery.trim().toLowerCase();
      let matchesSearch = true;
      if (q) {
        if (searchCriteria === 'name') {
          matchesSearch = Boolean(
            (c.gold?.name && c.gold.name.toLowerCase().includes(q)) ||
            (c.silver?.name && c.silver.name.toLowerCase().includes(q)) ||
            c.bronzes.some(b => b.name && b.name.toLowerCase().includes(q))
          );
        } else if (searchCriteria === 'club') {
          matchesSearch = Boolean(
            (c.gold?.club && c.gold.club.toLowerCase().includes(q)) ||
            (c.silver?.club && c.silver.club.toLowerCase().includes(q)) ||
            c.bronzes.some(b => b.club && b.club.toLowerCase().includes(q))
          );
        } else if (searchCriteria === 'category') {
          matchesSearch = c.category.toLowerCase().includes(q);
        } else {
          matchesSearch = c.category.toLowerCase().includes(q) ||
            Boolean(c.gold?.name && c.gold.name.toLowerCase().includes(q)) ||
            Boolean(c.gold?.club && c.gold.club.toLowerCase().includes(q)) ||
            Boolean(c.silver?.name && c.silver.name.toLowerCase().includes(q)) ||
            Boolean(c.silver?.club && c.silver.club.toLowerCase().includes(q)) ||
            c.bronzes.some(b => (b.name && b.name.toLowerCase().includes(q)) || (b.club && b.club.toLowerCase().includes(q)));
        }
      }
      const matchesDiv = selectedDivision === 'all' || getCategoryDivision(c.category) === selectedDivision;
      return matchesSearch && matchesDiv;
    });
  }, [categoryResults, searchQuery, searchCriteria, selectedDivision]);

  const allGolds = useMemo(() => {
    return categoryResults
      .filter(c => c.gold?.name && isValidAthlete(c.gold.name))
      .map(c => ({ ...c.gold!, category: c.category }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryResults]);

  const allSilvers = useMemo(() => {
    return categoryResults
      .filter(c => c.silver?.name && isValidAthlete(c.silver.name))
      .map(c => ({ ...c.silver!, category: c.category }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryResults]);

  const allBronzes = useMemo(() => {
    return categoryResults
      .flatMap(c => c.bronzes.filter(b => isValidAthlete(b.name)).map(b => ({ ...b, category: c.category })))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryResults]);

  const matchWinnerCriteria = (item: { name: string; club?: string; category: string }, q: string, crit: 'all' | 'name' | 'club' | 'category') => {
    if (!q) return true;
    if (crit === 'name') return item.name.toLowerCase().includes(q);
    if (crit === 'club') return (item.club || '').toLowerCase().includes(q);
    if (crit === 'category') return item.category.toLowerCase().includes(q);
    return item.name.toLowerCase().includes(q) ||
      (item.club && item.club.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q);
  };

  const filteredGolds = useMemo(() => {
    return allGolds.filter(g => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = matchWinnerCriteria(g, q, searchCriteria);
      const matchesDiv = selectedDivision === 'all' || getCategoryDivision(g.category) === selectedDivision;
      return matchesSearch && matchesDiv;
    });
  }, [allGolds, searchQuery, searchCriteria, selectedDivision]);

  const filteredSilvers = useMemo(() => {
    return allSilvers.filter(s => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = matchWinnerCriteria(s, q, searchCriteria);
      const matchesDiv = selectedDivision === 'all' || getCategoryDivision(s.category) === selectedDivision;
      return matchesSearch && matchesDiv;
    });
  }, [allSilvers, searchQuery, searchCriteria, selectedDivision]);

  const filteredBronzes = useMemo(() => {
    return allBronzes.filter(b => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = matchWinnerCriteria(b, q, searchCriteria);
      const matchesDiv = selectedDivision === 'all' || getCategoryDivision(b.category) === selectedDivision;
      return matchesSearch && matchesDiv;
    });
  }, [allBronzes, searchQuery, searchCriteria, selectedDivision]);

  const downloadCategoryPlacings = () => {
    const discLabel = discipline === 'poomsae' ? 'Poomsae' : 'Kyorugi';
    const data = filteredCategories.map(c => {
      const b1 = c.bronzes[0] || { name: '', club: '', place: '3rd' };
      const b2 = c.bronzes[1] || { name: '', club: '', place: placementOption === 'b' ? '4th' : '3rd' };
      const b2RankLabel = b2.place === '4th' ? '4th Place' : '3rd Place (Bronze 2)';
      const b2ClubLabel = b2.place === '4th' ? '4th Place Club' : '3rd Place Club 2';
      return {
        'Discipline': discLabel,
        'Division': getCategoryDivision(c.category),
        'Category': c.category,
        '1st Place (Gold)': c.gold?.name || '',
        '1st Place Club': c.gold?.club || '',
        '2nd Place (Silver)': c.silver?.name || '',
        '2nd Place Club': c.silver?.club || '',
        '3rd Place (Bronze 1)': b1.name || '',
        '3rd Place Club 1': b1.club || '',
        [b2RankLabel]: b2.name || '',
        [b2ClubLabel]: b2.club || ''
      };
    });
    
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${discipline}_category_placings_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadOverallWinners = () => {
    const discLabel = discipline === 'poomsae' ? 'Poomsae' : 'Kyorugi';
    const data: any[] = [];
    
    filteredGolds.forEach(g => {
      data.push({
        'Discipline': discLabel,
        'Division': getCategoryDivision(g.category),
        'Rank': '1st Place (Gold)',
        'Athlete Name': g.name,
        'Club Name': g.club,
        'Category': g.category
      });
    });
    
    filteredSilvers.forEach(s => {
      data.push({
        'Discipline': discLabel,
        'Division': getCategoryDivision(s.category),
        'Rank': '2nd Place (Silver)',
        'Athlete Name': s.name,
        'Club Name': s.club,
        'Category': s.category
      });
    });
    
    filteredBronzes.forEach(b => {
      data.push({
        'Discipline': discLabel,
        'Division': getCategoryDivision(b.category),
        'Rank': '3rd Place (Bronze)',
        'Athlete Name': b.name,
        'Club Name': b.club,
        'Category': b.category
      });
    });
    
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${discipline}_overall_winners_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadOverallStandings = () => {
    const discLabel = discipline === 'poomsae' ? 'Poomsae' : 'Kyorugi';
    const targetList = activeDivisionStandings;
    const divLabel = selectedDivision === 'all' ? 'All Divisions Combined' : `${selectedDivision} Division`;
    const data = targetList.map((c, i) => ({
      'Discipline': discLabel,
      'Division': divLabel,
      'Rank': i + 1,
      'Club / State': c.club || 'Unknown Club',
      'Gold Medals': c.gold,
      'Silver Medals': c.silver,
      'Bronze Medals': c.bronze,
      'Total Points': c.points
    }));
    
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${discipline}_${selectedDivision === 'all' ? 'overall' : selectedDivision.toLowerCase().replace(/[^a-z0-9]/g, '_')}_standings_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllDivisionsReport = () => {
    const discLabel = discipline === 'poomsae' ? 'Poomsae' : 'Kyorugi';
    const data: any[] = [];

    // 1. Overall Combined
    clubStandings.forEach((c, i) => {
      data.push({
        'Division / Category Group': 'OVERALL COMBINED',
        'Rank': i + 1,
        'Club / State': c.club || 'Unknown Club',
        'Gold Medals': c.gold,
        'Silver Medals': c.silver,
        'Bronze Medals': c.bronze,
        'Total Points': c.points
      });
    });

    // 2. Each Division
    availableDivisions.forEach(div => {
      const list = divisionStandingsMap[div] || [];
      list.forEach((c, i) => {
        data.push({
          'Division / Category Group': `${div.toUpperCase()} DIVISION`,
          'Rank': i + 1,
          'Club / State': c.club || 'Unknown Club',
          'Gold Medals': c.gold,
          'Silver Medals': c.silver,
          'Bronze Medals': c.bronze,
          'Total Points': c.points
        });
      });
    });

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${discipline}_divisions_complete_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentEventId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Trophy size={48} className="text-slate-300 mb-4" />
        <h2 className="text-xl font-bold">No Event Selected</h2>
        <p>Please select an event from the top right to view reports.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Trophy className="text-blue-600" />
            Tournament Report
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            {!includeAllEvents ? (
              events.find(e => e.id === currentEventId)?.name || 'Unknown Event'
            ) : (
              `Aggregating across ${events.filter(e => {
                if (e.winnerSheetUrl && e.winnerSheetUrl.includes('docs.google.com/spreadsheets')) return true;
                if (e.sheetUrl && e.sheetUrl.includes('docs.google.com/spreadsheets')) return true;
                return false;
              }).length} events`
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-xl">
            <button
              onClick={() => setPlacementOption('a')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-black transition-all uppercase tracking-wide",
                placementOption === 'a' 
                  ? "bg-red-600 text-white shadow-sm" 
                  : "text-slate-600 hover:bg-slate-200"
              )}
              title="Option A: Both Semi-Final losers are awarded Joint 3rd place (WT standard)"
            >
              Option A (Joint 3rd)
            </button>
            <button
              onClick={() => setPlacementOption('b')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-black transition-all uppercase tracking-wide",
                placementOption === 'b' 
                  ? "bg-red-600 text-white shadow-sm" 
                  : "text-slate-600 hover:bg-slate-200"
              )}
              title="Option B: 3rd and 4th place decided via Bronze Medal Match playoff"
            >
              Option B (Playoff)
            </button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-slate-600 font-medium bg-slate-50 px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors h-[40px]">
            <input 
              type="checkbox" 
              checked={includeAllEvents}
              onChange={(e) => setIncludeAllEvents(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Merge Multiple Days / Events
          </label>
          <button 
            onClick={fetchMatches}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-xl flex items-center gap-2 transition-all h-[40px]"
          >
            <RefreshCw size={18} className={cn(isLoading && "animate-spin")} />
            {isLoading ? "Analyzing Data..." : "Refresh Report API"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 font-medium">
          {error}
        </div>
      )}

      {/* DISCIPLINE SELECTION BANNER */}
      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setDiscipline('kyorugi');
              if (activeTab === 'players') setActiveTab('winners');
            }}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-wider",
              discipline === 'kyorugi' && activeTab !== 'players'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            <Swords size={16} className={discipline === 'kyorugi' && activeTab !== 'players' ? "text-white" : "text-blue-500"} />
            <span>Kyorugi Report</span>
            <span className={cn(
              "px-2 py-0.5 text-xs rounded-full font-bold",
              discipline === 'kyorugi' && activeTab !== 'players' ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-700"
            )}>
              {kyorugiCategoryCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDiscipline('poomsae');
              if (activeTab === 'players') setActiveTab('winners');
            }}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-wider",
              discipline === 'poomsae' && activeTab !== 'players'
                ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            <Sparkles size={16} className={discipline === 'poomsae' && activeTab !== 'players' ? "text-white" : "text-amber-500"} />
            <span>Poomsae Report</span>
            <span className={cn(
              "px-2 py-0.5 text-xs rounded-full font-bold",
              discipline === 'poomsae' && activeTab !== 'players' ? "bg-amber-700 text-white" : "bg-slate-200 text-slate-700"
            )}>
              {poomsaeCategoryCount}
            </span>
          </button>

          {/* BESIDE POOMSAE REPORT: PLAYER SUMMARY */}
          <button
            type="button"
            onClick={() => setActiveTab('players')}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-wider",
              activeTab === 'players'
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            <Users size={16} className={activeTab === 'players' ? "text-white" : "text-emerald-500"} />
            <span>Player Summary</span>
            <span className={cn(
              "px-2 py-0.5 text-xs rounded-full font-bold",
              activeTab === 'players' ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-700"
            )}>
              {totalUniquePlayers}
            </span>
          </button>
        </div>

        <div className="text-xs font-semibold text-slate-500 px-3.5 py-1.5 bg-white/80 rounded-xl border border-slate-200/60 flex items-center gap-2">
          <span className={cn(
            "w-2.5 h-2.5 rounded-full animate-pulse",
            activeTab === 'players' ? "bg-emerald-500" : (discipline === 'kyorugi' ? "bg-blue-500" : "bg-amber-500")
          )} />
          <span>Active Report: <strong className="text-slate-800 uppercase tracking-wide">
            {activeTab === 'players' ? 'Player Summary (Total Players by Club)' : (discipline === 'kyorugi' ? 'Kyorugi (Sparring)' : 'Poomsae (Pattern)')}
          </strong></span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 sm:gap-4 border-b border-slate-200 pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('winners')}
          className={cn(
            "px-5 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative shrink-0",
            activeTab === 'winners' 
              ? "text-blue-700 bg-white border border-b-0 border-slate-200" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          Category Placings
          {activeTab === 'winners' && <div className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
        </button>
        <button
          onClick={() => setActiveTab('by-rank')}
          className={cn(
            "px-5 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative shrink-0",
            activeTab === 'by-rank' 
              ? "text-blue-700 bg-white border border-b-0 border-slate-200" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          Club/State Overall Winner by Category
          {activeTab === 'by-rank' && <div className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={cn(
            "px-5 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative shrink-0",
            activeTab === 'summary' 
              ? "text-blue-700 bg-white border border-b-0 border-slate-200" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          Overall Standings (WT Calc)
          {activeTab === 'summary' && <div className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
        </button>
        <button
          onClick={() => setActiveTab('total-overall')}
          className={cn(
            "px-5 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative shrink-0",
            activeTab === 'total-overall' 
              ? "text-blue-700 bg-white border border-b-0 border-slate-200" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          Total Overall
          {activeTab === 'total-overall' && <div className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
        </button>
        <button
          onClick={() => setActiveTab('players')}
          className={cn(
            "px-5 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative shrink-0 flex items-center gap-2",
            activeTab === 'players' 
              ? "text-emerald-700 bg-white border border-b-0 border-slate-200" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          <Users size={16} className={activeTab === 'players' ? "text-emerald-600" : "text-slate-400"} />
          <span>Player Summary (by Club)</span>
          <span className={cn(
            "px-2 py-0.5 text-xs rounded-full font-bold",
            activeTab === 'players' ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
          )}>
            {totalUniquePlayers}
          </span>
          {activeTab === 'players' && <div className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {activeTab === 'winners' && (
          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className={discipline === 'kyorugi' ? "text-blue-600 font-black" : "text-amber-600 font-black"}>
                  {discipline === 'kyorugi' ? 'Kyorugi' : 'Poomsae'}
                </span>
                Category Placings
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={downloadCategoryPlacings}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 text-sm transition-all shadow-sm"
                >
                  <Download size={16} />
                  Download Placings CSV
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('all')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        searchCriteria === 'all' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('name')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                        searchCriteria === 'name' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      <User size={12} />
                      By Name
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('club')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        searchCriteria === 'club' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Club
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('category')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        searchCriteria === 'category' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Category
                    </button>
                  </div>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder={
                        searchCriteria === 'name' 
                          ? "Search Athlete Name..." 
                          : searchCriteria === 'club' 
                            ? "Search Club Name..." 
                            : searchCriteria === 'category'
                              ? "Search Category..."
                              : "Search Category, Athlete, Club..."
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-8 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none w-56 sm:w-64 text-sm"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Division Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 mb-5 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                <Filter size={12} /> Division:
              </span>
              <button
                type="button"
                onClick={() => setSelectedDivision('all')}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                  selectedDivision === 'all'
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                All Divisions ({categoryResults.length})
              </button>
              {availableDivisions.map(div => {
                const count = categoryResults.filter(c => getCategoryDivision(c.category) === div).length;
                return (
                  <button
                    key={div}
                    type="button"
                    onClick={() => setSelectedDivision(div)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                      selectedDivision === div
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    <span>{div}</span>
                    <span className={cn(
                      "text-[10px] px-1 rounded-full",
                      selectedDivision === div ? "bg-blue-800 text-white" : "bg-slate-200 text-slate-600"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
 
             <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-50 border-b border-slate-200">
                     <th className="p-4 font-bold text-slate-600 text-sm">Category</th>
                     <th className="p-4 font-bold text-slate-600 text-sm"><div className="flex items-center gap-1"><Medal size={16} className="text-yellow-500"/> 1st Place (Gold)</div></th>
                     <th className="p-4 font-bold text-slate-600 text-sm"><div className="flex items-center gap-1"><Medal size={16} className="text-slate-400"/> 2nd Place (Silver)</div></th>
                     <th className="p-4 font-bold text-slate-600 text-sm"><div className="flex items-center gap-1"><Medal size={16} className="text-amber-700"/> {placementOption === 'b' ? '3rd & 4th Place (Playoff)' : '3rd Place (Joint Bronzes)'}</div></th>
                     {userIsAdmin && (
                       <th className="p-4 font-bold text-slate-600 text-sm text-right">Actions</th>
                     )}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {filteredCategories.length === 0 ? (
                     <tr>
                       <td colSpan={userIsAdmin ? 5 : 4} className="p-8 text-center text-slate-500">
                         {isLoading ? "Scanning bracket history..." : "No categories found for current search/division filter."}
                       </td>
                     </tr>
                   ) : filteredCategories.map((c, i) => (
                     <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                       <td className="p-4">
                         <div className="flex flex-wrap items-center gap-2">
                           <span className="font-bold text-slate-800">{c.category}</span>
                           {c.isCustomEdited && (
                             <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs" title="Manually edited placings">
                               Custom Edited
                             </span>
                           )}
                         </div>
                         <span className="inline-block mt-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                           {getCategoryDivision(c.category)}
                         </span>
                       </td>
                       <td className="p-4">
                         {c.gold ? (
                           <div>
                             <div className="font-bold text-slate-900">{c.gold.name}</div>
                             <div className="text-xs text-blue-900 font-bold">{c.gold.club}</div>
                           </div>
                         ) : <span className="text-slate-400 text-sm italic">Pending Finish</span>}
                       </td>
                       <td className="p-4">
                         {c.silver ? (
                           <div>
                             <div className="font-bold text-slate-700">{c.silver.name}</div>
                             <div className="text-xs text-blue-900 font-bold">{c.silver.club}</div>
                           </div>
                         ) : <span className="text-slate-400">-</span>}
                       </td>
                       <td className="p-4">
                         {c.bronzes.length > 0 ? (
                           <div className="flex flex-col gap-2">
                             {c.bronzes.map((b, bi) => (
                               <div key={bi} className={cn("px-2 py-1 rounded border inline-block w-max", b.place === '4th' ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-amber-50 border-amber-100")}>
                                 <div className="font-bold text-slate-800 text-sm flex gap-2"><span>{b.name}</span><span className={cn("font-black", b.place === '4th' ? "text-slate-500" : "text-amber-700/60")}>{b.place === '4th' ? '#4' : '#3'}</span></div>
                                 <div className="text-xs text-blue-900 font-bold">{b.club}</div>
                               </div>
                             ))}
                           </div>
                         ) : <span className="text-slate-400">-</span>}
                       </td>
                       {userIsAdmin && (
                         <td className="p-4 text-right">
                           <div className="flex items-center justify-end gap-1.5">
                             <button
                               type="button"
                               onClick={() => handleOpenEditModal(c)}
                               className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 border border-blue-200 shadow-2xs"
                               title="Edit 1st, 2nd, and 3rd place winners"
                             >
                               <Edit2 size={13} />
                               Edit Placings
                             </button>
                             {c.isCustomEdited && (
                               <button
                                 type="button"
                                 onClick={() => handleResetCategory(c.category)}
                                 className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                                 title="Reset to auto-calculated bracket placings"
                               >
                                 <RotateCcw size={14} />
                               </button>
                             )}
                           </div>
                         </td>
                       )}
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        )}

        {activeTab === 'by-rank' && (
          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className={discipline === 'kyorugi' ? "text-blue-600 font-black" : "text-amber-600 font-black"}>
                  {discipline === 'kyorugi' ? 'Kyorugi' : 'Poomsae'}
                </span>
                Overall Winners by Category
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={downloadOverallWinners}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 text-sm transition-all shadow-sm"
                >
                  <Download size={16} />
                  Download Winners CSV
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('all')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        searchCriteria === 'all' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('name')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                        searchCriteria === 'name' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      <User size={12} />
                      By Name
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('club')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        searchCriteria === 'club' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Club
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchCriteria('category')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        searchCriteria === 'category' ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Category
                    </button>
                  </div>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder={
                        searchCriteria === 'name' 
                          ? "Search Winner by Name..." 
                          : searchCriteria === 'club' 
                            ? "Search by Club..." 
                            : searchCriteria === 'category'
                              ? "Search by Category..."
                              : "Search Names, Clubs..."
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-8 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none w-56 sm:w-64 text-sm"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Division Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 mb-6 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                <Filter size={12} /> Division:
              </span>
              <button
                type="button"
                onClick={() => setSelectedDivision('all')}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                  selectedDivision === 'all'
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                All Divisions
              </button>
              {availableDivisions.map(div => (
                <button
                  key={div}
                  type="button"
                  onClick={() => setSelectedDivision(div)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                    selectedDivision === div
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {div}
                </button>
              ))}
            </div>

            <div className="space-y-12">
              {/* 1st Place Section */}
              <div>
                <h3 className="text-lg font-black text-yellow-600 flex items-center gap-2 mb-4 border-b border-yellow-100 pb-2">
                  <Medal size={20} className="text-yellow-500" /> 1st Place overall (Gold)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredGolds.length === 0 ? (
                    <div className="text-slate-500 italic">No gold winners found.</div>
                  ) : filteredGolds.map((g, i) => (
                    <div key={i} className="bg-white border text-left border-yellow-200 rounded-xl max-w-sm p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="font-black text-slate-900 text-lg leading-tight uppercase mb-1">{g.name}</div>
                      <div className="text-sm font-bold text-blue-900 uppercase tracking-widest">{g.club}</div>
                      <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="truncate">{g.category}</span>
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-800 border border-yellow-200 shrink-0">
                          {getCategoryDivision(g.category)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2nd Place Section */}
              <div>
                <h3 className="text-lg font-black text-slate-600 flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                  <Medal size={20} className="text-slate-400" /> 2nd Place overall (Silver)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredSilvers.length === 0 ? (
                    <div className="text-slate-500 italic">No silver winners found.</div>
                  ) : filteredSilvers.map((s, i) => (
                    <div key={i} className="bg-white border text-left border-slate-200 rounded-xl max-w-sm p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="font-black text-slate-900 text-lg leading-tight uppercase mb-1">{s.name}</div>
                      <div className="text-sm font-bold text-blue-900 uppercase tracking-widest">{s.club}</div>
                      <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="truncate">{s.category}</span>
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                          {getCategoryDivision(s.category)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3rd Place Section */}
              <div>
                <h3 className="text-lg font-black text-amber-700 flex items-center gap-2 mb-4 border-b border-amber-100 pb-2">
                  <Medal size={20} className="text-amber-600" /> 3rd Place overall (Bronze)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredBronzes.length === 0 ? (
                    <div className="text-slate-500 italic">No bronze winners found.</div>
                  ) : filteredBronzes.map((b, i) => (
                    <div key={i} className="bg-white border text-left border-amber-200 rounded-xl max-w-sm p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="font-black text-slate-900 text-lg leading-tight uppercase mb-1">{b.name}</div>
                      <div className="text-sm font-bold text-blue-900 uppercase tracking-widest">{b.club}</div>
                      <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="truncate">{b.category}</span>
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          {getCategoryDivision(b.category)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="p-6 flex flex-col items-center">
            {/* 1. DIVISION OVERALL CHAMPIONS SHOWCASE */}
            <div className="w-full max-w-5xl mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Crown size={24} className="text-amber-500 fill-amber-400" />
                    <span>Division Overall Champions</span>
                    <span className={discipline === 'kyorugi' ? "text-blue-600 text-sm font-bold px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200" : "text-amber-600 text-sm font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200"}>
                      {discipline === 'kyorugi' ? 'Kyorugi' : 'Poomsae'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Total winner for each category division (Gold: 7 pts, Silver: 3 pts, Bronze: 1 pt). Click a division card or filter below to inspect its detailed standings.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={downloadAllDivisionsReport}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white font-bold rounded-xl flex items-center gap-2 text-xs transition-all shadow-sm"
                    title="Export all division standings into one combined CSV report"
                  >
                    <Download size={14} />
                    Download All Divisions Report
                  </button>
                  <button
                    onClick={downloadOverallStandings}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs transition-all shadow-sm"
                  >
                    <Download size={14} />
                    Download Current View CSV
                  </button>
                </div>
              </div>

              {/* Champions Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {divisionChampions.map((dc) => {
                  const isSelected = selectedDivision === dc.division;
                  return (
                    <div
                      key={dc.division}
                      onClick={() => setSelectedDivision(isSelected ? 'all' : dc.division)}
                      className={cn(
                        "relative rounded-2xl p-5 border transition-all cursor-pointer text-left flex flex-col justify-between",
                        isSelected
                          ? "bg-blue-50/70 border-blue-500 shadow-md ring-2 ring-blue-500/20"
                          : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black tracking-wide uppercase bg-slate-900 text-white flex items-center gap-1.5 shadow-2xs">
                            <Award size={13} className="text-yellow-400" />
                            {dc.division}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">
                            {dc.completedCategories}/{dc.totalCategories} Cats
                          </span>
                        </div>

                        {dc.winner ? (
                          <div className="space-y-3">
                            <div>
                              <div className="text-[11px] font-black uppercase text-amber-600 tracking-wider flex items-center gap-1 mb-0.5">
                                <Trophy size={13} className="text-yellow-500" />
                                1st Place Overall Winner
                              </div>
                              <div className="text-base font-black text-slate-900 leading-tight uppercase truncate" title={dc.winner.club}>
                                {dc.winner.club}
                              </div>
                            </div>

                            <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                <span className="flex items-center gap-0.5 text-yellow-600">🥇 {dc.winner.gold}</span>
                                <span className="flex items-center gap-0.5 text-slate-500">🥈 {dc.winner.silver}</span>
                                <span className="flex items-center gap-0.5 text-amber-700">🥉 {dc.winner.bronze}</span>
                              </div>
                              <div className="text-sm font-black text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-lg">
                                {dc.winner.points} pts
                              </div>
                            </div>

                            {/* Runners up */}
                            <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-100">
                              <div className="flex justify-between items-center truncate">
                                <span className="text-slate-400">2nd:</span>
                                <span className="font-bold text-slate-700 truncate max-w-[180px]">
                                  {dc.runnerUp ? `${dc.runnerUp.club} (${dc.runnerUp.points} pts)` : '-'}
                                </span>
                              </div>
                              <div className="flex justify-between items-center truncate">
                                <span className="text-slate-400">3rd:</span>
                                <span className="font-bold text-slate-700 truncate max-w-[180px]">
                                  {dc.thirdPlace ? `${dc.thirdPlace.club} (${dc.thirdPlace.points} pts)` : '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="py-8 text-center text-slate-400 text-xs italic">
                            No finished matches yet in {dc.division}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-2 border-t border-slate-100/80 flex items-center justify-between text-xs font-bold text-blue-600">
                        <span>{isSelected ? "Filtered below ✓" : "Click to view standings"}</span>
                        <span>→</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. DIVISION SELECTOR TABS */}
            <div className="w-full max-w-5xl mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                  <Filter size={14} className="text-slate-400" /> Filter Team Standings Table:
                </span>
                {selectedDivision !== 'all' && (
                  <button
                    onClick={() => setSelectedDivision('all')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    Reset to All Divisions
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedDivision('all')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                    selectedDivision === 'all'
                      ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <span>All Divisions Combined</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                    selectedDivision === 'all' ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-600"
                  )}>
                    {clubStandings.length}
                  </span>
                </button>
                {availableDivisions.map(div => {
                  const isSel = selectedDivision === div;
                  const count = (divisionStandingsMap[div] || []).length;
                  return (
                    <button
                      key={div}
                      type="button"
                      onClick={() => setSelectedDivision(div)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                        isSel
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                      )}
                    >
                      <span>{div}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                        isSel ? "bg-blue-800 text-white" : "bg-slate-200 text-slate-600"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* 3. DETAILED STANDINGS TABLE */}
            <div className="w-full max-w-5xl mb-2 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                <span>{selectedDivision === 'all' ? 'All Divisions Combined' : `${selectedDivision} Division`} Team Standings</span>
                <span className="text-xs font-bold text-slate-400">({activeDivisionStandings.length} clubs ranked)</span>
              </h3>
            </div>

            <div className="w-full max-w-5xl border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-4 font-black tracking-widest text-xs uppercase w-16">Rank</th>
                    <th className="p-4 font-black tracking-widest text-xs uppercase">Club / State</th>
                    <th className="p-4 font-black tracking-widest text-xs uppercase text-center text-yellow-400 w-24">Gold</th>
                    <th className="p-4 font-black tracking-widest text-xs uppercase text-center text-slate-300 w-24">Silver</th>
                    <th className="p-4 font-black tracking-widest text-xs uppercase text-center text-amber-600 w-24">Bronze</th>
                    <th className="p-4 font-black tracking-widest text-xs uppercase text-center bg-blue-600 w-32">Total Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeDivisionStandings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-500">
                         {isLoading ? "Calculating team scores..." : `No clubs found with medals in ${selectedDivision === 'all' ? 'this tournament' : selectedDivision}.`}
                      </td>
                    </tr>
                  ) : activeDivisionStandings.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm",
                          i === 0 ? "bg-yellow-400 text-yellow-900 shadow-xs" :
                          i === 1 ? "bg-slate-300 text-slate-800" :
                          i === 2 ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600"
                        )}>
                          {i + 1}
                        </div>
                      </td>
                      <td className="p-4 font-bold text-blue-900 text-base flex items-center gap-3">
                        <Building2 size={18} className="text-slate-400 shrink-0" />
                        <span className="uppercase">{c.club || 'Unknown Club'}</span>
                        {i === 0 && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-200">
                            <Crown size={10} className="text-amber-600" /> Champion
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-black text-center text-base">{c.gold}</td>
                      <td className="p-4 font-black text-center text-base">{c.silver}</td>
                      <td className="p-4 font-black text-center text-base">{c.bronze}</td>
                      <td className="p-4 font-black text-center text-lg text-blue-700 bg-blue-50/60">{c.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-8 text-xs text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-5xl w-full">
              <strong>WT Calculation Rules Applied:</strong> Teams are ranked by Total Points (Gold: 7 pts, Silver: 3 pts, Bronze: 1 pt). If there is a tie in points, the team with the most Gold medals wins, followed by Silver, then Bronze.
            </p>
          </div>
        )}

        {activeTab === 'total-overall' && (
          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Total Overall Standing Compiler</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Upload multiple medal standings CSV files with headers: <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">Club / State</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">Gold Medals</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">Silver Medals</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">Bronze Medals</code> to aggregate and compile team scores.
                </p>
              </div>
              {uploadedFiles.length > 0 && (
                <button
                  onClick={clearAllFiles}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl flex items-center gap-2 text-sm transition-all shadow-sm border border-red-200"
                >
                  <Trash2 size={16} />
                  Clear All Files
                </button>
              )}
            </div>

            {/* QUICK IMPORT CURRENT EVENT STANDINGS */}
            <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-black uppercase text-slate-500 tracking-wider block">Direct Event Source</span>
                  <span className="text-sm font-bold text-slate-800">Quick-compile calculated standings directly from current event:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addDisciplineStandingsToTotalOverall('kyorugi')}
                    disabled={kyorugiCategoryCount === 0}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Swords size={14} />
                    <span>+ Add All Kyorugi ({kyorugiCategoryCount} cats)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addDisciplineStandingsToTotalOverall('poomsae')}
                    disabled={poomsaeCategoryCount === 0}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Sparkles size={14} />
                    <span>+ Add All Poomsae ({poomsaeCategoryCount} cats)</span>
                  </button>
                </div>
              </div>

              {availableDivisions.length > 0 && (
                <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <Filter size={12} className="text-slate-400" /> Add Single Division ({discipline === 'kyorugi' ? 'Kyorugi' : 'Poomsae'}):
                  </span>
                  {availableDivisions.map(div => {
                    const count = (divisionStandingsMap[div] || []).length;
                    return (
                      <button
                        key={div}
                        type="button"
                        onClick={() => addDivisionStandingsToTotalOverall(discipline, div)}
                        disabled={count === 0}
                        className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center gap-1 disabled:opacity-50"
                      >
                        <span>+ {div}</span>
                        <span className="text-[10px] text-slate-400">({count} clubs)</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* DRAG AND DROP ZONE */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all min-h-[160px]",
                dragActive 
                  ? "border-blue-500 bg-blue-50/50" 
                  : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
              )}
              onClick={() => document.getElementById('csv-multi-upload')?.click()}
            >
              <input
                id="csv-multi-upload"
                type="file"
                accept=".csv"
                multiple
                className="hidden"
                onChange={handleCSVFilesSelect}
              />
              <Upload size={36} className="text-slate-400 mb-3 animate-bounce" />
              <p className="text-sm font-bold text-slate-700">
                Drag and drop your medal standing CSV files here, or <span className="text-blue-600 hover:underline">browse files</span>
              </p>
              <p className="text-xs text-slate-400 mt-1.5">
                Supports multiple CSV files selection. Ensure headers are correctly present.
              </p>
            </div>

            {/* LIST OF UPLOADED FILES */}
            {uploadedFiles.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-slate-500" />
                  Uploaded CSV Files ({uploadedFiles.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uploadedFiles.map((file, idx) => (
                    <div 
                      key={idx} 
                      className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm hover:shadow transition-all"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="font-bold text-slate-800 text-sm truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatFileSize(file.size)} • <strong className="text-blue-600">{file.rowCount}</strong> rows compiled
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeUploadedFile(file.name);
                        }}
                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        title="Remove file"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* COMPILED SUMMARY CARDS */}
            {compiledStandings.length > 0 && (
              <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-500 font-medium">Clubs / States</span>
                    <Building2 className="text-slate-400" size={18} />
                  </div>
                  <p className="text-3xl font-black text-slate-800">{compiledSummary.clubsCount}</p>
                </div>
                <div className="bg-yellow-50/50 border border-yellow-200/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-yellow-700 font-medium">Total Gold Medals</span>
                    <Medal className="text-yellow-500" size={18} />
                  </div>
                  <p className="text-3xl font-black text-yellow-700">{compiledSummary.golds}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-600 font-medium">Total Silver Medals</span>
                    <Medal className="text-slate-400" size={18} />
                  </div>
                  <p className="text-3xl font-black text-slate-600">{compiledSummary.silvers}</p>
                </div>
                <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-amber-800 font-medium">Total Bronze Medals</span>
                    <Medal className="text-amber-600" size={18} />
                  </div>
                  <p className="text-3xl font-black text-amber-800">{compiledSummary.bronzes}</p>
                </div>
              </div>
            )}

            {/* COMPILED STANDINGS TABLE */}
            {compiledStandings.length > 0 ? (
              <div className="mt-8 flex flex-col items-center">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 w-full max-w-4xl">
                  {/* SEARCH BAR */}
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search compiled clubs..."
                      value={totalOverallSearch}
                      onChange={(e) => setTotalOverallSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>

                  <button
                    onClick={downloadCompiledStandings}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 text-sm transition-all shadow-sm"
                  >
                    <Download size={16} />
                    Download Compiled Standings
                  </button>
                </div>

                <div className="w-full max-w-4xl border border-slate-200 rounded-xl overflow-hidden self-center">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="p-4 font-black tracking-widest text-sm uppercase">Rank</th>
                        <th className="p-4 font-black tracking-widest text-sm uppercase">Club / State</th>
                        <th className="p-4 font-black tracking-widest text-sm uppercase text-center text-yellow-400">Gold</th>
                        <th className="p-4 font-black tracking-widest text-sm uppercase text-center text-slate-300">Silver</th>
                        <th className="p-4 font-black tracking-widest text-sm uppercase text-center text-amber-600">Bronze</th>
                        <th className="p-4 font-black tracking-widest text-sm uppercase text-center bg-blue-600">Total Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCompiledStandings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500">
                            No match found for "{totalOverallSearch}" in compiled standings.
                          </td>
                        </tr>
                      ) : filteredCompiledStandings.map((c, i) => {
                        // Find rank based on compiledStandings arrays index to handle correct indexing during filter
                        const originalRank = compiledStandings.findIndex(item => item.club === c.club) + 1;
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-4">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm",
                                originalRank === 1 ? "bg-yellow-400 text-yellow-900" :
                                originalRank === 2 ? "bg-slate-300 text-slate-800" :
                                originalRank === 3 ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600"
                              )}>
                                {originalRank}
                              </div>
                            </td>
                            <td className="p-4 font-bold text-blue-900 text-lg flex items-center gap-3">
                              <Building2 size={20} className="text-slate-400" />
                              {c.club || 'Unknown Club'}
                            </td>
                            <td className="p-4 font-black text-center text-lg">{c.gold}</td>
                            <td className="p-4 font-black text-center text-lg">{c.silver}</td>
                            <td className="p-4 font-black text-center text-lg">{c.bronze}</td>
                            <td className="p-4 font-black text-center text-xl text-blue-700 bg-blue-50/50">{c.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="mt-8 text-sm text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-4xl w-full">
                  <strong>Standard WT Points Model Applied:</strong> Compiled scores are calculated by summing medals across all uploaded CSV data inputs. WT Classification ranks teams by total aggregated points (Gold Medal counts for 7 points, Silver counts for 3 points, Bronze counts for 1 point). Ties are broken by Gold count, followed by Silver count, and then Bronze count.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center mt-6 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                <FileSpreadsheet size={48} className="text-slate-300 stroke-[1.5] mb-3" />
                <h4 className="text-slate-700 font-bold mb-1">No standings uploaded yet</h4>
                <p className="text-sm text-slate-500 max-w-md">
                  Upload one or more CSV files containing club medal positions to compile and calculate overall results.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'players' && (
          <div className="p-6">
            {/* Header with Title and Actions */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl shadow-xs">
                  <Users size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <span>Tournament Player Summary by Club</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {totalUniquePlayers} Athletes Registered
                    </span>
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Aggregated total unique players and category entries per club/state across Kyorugi (Sparring) and Poomsae (Pattern).
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={downloadClubPlayerSummaryCSV}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 text-xs transition-all shadow-sm"
                  title="Export summary table of clubs and player counts"
                >
                  <Download size={15} />
                  <span>Club Summary CSV</span>
                </button>
                <button
                  type="button"
                  onClick={downloadFullRosterCSV}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl flex items-center gap-2 text-xs transition-all border border-slate-200 shadow-2xs"
                  title="Export complete list of all athletes with categories and bouts"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" />
                  <span>Full Roster CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintSummary}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 text-xs transition-all"
                  title="Print this report"
                >
                  <Printer size={15} />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {/* KPI STATS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={13} className="text-slate-400" />
                  <span>Total Clubs</span>
                </div>
                <div className="text-2xl font-black text-slate-800 mt-1">
                  {clubSummaries.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Participating teams</div>
              </div>

              <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80">
                <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={13} className="text-emerald-600" />
                  <span>Total Players</span>
                </div>
                <div className="text-2xl font-black text-emerald-800 mt-1">
                  {totalUniquePlayers}
                </div>
                <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Unique athletes</div>
              </div>

              <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200/80">
                <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Swords size={13} className="text-blue-600" />
                  <span>Kyorugi</span>
                </div>
                <div className="text-2xl font-black text-blue-800 mt-1">
                  {totalKyorugiPlayers}
                </div>
                <div className="text-[11px] text-blue-600 font-medium mt-0.5">Sparring athletes</div>
              </div>

              <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80">
                <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-600" />
                  <span>Poomsae</span>
                </div>
                <div className="text-2xl font-black text-amber-800 mt-1">
                  {totalPoomsaePlayers}
                </div>
                <div className="text-[11px] text-amber-600 font-medium mt-0.5">Pattern athletes</div>
              </div>

              <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200/80">
                <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck size={13} className="text-purple-600" />
                  <span>Dual Discipline</span>
                </div>
                <div className="text-2xl font-black text-purple-800 mt-1">
                  {totalDualPlayers}
                </div>
                <div className="text-[11px] text-purple-600 font-medium mt-0.5">Kyorugi + Poomsae</div>
              </div>

              <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={13} className="text-slate-400" />
                  <span>Avg Squad</span>
                </div>
                <div className="text-2xl font-black text-slate-800 mt-1">
                  {clubSummaries.length > 0 ? (totalUniquePlayers / clubSummaries.length).toFixed(1) : '0'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Athletes / club</div>
              </div>
            </div>

            {/* FILTER AND SEARCH CONTROLS */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 mb-6 space-y-3">
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    placeholder="Search club name or athlete name..."
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
                  />
                  {playerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setPlayerSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Quick Expand / Collapse All */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAllClubs}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center gap-1"
                  >
                    <ChevronDown size={14} />
                    <span>Expand All Rosters</span>
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllClubs}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center gap-1"
                  >
                    <ChevronUp size={14} />
                    <span>Collapse All</span>
                  </button>
                </div>
              </div>

              {/* Second Row: Filters and Sorting */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70">
                {/* Discipline Filter */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setPlayerDisciplineFilter('all')}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                      playerDisciplineFilter === 'all'
                        ? "bg-slate-800 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    All Disciplines ({totalUniquePlayers})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerDisciplineFilter('kyorugi')}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                      playerDisciplineFilter === 'kyorugi'
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Swords size={12} />
                    <span>Kyorugi Only ({totalKyorugiPlayers})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerDisciplineFilter('poomsae')}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                      playerDisciplineFilter === 'poomsae'
                        ? "bg-amber-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Sparkles size={12} />
                    <span>Poomsae Only ({totalPoomsaePlayers})</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Division Filter */}
                  {allDivisionsList.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-500">Division:</span>
                      <select
                        value={playerDivisionFilter}
                        onChange={(e) => setPlayerDivisionFilter(e.target.value)}
                        className="bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
                      >
                        <option value="all">All Divisions</option>
                        {allDivisionsList.map(div => (
                          <option key={div} value={div}>{div}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Sort By Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <ArrowUpDown size={12} />
                      <span>Sort:</span>
                    </span>
                    <select
                      value={playerSortBy}
                      onChange={(e) => setPlayerSortBy(e.target.value as any)}
                      className="bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
                    >
                      <option value="players-desc">Most Players First</option>
                      <option value="players-asc">Least Players First</option>
                      <option value="entries-desc">Most Category Entries</option>
                      <option value="name-asc">Club Name (A to Z)</option>
                      <option value="name-desc">Club Name (Z to A)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* RESULTS COUNT & FILTER SUMMARY */}
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3 px-1">
              <div>
                Showing <strong className="text-slate-800">{filteredAndSortedClubSummaries.length}</strong> of <strong className="text-slate-800">{clubSummaries.length}</strong> clubs
                {(playerDisciplineFilter !== 'all' || playerDivisionFilter !== 'all' || playerSearchQuery) && (
                  <span className="ml-1 text-emerald-700 font-semibold">(filtered)</span>
                )}
              </div>
              {(playerDisciplineFilter !== 'all' || playerDivisionFilter !== 'all' || playerSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setPlayerSearchQuery('');
                    setPlayerDisciplineFilter('all');
                    setPlayerDivisionFilter('all');
                  }}
                  className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline"
                >
                  Reset all filters
                </button>
              )}
            </div>

            {/* CLUBS PLAYER SUMMARY TABLE */}
            {filteredAndSortedClubSummaries.length > 0 ? (
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-black text-xs uppercase tracking-wider">
                        <th className="py-3.5 px-4 w-12 text-center">#</th>
                        <th className="py-3.5 px-4">Club / State Name</th>
                        <th className="py-3.5 px-4 text-center">Total Players</th>
                        <th className="py-3.5 px-4 text-center">Kyorugi</th>
                        <th className="py-3.5 px-4 text-center">Poomsae</th>
                        <th className="py-3.5 px-4 text-center">Dual</th>
                        <th className="py-3.5 px-4 text-center">Entries</th>
                        <th className="py-3.5 px-4">Divisions Breakdown</th>
                        <th className="py-3.5 px-4 text-right">Roster</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAndSortedClubSummaries.map((club, index) => {
                        const isExpanded = !!expandedClubs[club.club];
                        return (
                          <React.Fragment key={club.club}>
                            <tr
                              className={cn(
                                "transition-colors cursor-pointer group",
                                isExpanded ? "bg-emerald-50/30" : "hover:bg-slate-50/80"
                              )}
                              onClick={() => toggleClubExpanded(club.club)}
                            >
                              <td className="py-3.5 px-4 text-center font-bold text-slate-400">
                                <span className={cn(
                                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black",
                                  index === 0 ? "bg-amber-100 text-amber-800" :
                                  index === 1 ? "bg-slate-200 text-slate-800" :
                                  index === 2 ? "bg-amber-50 text-amber-900 border border-amber-300" :
                                  "text-slate-500"
                                )}>
                                  {index + 1}
                                </span>
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleClubExpanded(club.club);
                                    }}
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
                                  >
                                    {isExpanded ? <ChevronDown size={16} className="text-emerald-600" /> : <ChevronRight size={16} />}
                                  </button>
                                  <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                                    <Building2 size={16} />
                                  </div>
                                  <div>
                                    <span className="font-extrabold text-slate-900 text-sm group-hover:text-emerald-800 transition-colors">
                                      {club.club}
                                    </span>
                                    <div className="text-[11px] text-slate-400">
                                      {club.filteredPlayerCount} {club.filteredPlayerCount === 1 ? 'athlete' : 'athletes'}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <span className="inline-flex items-center px-3 py-1 rounded-xl font-black text-sm bg-emerald-100 text-emerald-800 border border-emerald-200/80">
                                  {club.filteredPlayerCount}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold",
                                  club.kyorugiPlayersCount > 0 ? "bg-blue-50 text-blue-700 border border-blue-200" : "text-slate-300"
                                )}>
                                  <Swords size={11} className={club.kyorugiPlayersCount > 0 ? "text-blue-500" : "opacity-30"} />
                                  <span>{club.kyorugiPlayersCount}</span>
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold",
                                  club.poomsaePlayersCount > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "text-slate-300"
                                )}>
                                  <Sparkles size={11} className={club.poomsaePlayersCount > 0 ? "text-amber-500" : "opacity-30"} />
                                  <span>{club.poomsaePlayersCount}</span>
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                {club.bothDisciplinesCount > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                    {club.bothDisciplinesCount}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-xs">-</span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                                <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs">
                                  {club.totalEntries}
                                </span>
                              </td>

                              <td className="py-3.5 px-4">
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {Object.entries(club.divisionsBreakdown).map(([div, cnt]) => (
                                    <span
                                      key={div}
                                      className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold border border-slate-200"
                                    >
                                      {div}: <span className="text-slate-900 font-black">{cnt}</span>
                                    </span>
                                  ))}
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedClubModal(club);
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 rounded-lg border border-slate-200 hover:border-emerald-300 transition-colors shadow-2xs"
                                >
                                  View Roster
                                </button>
                              </td>
                            </tr>

                            {/* EXPANDABLE CLUB ROSTER ROW */}
                            {isExpanded && (
                              <tr className="bg-slate-50/70">
                                <td colSpan={9} className="py-4 px-6 border-y border-slate-200/80">
                                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                                      <div className="flex items-center gap-2">
                                        <Users size={16} className="text-emerald-600" />
                                        <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                                          Athlete Roster — {club.club} ({club.filteredPlayers.length} {club.filteredPlayers.length === 1 ? 'Player' : 'Players'})
                                        </h4>
                                      </div>
                                      <div className="text-xs text-slate-400">
                                        Click "View Roster" for focused athlete cards or print preview
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                      {club.filteredPlayers.map((player, pIdx) => (
                                        <div
                                          key={`${player.normalizedName}_${pIdx}`}
                                          className="p-3 bg-slate-50/80 hover:bg-white rounded-xl border border-slate-200/70 hover:border-emerald-300 transition-all flex flex-col justify-between"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <span className="text-[11px] font-bold text-slate-400 w-5">
                                                #{pIdx + 1}
                                              </span>
                                              <span className="font-extrabold text-slate-800 text-xs">
                                                {player.name}
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                              {player.disciplines.includes('Kyorugi') && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800">
                                                  K
                                                </span>
                                              )}
                                              {player.disciplines.includes('Poomsae') && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800">
                                                  P
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <div className="mt-2 pt-2 border-t border-slate-200/50 space-y-1">
                                            <div className="text-[11px] text-slate-600 font-medium">
                                              {player.categories.length > 0 ? (
                                                player.categories.map((c, i) => (
                                                  <span key={i} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 bg-white text-slate-700 rounded border border-slate-200 text-[10px] font-semibold">
                                                    {c}
                                                  </span>
                                                ))
                                              ) : (
                                                <span className="text-slate-400 text-[10px]">Registered Squad</span>
                                              )}
                                            </div>

                                            {player.bouts.length > 0 && (
                                              <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-0.5">
                                                <span className="font-bold text-slate-500">Bouts:</span>
                                                <span className="font-semibold text-slate-600">{player.bouts.join(', ')}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center mt-4 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                <Users size={44} className="text-slate-300 stroke-[1.5] mb-2" />
                <h4 className="text-slate-700 font-bold mb-1">No clubs or players match your filter</h4>
                <p className="text-xs text-slate-500 max-w-md mb-4">
                  Try clearing your search query or adjusting the discipline/division filters to view more clubs.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPlayerSearchQuery('');
                    setPlayerDisciplineFilter('all');
                    setPlayerDivisionFilter('all');
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CLUB FULL ROSTER DETAIL MODAL */}
      {selectedClubModal && (
        <div id="club-roster-modal-overlay" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="club-roster-modal-container" className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Building2 size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                    <span>{selectedClubModal.club}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {selectedClubModal.players.length} Athletes
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span>Kyorugi: <strong className="text-blue-700">{selectedClubModal.kyorugiPlayersCount}</strong></span>
                    <span>•</span>
                    <span>Poomsae: <strong className="text-amber-700">{selectedClubModal.poomsaePlayersCount}</strong></span>
                    <span>•</span>
                    <span>Total Entries: <strong className="text-slate-800">{selectedClubModal.totalEntries}</strong></span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClubModal(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: Roster Table */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Athlete Name</th>
                      <th className="py-2.5 px-3">Discipline</th>
                      <th className="py-2.5 px-3">Category / Event</th>
                      <th className="py-2.5 px-3">Division</th>
                      <th className="py-2.5 px-3 text-center">Bouts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedClubModal.players.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-extrabold text-slate-900">{p.name}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1">
                            {p.disciplines.map(d => (
                              <span
                                key={d}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-bold",
                                  d === 'Kyorugi' ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                                )}
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">
                          {p.categories.join('; ') || 'General Roster'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-semibold">
                          {p.divisions.join(', ') || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                          {p.bouts.length > 0 ? p.bouts.join(', ') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Official Roster Record for {selectedClubModal.club}
              </span>
              <button
                type="button"
                onClick={() => setSelectedClubModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
              >
                Close Roster
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN PLACINGS EDIT MODAL */}
      {editingCategory && (
        <div id="placings-edit-modal-overlay" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="placings-edit-modal-container" className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">Edit Category Placings</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-extrabold text-blue-900 text-xs">{editingCategory.category}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {discipline === 'kyorugi' ? 'Kyorugi' : 'Poomsae'} • {getCategoryDivision(editingCategory.category)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-placings-modal"
                onClick={() => setEditingCategory(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              <p className="text-xs text-slate-500 bg-blue-50 border border-blue-200 p-3 rounded-xl leading-relaxed">
                <strong>Tournament Report Placings:</strong> You can manually update the athlete names and select their club affiliation from the registered clubs list. These adjustments will update category placings, overall winner tables, and club standings points across the report.
              </p>

              {/* 1st Place (Gold) */}
              <div className="p-4 bg-yellow-50/60 rounded-xl border border-yellow-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs uppercase tracking-wider text-yellow-900 flex items-center gap-1.5">
                    <Medal size={16} className="text-yellow-600" />
                    1st Place (Gold Medalist)
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomClubModes(prev => ({ ...prev, gold: !prev.gold }))}
                    className="text-[11px] font-bold text-yellow-900/80 hover:text-yellow-950 underline"
                  >
                    {customClubModes.gold ? "Select from list" : "+ Enter new club"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Athlete Name</label>
                    <input
                      type="text"
                      id="input-placings-gold-name"
                      placeholder="e.g. John Doe"
                      value={editForm.goldName}
                      onChange={(e) => setEditForm(prev => ({ ...prev, goldName: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Club Affiliation</label>
                    {customClubModes.gold ? (
                      <input
                        type="text"
                        id="input-placings-gold-club-custom"
                        placeholder="Type new club name..."
                        value={editForm.goldClub}
                        onChange={(e) => setEditForm(prev => ({ ...prev, goldClub: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    ) : (
                      <select
                        id="select-placings-gold-club"
                        value={editForm.goldClub}
                        onChange={(e) => setEditForm(prev => ({ ...prev, goldClub: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      >
                        <option value="">-- Select Club from List --</option>
                        {availableClubs.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        {editForm.goldClub && !availableClubs.includes(editForm.goldClub) && (
                          <option value={editForm.goldClub}>{editForm.goldClub} (Custom)</option>
                        )}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* 2nd Place (Silver) */}
              <div className="p-4 bg-slate-100/70 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Medal size={16} className="text-slate-400" />
                    2nd Place (Silver Medalist)
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomClubModes(prev => ({ ...prev, silver: !prev.silver }))}
                    className="text-[11px] font-bold text-slate-600 hover:text-slate-800 underline"
                  >
                    {customClubModes.silver ? "Select from list" : "+ Enter new club"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Athlete Name</label>
                    <input
                      type="text"
                      id="input-placings-silver-name"
                      placeholder="e.g. Jane Smith"
                      value={editForm.silverName}
                      onChange={(e) => setEditForm(prev => ({ ...prev, silverName: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Club Affiliation</label>
                    {customClubModes.silver ? (
                      <input
                        type="text"
                        id="input-placings-silver-club-custom"
                        placeholder="Type new club name..."
                        value={editForm.silverClub}
                        onChange={(e) => setEditForm(prev => ({ ...prev, silverClub: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                      />
                    ) : (
                      <select
                        id="select-placings-silver-club"
                        value={editForm.silverClub}
                        onChange={(e) => setEditForm(prev => ({ ...prev, silverClub: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                      >
                        <option value="">-- Select Club from List --</option>
                        {availableClubs.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        {editForm.silverClub && !availableClubs.includes(editForm.silverClub) && (
                          <option value={editForm.silverClub}>{editForm.silverClub} (Custom)</option>
                        )}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* 3rd & 4th Place (Bronzes / Playoff) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <Medal size={16} className="text-amber-600" />
                    3rd & 4th Place Placings
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm(prev => ({
                        ...prev,
                        bronzes: [
                          ...prev.bronzes,
                          { place: placementOption === 'b' && prev.bronzes.length >= 1 ? '4th' : '3rd', name: '', club: '' }
                        ]
                      }));
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                  >
                    <Plus size={14} /> Add Place Entry
                  </button>
                </div>

                {editForm.bronzes.map((bronzeItem, bIdx) => {
                  const bronzeKey = `bronze_${bIdx}`;
                  return (
                    <div key={bIdx} className="p-4 bg-amber-50/50 rounded-xl border border-amber-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <select
                            value={bronzeItem.place}
                            onChange={(e) => {
                              const newBronzes = [...editForm.bronzes];
                              newBronzes[bIdx].place = e.target.value as '3rd' | '4th';
                              setEditForm(prev => ({ ...prev, bronzes: newBronzes }));
                            }}
                            className="text-xs font-bold px-2 py-1 bg-white border border-amber-300 rounded text-amber-900 focus:outline-none"
                          >
                            <option value="3rd">3rd Place (Bronze)</option>
                            <option value="4th">4th Place (Playoff)</option>
                          </select>
                          <span className="text-[11px] text-slate-500 font-semibold">Entry #{bIdx + 1}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setCustomClubModes(prev => ({ ...prev, [bronzeKey]: !prev[bronzeKey] }))}
                            className="text-[11px] font-bold text-amber-900/80 hover:text-amber-950 underline"
                          >
                            {customClubModes[bronzeKey] ? "Select from list" : "+ Enter new club"}
                          </button>
                          {editForm.bronzes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditForm(prev => ({
                                  ...prev,
                                  bronzes: prev.bronzes.filter((_, idx) => idx !== bIdx)
                                }));
                              }}
                              className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                              title="Remove entry"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Athlete Name</label>
                          <input
                            type="text"
                            id={`input-placings-bronze-${bIdx}-name`}
                            placeholder="e.g. Athlete Name"
                            value={bronzeItem.name}
                            onChange={(e) => {
                              const newBronzes = [...editForm.bronzes];
                              newBronzes[bIdx].name = e.target.value;
                              setEditForm(prev => ({ ...prev, bronzes: newBronzes }));
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Club Affiliation</label>
                          {customClubModes[bronzeKey] ? (
                            <input
                              type="text"
                              id={`input-placings-bronze-${bIdx}-club-custom`}
                              placeholder="Type new club name..."
                              value={bronzeItem.club}
                              onChange={(e) => {
                                const newBronzes = [...editForm.bronzes];
                                newBronzes[bIdx].club = e.target.value;
                                setEditForm(prev => ({ ...prev, bronzes: newBronzes }));
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          ) : (
                            <select
                              id={`select-placings-bronze-${bIdx}-club`}
                              value={bronzeItem.club}
                              onChange={(e) => {
                                const newBronzes = [...editForm.bronzes];
                                newBronzes[bIdx].club = e.target.value;
                                setEditForm(prev => ({ ...prev, bronzes: newBronzes }));
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            >
                              <option value="">-- Select Club from List --</option>
                              {availableClubs.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                              {bronzeItem.club && !availableClubs.includes(bronzeItem.club) && (
                                <option value={bronzeItem.club}>{bronzeItem.club} (Custom)</option>
                              )}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                {editingCategory.isCustomEdited && (
                  <button
                    type="button"
                    id="btn-reset-placings-bracket"
                    onClick={() => {
                      handleResetCategory(editingCategory.category);
                      setEditingCategory(null);
                    }}
                    className="px-3.5 py-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                  >
                    <RotateCcw size={14} />
                    Reset to Bracket Calculation
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-cancel-placings-modal"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-save-placings-modal"
                  onClick={handleSaveEditPlacings}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-sm inline-flex items-center gap-1.5"
                >
                  <Check size={16} />
                  Save Placings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
