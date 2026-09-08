import React, { useState, useEffect, useMemo } from 'react';
import { EventData, MatchHistoryItem } from '../types';
import { Download, RefreshCw, Trophy, Medal, Building2, Search, Upload, Trash2, FileSpreadsheet, X, Plus, Swords, Sparkles, Crown, Award, Filter, User } from 'lucide-react';
import Papa from 'papaparse';
import { getBoutNumber, isBoutMatch, cn, isPoomsaeCategory, isPlayoffBout } from '../lib/utils';

interface EventReportProps {
  currentEventId: string | null;
  events: EventData[];
  matchHistory?: MatchHistoryItem[];
  backupData?: Record<string, { mappings: any[], matches: any[] }>;
}

interface RawMatch {
  event: string;
  category: string;
  matchNoStr: string;
  matchNo: number;
  blueName: string;
  blueClub: string;
  redName: string;
  redClub: string;
  winner: string;
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
  if (cat.includes('SUPER CADET') || cat.includes('SUPER-CADET') || cat.includes('SUPER_CADET')) return 'Super Cadet';
  if (cat.includes('SUPER JUNIOR') || cat.includes('SUPER-JUNIOR') || cat.includes('SUPER_JUNIOR')) return 'Super Junior';
  if (cat.includes('CADET') || cat.includes('12 - 14') || cat.includes('12-14') || cat.includes('BELOW 33KG')) return 'Cadet';
  if (cat.includes('JUNIOR') || cat.includes('15 - 17') || cat.includes('15-17')) return 'Junior';
  if (cat.includes('SENIOR') || cat.includes('OPEN') || cat.includes('18+') || cat.includes('18 - 35')) return 'Senior';
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
      winnerClub: m.blueClub,
      loserName: isValidAthlete(m.redName) ? m.redName : '',
      loserClub: isValidAthlete(m.redName) ? m.redClub : '',
      isCompleted: true
    };
  } else if (isRedWin && !isBlueWin) {
    return {
      winnerName: m.redName,
      winnerClub: m.redClub,
      loserName: isValidAthlete(m.blueName) ? m.blueName : '',
      loserClub: isValidAthlete(m.blueName) ? m.blueClub : '',
      isCompleted: true
    };
  } else {
    if (namesMatch(winnerRaw, m.blueName)) {
      return {
        winnerName: m.blueName,
        winnerClub: m.blueClub,
        loserName: isValidAthlete(m.redName) ? m.redName : '',
        loserClub: isValidAthlete(m.redName) ? m.redClub : '',
        isCompleted: true
      };
    } else if (namesMatch(winnerRaw, m.redName)) {
      return {
        winnerName: m.redName,
        winnerClub: m.redClub,
        loserName: isValidAthlete(m.blueName) ? m.blueName : '',
        loserClub: isValidAthlete(m.blueName) ? m.blueClub : '',
        isCompleted: true
      };
    } else {
      const isRedLoser = m.blueName && namesMatch(m.blueName, winnerRaw);
      const isBlueLoser = m.redName && namesMatch(m.redName, winnerRaw);
      return {
        winnerName: winnerRaw,
        winnerClub: m.blueClub || m.redClub,
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

export function EventReport({ currentEventId, events, matchHistory = [], backupData = {} }: EventReportProps) {
  const [activeTab, setActiveTab] = useState<'winners' | 'by-rank' | 'summary' | 'total-overall'>('winners');
  const [discipline, setDiscipline] = useState<'kyorugi' | 'poomsae'>('kyorugi');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<RawMatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState<'all' | 'name' | 'club' | 'category'>('all');
  // Category division filter: 'all' or specific division like 'Cadet', 'Junior', 'Senior', 'Super Cadet'
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  
  // Option A (Joint 3rd Place) vs Option B (3rd Place Playoff)
  const [placementOption, setPlacementOption] = useState<'a' | 'b'>('b');
  
  // Feature: Option to combine multiple events
  const [includeAllEvents, setIncludeAllEvents] = useState(false);

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
    setIsLoading(true);
    setError(null);
    try {
      let combinedMatches: RawMatch[] = [];

      // 1. Try to load matches from local bracket record / backupData in the app first
      if (backupData && Object.keys(backupData).length > 0) {
        const targetIds = includeAllEvents 
          ? events.map(e => e.id)
          : (currentEventId ? [currentEventId] : []);
          
        targetIds.forEach(evId => {
          const evName = events.find(e => e.id === evId)?.name || '';
          Object.keys(backupData).forEach(key => {
            if (key.startsWith(`${evId}_`)) {
              const dataRing = backupData[key];
              if (dataRing && Array.isArray(dataRing.matches)) {
                dataRing.matches.forEach(m => {
                  const hist = (matchHistory || []).find(h => 
                    h.eventId === evId && 
                    isBoutMatch(h.bout, m.bout)
                  );
                  const winnerName = (hist && hist.winner) ? hist.winner : (m.winner || '');
                  
                  const exists = combinedMatches.some(ex => 
                    ex.category === m.category && 
                    isBoutMatch(ex.matchNoStr, m.bout)
                  );
                  
                  if (!exists) {
                    combinedMatches.push({
                      event: evName,
                      category: m.category,
                      matchNoStr: m.bout.toString(),
                      matchNo: getBoutNumber(m.bout.toString()),
                      blueName: m.blue_name,
                      blueClub: m.blue_club,
                      redName: m.red_name,
                      redClub: m.red_club,
                      winner: winnerName,
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

      // 2. If no matches were loaded from internal bracket records, fall back to Google Sheets
      if (combinedMatches.length === 0) {
        const getValidUrl = (e: EventData) => {
          const defaultUrl = 'https://docs.google.com/spreadsheets/d/14TrlxR_rk9S7WmdanXGLlE4Y-ry9TqY6_B6HYA0Uuus/edit?usp=sharing';
          if (e.winnerSheetUrl && e.winnerSheetUrl.includes('docs.google.com/spreadsheets')) return e.winnerSheetUrl;
          if (e.sheetUrl && e.sheetUrl.includes('docs.google.com/spreadsheets')) return e.sheetUrl;
          return defaultUrl;
        };

        const targetEvents = includeAllEvents 
          ? events.filter(e => getValidUrl(e) !== null)
          : events.filter(e => e.id === currentEventId && getValidUrl(e) !== null);

        if (targetEvents.length > 0) {
          for (const event of targetEvents) {
            let activeUrl = getValidUrl(event)!;
            if (!activeUrl.includes('/export?')) {
              activeUrl = activeUrl.replace(/\/edit.*$/, '') + '/export?format=csv';
            }

            const response = await fetch(activeUrl);
            if (!response.ok) {
               console.warn(`Failed to fetch data for event: ${event.name}`);
               continue; // Skip if one fails, to at least get the others
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
                  
                  for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length >= 10 && row[2] && row[3]) { 
                      const sheetEventName = row[1] || '';
                      if (sheetEventName.trim().toLowerCase() !== event.name.trim().toLowerCase()) {
                         continue; 
                      }

                      const matchNoStr = row[3] || '';
                      const winner = row[9] || '';
                      const category = row[4] || '';
                      const blueName = row[5] || '';
                      const blueClub = row[6] || '';
                      const redName = row[7] || '';
                      const redClub = row[8] || '';
                      const r1Blue = row.length > 10 && row[10] ? parseFloat(row[10]) : undefined;
                      const r1Red = row.length > 11 && row[11] ? parseFloat(row[11]) : undefined;

                      // Override winner if completed in matchHistory local app state
                      const hist = (matchHistory || []).find(h => 
                        h.eventId === event.id && 
                        isBoutMatch(h.bout, matchNoStr)
                      );
                      const winnerName = hist ? hist.winner : winner;
                      const finalR1Blue = hist && hist.points?.r1Blue ? parseFloat(hist.points.r1Blue) : r1Blue;
                      const finalR1Red = hist && hist.points?.r1Red ? parseFloat(hist.points.r1Red) : r1Red;

                      const combinedItem = {
                        event: sheetEventName,
                        category,
                        matchNoStr,
                        matchNo: getBoutNumber(matchNoStr),
                        blueName: blueName.trim(),
                        blueClub: blueClub.trim(),
                        redName: redName.trim(),
                        redClub: redClub.trim(),
                        winner: winnerName.trim(),
                        r1Blue: finalR1Blue,
                        r1Red: finalR1Red
                      };

                      const existingIdx = combinedMatches.findIndex(m => 
                        m.event.trim().toLowerCase() === sheetEventName.trim().toLowerCase() && 
                        isBoutMatch(m.matchNoStr, matchNoStr)
                      );
                      if (existingIdx !== -1) {
                        combinedMatches[existingIdx] = combinedItem;
                      } else {
                        combinedMatches.push(combinedItem);
                      }
                    }
                  }
                  resolve();
                },
                error: (err) => {
                  console.warn(`Parse error on event ${event.name}: ${err.message}`);
                  resolve();
                },
                skipEmptyLines: true
              });
            });
          }
        }
      } else {
        // If loaded from backupData, make sure we run a real-time sweep over all matches 
        // to retrieve any freshly loaded or updated winners from the matchHistory
        combinedMatches = combinedMatches.map(m => {
          const matchingEventId = events.find(e => e.name === m.event)?.id || currentEventId;
          const hist = (matchHistory || []).find(h => 
            h.eventId === matchingEventId && 
            isBoutMatch(h.bout, m.matchNoStr)
          );
          return {
            ...m,
            winner: (hist && hist.winner) ? hist.winner : m.winner,
            r1Blue: hist && hist.points?.r1Blue ? parseFloat(hist.points.r1Blue) : m.r1Blue,
            r1Red: hist && hist.points?.r1Red ? parseFloat(hist.points.r1Red) : m.r1Red
          };
        });
      }

      setMatches(combinedMatches);
      
      if (combinedMatches.length === 0) {
          setError("No matches parsed successfully. Please check the sheet structures or upload brackets using the AI Bracket Setup.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [currentEventId, includeAllEvents, matchHistory, backupData]);

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

  const categoryResults = useMemo(() => {
    return computeCategoryResults(activeMatches, placementOption);
  }, [activeMatches, placementOption]);

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
            onClick={() => setDiscipline('kyorugi')}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-wider",
              discipline === 'kyorugi'
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            <Swords size={16} className={discipline === 'kyorugi' ? "text-white" : "text-blue-500"} />
            <span>Kyorugi Report</span>
            <span className={cn(
              "px-2 py-0.5 text-xs rounded-full font-bold",
              discipline === 'kyorugi' ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-700"
            )}>
              {kyorugiCategoryCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDiscipline('poomsae')}
            className={cn(
              "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all uppercase tracking-wider",
              discipline === 'poomsae'
                ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            <Sparkles size={16} className={discipline === 'poomsae' ? "text-white" : "text-amber-500"} />
            <span>Poomsae Report</span>
            <span className={cn(
              "px-2 py-0.5 text-xs rounded-full font-bold",
              discipline === 'poomsae' ? "bg-amber-700 text-white" : "bg-slate-200 text-slate-700"
            )}>
              {poomsaeCategoryCount}
            </span>
          </button>
        </div>

        <div className="text-xs font-semibold text-slate-500 px-3.5 py-1.5 bg-white/80 rounded-xl border border-slate-200/60 flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full animate-pulse", discipline === 'kyorugi' ? "bg-blue-500" : "bg-amber-500")} />
          <span>Active Report: <strong className="text-slate-800 uppercase tracking-wide">{discipline === 'kyorugi' ? 'Kyorugi (Sparring)' : 'Poomsae (Pattern)'}</strong></span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 border-b border-slate-200 pb-px">
        <button
          onClick={() => setActiveTab('winners')}
          className={cn(
            "px-6 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative",
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
            "px-6 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative",
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
            "px-6 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative",
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
            "px-6 py-3 font-bold text-sm tracking-wide rounded-t-xl transition-all relative",
            activeTab === 'total-overall' 
              ? "text-blue-700 bg-white border border-b-0 border-slate-200" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          )}
        >
          Total Overall
          {activeTab === 'total-overall' && <div className="absolute -bottom-px left-0 right-0 h-px bg-white" />}
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
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {filteredCategories.length === 0 ? (
                     <tr>
                       <td colSpan={4} className="p-8 text-center text-slate-500">
                         {isLoading ? "Scanning bracket history..." : "No categories found for current search/division filter."}
                       </td>
                     </tr>
                   ) : filteredCategories.map((c, i) => (
                     <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                       <td className="p-4">
                         <div className="font-bold text-slate-800">{c.category}</div>
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
      </div>

    </div>
  );
}
