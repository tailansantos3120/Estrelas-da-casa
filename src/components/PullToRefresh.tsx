import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  hintText: string;
  children: React.ReactNode;
}

export default function PullToRefresh({
  onRefresh,
  isRefreshing,
  hintText,
  children,
}: PullToRefreshProps) {
  const startY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 2) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0 && window.scrollY <= 2) {
      setPullDistance(Math.min(72, delta * 0.45));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= 52) {
      await onRefresh();
    }
    startY.current = null;
    setPullDistance(0);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {(pullDistance > 8 || isRefreshing) && (
        <div
          style={{ height: isRefreshing ? 44 : pullDistance }}
          className="flex items-center justify-center gap-2 text-xs font-medium text-amber-500 overflow-hidden transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Atualizando...' : hintText}</span>
        </div>
      )}
      {children}
    </div>
  );
}
