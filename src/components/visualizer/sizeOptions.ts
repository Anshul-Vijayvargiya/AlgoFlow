const SIZE_OPTIONS = [5, 7, 10, 12];

/**
 * Preset sizes plus the CURRENT size (e.g. Merge Sort's default input has 8 elements), so the control never lies.
 * With bounds (linked lists: at most 10 nodes, 9 when the operation adds one, at least 1 to delete at a position),
 * presets outside them are dropped and the largest allowed size is offered.
 */
export const getSizeOptions = (current: number, bounds?: { min: number; max: number }): number[] => {
  const presets = bounds ? [...SIZE_OPTIONS.filter(n => n >= bounds.min && n <= bounds.max), bounds.max] : SIZE_OPTIONS;
  return [...new Set([...presets, current])].sort((a, b) => a - b);
};
