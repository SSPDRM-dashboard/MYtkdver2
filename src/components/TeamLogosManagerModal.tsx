import React, { useState } from 'react';
import { X, Upload, Image as ImageIcon, Search, Trash2, CheckCircle2, ShieldAlert, Flag } from 'lucide-react';
import { AVAILABLE_DEMO_FLAGS, normalizeKey, getPlayerLogoOrFlag } from '../lib/teamLogos';
import { PlayerLogoBadge } from './PlayerLogoBadge';

interface TeamLogosManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamLogos: Record<string, string>;
  onSaveTeamLogo: (key: string, url: string) => void;
  onDeleteTeamLogo: (key: string) => void;
  existingClubs: string[];
}

export const TeamLogosManagerModal: React.FC<TeamLogosManagerModalProps> = ({
  isOpen,
  onClose,
  teamLogos,
  onSaveTeamLogo,
  onDeleteTeamLogo,
  existingClubs,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [targetClubName, setTargetClubName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [selectedQuickFlag, setSelectedQuickFlag] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'manage' | 'add'>('manage');

  if (!isOpen) return null;

  // Aggregate clubs from both existing list and configured logos
  const combinedClubs = Array.from(
    new Set([
      ...existingClubs.map(c => c.trim()).filter(c => c && c !== '---'),
      ...Object.keys(teamLogos).map(k => k.trim())
    ])
  ).sort((a, b) => a.localeCompare(b));

  const filteredClubs = combinedClubs.filter(c =>
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Image file is too large. Please select an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setPreviewImage(base64);
        setCustomUrl('');
        setSelectedQuickFlag(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyLogo = () => {
    if (!targetClubName.trim()) {
      alert('Please enter or select a Club or Athlete name.');
      return;
    }
    const finalUrl = previewImage || customUrl.trim() || selectedQuickFlag;
    if (!finalUrl) {
      alert('Please select a flag, upload an image, or paste an image URL.');
      return;
    }

    const normalized = normalizeKey(targetClubName);
    onSaveTeamLogo(normalized, finalUrl);
    // Also save under raw name for exact match
    if (normalized !== targetClubName.trim().toLowerCase()) {
      onSaveTeamLogo(targetClubName.trim().toLowerCase(), finalUrl);
    }

    setTargetClubName('');
    setCustomUrl('');
    setPreviewImage(null);
    setSelectedQuickFlag(null);
    setActiveTab('manage');
  };

  const selectClubToEdit = (club: string) => {
    setTargetClubName(club);
    const existing = teamLogos[normalizeKey(club)] || teamLogos[club.toLowerCase()] || '';
    setCustomUrl(existing.startsWith('http') ? existing : '');
    setPreviewImage(existing);
    setActiveTab('add');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#162036]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Flag size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-wide">
                Team & Player Logos / Flags Manager
              </h2>
              <p className="text-xs text-slate-400">
                Logos and flags are automatically synchronized and rendered across Site View, Standby, Rings, and Reports.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-[#0c1322] px-6 pt-3 gap-3">
          <button
            onClick={() => setActiveTab('manage')}
            className={`pb-3 px-4 font-bold text-sm tracking-wide border-b-2 transition-all ${
              activeTab === 'manage'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Current Teams & Recognized Flags ({combinedClubs.length})
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`pb-3 px-4 font-bold text-sm tracking-wide border-b-2 transition-all ${
              activeTab === 'add'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            + Assign / Upload Custom Logo or Flag
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'manage' && (
            <div className="space-y-4">
              {/* Search & info */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search club or team name (e.g. Selangor, Jaguh, KL, Malaysia)..."
                    className="w-full bg-[#162036] border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  onClick={() => {
                    setTargetClubName('');
                    setCustomUrl('');
                    setPreviewImage(null);
                    setSelectedQuickFlag(null);
                    setActiveTab('add');
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-md shrink-0 flex items-center gap-2"
                >
                  <Upload size={16} />
                  Assign New
                </button>
              </div>

              {/* Grid of clubs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[52vh] overflow-y-auto pr-1">
                {filteredClubs.map((club) => {
                  const normalized = normalizeKey(club);
                  const isCustom = Boolean(teamLogos[normalized] || teamLogos[club.toLowerCase()]);
                  const resolved = getPlayerLogoOrFlag(club, club, teamLogos, null, true);

                  return (
                    <div
                      key={club}
                      className="flex items-center justify-between p-3 bg-[#162036]/80 hover:bg-[#1a2640] border border-slate-800 rounded-xl transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerLogoBadge
                          club={club}
                          customLogos={teamLogos}
                          size="md"
                          className="shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{club}</p>
                          <span className="text-[10px] uppercase font-semibold text-slate-400">
                            {isCustom ? (
                              <span className="text-emerald-400">Custom Upload</span>
                            ) : (
                              <span>Auto-detected Flag</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 shrink-0">
                        <button
                          onClick={() => selectClubToEdit(club)}
                          className="px-2.5 py-1 text-xs font-bold text-blue-400 bg-blue-900/30 hover:bg-blue-900/60 rounded border border-blue-500/30"
                          title="Change or Edit Logo"
                        >
                          Edit
                        </button>
                        {isCustom && (
                          <button
                            onClick={() => {
                              onDeleteTeamLogo(normalized);
                              onDeleteTeamLogo(club.toLowerCase());
                            }}
                            className="p-1.5 text-rose-400 hover:bg-rose-900/30 rounded border border-rose-500/20"
                            title="Reset to default"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredClubs.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    No clubs matching "{searchTerm}". Click "Assign New" to assign a logo.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'add' && (
            <div className="space-y-6">
              {/* Club / Athlete Name */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Club or Athlete Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetClubName}
                    onChange={(e) => setTargetClubName(e.target.value)}
                    placeholder="Enter club name or player name (e.g., Selangor, Persatuan Taekwondo Johor, Mas)..."
                    className="flex-1 bg-[#162036] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {/* Dropdown of existing clubs for quick pick */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) setTargetClubName(e.target.value);
                    }}
                    className="bg-[#162036] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">Pick from active tournament clubs...</option>
                    {existingClubs.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Logo Choice: Quick State/Country Flag or Upload File */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Method 1: Upload or URL */}
                <div className="bg-[#162036] p-4 rounded-xl border border-slate-800 space-y-4">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Upload size={14} className="text-blue-400" /> Option 1: Upload Image or Paste URL
                  </h3>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Upload Local Image (PNG, JPG, SVG - max 2MB):</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Or Paste Direct Image / Flag URL:</label>
                    <input
                      type="text"
                      value={customUrl}
                      onChange={(e) => {
                        setCustomUrl(e.target.value);
                        setPreviewImage(e.target.value);
                        setSelectedQuickFlag(null);
                      }}
                      placeholder="https://example.com/logo.png"
                      className="w-full bg-[#0f172a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Method 2: Quick Flag Selector */}
                <div className="bg-[#162036] p-4 rounded-xl border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Flag size={14} className="text-emerald-400" /> Option 2: Choose State / Country Flag
                  </h3>

                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                    {AVAILABLE_DEMO_FLAGS.map((flag) => {
                      const isSelected = selectedQuickFlag === flag.url;
                      return (
                        <button
                          key={flag.code}
                          type="button"
                          onClick={() => {
                            setSelectedQuickFlag(flag.url);
                            setPreviewImage(flag.url);
                            setCustomUrl('');
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                            isSelected
                              ? 'bg-blue-600/30 border-blue-500 ring-2 ring-blue-500/50'
                              : 'bg-[#0f172a] border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <img
                            src={flag.url}
                            alt={flag.name}
                            className="w-8 h-6 object-contain rounded-sm shadow-sm mb-1"
                          />
                          <span className="text-[10px] font-bold text-slate-300 truncate w-full">
                            {flag.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Preview Bar */}
              {(previewImage || customUrl || selectedQuickFlag || targetClubName) && (
                <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-950 border border-white/20 flex items-center justify-center overflow-hidden p-1">
                      {previewImage || customUrl || selectedQuickFlag ? (
                        <img
                          src={previewImage || customUrl || selectedQuickFlag || ''}
                          alt="Preview"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <PlayerLogoBadge club={targetClubName} size="md" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">
                        {targetClubName || 'Club Name Preview'}
                      </p>
                      <p className="text-xs text-emerald-400">
                        {previewImage || customUrl || selectedQuickFlag ? 'Ready to apply' : 'Will use auto-detected flag / monogram'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetClubName('');
                        setCustomUrl('');
                        setPreviewImage(null);
                        setSelectedQuickFlag(null);
                        setActiveTab('manage');
                      }}
                      className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyLogo}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center gap-2"
                    >
                      <CheckCircle2 size={16} /> Save & Synchronize Logo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamLogosManagerModal;
