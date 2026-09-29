import { useEffect, useState, useSyncExternalStore } from 'react';

// All "what time is it" questions go through now(). In development the clock
// can be shifted from Settings to test day rollover without waiting for it.

let offsetMs = 0;
const listeners = new Set<() => void>();

export function now(): number {
  return Date.now() + offsetMs;
}

export function getClockOffsetMs(): number {
  return offsetMs;
}

export function setClockOffsetMs(ms: number): void {
  if (!__DEV__) return;
  offsetMs = ms;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useClockOffsetMs(): number {
  return useSyncExternalStore(subscribe, getClockOffsetMs, getClockOffsetMs);
}

const TICK_MS = 30_000;

/** The current time, refreshed every 30 s and whenever the dev offset changes. */
export function useNow(): number {
  const offset = useClockOffsetMs();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return tick + offset;
}
