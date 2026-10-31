import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import localSqliteDb from '../services/localSqliteDb';
import { resetRevalidationThrottle } from '../services/dbInterceptor';

export default function RefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState(null); // { x, y } in px, or null for default
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialPosX: 0, initialPosY: 0, hasMoved: false });
  const buttonRef = useRef(null);

  // Initialize or handle window resize to keep button inside viewport
  useEffect(() => {
    const handleResize = () => {
      if (position) {
        const maxX = window.innerWidth - 64;
        const maxY = window.innerHeight - 64;
        setPosition(prev => {
          if (!prev) return null;
          return {
            x: Math.min(Math.max(16, prev.x), maxX),
            y: Math.min(Math.max(16, prev.y), maxY)
          };
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position]);

  // Execute full application refresh with cache invalidation
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    try {
      // 1. Wipe local SQLite/IndexedDB caches so next render pulls 100% fresh data from server
      if (localSqliteDb && typeof localSqliteDb.clearAll === 'function') {
        await localSqliteDb.clearAll();
      }

      // 2. Clear API revalidation throttle
      if (typeof resetRevalidationThrottle === 'function') {
        resetRevalidationThrottle();
      }

      // 3. Dispatch events in case any active listeners exist
      window.dispatchEvent(new CustomEvent('localDbSyncUpdated', { detail: { fullSync: true } }));
      window.dispatchEvent(new CustomEvent('appRefresh', { detail: { timestamp: Date.now() } }));
    } catch (err) {
      console.warn('[RefreshButton] Cache cleanup warning:', err);
    } finally {
      // Smooth visual feedback before reload
      setTimeout(() => {
        window.location.reload();
      }, 400);
    }
  };

  // Let other components (e.g. the navbar "Weekly Dues" button) trigger this
  // exact refresh by dispatching: window.dispatchEvent(new Event('triggerAppRefresh'))
  const handleRefreshRef = useRef(handleRefresh);
  handleRefreshRef.current = handleRefresh;

  useEffect(() => {
    const onTriggerRefresh = () => {
      if (handleRefreshRef.current) handleRefreshRef.current();
    };
    window.addEventListener('triggerAppRefresh', onTriggerRefresh);
    return () => window.removeEventListener('triggerAppRefresh', onTriggerRefresh);
  }, []);

  // --- DRAG / TOUCH HANDLERS ---
  const handlePointerDown = (clientX, clientY) => {
    isDraggingRef.current = true;
    const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : { left: 0, top: 0 };
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initialPosX: rect.left,
      initialPosY: rect.top,
      hasMoved: false
    };
  };

  const handlePointerMove = (clientX, clientY) => {
    if (!isDraggingRef.current) return;
    const dx = clientX - dragStartRef.current.startX;
    const dy = clientY - dragStartRef.current.startY;

    // Only consider it a drag if moved more than 5px
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragStartRef.current.hasMoved = true;
    }

    if (dragStartRef.current.hasMoved) {
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
      const newX = Math.min(Math.max(12, dragStartRef.current.initialPosX + dx), maxX);
      const newY = Math.min(Math.max(12, dragStartRef.current.initialPosY + dy), maxY);

      setPosition({ x: newX, y: newY });
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    const wasMoved = dragStartRef.current.hasMoved;
    isDraggingRef.current = false;

    // If pointer didn't move significantly, treat it as a click/tap
    if (!wasMoved && !isRefreshing) {
      handleRefresh();
    }
  };

  // Mouse drag listeners
  const onMouseDown = (e) => {
    e.preventDefault();
    handlePointerDown(e.clientX, e.clientY);

    const onMouseMove = (moveEvent) => {
      handlePointerMove(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = () => {
      handlePointerUp();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Touch drag listeners
  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handlePointerDown(touch.clientX, touch.clientY);
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      const touch = e.touches[0];
      handlePointerMove(touch.clientX, touch.clientY);
    }
  };

  const onTouchEnd = () => {
    handlePointerUp();
  };

  // Determine button positioning styles
  const buttonStyle = position
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 99999,
        touchAction: 'none'
      }
    : {
        position: 'fixed',
        bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
        right: 'max(20px, env(safe-area-inset-right, 20px))',
        zIndex: 99999,
        touchAction: 'none'
      };

  return (
    <div
      ref={buttonRef}
      style={buttonStyle}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="select-none"
    >
      <div className="relative flex items-center justify-center">
        {/* Hover / Active Tooltip Pill */}
        {(isHovered || isRefreshing) && (
          <div
            className={`
              absolute right-full mr-2.5 px-3 py-1.5 rounded-lg
              bg-[#16423C]/95 text-white text-xs font-semibold tracking-wide
              whitespace-nowrap shadow-xl border border-[#6A9C89]/40 backdrop-blur-md
              pointer-events-none transition-all duration-200
              ${isRefreshing ? 'animate-pulse' : 'animate-in fade-in zoom-in-95'}
            `}
          >
            {isRefreshing ? 'Refreshing data...' : 'Refresh App'}
          </div>
        )}

        {/* Floating Action Button */}
        <button
          type="button"
          onClick={(e) => {
            // Click event handled in pointerUp for drag support, but fallback here
            e.preventDefault();
            if (!dragStartRef.current.hasMoved && !isRefreshing) {
              handleRefresh();
            }
          }}
          disabled={isRefreshing}
          aria-label="Refresh App"
          title="Refresh App"
          className={`
            group flex items-center justify-center
            w-12 h-12 md:w-13 md:h-13 rounded-full
            bg-gradient-to-br from-[#16423C] to-[#0f2e29]
            hover:from-[#1d534a] hover:to-[#16423C]
            text-white border-2 border-[#6A9C89]/70
            shadow-[0_6px_20px_rgba(22,66,60,0.45)]
            hover:shadow-[0_8px_25px_rgba(106,156,137,0.55)]
            hover:border-[#6A9C89]
            active:scale-95 transition-all duration-200
            cursor-pointer focus:outline-none
            ${isRefreshing ? 'ring-4 ring-[#6A9C89]/50 cursor-wait' : ''}
          `}
        >
          <RefreshCw
            className={`
              w-5 h-5 md:w-6 md:h-6 text-[#C4DAD2] group-hover:text-white
              transition-transform duration-300
              ${isRefreshing ? 'animate-spin text-white' : 'group-hover:rotate-45'}
            `}
          />
        </button>
      </div>
    </div>
  );
}