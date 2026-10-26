import { renderToStaticMarkup } from 'react-dom/server';
import { getAlgorithmDefinition } from '../../../engine/AlgorithmRegistry';
import type { AlgorithmId, ExecutionStep } from '../../../types/algorithm';
import { ArrayVisualizer } from '../ArrayVisualizer';
import { deriveOutcome } from '../barVisuals';

export interface ParsedBar {
  index: number;
  role: string;
  inRange: boolean;
  pointers: string[];
}

/** Renders the REAL ArrayVisualizer for one step of a real trace, exactly as VisualizerPage wires it. */
export function renderStep(id: AlgorithmId, steps: ExecutionStep[], index: number): string {
  const def = getAlgorithmDefinition(id);
  return renderToStaticMarkup(
    <ArrayVisualizer
      currentStep={steps[index]}
      positionPointers={def?.positionPointers}
      outcome={deriveOutcome(steps, index)}
      hashMapShape={steps.find(s => s.hashMap)?.hashMap}
    />
  );
}

export function parseBars(html: string): ParsedBar[] {
  const out: ParsedBar[] = [];
  const re = /data-bar-index="(\d+)" data-role="([a-z]+)" data-in-range="(true|false)" data-pointers="([^"]*)"/g;
  for (const m of html.matchAll(re)) {
    out.push({ index: Number(m[1]), role: m[2], inRange: m[3] === 'true', pointers: m[4] ? m[4].split(',') : [] });
  }
  return out;
}

export const rolesOf = (bars: ParsedBar[], role: string) => bars.filter(b => b.role === role).map(b => b.index);
