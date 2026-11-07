import React from 'react';
import { wrapRadarLabel } from './progressData';

/** what recharts passes a custom PolarAngleAxis tick (the parts used here) */
export interface RadarTopicTickProps {
  x: number;
  y: number;
  textAnchor?: 'start' | 'middle' | 'end' | 'inherit';
  /** recharts: 'start' below the vertex (top sector), 'end' above it (bottom sector), 'middle' beside it */
  verticalAnchor?: 'start' | 'middle' | 'end';
  fill?: string;
  fontSize?: number | string;
  payload: { value: string };
  /** the most characters per line before the name wraps (radarLineChars for the chart's width) */
  lineChars?: number;
}

/**
 * One topic name on the radar, on one or two lines (wrapRadarLabel). It is placed exactly like recharts' own tick text
 * (cap height 0.71em, line height 1em, the same anchors), so a one-line name looks as before; a two-line name grows
 * away from the radar: upwards above it, downwards below it, centred on the vertex beside it.
 */
export const RadarTopicTick: React.FC<RadarTopicTickProps> = ({ x, y, textAnchor = 'middle', verticalAnchor = 'middle', fill, fontSize, payload, lineChars }) => {
  const lines = wrapRadarLabel(String(payload.value), lineChars);
  const extra = lines.length - 1;
  const firstDy = verticalAnchor === 'start' ? 0.71 : verticalAnchor === 'end' ? -extra : -extra / 2 + 0.355;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill={fill} fontSize={fontSize} className="recharts-text recharts-polar-angle-axis-tick-value" data-lines={lines.length}>
      {lines.map((line, k) => (
        <tspan key={k} x={x} dy={`${k === 0 ? Number(firstDy.toFixed(3)) : 1}em`}>
          {line}
        </tspan>
      ))}
    </text>
  );
};
