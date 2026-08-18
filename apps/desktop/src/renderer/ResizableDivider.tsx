import { useState, type KeyboardEvent, type PointerEvent } from 'react';

interface ResizableDividerProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onResize: (clientX: number) => void;
  onKeyboardResize: (delta: number) => void;
  testId: string;
  className?: string;
}

export function ResizableDivider({ label, value, min, max, onResize, onKeyboardResize, testId, className = '' }: ResizableDividerProps) {
  const [dragging, setDragging] = useState(false);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    onResize(event.clientX);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onKeyboardResize(event.key === 'ArrowLeft' ? -16 : 16);
  }

  return <div
    className={`split-resizer ${dragging ? 'dragging' : ''} ${className}`.trim()}
    role="separator"
    aria-label={label}
    aria-orientation="vertical"
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
