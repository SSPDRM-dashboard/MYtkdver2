import React, { useEffect, useState } from 'react';
import { Check, Copy, Link2, Radio, RefreshCw, Trash2, Terminal, CheckCircle2 } from 'lucide-react';
import { RingStatus } from '../types';
import { cn } from '../lib/utils';

interface WaychampLogEntry {
  id: string;
  timestamp: string;
  endpoint: 'ovr' | 'match-action';
  method: string;
  path: string;
  query: Record<string, any>;
  mat: string;
  body: any;
  summary: string;
}

interface WaychampMatStatus {
  mat: string;
  ringNumber: number;
  connected: boolean;
  lastSeenAt: string;
  lastAction: string;
  boutNumber?: string;
  round?: number | string;
  blueScore?: number;
  redScore?: number;
  blueGamJeom?: number;
  redGamJeom?: number;
  winner?: 'blue' | 'red' | null;
  rawPayload?: any;
}

interface WaychampStatusResponse {
  status: string;
  eventName: string;
  eventDate: string;
  syncedRingCount: number;
  lastSyncedAt: string | null;
  liveMatStatus: Record<string, WaychampMatStatus>;
  incomingLogs: WaychampLogEntry[];
}

interface WaychampSettingsProps {
  rings: RingStatus[];
  eventName: string;
  eventDate: string;
  namingMode: 'number' | 'alphabet';
}

export const WaychampSettings: React.FC<WaychampSettingsProps> = ({
  rings,
  eventName,
  eventDate,
  namingMode,
}) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const ovrUrl = `${origin}/api/waychamp/ovr`;
  const matchActionUrl = `${origin}/api/waychamp/match-action`;

  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tkd_waychamp_enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [isToggling, setIsToggling] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'ovr' | 'action' | null>(null);
  const [statusData, setStatusData] = useState<WaychampStatusResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testMat, setTestMat] = useState('A');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const handleToggleEnabled = async () => {
    const next = !isEnabled;
    setIsToggling(true);
    setIsEnabled(next);
    try {
      localStorage.setItem('tkd_waychamp_enabled', String(next));
    } catch {}
    try {
      await fetch('/api/waychamp/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (next) {
        await syncRingsToServer();
      }
    } catch {
      // ignore network error
    } finally {
      setIsToggling(false);
    }
  };

  const handleCopy = (key: 'ovr' | 'action', text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000);
      }).catch(() => {});
    }
  };

  const syncRingsToServer = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/waychamp/sync-rings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName, eventDate, rings }),
      });
      await fetchStatus();
    } catch {
      // ignore network error
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/waychamp/status');
      if (res.ok) {
        const json = await res.json();
        setStatusData(json);
      }
    } catch {
      // ignore
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await fetch(`/api/waychamp/ovr?mat=${encodeURIComponent(testMat)}`);
      await fetchStatus();
    } catch {
      // ignore
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/waychamp/clear-logs', { method: 'POST' });
      await fetchStatus();
    } catch {
      // ignore
    }
  };

  // Sync initial enabled state to server on mount
  useEffect(() => {
    fetch('/api/waychamp/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: isEnabled }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync rings only when Waychamp integration is ON
  useEffect(() => {
    if (!isEnabled) return;
    syncRingsToServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, rings, eventName, eventDate]);

  // Poll incoming Waychamp traffic every 3 seconds only while ON
  useEffect(() => {
    if (!isEnabled) return;
    fetchStatus();
    const timer = setInterval(fetchStatus, 3000);
    return () => clearInterval(timer);
  }, [isEnabled]);

  const matEntries: WaychampMatStatus[] = Object.values(statusData?.liveMatStatus || {});
  const logs = statusData?.incomingLogs || [];

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 space-y-6">
      <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4", isEnabled && "border-b border-slate-100 pb-5")}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-11 h-11 rounded-2xl text-white flex items-center justify-center shadow-sm shrink-0 transition-colors",
            isEnabled ? "bg-blue-600" : "bg-slate-400"
          )}>
            <Link2 size={22} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Waychamp PSS / OVR Integration
            </h3>
            <p className="text-xs font-medium text-slate-500">
              Bidirectional link for Waychamp OVR URL (bout sync) and HTTP Match Action (live scores &amp; results).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {isEnabled && (
            <button
              type="button"
              onClick={syncRingsToServer}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={cn(isSyncing && 'animate-spin')} />
              <span>{isSyncing ? 'Syncing...' : `Sync Bouts (${rings.length} Rings)`}</span>
            </button>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            disabled={isToggling}
            onClick={handleToggleEnabled}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border transition-colors cursor-pointer disabled:opacity-60",
              isEnabled
                ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                : "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200"
            )}
          >
            <span
              className={cn(
                "w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center",
                isEnabled ? "bg-emerald-500 justify-end" : "bg-slate-400 justify-start"
              )}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-white shadow-sm block" />
            </span>
            <span>{isEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {isEnabled && (
        <>

      {/* URLs to paste into Waychamp Setting -> Network */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-800">
              1. Waychamp OVR URL (Setting → Network → OVR)
            </span>
            <button
              type="button"
              onClick={() => handleCopy('ovr', ovrUrl)}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copiedKey === 'ovr' ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedKey === 'ovr' ? 'Copied' : 'Copy URL'}</span>
            </button>
          </div>
          <div className="font-mono text-xs font-bold text-slate-800 bg-white border border-blue-200 rounded-xl px-3 py-2.5 break-all select-all">
            {ovrUrl}
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            In Waychamp: set <strong>Supplier</strong> to <code className="font-mono font-bold">Waychamp</code>, paste this URL into <strong>OVR URL</strong>, enter your <strong>Mat</strong> (e.g. <code className="font-mono font-bold">A</code>–<code className="font-mono font-bold">E</code>), and click <strong>Connection</strong>.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
              2. HTTP Match Action URL (Live Score Push)
            </span>
            <button
              type="button"
              onClick={() => handleCopy('action', matchActionUrl)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copiedKey === 'action' ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedKey === 'action' ? 'Copied' : 'Copy URL'}</span>
            </button>
          </div>
          <div className="font-mono text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2.5 break-all select-all">
            {matchActionUrl}
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            In Waychamp: paste this URL into <strong>HTTP Match Action</strong> (bottom-left), click <strong>Add</strong>, then click <strong>Connect</strong>.
          </p>
        </div>
      </div>

      {/* Quick Test & Mat Status */}
      <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio size={15} className="text-emerald-600" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Connected Mats ({matEntries.length})
            </span>
            {statusData?.lastSyncedAt && (
              <span className="text-[10px] font-mono text-slate-400">
                · Bouts synced {new Date(statusData.lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={testMat}
              onChange={(e) => setTestMat(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 outline-none"
              aria-label="Test Mat"
            >
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((m) => (
                <option key={m} value={m}>
                  Mat {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-50"
            >
              {isTesting ? 'Testing...' : 'Test OVR Endpoint'}
            </button>
          </div>
        </div>

        {matEntries.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
            No Waychamp mat has connected yet. Click <strong>Connection</strong> in Waychamp (or click <strong>Test OVR Endpoint</strong> above) to verify.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {matEntries.map((m) => {
              const ringLabel =
                namingMode === 'number' ? `Ring ${m.ringNumber}` : `Ring ${String.fromCharCode(64 + m.ringNumber)}`;
              return (
                <div
                  key={m.mat}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      Mat {m.mat} → {ringLabel}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(m.lastSeenAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600 truncate">
                    {m.lastAction}
                  </div>
                  {(m.blueScore !== undefined || m.redScore !== undefined || m.boutNumber) && (
                    <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 text-xs font-mono font-black">
                      <span className="text-slate-700">Bout {m.boutNumber || '---'}</span>
                      <span>
                        <span className="text-blue-600">{m.blueScore ?? 0}</span>
                        <span className="text-slate-400 mx-1">:</span>
                        <span className="text-red-600">{m.redScore ?? 0}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Incoming Request Inspector */}
      <div className="rounded-2xl border border-slate-200 bg-slate-950 text-slate-100 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={15} className="text-cyan-400" />
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Live Incoming Waychamp Request Inspector ({logs.length})
            </span>
          </div>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={handleClearLogs}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-200 text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 size={11} />
              <span>Clear</span>
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-slate-400 font-mono">
            Waiting for incoming requests from Waychamp... Click "Connection" in Waychamp to inspect its exact path and JSON payload here.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {logs.map((entry) => {
              const isExpanded = expandedLogId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-xs font-mono"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedLogId(isExpanded ? null : entry.id)}
                    className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-black uppercase shrink-0',
                          entry.method === 'GET' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                        )}
                      >
                        {entry.method}
                      </span>
                      <span className="text-slate-200 truncate">{entry.summary}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </button>
                  {isExpanded && (
                    <pre className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-cyan-200 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        {
                          path: entry.path,
                          query: entry.query,
                          body: entry.body,
                        },
                        null,
                        2
                      )}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};
