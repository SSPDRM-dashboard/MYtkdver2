import React, { useState } from 'react';
import { Type, RotateCcw, ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export interface AdminFontSizeControlsProps {
  activeNameFontScale: number;
  setActiveNameFontScale: (scale: number | ((prev: number) => number)) => void;
  activeClubFontScale: number;
  setActiveClubFontScale: (scale: number | ((prev: number) => number)) => void;
  standbyNameFontScale?: number;
  setStandbyNameFontScale?: (scale: number | ((prev: number) => number)) => void;
  standbyClubFontScale?: number;
  setStandbyClubFontScale?: (scale: number | ((prev: number) => number)) => void;
  initialTarget?: 'active' | 'standby';
  dark?: boolean;
  className?: string;
}

export function AdminFontSizeControls({
  activeNameFontScale,
  setActiveNameFontScale,
  activeClubFontScale,
  setActiveClubFontScale,
  standbyNameFontScale: propStandbyNameFontScale,
  setStandbyNameFontScale: propSetStandbyNameFontScale,
  standbyClubFontScale: propStandbyClubFontScale,
  setStandbyClubFontScale: propSetStandbyClubFontScale,
  initialTarget = 'active',
  dark = true,
  className
}: AdminFontSizeControlsProps) {
  const [target, setTarget] = useState<'active' | 'standby'>(initialTarget);
  const [showPresets, setShowPresets] = useState(false);

  // Fallback state if props are not explicitly provided
  const [localStandbyNameScale, setLocalStandbyNameScale] = useState<number>(() => {
    const saved = localStorage.getItem('tkd_standby_name_font_scale');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [localStandbyClubScale, setLocalStandbyClubScale] = useState<number>(() => {
    const saved = localStorage.getItem('tkd_standby_club_font_scale');
    return saved ? parseInt(saved, 10) : 100;
  });

  const standbyNameScale = propStandbyNameFontScale ?? localStandbyNameScale;
  const setStandbyNameScale = propSetStandbyNameFontScale ?? ((val: number | ((prev: number) => number)) => {
    setLocalStandbyNameScale(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      localStorage.setItem('tkd_standby_name_font_scale', next.toString());
      return next;
    });
  });

  const standbyClubScale = propStandbyClubFontScale ?? localStandbyClubScale;
  const setStandbyClubScale = propSetStandbyClubFontScale ?? ((val: number | ((prev: number) => number)) => {
    setLocalStandbyClubScale(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      localStorage.setItem('tkd_standby_club_font_scale', next.toString());
      return next;
    });
  });

  const currentNameScale = target === 'active' ? activeNameFontScale : standbyNameScale;
  const currentSetNameScale = target === 'active' ? setActiveNameFontScale : setStandbyNameScale;
  const currentClubScale = target === 'active' ? activeClubFontScale : standbyClubScale;
  const currentSetClubScale = target === 'active' ? setActiveClubFontScale : setStandbyClubScale;

  const presets = [
    { label: 'Default (100%)', nameScale: 100, clubScale: 100 },
    { label: 'Medium LED (+20%)', nameScale: 120, clubScale: 120 },
    { label: 'Large LED (+40%)', nameScale: 140, clubScale: 140 },
    { label: 'Extra Large LED (+60%)', nameScale: 160, clubScale: 150 },
    { label: 'Huge LED (+80%)', nameScale: 180, clubScale: 160 },
    { label: 'Maximum (+100%)', nameScale: 200, clubScale: 180 },
  ];

  const hasActiveModified = activeNameFontScale !== 100 || activeClubFontScale !== 100;
  const hasStandbyModified = standbyNameScale !== 100 || standbyClubScale !== 100;
  const hasCurrentModified = target === 'active' ? hasActiveModified : hasStandbyModified;

  return (
    <div className={cn(
      "relative inline-flex items-center gap-1.5 px-2 py-1 rounded-2xl border text-xs font-bold transition-all select-none",
      dark 
        ? "bg-[#0d1526]/95 border-white/15 text-white shadow-xl backdrop-blur-md" 
        : "bg-white border-slate-200 text-slate-800 shadow-sm",
      className
    )}>
      {/* Label / Type indicator with popover toggle */}
      <div 
        className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity mr-0.5"
        onClick={() => setShowPresets(!showPresets)}
        title="Click to view LED Font Presets & Options"
      >
        <Type size={13} className={target === 'active' ? "text-amber-400 shrink-0" : "text-yellow-300 shrink-0"} />
        <span className="hidden sm:inline text-slate-400">LED Font</span>
        <ChevronDown size={11} className={cn("text-slate-400 transition-transform", showPresets && "rotate-180")} />
      </div>

      {/* Target Selector: Active vs Standby */}
      <div className={cn(
        "flex items-center p-0.5 rounded-lg border",
        dark ? "bg-slate-950/60 border-slate-800" : "bg-slate-100 border-slate-200"
      )}>
        <button
          type="button"
          onClick={() => setTarget('active')}
          className={cn(
            "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1",
            target === 'active'
              ? "bg-blue-600 text-white shadow-sm"
              : (dark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900")
          )}
          title="Adjust font scale for the Active / Live Match on Court"
        >
          <span>Active</span>
          {hasActiveModified && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
        </button>
        <button
          type="button"
          onClick={() => setTarget('standby')}
          className={cn(
            "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1",
            target === 'standby'
              ? "bg-amber-500 text-slate-950 shadow-sm font-black"
              : (dark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900")
          )}
          title="Adjust font scale for Standby / Upcoming Queue Players"
        >
          <span>Standby</span>
          {hasStandbyModified && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
        </button>
      </div>

      {/* Athlete Name font size stepper */}
      <div className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded-lg border",
        dark ? "bg-slate-900/80 border-slate-700/60" : "bg-slate-100 border-slate-200"
      )}>
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Name</span>
        <button
          type="button"
          onClick={() => currentSetNameScale(prev => Math.max(70, prev - 10))}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded text-xs font-black transition-colors",
            dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-white hover:bg-slate-200 text-slate-700 shadow-sm"
          )}
          title={`Decrease ${target === 'active' ? 'Active' : 'Standby'} Athlete Name Font Size (-10%)`}
        >
          -
        </button>
        <span className="text-[11px] font-mono font-black text-amber-300 min-w-[34px] text-center">
          {currentNameScale}%
        </span>
        <button
          type="button"
          onClick={() => currentSetNameScale(prev => Math.min(250, prev + 10))}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded text-xs font-black transition-colors",
            dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-white hover:bg-slate-200 text-slate-700 shadow-sm"
          )}
          title={`Increase ${target === 'active' ? 'Active' : 'Standby'} Athlete Name Font Size (+10%)`}
        >
          +
        </button>
      </div>

      {/* Club Name font size stepper */}
      <div className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded-lg border",
        dark ? "bg-slate-900/80 border-slate-700/60" : "bg-slate-100 border-slate-200"
      )}>
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Club</span>
        <button
          type="button"
          onClick={() => currentSetClubScale(prev => Math.max(70, prev - 10))}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded text-xs font-black transition-colors",
            dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-white hover:bg-slate-200 text-slate-700 shadow-sm"
          )}
          title={`Decrease ${target === 'active' ? 'Active' : 'Standby'} Club Name Font Size (-10%)`}
        >
          -
        </button>
        <span className="text-[11px] font-mono font-black text-amber-300 min-w-[34px] text-center">
          {currentClubScale}%
        </span>
        <button
          type="button"
          onClick={() => currentSetClubScale(prev => Math.min(250, prev + 10))}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded text-xs font-black transition-colors",
            dark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-white hover:bg-slate-200 text-slate-700 shadow-sm"
          )}
          title={`Increase ${target === 'active' ? 'Active' : 'Standby'} Club Name Font Size (+10%)`}
        >
          +
        </button>
      </div>

      {/* Reset button if modified */}
      {hasCurrentModified && (
        <button
          type="button"
          onClick={() => {
            currentSetNameScale(100);
            currentSetClubScale(100);
          }}
          className={cn(
            "p-1 rounded-md transition-colors",
            dark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
          )}
          title={`Reset ${target === 'active' ? 'Active' : 'Standby'} Font Sizes to 100% (Default)`}
        >
          <RotateCcw size={12} />
        </button>
      )}

      {/* Presets popover */}
      {showPresets && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowPresets(false)} 
          />
          <div className={cn(
            "absolute top-full right-0 mt-2 w-64 p-2.5 rounded-2xl border shadow-2xl z-50 flex flex-col gap-1.5",
            dark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
          )}>
            <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-700/50 mb-1 flex items-center justify-between">
              <span>LED Font Presets ({target.toUpperCase()})</span>
              <span className="text-amber-400 font-mono">{currentNameScale}% / {currentClubScale}%</span>
            </div>

            {presets.map(p => {
              const isActive = currentNameScale === p.nameScale && currentClubScale === p.clubScale;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    currentSetNameScale(p.nameScale);
                    currentSetClubScale(p.clubScale);
                    setShowPresets(false);
                  }}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold text-left transition-colors",
                    isActive 
                      ? "bg-amber-500 text-slate-950 font-black" 
                      : (dark ? "hover:bg-slate-800 text-slate-300" : "hover:bg-slate-100 text-slate-700")
                  )}
                >
                  <span>{p.label}</span>
                  {isActive && <Check size={14} className="stroke-[3]" />}
                </button>
              );
            })}

            {/* Quick Actions */}
            <div className="border-t border-slate-700/50 pt-1.5 mt-1 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  if (target === 'active') {
                    setStandbyNameScale(activeNameFontScale);
                    setStandbyClubScale(activeClubFontScale);
                  } else {
                    setActiveNameFontScale(standbyNameScale);
                    setActiveClubFontScale(standbyClubScale);
                  }
                  setShowPresets(false);
                }}
                className={cn(
                  "w-full text-left px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors",
                  dark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                )}
              >
                Copy {target === 'active' ? 'Active' : 'Standby'} Scale to {target === 'active' ? 'Standby' : 'Active'}
              </button>
              {(hasActiveModified || hasStandbyModified) && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveNameFontScale(100);
                    setActiveClubFontScale(100);
                    setStandbyNameScale(100);
                    setStandbyClubScale(100);
                    setShowPresets(false);
                  }}
                  className="w-full text-left px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-950/40 transition-colors"
                >
                  Reset All to Default 100%
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

