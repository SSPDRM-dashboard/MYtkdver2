import React, { useState } from 'react';
import { getPlayerLogoOrFlag, generateClubMonogramBadge } from '../lib/teamLogos';
import { useSyncedState } from '../App';

interface PlayerLogoBadgeProps {
  club?: string | null;
  name?: string | null;
  customLogos?: Record<string, string> | null;
  directLogo?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  generateFallback?: boolean;
  shape?: 'rounded' | 'circle' | 'flag';
  showOverride?: boolean;
}

export const PlayerLogoBadge: React.FC<PlayerLogoBadgeProps> = ({
  club,
  name,
  customLogos,
  directLogo,
  size = 'md',
  className = '',
  generateFallback = true,
  shape = 'rounded',
  showOverride,
}) => {
  const [showPlayerLogos] = useSyncedState<boolean>('tkd_show_player_logos', true);
  const [loadError, setLoadError] = useState(false);

  // Globally hide logo if showPlayerLogos is false, unless explicitly overridden
  if (showPlayerLogos === false && showOverride !== true) {
    return null;
  }

  // If both club and name are empty or placeholders, don't render an empty icon
  const hasContent = (club && club.trim() && club.trim() !== '---') || (name && name.trim() && name.trim() !== '---');
  if (!hasContent && !directLogo) {
    return null;
  }

  // Size definitions
  const sizeMap = {
    xs: 'w-5 h-5 min-w-[20px] max-w-[20px] text-[9px]',
    sm: 'w-7 h-7 min-w-[28px] max-w-[28px] text-[11px]',
    md: 'w-10 h-10 min-w-[40px] max-w-[40px] text-[14px]',
    lg: 'w-13 h-13 min-w-[52px] max-w-[52px] text-[18px]',
    xl: 'w-16 h-16 min-w-[64px] max-w-[64px] text-[22px]',
  };

  const currentSizeClass = sizeMap[size] || sizeMap.md;

  const resolvedUrl = loadError
    ? generateFallback ? generateClubMonogramBadge(club || name) : null
    : getPlayerLogoOrFlag(club, name, customLogos, directLogo, generateFallback);

  if (!resolvedUrl) {
    return null;
  }

  const shapeClass =
    shape === 'circle'
      ? 'rounded-full'
      : shape === 'flag'
      ? 'rounded-sm aspect-[4/3]'
      : 'rounded-md';

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden bg-slate-900/80 border border-white/20 shadow-md ring-1 ring-black/20 ${shapeClass} ${currentSizeClass} ${className}`}
      title={club ? `${club}${name ? ` - ${name}` : ''}` : name || 'Player Flag/Logo'}
    >
      <img
        src={resolvedUrl}
        alt={club || name || 'Team Flag/Logo'}
        onError={() => setLoadError(true)}
        className="w-full h-full object-contain p-0.5 select-none pointer-events-none"
        loading="lazy"
      />
    </div>
  );
};

export default PlayerLogoBadge;
