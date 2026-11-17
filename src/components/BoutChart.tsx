import React, { useState, useMemo } from 'react';
import { BoutMapping, MatchData, MatchHistoryItem, RingStatus } from '../types';
import {
  formatBoutNumber,
  normalizeBoutNumber,
  normalizeBoutWithRing,
  parseRingNumber,
  extractWinnerOfBout,
  isBoutMatch,
} from '../lib/utils';

export interface BoutChartProps {
  mappings: BoutMapping[];
  boutQueue: { id: string; data: MatchData }[];
  matchHistory: MatchHistoryItem[];
  rings?: RingStatus[];
  backupData?: Record<string, { mappings: BoutMapping[]; matches: MatchData[] }>;
  currentEventId?: string | null;
  boutNumberingMode?: 'numeric' | 'alphanumeric';
  onUpdateBoutNumber?: (oldBoutId: string, newBoutId: string) => void;
  onUpdateBoutName?: (boutId: string, color: 'blue' | 'red', newName: string) => void;
}

interface CombinedMatchRecord {
  boutId: string;
  rawBout: string;
  ringNumber: number;
  category: string;
  blueName: string;
  redName: string;
  winnerName: string;
  winnerSide: 'Blue' | 'Red' | null;
  isCompleted: boolean;
}

interface BracketNode {
  id: string;
  rawBout: string;
  ringNumber: number;
  match: CombinedMatchRecord | null;
  sources: { sourceId: string; slot: 'Chung' | 'Hong' }[];
  target: string | null;
  depth: number;
  x: number;
  y: number;
}

const cleanName = (name?: string | null): string => {
  if (!name) return '';
  const trimmed = String(name).trim();
  if (!trimmed || trimmed === '---' || trimmed === '-') return '';
  return trimmed;
};

const isPlaceholderName = (name: string): boolean => {
  if (!name) return true;
  const upper = name.trim().toUpperCase();
  return (
    upper === 'TBD' ||
    upper === 'UNKNOWN' ||
    upper === 'WINNER' ||
    upper.startsWith('WINNER OF ') ||
    Boolean(extractWinnerOfBout(upper))
  );
};

const toCanonicalBoutId = (bout: string | number | undefined | null, ringHint?: number): string => {
  if (bout === null || bout === undefined) return '';
  const raw = String(bout).trim();
  if (!raw) return '';
  const inferredRing = ringHint && ringHint > 0 ? ringHint : parseRingNumber(raw);
  return normalizeBoutWithRing(raw, inferredRing) || normalizeBoutNumber(raw);
};

export function BoutChart({
  mappings,
  boutQueue,
  matchHistory,
  rings = [],
  backupData,
  currentEventId,
  boutNumberingMode = 'alphanumeric',
  onUpdateBoutNumber,
  onUpdateBoutName,
}: BoutChartProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editingNameNodeId, setEditingNameNodeId] = useState<string | null>(null);
  const [editingNameColor, setEditingNameColor] = useState<'blue' | 'red' | null>(null);
  const [editNameValue, setEditNameValue] = useState<string>('');

  // Collect event-scoped backup matches & mappings (to preserve WINNER OF chains even after advancement)
  const eventBackup = useMemo(() => {
    const backupMatches: MatchData[] = [];
    const backupMappings: BoutMapping[] = [];
    if (!backupData) return { backupMatches, backupMappings };

    Object.entries(backupData).forEach(([key, entry]) => {
      if (currentEventId && !key.startsWith(`${currentEventId}_`)) return;
      if (entry && Array.isArray(entry.matches)) {
        backupMatches.push(...entry.matches);
      }
      if (entry && Array.isArray(entry.mappings)) {
        backupMappings.push(...entry.mappings);
      }
    });
    return { backupMatches, backupMappings };
  }, [backupData, currentEventId]);

  const scopedQueueMatches = useMemo(() => {
    return boutQueue
      .filter((q) => !currentEventId || !q.data.eventId || q.data.eventId === currentEventId)
      .map((q) => q.data);
  }, [boutQueue, currentEventId]);

  const scopedRingMatches = useMemo(() => {
    const list: MatchData[] = [];
    rings.forEach((r) => {
      const candidates = [
        r.currentBout,
        r.onDeck,
        r.inTheHole,
        ...(Array.isArray(r.suspendedBouts) ? r.suspendedBouts : []),
      ];
      candidates.forEach((m) => {
        if (!m) return;
        if (currentEventId && m.eventId && m.eventId !== currentEventId) return;
        list.push(m);
      });
    });
    return list;
  }, [rings, currentEventId]);

  const scopedHistory = useMemo(() => {
    return matchHistory.filter((h) => !currentEventId || !h.eventId || h.eventId === currentEventId);
  }, [matchHistory, currentEventId]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    const addCat = (c?: string) => {
      const trimmed = c?.trim();
      if (trimmed && trimmed !== 'SKIPPED' && trimmed !== '-' && trimmed !== 'Auto-Extracted' && trimmed !== 'Auto-Extracted from File') {
        cats.add(trimmed);
      }
    };
    mappings.forEach((m) => addCat(m.categoryName));
    eventBackup.backupMappings.forEach((m) => addCat(m.categoryName));
    scopedQueueMatches.forEach((m) => addCat(m.category));
    scopedRingMatches.forEach((m) => addCat(m.category));
    scopedHistory.forEach((h) => addCat(h.category));
    eventBackup.backupMatches.forEach((m) => addCat(m.category));
    return Array.from(cats).sort();
  }, [mappings, eventBackup, scopedQueueMatches, scopedRingMatches, scopedHistory]);

  const { nodes, edges, width, height } = useMemo(() => {
    if (!selectedCategory) return { nodes: [], edges: [], width: 0, height: 0 };

    const catKey = selectedCategory.trim().toLowerCase();
    const matchesCategory = (c?: string) => (c?.trim().toLowerCase() || '') === catKey;

    const recordMap = new Map<string, CombinedMatchRecord>();

    const upsertMatch = (
      rawBout: string | number,
      ringNum: number,
      category: string,
      blueNameRaw: string,
      redNameRaw: string,
      hist?: MatchHistoryItem | null
    ) => {
      const boutId = toCanonicalBoutId(rawBout, ringNum);
      if (!boutId) return;
      const existing = recordMap.get(boutId);

      const blueCandidate = cleanName(blueNameRaw);
      const redCandidate = cleanName(redNameRaw);

      let blueName = existing?.blueName || '';
      if (blueCandidate && (!blueName || (isPlaceholderName(blueName) && !isPlaceholderName(blueCandidate)))) {
        blueName = blueCandidate;
      }

      let redName = existing?.redName || '';
      if (redCandidate && (!redName || (isPlaceholderName(redName) && !isPlaceholderName(redCandidate)))) {
        redName = redCandidate;
      }

      let winnerName = existing?.winnerName || '';
      let winnerSide: 'Blue' | 'Red' | null = existing?.winnerSide || null;
      let isCompleted = existing?.isCompleted || false;

      if (hist) {
        const rawW = cleanName(hist.winner);
        if (hist.winnerSide === 'Blue' || hist.winnerSide === 'Red') {
          winnerSide = hist.winnerSide;
        }
        if (rawW) {
          isCompleted = true;
          const upperW = rawW.toUpperCase();
          if (upperW === 'NO WINNER' || upperW === 'DOUBLE NO-SHOW' || upperW === 'NO CONTEST') {
            winnerSide = null;
            winnerName = 'NO WINNER';
          } else if (upperW === 'BLUE' || upperW === 'CHUNG') {
            winnerSide = 'Blue';
            winnerName = blueName || cleanName(hist.blue_name) || 'BLUE';
          } else if (upperW === 'RED' || upperW === 'HONG') {
            winnerSide = 'Red';
            winnerName = redName || cleanName(hist.red_name) || 'RED';
          } else {
            winnerName = rawW;
            if (!winnerSide) {
              const wLower = rawW.toLowerCase();
              const bLower = (blueName || cleanName(hist.blue_name)).toLowerCase();
              const rLower = (redName || cleanName(hist.red_name)).toLowerCase();
              if (bLower && (wLower === bLower || bLower.includes(wLower))) {
                winnerSide = 'Blue';
              } else if (rLower && (wLower === rLower || rLower.includes(wLower))) {
                winnerSide = 'Red';
              }
            }
          }
        } else if (winnerSide) {
          isCompleted = true;
          winnerName = winnerSide === 'Blue' ? blueName : redName;
        }
      }

      recordMap.set(boutId, {
        boutId,
        rawBout: existing?.rawBout || String(rawBout),
        ringNumber: existing?.ringNumber || ringNum || parseRingNumber(rawBout),
        category: existing?.category || category,
        blueName,
        redName,
        winnerName,
        winnerSide,
        isCompleted,
      });
    };

    // Merge data from all sources (backup -> queue -> active rings -> matchHistory)
    eventBackup.backupMatches
      .filter((m) => matchesCategory(m.category))
      .forEach((m) => upsertMatch(m.bout, m.ring || parseRingNumber(m.bout), m.category, m.blue_name, m.red_name));

    scopedQueueMatches
      .filter((m) => matchesCategory(m.category))
      .forEach((m) => upsertMatch(m.bout, m.ring || parseRingNumber(m.bout), m.category, m.blue_name, m.red_name));

    scopedRingMatches
      .filter((m) => matchesCategory(m.category))
      .forEach((m) => upsertMatch(m.bout, m.ring || parseRingNumber(m.bout), m.category, m.blue_name, m.red_name));

    scopedHistory
      .filter((h) => matchesCategory(h.category))
      .forEach((h) => {
        const ringNum = h.ring || parseRingNumber(h.bout);
        const canonical = toCanonicalBoutId(h.bout, ringNum);
        const existingRec = recordMap.get(canonical);
        upsertMatch(
          h.bout,
          ringNum,
          h.category,
          h.blue_name || existingRec?.blueName || '',
          h.red_name || existingRec?.redName || '',
          h
        );
      });

    // Collect mappings for this category (plus any Auto-Extracted mappings connecting bouts in this category)
    const allMappings = [...mappings, ...eventBackup.backupMappings];
    const catMappings = allMappings.filter((m) => {
      if (matchesCategory(m.categoryName)) return true;
      const isGeneric =
        !m.categoryName ||
        m.categoryName === 'Auto-Extracted' ||
        m.categoryName === 'Auto-Extracted from File';
      if (!isGeneric) return false;
      const sId = toCanonicalBoutId(m.sourceBout);
      const nId = toCanonicalBoutId(m.nextBout);
      return recordMap.has(sId) || recordMap.has(nId);
    });

    // Build unified set of boutIds
    const boutIds = new Set<string>(recordMap.keys());
    catMappings.forEach((m) => {
      const sId = toCanonicalBoutId(m.sourceBout);
      const nId = toCanonicalBoutId(m.nextBout);
      if (sId) boutIds.add(sId);
      if (nId) boutIds.add(nId);
    });

    // Helper to resolve a source bout string within this category
    const resolveFeederId = (refRaw: string, parentRing: number): string | null => {
      const candidate = toCanonicalBoutId(refRaw, parentRing);
      if (candidate && boutIds.has(candidate)) return candidate;
      for (const id of boutIds) {
        if (isBoutMatch(id, refRaw)) return id;
      }
      return candidate || null;
    };

    // Infer extra feeder edges from "WINNER OF Bxx" placeholders in backup/queue/ring matches
    const inferredEdges: { sourceId: string; nextId: string; slot: 'Chung' | 'Hong' }[] = [];
    const scanPlaceholdersForEdges = (matchesList: MatchData[]) => {
      matchesList
        .filter((m) => matchesCategory(m.category))
        .forEach((m) => {
          const rNum = m.ring || parseRingNumber(m.bout);
          const nextId = toCanonicalBoutId(m.bout, rNum);
          if (!nextId) return;

          const blueRef = extractWinnerOfBout(m.blue_name);
          if (blueRef) {
            const sId = resolveFeederId(blueRef, rNum);
            if (sId && sId !== nextId) {
              boutIds.add(sId);
              inferredEdges.push({ sourceId: sId, nextId, slot: 'Chung' });
            }
          }

          const redRef = extractWinnerOfBout(m.red_name);
          if (redRef) {
            const sId = resolveFeederId(redRef, rNum);
            if (sId && sId !== nextId) {
              boutIds.add(sId);
              inferredEdges.push({ sourceId: sId, nextId, slot: 'Hong' });
            }
          }
        });
    };
    scanPlaceholdersForEdges(eventBackup.backupMatches);
    scanPlaceholdersForEdges(scopedQueueMatches);
    scanPlaceholdersForEdges(scopedRingMatches);

    if (boutIds.size === 0) {
      return { nodes: [], edges: [], width: 0, height: 0 };
    }

    const nodeMap = new Map<string, BracketNode>();
    boutIds.forEach((id) => {
      const rec = recordMap.get(id) || null;
      const ringNum = rec?.ringNumber || parseRingNumber(id);
      nodeMap.set(id, {
        id,
        rawBout: rec?.rawBout || id,
        ringNumber: ringNum,
        match: rec,
        sources: [],
        target: null,
        depth: 0,
        x: 0,
        y: 0,
      });
    });

    const addEdge = (sourceId: string, nextId: string, slot: 'Chung' | 'Hong') => {
      if (!sourceId || !nextId || sourceId === nextId) return;
      const sourceNode = nodeMap.get(sourceId);
      const nextNode = nodeMap.get(nextId);
      if (!sourceNode || !nextNode) return;
      sourceNode.target = nextId;
      if (!nextNode.sources.some((s) => s.sourceId === sourceId)) {
        nextNode.sources.push({ sourceId, slot });
      }
    };

    catMappings.forEach((m) => {
      const sId = toCanonicalBoutId(m.sourceBout);
      const nId = toCanonicalBoutId(m.nextBout);
      addEdge(sId, nId, m.slot);
    });
    inferredEdges.forEach((e) => addEdge(e.sourceId, e.nextId, e.slot));

    // Propagate feeder winners into target player slots if target slot is still placeholder/empty
    nodeMap.forEach((node) => {
      if (!node.match) return;
      node.sources.forEach((src) => {
        const srcNode = nodeMap.get(src.sourceId);
        const srcWinnerRaw = srcNode?.match?.winnerName;
        if (!srcWinnerRaw) return;
        const srcWinner = ['NO WINNER', 'DOUBLE NO-SHOW', 'NO CONTEST'].includes(srcWinnerRaw.toUpperCase())
          ? 'BYE'
          : srcWinnerRaw;
        if (src.slot === 'Chung' && isPlaceholderName(node.match!.blueName)) {
          node.match!.blueName = srcWinner;
        }
        if (src.slot === 'Hong' && isPlaceholderName(node.match!.redName)) {
          node.match!.redName = srcWinner;
        }
      });
    });

    // Calculate column depths from roots backwards (right-to-left)
    const nodesArray = Array.from(nodeMap.values());
    const levelMap = new Map<string, number>();
    nodesArray.forEach((n) => levelMap.set(n.id, -1));

    const roots = nodesArray.filter((n) => n.target === null || !nodeMap.has(n.target));
    roots.forEach((r) => levelMap.set(r.id, 0));

    let levelChanged = true;
    let guard = 0;
    while (levelChanged && guard < nodesArray.length + 5) {
      levelChanged = false;
      guard++;
      nodesArray.forEach((node) => {
        const currentLevel = levelMap.get(node.id) ?? -1;
        if (currentLevel !== -1) {
          node.sources.forEach((source) => {
            const sourceNode = nodeMap.get(source.sourceId);
            if (sourceNode) {
              const oldLevel = levelMap.get(sourceNode.id) ?? -1;
              const newLevel = currentLevel + 1;
              if (newLevel > oldLevel && newLevel <= nodesArray.length) {
                levelMap.set(sourceNode.id, newLevel);
                levelChanged = true;
              }
            }
          });
        }
      });
    }

    const maxLevel = Math.max(0, ...Array.from(levelMap.values()));

    nodesArray.forEach((node) => {
      const level = levelMap.get(node.id);
      node.depth = level !== undefined && level !== -1 ? maxLevel - level : 0;
    });

    const nodesByDepth: BracketNode[][] = [];
    for (let d = 0; d <= maxLevel; d++) {
      nodesByDepth.push(nodesArray.filter((n) => n.depth === d));
    }

    const NODE_WIDTH = 320;
    const NODE_HEIGHT = 92;
    const X_GAP = 68;
    const Y_GAP = 24;

    // DFS from roots (Chung top, Hong bottom) so feeder trees stay cleanly ordered
    const leafOrder: string[] = [];
    const visited = new Set<string>();

    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) return;

      if (node.sources.length === 0) {
        leafOrder.push(nodeId);
      } else {
        const sortedSources = [...node.sources].sort((a, b) => (a.slot === 'Chung' ? -1 : 1));
        sortedSources.forEach((s) => traverse(s.sourceId));
      }
    };

    const sortedRoots = [...roots].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    sortedRoots.forEach((r) => traverse(r.id));

    nodesArray
      .filter((n) => n.sources.length === 0 && !visited.has(n.id))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      .forEach((n) => leafOrder.push(n.id));

    let currentY = 24;
    leafOrder.forEach((nodeId) => {
      const node = nodeMap.get(nodeId);
      if (node) {
        node.y = currentY;
        currentY += NODE_HEIGHT + Y_GAP;
      }
    });

    // Position parent nodes centered vertically between their feeder nodes
    for (let d = 1; d <= maxLevel; d++) {
      nodesByDepth[d].forEach((node) => {
        if (node.sources.length > 0) {
          const childYs = node.sources.map((s) => nodeMap.get(s.sourceId)?.y ?? 0);
          node.y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
          node.sources.sort((a, b) => (a.slot === 'Chung' ? -1 : 1));
        }
      });

      // Prevent vertical overlap within the same depth column
      const colNodes = [...nodesByDepth[d]].sort((a, b) => a.y - b.y);
      for (let i = 1; i < colNodes.length; i++) {
        const minAllowedY = colNodes[i - 1].y + NODE_HEIGHT + Y_GAP;
        if (colNodes[i].y < minAllowedY) {
          colNodes[i].y = minAllowedY;
        }
      }
    }

    nodesArray.forEach((node) => {
      node.x = node.depth * (NODE_WIDTH + X_GAP) + 24;
    });

    const totalWidth = (maxLevel + 1) * (NODE_WIDTH + X_GAP) + 48;
    const maxBottom = Math.max(currentY, ...nodesArray.map((n) => n.y + NODE_HEIGHT + 32));

    interface Edge {
      id: string;
      startX: number;
      startY: number;
      midX: number;
      endX: number;
      endY: number;
    }
    const svgEdges: Edge[] = [];

    nodesArray.forEach((node) => {
      node.sources.forEach((source) => {
        const sourceNode = nodeMap.get(source.sourceId);
        if (sourceNode) {
          const startX = sourceNode.x + NODE_WIDTH;
          const startY = sourceNode.y + NODE_HEIGHT / 2;
          const endX = node.x;
          const endY = node.y + NODE_HEIGHT / 2;
          const midX = endX - X_GAP / 2;
          svgEdges.push({
            id: `${source.sourceId}-${node.id}`,
            startX,
            startY,
            midX,
            endX,
            endY,
          });
        }
      });
    });

    return { nodes: nodesArray, edges: svgEdges, width: totalWidth, height: maxBottom };
  }, [
    selectedCategory,
    mappings,
    eventBackup,
    scopedQueueMatches,
    scopedRingMatches,
    scopedHistory,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Bout Chart</h2>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="w-full md:w-1/2 lg:w-1/3">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">
            Select Category
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
          >
            <option value="">-- Choose Category --</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {selectedCategory && (
          <div
            className="w-full overflow-x-auto overflow-y-auto pb-8 rounded-xl border border-slate-200 bg-slate-50"
            style={{ minHeight: 400 }}
          >
            {nodes.length === 0 ? (
              <p className="text-slate-500 font-bold p-8 text-center">
                No brackets found for this category.
              </p>
            ) : (
              <div
                style={{
                  width: Math.max(width, 680),
                  height: Math.max(height, 400),
                  position: 'relative',
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                >
                  {edges.map((e, i) => {
                    const path = `M ${e.startX} ${e.startY} L ${e.midX} ${e.startY} L ${e.midX} ${e.endY} L ${e.endX} ${e.endY}`;
                    return (
                      <path
                        key={`${e.id}-${i}`}
                        d={path}
                        fill="none"
                        stroke="#1d4ed8"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </svg>

                {nodes.map((node, i) => {
                  const m = node.match;
                  const winnerName = m?.winnerName || '';
                  const winnerSide = m?.winnerSide || null;
                  const formattedBout = formatBoutNumber(node.ringNumber, node.rawBout, boutNumberingMode);

                  return (
                    <div
                      key={`${node.id}-${i}`}
                      className="absolute bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden flex flex-col text-xs"
                      style={{ left: node.x, top: node.y, width: 320, height: 92 }}
                    >
                      {/* Card Header: BOUT Bxx  +  WINNER [NAME] */}
                      <div className="bg-slate-100 border-b border-slate-200 px-2.5 py-1.5 flex items-center justify-between gap-2 min-h-[30px]">
                        {editingNodeId === node.id ? (
                          <input
                            autoFocus
                            type="text"
                            className="border border-blue-400 bg-white rounded px-1 w-24 outline-none text-black text-[11px] font-black uppercase"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editValue.trim() && editValue !== node.id) {
                                  onUpdateBoutNumber?.(node.id, editValue.trim());
                                }
                                setEditingNodeId(null);
                              }
                              if (e.key === 'Escape') setEditingNodeId(null);
                            }}
                            onBlur={() => {
                              if (editValue.trim() && editValue !== node.id) {
                                onUpdateBoutNumber?.(node.id, editValue.trim());
                              }
                              setEditingNodeId(null);
                            }}
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-blue-600 transition-colors text-[11px] font-black uppercase text-slate-600 tracking-tight shrink-0"
                            onClick={() => {
                              setEditingNodeId(node.id);
                              setEditValue(node.rawBout || node.id);
                            }}
                            title="Click to edit bout number"
                          >
                            BOUT {formattedBout}
                          </span>
                        )}

                        {winnerName && (
                          winnerName.toUpperCase() === 'NO WINNER' ? (
                            <span
                              className="bg-amber-100 text-amber-800 border border-amber-300 font-black text-[10px] uppercase px-2 py-0.5 rounded shrink-0"
                              title="Both competitors did not show up (No Winner)"
                            >
                              NO WINNER
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-black uppercase text-red-600 tracking-wide shrink-0">
                                WINNER
                              </span>
                              <span
                                className="bg-slate-200/90 text-red-600 font-bold text-[10px] uppercase px-2 py-0.5 rounded truncate max-w-[175px]"
                                title={winnerName}
                              >
                                {winnerName}
                              </span>
                            </div>
                          )
                        )}
                      </div>

                      {/* Athlete Rows */}
                      <div className="flex-1 flex flex-col justify-center bg-white">
                        {/* Blue (Chung) Row */}
                        <div
                          className={`flex items-center px-2.5 py-1.5 border-l-4 border-blue-600 text-[12px] uppercase tracking-tight ${
                            winnerSide === 'Blue' ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                          }`}
                        >
                          {editingNameNodeId === node.id && editingNameColor === 'blue' ? (
                            <input
                              autoFocus
                              type="text"
                              className="border border-blue-400 bg-white rounded px-1 w-full outline-none text-black text-xs"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editNameValue.trim() !== (m?.blueName || '')) {
                                    onUpdateBoutName?.(node.id, 'blue', editNameValue.trim());
                                  }
                                  setEditingNameNodeId(null);
                                  setEditingNameColor(null);
                                }
                                if (e.key === 'Escape') {
                                  setEditingNameNodeId(null);
                                  setEditingNameColor(null);
                                }
                              }}
                              onBlur={() => {
                                if (editNameValue.trim() !== (m?.blueName || '')) {
                                  onUpdateBoutName?.(node.id, 'blue', editNameValue.trim());
                                }
                                setEditingNameNodeId(null);
                                setEditingNameColor(null);
                              }}
                            />
                          ) : (
                            <span
                              className="truncate w-full cursor-pointer hover:text-blue-700 transition-colors"
                              onClick={() => {
                                setEditingNameNodeId(node.id);
                                setEditingNameColor('blue');
                                setEditNameValue(m?.blueName || '');
                              }}
                              title={m?.blueName ? `${m.blueName} (Click to edit)` : 'Click to edit name'}
                            >
                              {m?.blueName ? (
                                m.blueName
                              ) : (
                                <span className="italic text-slate-300">TBD</span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="border-t border-slate-100" />

                        {/* Red (Hong) Row */}
                        <div
                          className={`flex items-center px-2.5 py-1.5 border-l-4 border-red-600 text-[12px] uppercase tracking-tight ${
                            winnerSide === 'Red' ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                          }`}
                        >
                          {editingNameNodeId === node.id && editingNameColor === 'red' ? (
                            <input
                              autoFocus
                              type="text"
                              className="border border-red-400 bg-white rounded px-1 w-full outline-none text-black text-xs"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (editNameValue.trim() !== (m?.redName || '')) {
                                    onUpdateBoutName?.(node.id, 'red', editNameValue.trim());
                                  }
                                  setEditingNameNodeId(null);
                                  setEditingNameColor(null);
                                }
                                if (e.key === 'Escape') {
                                  setEditingNameNodeId(null);
                                  setEditingNameColor(null);
                                }
                              }}
                              onBlur={() => {
                                if (editNameValue.trim() !== (m?.redName || '')) {
                                  onUpdateBoutName?.(node.id, 'red', editNameValue.trim());
                                }
                                setEditingNameNodeId(null);
                                setEditingNameColor(null);
                              }}
                            />
                          ) : (
                            <span
                              className="truncate w-full cursor-pointer hover:text-red-700 transition-colors"
                              onClick={() => {
                                setEditingNameNodeId(node.id);
                                setEditingNameColor('red');
                                setEditNameValue(m?.redName || '');
                              }}
                              title={m?.redName ? `${m.redName} (Click to edit)` : 'Click to edit name'}
                            >
                              {m?.redName ? (
                                m.redName
                              ) : (
                                <span className="italic text-slate-300">TBD</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
