import { supabase } from './supabase';
import { GameState, OwnedGenerator } from '../types/game';

const STORAGE_KEY = 'ukraine_tap_game_state';

export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      lastSavedAt: Date.now(),
    }));
  } catch (e) {
    console.error('Failed to save game state:', e);
  }
}

export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GameState;

    // Calculate offline progress
    const now = Date.now();
    const offlineSeconds = (now - parsed.lastSavedAt) / 1000;

    // Apply offline XP for up to 8 hours
    const maxOfflineSeconds = 8 * 60 * 60;
    const cappedOfflineSeconds = Math.min(offlineSeconds, maxOfflineSeconds);

    return parsed;
  } catch (e) {
    console.error('Failed to load game state:', e);
    return null;
  }
}

export function clearGameState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
