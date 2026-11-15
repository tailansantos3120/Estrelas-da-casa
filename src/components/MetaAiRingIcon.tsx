import React, { useId } from 'react';

interface MetaAiRingIconProps {
  className?: string;
  spinning?: boolean;
}

export function MetaAiRingIcon({ className = 'w-6 h-6', spinning = false }: MetaAiRingIconProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `meta-ai-ring-${uid}`;
  const glowId = `meta-ai-glow-${uid}`;

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={`${className} ${spinning ? 'animate-spin' : ''}`}
      style={spinning ? { animationDuration: '2.2s' } : undefined}
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="6" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="35%" stopColor="#0084FF" />
          <stop offset="70%" stopColor="#6E56CF" />
          <stop offset="100%" stopColor="#E040FB" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#0084FF" stopOpacity="0" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#${glowId})`} />
      <circle
        cx="20"
        cy="20"
        r="13.5"
        stroke={`url(#${gradId})`}
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <circle
        cx="20"
        cy="20"
        r="13.5"
        stroke="#FFFFFF"
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeDasharray="16 68"
        strokeLinecap="round"
      />
    </svg>
  );
}
