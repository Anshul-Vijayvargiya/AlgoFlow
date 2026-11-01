import { useEffect, useState } from 'react';

/** whole seconds left until `retryAt` (0 when it has passed or there is none) */
export function secondsUntil(retryAt: number | null, now: number): number {
  return retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/** "45 s", "2 min 5 s", "15 min" */
export function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const min = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${min} min ${s} s` : `${min} min`;
}

/**
 * The current time, re-read once a second while any of `deadlines` is still ahead (the Retry countdowns); no timer
 * runs otherwise.
 */
export function useClockUntil(...deadlines: (number | null)[]): number {
  const [now, setNow] = useState(() => Date.now());
  const until = Math.max(0, ...deadlines.map(d => d ?? 0));
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 1000);
    // the first tick lands within a second; until then the wait shown is at most a second long
    const first = setTimeout(() => setNow(Date.now()), 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [until]);
  return now;
}
