const SIZE_OPTIONS = [5, 7, 10, 12];

/** Preset sizes plus the CURRENT size (e.g. Merge Sort's default input has 8 elements), so the control never lies. */
export const getSizeOptions = (current: number): number[] =>
  [...new Set([...SIZE_OPTIONS, current])].sort((a, b) => a - b);
