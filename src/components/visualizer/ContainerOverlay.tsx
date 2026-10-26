import React, { useLayoutEffect, useState } from 'react';
import type { ContainerSpan, ContainerView } from '../../types/algorithm';

interface ContainerOverlayProps {
  view: ContainerView;
  /** the bars' container: the overlay is positioned in it, from the bar columns' measured places */
  plotRef: React.RefObject<HTMLDivElement | null>;
  /** the bars' own height scale (value → % of the plot area), so the water level meets the shorter line's top */
  heightFor: (value: number) => number;
  transitionMs: number;
}

interface Box {
  left: number;
  width: number;
  bottom: number;
  height: number;
}

/**
 * Where a container sits over the bars: from the centre of its left line to the centre of its right line, from the
 * plot's floor up to its water level. Measured from the rendered columns (their x never animates), so it stays
 * aligned at every width; null until measured (server rendering, tests), when only the data attributes are drawn.
 */
function measure(root: HTMLElement, span: ContainerSpan, heightFor: (v: number) => number): Box | null {
  const col = (i: number) => root.querySelector<HTMLElement>(`[data-bar-index="${i}"]`);
  const l = col(span.left);
  const r = col(span.right);
  const plot = l?.firstElementChild as HTMLElement | null | undefined;
  if (!l || !r || !plot) return null;
  const base = root.getBoundingClientRect();
  const lr = l.getBoundingClientRect();
  const rr = r.getBoundingClientRect();
  const pr = plot.getBoundingClientRect();
  const x1 = lr.left + lr.width / 2 - base.left;
  const x2 = rr.left + rr.width / 2 - base.left;
  return {
    left: x1,
    width: Math.max(0, x2 - x1),
    bottom: base.bottom - pr.bottom,
    // a level of 0 holds no water (the bar scale draws 0 as a short stub, which is not water)
    height: span.level === 0 ? 0 : (pr.height * heightFor(span.level)) / 100,
  };
}

const Container: React.FC<{ kind: 'current' | 'best'; span: ContainerSpan; box: Box | null; transitionMs: number }> = ({ kind, span, box, transitionMs }) => (
  <div
    data-container={kind}
    data-left={span.left}
    data-right={span.right}
    data-level={span.level}
    data-area={span.area}
    aria-hidden="true"
    style={
      box
        ? { left: box.left, width: box.width, bottom: box.bottom, height: box.height, transitionDuration: `${transitionMs}ms` }
        : { visibility: 'hidden' }
    }
    className={`absolute pointer-events-none transition-[left,width,height] motion-reduce:transition-none ${
      kind === 'current'
        ? 'bg-sky-400/25 border-t-2 border-sky-300 z-0'
        : 'border-2 border-dashed border-emerald-400/90 rounded-sm z-20'
    }`}
  >
    <span
      className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
        kind === 'current' ? '-top-5 bg-sky-500/20 text-sky-200 border border-sky-400/50' : '-bottom-5 bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
      }`}
    >
      {kind === 'current' ? `area ${span.area}` : `best ${span.area}`}
    </span>
  </div>
);

/** Container With Most Water: the container being measured (water) and the best one so far (dashed outline). */
export const ContainerOverlay: React.FC<ContainerOverlayProps> = ({ view, plotRef, heightFor, transitionMs }) => {
  const [boxes, setBoxes] = useState<{ current: Box | null; best: Box | null }>({ current: null, best: null });
  const { current, best } = view;

  useLayoutEffect(() => {
    const root = plotRef.current;
    if (!root) return;
    const update = () =>
      setBoxes({
        current: current ? measure(root, current, heightFor) : null,
        best: best ? measure(root, best, heightFor) : null,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [plotRef, current, best, heightFor]);

  return (
    <>
      {current && <Container kind="current" span={current} box={boxes.current} transitionMs={transitionMs} />}
      {best && <Container kind="best" span={best} box={boxes.best} transitionMs={transitionMs} />}
    </>
  );
};
