import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface ResizableDividerProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onResizeStart?: (clientPosition: number) => void;
  onResize: (clientX: number) => void;
  onResizeEnd?: (clientX: number) => void;
  onKeyboardResize: (delta: number) => void;
  testId: string;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

export function ResizableDivider({ label, value, min, max, onResizeStart, onResize, onResizeEnd, onKeyboardResize, testId, className = '', orientation = 'vertical' }: ResizableDividerProps) {
  const [dragging, setDragging] = useState(false);
  const animationRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<number | null>(null);
  const lastPositionRef = useRef<number | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    dragCleanupRef.current?.();
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
    delete document.documentElement.dataset.resizing;
  }, []);

  function scheduleResize(position: number) {
    lastPositionRef.current = position;
    pendingPositionRef.current = position;
    if (animationRef.current !== null) return;
    animationRef.current = window.requestAnimationFrame(() => {
      animationRef.current = null;
      const pending = pendingPositionRef.current;
      pendingPositionRef.current = null;
      if (pending !== null) onResize(pending);
    });
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCleanupRef.current?.();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture(pointerId);
    const position = orientation === 'vertical' ? event.clientX : event.clientY;
    lastPositionRef.current = position;
    onResizeStart?.(position);
    document.documentElement.dataset.resizing = orientation;
    setDragging(true);
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const samples = next.getCoalescedEvents?.() ?? [next];
      const latest = samples.at(-1) ?? next;
      scheduleResize(orientation === 'vertical' ? latest.clientX : latest.clientY);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      dragCleanupRef.current = null;
    };
    const finish = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      cleanup();
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      if (pendingPositionRef.current !== null) {
        const pending = pendingPositionRef.current;
        pendingPositionRef.current = null;
        if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
        onResize(pending);
      }
      if (lastPositionRef.current !== null) onResizeEnd?.(lastPositionRef.current);
      lastPositionRef.current = null;
      delete document.documentElement.dataset.resizing;
      setDragging(false);
      target.blur();
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const backward = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
    const forward = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== backward && event.key !== forward) return;
    event.preventDefault();
    onKeyboardResize(event.key === backward ? -16 : 16);
  }

  return <div
    className={`split-resizer ${dragging ? 'dragging' : ''} ${className}`.trim()}
    role="separator"
    aria-label={label}
    aria-orientation={orientation}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={Math.round(value)}
    tabIndex={0}
    onPointerDown={pointerDown}
    onKeyDown={keyDown}
    data-testid={testId}
  ><span /></div>;
}
