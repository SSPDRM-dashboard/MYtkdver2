import React, { useState, useMemo } from 'react';
import { Search, Trophy, RotateCcw, AlertTriangle, User, Hash, Sparkles, X, ChevronRight, CheckCircle2 } from 'lucide-react';
import { MatchHistoryItem, MatchData, BoutMapping } from '../types';
import { isBoutMatch, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SearchWinnerProps {
  matchHistory: MatchHistoryItem[];
  currentEventId: string | null;
  onRestoreMatch?: (match: MatchHistoryItem) => void;
  boutQueue?: { id: string; data: MatchData }[];
  backupData?: Record<string, { mappings: BoutMapping[], matches: MatchData[] }>;
}

export type SearchCriteria = 'name' | 'bout' | 'all';

interface BoutResolvedDetails {
  blueName: string;
  blueClub: string;
  redName: string;
  redClub: string;
  winnerName: string;
  winnerClub: string;
}

export function SearchWinner({ matchHistory, currentEventId, onRestoreMatch, boutQueue = [], backupData = {} }: SearchWinnerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>('name');
  const [results, setResults] = useState<MatchHistoryItem[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Helper to resolve competitor and winner names using matchHistory, active queue, and backups
  const resolveBoutDetails = (item: MatchHistoryItem): BoutResolvedDetails => {
    let fallbackMatch = boutQueue.find(q => isBoutMatch(q.data.bout, item.bout))?.data;

    if (!fallbackMatch && currentEventId) {
      for (const key of Object.keys(backupData)) {
        if (key.startsWith(currentEventId + '_')) {
          const found = backupData[key]?.matches?.find(m => isBoutMatch(m.bout, item.bout));
          if (found) {
            fallbackMatch = found;
            break;
          }
        }
      }
    }

    const blueName = item.blue_name || fallbackMatch?.blue_name || (item.winnerSide === 'Blue' ? item.winner : '');
    const blueClub = item.blue_club || fallbackMatch?.blue_club || (item.winnerSide === 'Blue' ? item.winnerClub || '' : '');
    const redName = item.red_name || fallbackMatch?.red_name || (item.winnerSide === 'Red' ? item.winner : '');
    const redClub = item.red_club || fallbackMatch?.red_club || (item.winnerSide === 'Red' ? item.winnerClub || '' : '');

    let winnerName = item.winner;
    if (item.winnerSide === 'Blue' && blueName && blueName.toLowerCase() !== 'blue') {
      winnerName = blueName;
    } else if (item.winnerSide === 'Red' && redName && redName.toLowerCase() !== 'red') {
      winnerName = redName;
    } else if (item.winner.toLowerCase() === 'blue' && blueName) {
      winnerName = blueName;
    } else if (item.winner.toLowerCase() === 'red' && redName) {
      winnerName = redName;
    }

    let winnerClub = item.winnerClub || '';
    if (!winnerClub || winnerClub === '-') {
      if (item.winnerSide === 'Blue' && blueClub) winnerClub = blueClub;
      else if (item.winnerSide === 'Red' && redClub) winnerClub = redClub;
    }

    return {
      blueName: blueName || (item.winnerSide === 'Blue' ? item.winner : '---'),
      blueClub: blueClub || (item.winnerSide === 'Blue' ? item.winnerClub || '---' : '---'),
      redName: redName || (item.winnerSide === 'Red' ? item.winner : '---'),
      redClub: redClub || (item.winnerSide === 'Red' ? item.winnerClub || '---' : '---'),
      winnerName: winnerName || 'Unknown Winner',
      winnerClub: winnerClub && winnerClub !== '-' ? winnerClub : ''
    };
  };

  const executeSearch = (query: string, criteria: SearchCriteria) => {
    const q = query.trim().toLowerCase();
    if (!q || !currentEventId) {
      setResults([]);
      setSelectedMatchId(null);
      setHasSearched(false);
      return;
    }

    const eventMatches = matchHistory.filter(h => h.eventId === currentEventId);

    const matchesFound = eventMatches.filter(h => {
      const details = resolveBoutDetails(h);
      const boutStr = (h.bout || '').toString().toLowerCase();

      if (criteria === 'bout') {
        return isBoutMatch(h.bout, q) || boutStr.includes(q);
      }

      if (criteria === 'name') {
        const winnerMatches = details.winnerName.toLowerCase().includes(q);
        const blueMatches = details.blueName.toLowerCase().includes(q);
        const redMatches = details.redName.toLowerCase().includes(q);
        return winnerMatches || blueMatches || redMatches;
      }

      // 'all' criteria
      const isBout = isBoutMatch(h.bout, q) || boutStr.includes(q);
      const isName = details.winnerName.toLowerCase().includes(q) ||
        details.blueName.toLowerCase().includes(q) ||
        details.redName.toLowerCase().includes(q);
      const isClub = details.winnerClub.toLowerCase().includes(q) ||
        details.blueClub.toLowerCase().includes(q) ||
        details.redClub.toLowerCase().includes(q);
      const isCategory = (h.category || '').toLowerCase().includes(q);

      return isBout || isName || isClub || isCategory;
    });

    // Prioritize matches where the searched query directly won the match
    matchesFound.sort((a, b) => {
      const detA = resolveBoutDetails(a);
      const detB = resolveBoutDetails(b);
      const aIsWinner = detA.winnerName.toLowerCase().includes(q);
      const bIsWinner = detB.winnerName.toLowerCase().includes(q);
      if (aIsWinner && !bIsWinner) return -1;
      if (!aIsWinner && bIsWinner) return 1;
      return 0;
    });

    setResults(matchesFound);
    setSelectedMatchId(matchesFound.length > 0 ? matchesFound[0].id : null);
    setHasSearched(true);
    setIsConfirming(false);
    setShowSuccess(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchQuery, searchCriteria);
  };

  const handleCriteriaChange = (newCriteria: SearchCriteria) => {
    setSearchCriteria(newCriteria);
    if (searchQuery.trim()) {
      executeSearch(searchQuery, newCriteria);
    }
  };

  const selectedMatch = useMemo(() => {
    if (!selectedMatchId) return results.length > 0 ? results[0] : null;
    return results.find(r => r.id === selectedMatchId) || (results.length > 0 ? results[0] : null);
  }, [results, selectedMatchId]);

  const selectedMatchDetails = useMemo(() => {
    return selectedMatch ? resolveBoutDetails(selectedMatch) : null;
  }, [selectedMatch, boutQueue, backupData, currentEventId]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Search Header Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
            <Search size={22} className="text-blue-600" />
            <span>Search Winner</span>
          </h2>

          {/* Search Criteria Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => handleCriteriaChange('name')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                searchCriteria === 'name'
                  ? "bg-white text-blue-600 shadow-2xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <User size={13} />
              <span>By Name</span>
            </button>
            <button
              type="button"
              onClick={() => handleCriteriaChange('bout')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                searchCriteria === 'bout'
                  ? "bg-white text-blue-600 shadow-2xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Hash size={13} />
              <span>By Match No</span>
            </button>
            <button
              type="button"
              onClick={() => handleCriteriaChange('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                searchCriteria === 'all'
                  ? "bg-white text-blue-600 shadow-2xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Sparkles size={13} />
              <span>All Fields</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchCriteria === 'name' 
                  ? "Enter Athlete / Winner Name (e.g. Alex, Sarah, Lee)..."
                  : searchCriteria === 'bout'
                    ? "Enter Match / Bout No (e.g. A1, 23, E09)..."
                    : "Search by Athlete Name, Match No, or Club..."
              }
              className="w-full pl-12 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-lg font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs placeholder:font-normal placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setResults([]);
                  setHasSearched(false);
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="Clear input"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button 
            type="submit"
            className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-2xs flex items-center justify-center gap-2 shrink-0"
          >
            <span>Search</span>
          </button>
        </form>

        {/* Criteria helper tips */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>
            {searchCriteria === 'name' && "Filtering completed bouts by Winner and Athlete Names."}
            {searchCriteria === 'bout' && "Filtering completed bouts by Bout Code or Match Number."}
            {searchCriteria === 'all' && "Searching across Bout Numbers, Athlete Names, Categories, and Clubs."}
          </span>
          <span className="font-semibold text-slate-500">
            {matchHistory.filter(h => h.eventId === currentEventId).length} completed bouts
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {hasSearched && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {results.length > 0 ? (
              <>
                {/* Multiple Matches Navigator if athlete won/played multiple bouts */}
                {results.length > 1 && (
                  <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                        Matches Found ({results.length})
                      </span>
                      <span className="text-xs text-slate-400">Click a match below to inspect details</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {results.map((r) => {
                        const isSelected = selectedMatch?.id === r.id;
                        const det = resolveBoutDetails(r);
                        const isSearchWinner = searchQuery.trim() && det.winnerName.toLowerCase().includes(searchQuery.trim().toLowerCase());

                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setSelectedMatchId(r.id);
                              setIsConfirming(false);
                            }}
                            className={cn(
                              "p-3 rounded-xl border text-left transition-all flex flex-col justify-between",
                              isSelected
                                ? "bg-blue-50/80 border-blue-500 shadow-2xs ring-2 ring-blue-500/20"
                                : "bg-slate-50/60 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                            )}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="font-black text-slate-900 text-sm">
                                Bout {r.bout}
                              </span>
                              {isSearchWinner ? (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  <Trophy size={10} className="text-amber-600" /> Won
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                                  Bout
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-700 font-bold truncate uppercase" title={det.winnerName}>
                              Winner: {det.winnerName}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-1">
                              {r.category || 'General'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected Match Details Card */}
                {selectedMatch && selectedMatchDetails && (
                  <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xs border border-slate-200 text-center">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="text-left">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Match No</p>
                          <p className="text-2xl sm:text-3xl font-black text-slate-900 leading-none">Bout {selectedMatch.bout}</p>
                        </div>
                        {selectedMatch.category && (
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Category</p>
                            <p className="text-sm font-bold text-slate-700 max-w-xs truncate">{selectedMatch.category}</p>
                          </div>
                        )}
                      </div>

                      {/* Winner Display Centerpiece */}
                      <div className="pt-2 flex flex-col items-center">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 border shadow-xs ${
                          selectedMatch.winnerSide === 'Blue' 
                            ? 'bg-blue-50 text-blue-600 border-blue-200' 
                            : selectedMatch.winnerSide === 'Red' 
                              ? 'bg-red-50 text-red-600 border-red-200' 
                              : 'bg-yellow-50 text-yellow-600 border-yellow-200'
                        }`}>
                          <Trophy size={40} className="drop-shadow-2xs" />
                        </div>

                        {selectedMatch.winnerSide && (
                          <div className="mb-2">
                            <span className={`inline-flex items-center px-4 py-1 rounded-full text-xs font-black tracking-widest uppercase border shadow-2xs ${
                              selectedMatch.winnerSide === 'Blue' 
                                ? 'bg-blue-600 text-white border-blue-700' 
                                : 'bg-red-600 text-white border-red-700'
                            }`}>
                              {selectedMatch.winnerSide} Corner Winner
                            </span>
                          </div>
                        )}

                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Official Winner</p>
                        <p className="text-2xl sm:text-4xl font-black text-slate-900 mb-1 uppercase tracking-tight">
                          {selectedMatchDetails.winnerName}
                        </p>

                        {selectedMatchDetails.winnerClub && (
                          <p className="text-base font-bold text-blue-900 uppercase tracking-wider">{selectedMatchDetails.winnerClub}</p>
                        )}

                        {selectedMatch.winType && (
                          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold uppercase tracking-wider">
                            <span className="opacity-75">Win Method:</span>
                            <span className="font-black">
                              {selectedMatch.winType === 'PTF' && 'Final Score (PTF)'}
                              {selectedMatch.winType === 'RSC' && 'Referee Stops Contest (RSC)'}
                              {selectedMatch.winType === 'WDR' && 'Withdrawal (WDR)'}
                              {selectedMatch.winType === 'DSQ' && 'Disqualification (DSQ)'}
                              {selectedMatch.winType === 'DQB' && 'Disqualification (DQB)'}
                              {!['PTF', 'RSC', 'WDR', 'DSQ', 'DQB'].includes(selectedMatch.winType) && selectedMatch.winType}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Corner Comparisons */}
                      <div className="pt-6 pb-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                        <div className={cn(
                          "p-4 rounded-xl border flex flex-col transition-all",
                          selectedMatch.winnerSide === 'Blue'
                            ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20"
                            : "bg-slate-50/50 border-slate-200 opacity-80"
                        )}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Blue Corner</span>
                            {selectedMatch.winnerSide === 'Blue' && (
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-600 text-white flex items-center gap-0.5">
                                <CheckCircle2 size={10} /> Winner
                              </span>
                            )}
                          </div>
                          <span className="text-base font-bold text-slate-900 uppercase">{selectedMatchDetails.blueName}</span>
                          <span className="text-xs font-medium text-slate-500 uppercase mt-auto pt-2">{selectedMatchDetails.blueClub}</span>
                        </div>

                        <div className={cn(
                          "p-4 rounded-xl border flex flex-col transition-all",
                          selectedMatch.winnerSide === 'Red'
                            ? "bg-red-50/70 border-red-300 ring-2 ring-red-500/20"
                            : "bg-slate-50/50 border-slate-200 opacity-80"
                        )}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Red Corner</span>
                            {selectedMatch.winnerSide === 'Red' && (
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-red-600 text-white flex items-center gap-0.5">
                                <CheckCircle2 size={10} /> Winner
                              </span>
                            )}
                          </div>
                          <span className="text-base font-bold text-slate-900 uppercase">{selectedMatchDetails.redName}</span>
                          <span className="text-xs font-medium text-slate-500 uppercase mt-auto pt-2">{selectedMatchDetails.redClub}</span>
                        </div>
                      </div>

                      {/* Restore Match Option */}
                      {onRestoreMatch && !showSuccess && (
                        <div className="pt-6 border-t border-slate-100">
                          {!isConfirming ? (
                            <button
                              type="button"
                              onClick={() => setIsConfirming(true)}
                              className="px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 mx-auto text-sm"
                            >
                              <RotateCcw size={16} />
                              Restore Match to Queue
                            </button>
                          ) : (
                            <div className="bg-red-50 p-4 rounded-xl space-y-4">
                              <div className="flex items-center gap-2 text-red-700 font-bold justify-center">
                                <AlertTriangle size={20} />
                                <p>Are you sure?</p>
                              </div>
                              <p className="text-sm text-red-600 text-center">
                                This will remove the recorded winner and place Bout {selectedMatch.bout} back into the active queue.
                              </p>
                              <div className="flex items-center justify-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setIsConfirming(false)}
                                  className="px-4 py-2 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 font-bold rounded-lg transition-colors text-sm"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRestoreMatch(selectedMatch);
                                    setShowSuccess(true);
                                    setTimeout(() => {
                                      setResults(prev => prev.filter(r => r.id !== selectedMatch.id));
                                      setSelectedMatchId(null);
                                      setShowSuccess(false);
                                    }, 2000);
                                  }}
                                  className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-bold rounded-lg transition-colors text-sm"
                                >
                                  Yes, Restore Bout
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {showSuccess && (
                        <div className="pt-6 border-t border-slate-100">
                          <div className="bg-green-50 p-4 rounded-xl text-center">
                            <p className="text-green-700 font-bold">Bout {selectedMatch.bout} restored successfully!</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white p-12 rounded-2xl shadow-xs border border-slate-200 text-center">
                <p className="text-lg font-bold text-slate-700 mb-2">No Winner Found</p>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  We couldn't find a recorded winner matching "{searchQuery}" using criterion: <strong className="text-slate-600">{searchCriteria === 'name' ? 'Athlete / Winner Name' : searchCriteria === 'bout' ? 'Match / Bout No' : 'All Fields'}</strong>.
                </p>
                {searchCriteria !== 'all' && (
                  <button
                    type="button"
                    onClick={() => handleCriteriaChange('all')}
                    className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                  >
                    <Sparkles size={14} className="text-blue-600" />
                    <span>Try searching across All Fields</span>
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
