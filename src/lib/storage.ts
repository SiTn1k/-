import { supabase } from './supabase';
import { GameState, OwnedGenerator } from '../types/game';
import { getTelegramWebApp } from './telegram';

const LOCAL_STORAGE_KEY = 'ukraine_tap_game_state';
const XP_BASE = 100;
const XP_MULTIPLIER = 1.5;

function calculateXpToLevel(level: number): number {
  return Math.floor(XP_BASE * Math.pow(XP_MULTIPLIER, level - 1));
}

// Get Telegram user ID
export function getTelegramUserId(): number | null {
  const tg = getTelegramWebApp();
  return tg?.initDataUnsafe?.user?.id || null;
}

// Get Telegram user info
export function getTelegramUserInfo(): { id: number; username?: string; first_name?: string; photo_url?: string } | null {
  const tg = getTelegramWebApp();
  const user = tg?.initDataUnsafe?.user;
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name,
    photo_url: user.photo_url,
  };
}

// Get referrer ID from URL params
export function getReferrerId(): number | null {
  const tg = getTelegramWebApp();
  const startParam = tg?.initDataUnsafe?.start_param;
  if (startParam && startParam.startsWith('ref_')) {
    const refId = parseInt(startParam.replace('ref_', ''), 10);
    return isNaN(refId) ? null : refId;
  }
  return null;
}

export interface LeaderboardEntry {
  telegram_id: number;
  first_name: string | null;
  username: string | null;
  level: number;
  total_xp: number;
  referrals_count: number;
  rank: number;
}

// Save game state to both localStorage and Supabase
export async function saveGameState(state: GameState): Promise<void> {
  const telegramId = getTelegramUserId();
  const userInfo = getTelegramUserInfo();

  // Always save to localStorage as backup
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      ...state,
      lastSavedAt: Date.now(),
    }));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }

  // Save to Supabase if we have Telegram ID
  if (telegramId && supabase) {
    try {
      const { error } = await supabase
        .from('game_progress')
        .upsert({
          telegram_id: telegramId,
          level: state.level,
          xp: state.xp,
          xp_to_next_level: state.xpToNextLevel,
          total_xp: state.totalXp,
          currency: state.currency,
          total_currency_earned: state.totalCurrencyEarned,
          tap_power: state.tapPower,
          passive_xp_per_second: state.passiveXpPerSecond,
          owned_generators: state.ownedGenerators as unknown as Record<string, unknown>,
          unlocked_epochs: state.unlockedEpochs,
          artifact_parts: state.artifactParts || {},
          completed_artifacts: state.completedArtifacts || [],
          username: userInfo?.username || null,
          first_name: userInfo?.first_name || null,
          photo_url: userInfo?.photo_url || null,
          last_saved_at: new Date().toISOString(),
        }, { onConflict: 'telegram_id' });

      if (error) {
        console.error('Failed to save to Supabase:', error);
      }
    } catch (e) {
      console.error('Failed to save to Supabase:', e);
    }
  }
}

// Load game state - prioritize Supabase, fall back to localStorage
export async function loadGameState(): Promise<GameState | null> {
  const telegramId = getTelegramUserId();

  // Try Supabase first if we have Telegram ID
  if (telegramId && supabase) {
    try {
      const { data, error } = await supabase
        .from('game_progress')
        .select('*')
        .eq('telegram_id', telegramId)
        .maybeSingle();

      if (data && !error) {
        // Calculate offline progress
        const now = Date.now();
        const lastSaved = new Date(data.last_saved_at).getTime();
        const offlineMs = now - lastSaved;
        const maxOfflineMs = 8 * 60 * 60 * 1000;
        const cappedOfflineMs = Math.min(offlineMs, maxOfflineMs);
        const offlineSeconds = cappedOfflineMs / 1000;

        const ownedGenerators = (data.owned_generators as OwnedGenerator[]) || [];
        const passiveXpPerSecond = data.passive_xp_per_second || 0;
        const offlineXpGain = passiveXpPerSecond * offlineSeconds;
        const offlineCurrencyGain = (data.level * 50) * (offlineSeconds / 60);

        return {
          epochId: 'trypillia',
          level: data.level,
          xp: data.xp + offlineXpGain,
          xpToNextLevel: data.xp_to_next_level || calculateXpToLevel(data.level),
          totalXp: data.total_xp + offlineXpGain,
          currency: data.currency + offlineCurrencyGain,
          totalCurrencyEarned: data.total_currency_earned + offlineCurrencyGain,
          tapPower: data.tap_power,
          passiveXpPerSecond: data.passive_xp_per_second,
          ownedGenerators,
          unlockedEpochs: data.unlocked_epochs || ['trypillia'],
          artifactParts: (data.artifact_parts as Record<string, number>) || {},
          completedArtifacts: data.completed_artifacts || [],
          lastSavedAt: now,
          referrerId: data.referrer_id,
          referralsCount: data.referrals_count || 0,
          referralEarnings: data.referral_earnings || 0,
        };
      }
    } catch (e) {
      console.error('Failed to load from Supabase:', e);
    }
  }

  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GameState;
    const now = Date.now();
    const offlineMs = now - parsed.lastSavedAt;
    const maxOfflineMs = 8 * 60 * 60 * 1000;
    const cappedOfflineMs = Math.min(offlineMs, maxOfflineMs);
    const offlineSeconds = cappedOfflineMs / 1000;

    const offlineXpGain = parsed.passiveXpPerSecond * offlineSeconds;
    const offlineCurrencyGain = (parsed.level * 50) * (offlineSeconds / 60);

    return {
      ...parsed,
      xp: parsed.xp + offlineXpGain,
      totalXp: parsed.totalXp + offlineXpGain,
      currency: parsed.currency + offlineCurrencyGain,
      totalCurrencyEarned: parsed.totalCurrencyEarned + offlineCurrencyGain,
      artifactParts: parsed.artifactParts || {},
      completedArtifacts: parsed.completedArtifacts || [],
      lastSavedAt: now,
      referrerId: parsed.referrerId || null,
      referralsCount: parsed.referralsCount || 0,
      referralEarnings: parsed.referralEarnings || 0,
    };
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
    return null;
  }
}

// Process referral for new user
export async function processReferral(state: GameState): Promise<GameState> {
  const telegramId = getTelegramUserId();
  const referrerId = getReferrerId();

  if (!telegramId || !supabase || state.referrerId !== undefined) {
    return state; // Already processed or no referrer
  }

  // Don't refer to yourself
  if (referrerId === telegramId) {
    return state;
  }

  // Check if referrer exists
  if (referrerId) {
    try {
      const { data: referrerData } = await supabase
        .from('game_progress')
        .select('telegram_id')
        .eq('telegram_id', referrerId)
        .maybeSingle();

      if (referrerData) {
        // Grant bonus to new user (50)
        const newUserBonus = 50;
        // Grant bonus to referrer (100) - will be processed on their next save
        await supabase.rpc('process_referral_bonus', {
          referrer_tid: referrerId,
          new_user_tid: telegramId,
          referrer_bonus: 100,
          new_user_bonus: newUserBonus,
        }).catch(() => {
          // RPC might not exist, handle manually
        });

        // If RPC doesn't exist, manually update
        await supabase
          .from('game_progress')
          .update({
            referrals_count: supabase.rpc('increment', { x: 1 }),
            referral_earnings: supabase.rpc('increment', { x: 100 }),
          })
          .eq('telegram_id', referrerId);

        return {
          ...state,
          currency: state.currency + newUserBonus,
          totalCurrencyEarned: state.totalCurrencyEarned + newUserBonus,
          referrerId: referrerId,
        };
      }
    } catch (e) {
      console.error('Failed to process referral:', e);
    }
  }

  return state;
}

// Get leaderboard (top 50 by XP)
export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('game_progress')
      .select('telegram_id, first_name, username, level, total_xp, referrals_count')
      .order('total_xp', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row, index) => ({
      telegram_id: row.telegram_id,
      first_name: row.first_name,
      username: row.username,
      level: row.level,
      total_xp: row.total_xp,
      referrals_count: row.referrals_count || 0,
      rank: index + 1,
    }));
  } catch (e) {
    console.error('Failed to get leaderboard:', e);
    return [];
  }
}

// Get user's rank
export async function getUserRank(telegramId: number): Promise<number | null> {
  if (!supabase) return null;

  try {
    const { data } = await supabase
      .from('game_progress')
      .select('total_xp')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (!data) return null;

    const { count } = await supabase
      .from('game_progress')
      .select('*', { count: 'exact', head: true })
      .gt('total_xp', data.total_xp);

    return (count || 0) + 1;
  } catch (e) {
    console.error('Failed to get user rank:', e);
    return null;
  }
}

// Clear game state (for testing)
export async function clearGameState(): Promise<void> {
  const telegramId = getTelegramUserId();

  localStorage.removeItem(LOCAL_STORAGE_KEY);

  if (telegramId && supabase) {
    try {
      await supabase
        .from('game_progress')
        .delete()
        .eq('telegram_id', telegramId);
    } catch (e) {
      console.error('Failed to clear Supabase data:', e);
    }
  }
}

// Sync function to periodically save
export function startAutoSync(getState: () => GameState, intervalMs = 5000): () => void {
  const interval = setInterval(() => {
    saveGameState(getState());
  }, intervalMs);

  const handleUnload = () => {
    saveGameState(getState());
  };
  window.addEventListener('beforeunload', handleUnload);
  window.addEventListener('pagehide', handleUnload);

  return () => {
    clearInterval(interval);
    window.removeEventListener('beforeunload', handleUnload);
    window.removeEventListener('pagehide', handleUnload);
  };
}
