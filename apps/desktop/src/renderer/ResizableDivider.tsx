import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface ResizableDividerProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onResize: (clientX: number) => void;
  onKeyboardResize: (delta: number) => void;
  testId: string;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

export function ResizableDivider({ label, value, min, max, onResize, onKeyboardResize, testId, className = '', orientation = 'vertical' }: ResizableDividerProps) {
  const [dragging, setDragging] = useState(false);
  const animationRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
  }, []);

  function scheduleResize(position: number) {
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    scheduleResize(orientation === 'vertical' ? event.clientX : event.clientY);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pendingPositionRef.current !== null) {
      const pending = pendingPositionRef.current;
      pendingPositionRef.current = null;
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      onResize(pending);
    }
    setDragging(false);
    event.currentTarget.blur();
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
    onPointerMove={pointerMove}
    onPointerUp={pointerUp}
    onPointerCancel={pointerUp}
    onKeyDown={keyDown}
    data-testid={testId}
  ><span /></div>;
}
