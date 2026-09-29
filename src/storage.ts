import type { BenchmarkSession } from './types';

const STORAGE_KEY = 'aw-performance-lab.sessions.v1';
const MAX_SESSIONS = 50;
let memoryFallback: BenchmarkSession[] = [];

export interface StorageResult<T> {
  value: T;
  persisted: boolean;
}

export function loadSessions(): StorageResult<BenchmarkSession[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as BenchmarkSession[];
    return { value: Array.isArray(parsed) ? parsed.slice(0, MAX_SESSIONS) : [], persisted: true };
  } catch {
    return { value: [...memoryFallback], persisted: false };
  }
}

export function saveSession(session: BenchmarkSession): StorageResult<BenchmarkSession[]> {
  const sessions = [session, ...loadSessions().value.filter((item) => item.id !== session.id)].slice(0, MAX_SESSIONS);
  memoryFallback = sessions;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return { value: sessions, persisted: true };
  } catch {
    return { value: sessions, persisted: false };
  }
}

export function clearSessions(): StorageResult<BenchmarkSession[]> {
  memoryFallback = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
    return { value: [], persisted: true };
  } catch {
    return { value: [], persisted: false };
  }
}
