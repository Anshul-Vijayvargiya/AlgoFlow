import React, { useLayoutEffect, useState } from 'react';
import type { WaterView } from '../../types/algorithm';

interface WaterOverlayProps {
  view: WaterView;
  heights: readonly number[];
  /** the bars' container: the water is positioned in it, from the bar columns' measured places */
  plotRef: React.RefObject<HTMLDivElement | null>;
  /** the bars' own height scale (value → % of the plot area), so the water meets the bars it lies between */
  heightFor: (value: number) => number;
  transitionMs: number;
}

interface Box {
  left: number;
  width: number;
  bottom: number;
  height: number;
}

/** a pool shorter than this would vanish where the bar scale clamps low bars to a minimum; its label still says the amount */
const MIN_POOL_PX = 4;

/**
 * Where bar i's water sits: over its column, from the top of the bar up to the water level (height + amount), in the
 * bars' own scale. Measured from the rendered columns (their x never animates); null until measured (server rendering,
 * tests), when only the data attributes are drawn.
 */
function measure(root: HTMLElement, i: number, height: number, amount: number, heightFor: (v: number) => number): Box | null {
  const col = root.querySelector<HTMLElement>(`[data-bar-index="${i}"]`);
  const plot = col?.firstElementChild as HTMLElement | null | undefined;
  if (!col || !plot) return null;
  const base = root.getBoundingClientRect();
  const cr = col.getBoundingClientRect();
  const pr = plot.getBoundingClientRect();
  const barTop = (pr.height * heightFor(height)) / 100;
  const level = (pr.height * heightFor(height + amount)) / 100;
  return { left: cr.left - base.left, width: cr.width, bottom: base.bottom - pr.bottom + barTop, height: Math.max(MIN_POOL_PX, level - barTop) };
}

/** Trapping Rain Water: the water each bar holds so far, and the bar the step decides. */
export const WaterOverlay: React.FC<WaterOverlayProps> = ({ view, heights, plotRef, heightFor, transitionMs }) => {
  const [boxes, setBoxes] = useState<(Box | null)[]>([]);
  const { amounts, current } = view;

  useLayoutEffect(() => {
    const root = plotRef.current;
    if (!root) return;
    const update = () => setBoxes(amounts.map((a, i) => (a > 0 ? measure(root, i, heights[i], a, heightFor) : null)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [plotRef, amounts, heights, heightFor]);

  const total = amounts.reduce((sum, a) => sum + a, 0);
  return (
    <div data-testid="water" data-total={total} data-current={current ?? ''} className="contents">
      {amounts.map((amount, i) => {
        if (amount <= 0) return null;
        const box = boxes[i] ?? null;
        return (
          <div
            key={i}
            data-water-index={i}
            data-amount={amount}
            data-current={i === current ? 'true' : 'false'}
            aria-hidden="true"
            style={
              box
                ? { left: box.left, width: box.width, bottom: box.bottom, height: box.height, transitionDuration: `${transitionMs}ms` }
                : { visibility: 'hidden' }
            }
            className={`absolute pointer-events-none z-0 rounded-t-sm transition-[height,bottom] motion-reduce:transition-none ${
              i === current ? 'bg-sky-400/45 border-t-2 border-sky-200' : 'bg-sky-400/25 border-t border-sky-300/70'
            }`}
          >
            <span className="absolute left-1/2 -translate-x-1/2 -top-4 text-[10px] leading-3 font-mono font-bold text-sky-200">{amount}</span>
          </div>
        );
      })}
    </div>
  );
};
