import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface TimePickerSheetProps {
  open: boolean;
  /** Current value as 'HH:mm' (24h), or '' when no time is set. */
  value: string;
  /** Called with the new 'HH:mm' value, or '' when cleared. */
  onSelect: (value: string) => void;
  onClose: () => void;
  /** Hide the Clear action when the field must always hold a value. */
  allowClear?: boolean;
}

// SVG dial geometry (viewBox units).
const SIZE = 288;
const CENTER = SIZE / 2;
const NUMBER_RADIUS = 104;
const THUMB_RADIUS = 20;

/** Formats a 24h 'HH:mm' string as a friendly 12h clock, e.g. '18:30' → '6:30 PM'. */
export function formatTime12h(value: string): string {
  if (!value) return '';
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${meridiem}`;
}

/**
 * Round clock-face time picker — a centered modal dialog (portaled to
 * <body> so no stacking context can trap it), Material-style:
 * tap or drag on the dial to pick the hour, then the minutes; the selected
 * value rides in the center bubble. Replaces the cramped native
 * `<input type="time">` popup.
 */
export const TimePickerSheet: React.FC<TimePickerSheetProps> = ({
  open,
  value,
  onSelect,
  onClose,
  allowClear = true,
}) => {
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>('AM');
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Seed the picker from the current value each time it opens.
  useEffect(() => {
    if (!open) return;
    if (value) {
      const [hStr, mStr] = value.split(':');
      const h = Number(hStr) || 0;
      const m = Number(mStr) || 0;
      setMeridiem(h >= 12 ? 'PM' : 'AM');
      setHour12(h % 12 || 12);
      setMinute(m);
    } else {
      setHour12(9);
      setMinute(0);
      setMeridiem('AM');
    }
    setMode('hour');
    setIsDragging(false);
  }, [open, value]);

  if (!open) return null;

  const updateFromPointer = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = ((clientX - rect.left) / rect.width) * SIZE;
    const y = ((clientY - rect.top) / rect.height) * SIZE;
    const dx = x - CENTER;
    const dy = y - CENTER;
    // 0° = 12 o'clock, growing clockwise.
    const deg = (Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 360) % 360;

    if (mode === 'hour') {
      const h = Math.round(deg / 30) % 12;
      setHour12(h === 0 ? 12 : h);
    } else {
      setMinute(Math.round(deg / 6) % 60);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging) updateFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    // Like Material: picking the hour advances to the minute dial.
    if (mode === 'hour') setMode('minute');
  };

  const commit = () => {
    const hour24 = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
    onSelect(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    onClose();
  };

  const clear = () => {
    onSelect('');
    onClose();
  };

  // Thumb sits at the selected position on the dial.
  const selectedDeg = mode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const thumbRad = ((selectedDeg - 90) * Math.PI) / 180;
  const thumbX = CENTER + NUMBER_RADIUS * Math.cos(thumbRad);
  const thumbY = CENTER + NUMBER_RADIUS * Math.sin(thumbRad);

  const dialNumbers = Array.from({ length: 12 }, (_, i) => {
    const angle = ((i * 30 - 90) * Math.PI) / 180;
    return {
      x: CENTER + NUMBER_RADIUS * Math.cos(angle),
      y: CENTER + NUMBER_RADIUS * Math.sin(angle),
      label: mode === 'hour' ? (i === 0 ? '12' : String(i)) : String(i * 5).padStart(2, '0'),
    };
  });

  const modeButtonClass = (active: boolean) =>
    `text-4xl font-extrabold font-mono tabular-nums leading-none rounded-2xl px-2.5 py-1 transition-colors cursor-pointer ${
      active
        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
        : 'text-slate-900 dark:text-white'
    }`;

  const meridiemClass = (active: boolean) =>
    `px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
    }`;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm overlay-safe animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[calc(100dvh-3rem)] overflow-y-auto bg-white dark:bg-slate-900 rounded-[1.75rem] border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title row */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Set time</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close time picker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Big time display — hour and minute are tappable to switch the dial mode */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <button type="button" onClick={() => setMode('hour')} className={modeButtonClass(mode === 'hour')}>
            {hour12}
          </button>
          <span className="text-3xl font-extrabold text-slate-300 dark:text-slate-600">:</span>
          <button type="button" onClick={() => setMode('minute')} className={modeButtonClass(mode === 'minute')}>
            {String(minute).padStart(2, '0')}
          </button>

          <div className="flex flex-col gap-1 ml-2">
            {(['AM', 'PM'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMeridiem(m)}
                className={meridiemClass(meridiem === m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-2">
          {mode === 'hour' ? 'Tap the clock to set the hour' : 'Tap or drag to set the minutes'}
        </p>

        {/* Round clock dial */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full max-w-[240px] mx-auto touch-none select-none mt-1"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Face */}
          <circle cx={CENTER} cy={CENTER} r={CENTER - 4} className="fill-slate-100 dark:fill-slate-800/70" />

          {/* Hand from center to the selection */}
          <line
            x1={CENTER}
            y1={CENTER}
            x2={thumbX}
            y2={thumbY}
            className="stroke-indigo-600 dark:stroke-indigo-500"
            strokeWidth="2"
          />

          {/* Dial numbers */}
          {dialNumbers.map((n, i) => (
            <text
              key={i}
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="15"
              fontWeight="700"
              className="fill-slate-500 dark:fill-slate-400 pointer-events-none"
            >
              {n.label}
            </text>
          ))}

          {/* Center pivot */}
          <circle cx={CENTER} cy={CENTER} r="3.5" className="fill-indigo-600 dark:fill-indigo-500" />

          {/* Selection thumb */}
          <circle
            cx={thumbX}
            cy={thumbY}
            r={THUMB_RADIUS}
            className="fill-indigo-600 dark:fill-indigo-500 pointer-events-none"
          />
          <text
            x={thumbX}
            y={thumbY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="15"
            fontWeight="700"
            className="fill-white pointer-events-none"
          >
            {mode === 'hour' ? hour12 : String(minute).padStart(2, '0')}
          </text>
        </svg>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-5">
          {allowClear && (
            <button
              type="button"
              onClick={clear}
              className="px-5 py-3 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={commit}
            className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TimePickerSheet;
