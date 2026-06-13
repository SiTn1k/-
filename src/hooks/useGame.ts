import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, EpochId, OwnedGenerator, TapEvent, LeaderboardEntry } from '../types/game';
import {
  EPOCHS,
  getEpochById,
  getCurrentEpochByLevel,
  getGeneratorCost,
  getGeneratorProduction,
} from '../data/epochs';
import {
  saveGameState,
  loadGameState,
  getTelegramUserId,
  getLeaderboard,
  getUserRank,
  processReferral,
} from '../lib/storage';

const XP_PER_LEVEL_MULTIPLIER = 1.5;
const XP_BASE = 100;
const SAVE_INTERVAL = 5000;

function calculateXpToLevel(level: number): number {
  return Math.floor(XP_BASE * Math.pow(XP_PER_LEVEL_MULTIPLIER, level - 1));
}

const INITIAL_STATE: GameState = {
  epochId: 'trypillia',
  level: 1,
  xp: 0,
  xpToNextLevel: calculateXpToLevel(1),
  totalXp: 0,
  currency: 20,
  totalCurrencyEarned: 20,
  ownedGenerators: [],
  tapPower: 1,
  passiveXpPerSecond: 0,
  unlockedEpochs: ['trypillia'],
  artifactParts: {},
  completedArtifacts: [],
  lastSavedAt: Date.now(),
  referrerId: null,
  referralsCount: 0,
  referralEarnings: 0,
};

export function useGame() {
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [tapEvents, setTapEvents] = useState<TapEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const tickRef = useRef<number | null>(null);
  const saveRef = useRef<number | null>(null);
  const isInitialized = useRef(false);

  const currentEpoch = getCurrentEpochByLevel(state.level);
  const epoch = getEpochById(currentEpoch.id);

  const calculatePassiveXp = useCallback((owned: OwnedGenerator[], level: number): number => {
    const currentEpoch = getCurrentEpochByLevel(level);
    const epochData = getEpochById(currentEpoch.id);

    return owned.reduce((total, og) => {
      const generator = epochData.generators.find(g => g.id === og.generatorId);
      if (!generator) return total;
      return total + getGeneratorProduction(generator, og.level);
    }, 0);
  }, []);

  // Load saved state on mount
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    loadGameState().then(async saved => {
      if (saved) {
        // Process referral if this is a new user
        const processedState = await processReferral(saved);
        const passiveXp = calculatePassiveXp(processedState.ownedGenerators, processedState.level);
        setState({
          ...processedState,
          passiveXpPerSecond: passiveXp,
        });
      }
      setIsLoading(false);
    });
  }, [calculatePassiveXp]);

  // Auto-save
  useEffect(() => {
    if (isLoading) return;

    saveRef.current = window.setInterval(() => {
      saveGameState(state);
    }, SAVE_INTERVAL);

    return () => {
      if (saveRef.current) clearInterval(saveRef.current);
      saveGameState(state);
    };
  }, [state, isLoading]);

  // Game tick
  useEffect(() => {
    if (isLoading) return;

    tickRef.current = window.setInterval(() => {
      setState(prev => {
        const passiveXp = calculatePassiveXp(prev.ownedGenerators, prev.level);
        const newXp = prev.xp + passiveXp / 10;
        const newTotalXp = prev.totalXp + passiveXp / 10;
        const currentEpoch = getCurrentEpochByLevel(prev.level);

        let newLevel = prev.level;
        let xp = newXp;
        let xpToNext = prev.xpToNextLevel;
        let newCurrency = prev.currency;
        let newTotalCurrency = prev.totalCurrencyEarned;
        let newUnlocked = [...prev.unlockedEpochs];

        while (xp >= xpToNext) {
          xp -= xpToNext;
          newLevel++;
          xpToNext = calculateXpToLevel(newLevel);
          newCurrency += newLevel * 50;
          newTotalCurrency += newLevel * 50;

          EPOCHS.forEach(e => {
            if (e.unlockLevel === newLevel && !newUnlocked.includes(e.id)) {
              newUnlocked.push(e.id);
            }
          });
        }

        return {
          ...prev,
          xp,
          totalXp: newTotalXp,
          level: newLevel,
          xpToNextLevel: xpToNext,
          epochId: currentEpoch.id,
          passiveXpPerSecond: passiveXp,
          currency: newCurrency,
          totalCurrencyEarned: newTotalCurrency,
          unlockedEpochs: newUnlocked,
        };
      });
    }, 100);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isLoading, calculatePassiveXp]);

  const tap = useCallback((x: number, y: number) => {
    const eventId = Math.random().toString(36).substr(2, 9);
    const value = state.tapPower;

    setState(prev => ({
      ...prev,
      xp: prev.xp + value,
      totalXp: prev.totalXp + value,
    }));

    setTapEvents(prev => [
      ...prev.slice(-9),
      { id: eventId, x, y, value, createdAt: Date.now() },
    ]);

    setTimeout(() => {
      setTapEvents(prev => prev.filter(e => e.id !== eventId));
    }, 1000);
  }, [state.tapPower]);

  const buyGenerator = useCallback((generatorId: string) => {
    const generator = epoch.generators.find(g => g.id === generatorId);
    if (!generator) return false;

    const currentOwned = state.ownedGenerators.find(og => og.generatorId === generatorId);
    const currentLevel = currentOwned?.level || 0;
    const cost = getGeneratorCost(generator, currentLevel);

    if (state.currency < cost) return false;

    setState(prev => {
      const existing = prev.ownedGenerators.find(og => og.generatorId === generatorId);
      const newOwned = existing
        ? prev.ownedGenerators.map(og =>
            og.generatorId === generatorId ? { ...og, level: og.level + 1 } : og
          )
        : [...prev.ownedGenerators, { generatorId, level: 1 }];

      const newPassiveXp = calculatePassiveXp(newOwned, prev.level);

      return {
        ...prev,
        currency: prev.currency - cost,
        ownedGenerators: newOwned,
        passiveXpPerSecond: newPassiveXp,
      };
    });

    return true;
  }, [epoch.generators, state.currency, state.ownedGenerators, calculatePassiveXp]);

  const upgradeTapPower = useCallback(() => {
    const cost = Math.floor(25 * Math.pow(1.8, state.tapPower - 1));
    if (state.currency < cost) return false;

    setState(prev => ({
      ...prev,
      currency: prev.currency - cost,
      tapPower: prev.tapPower + 1,
    }));

    return true;
  }, [state.currency, state.tapPower]);

  const addArtifactPart = useCallback((artifactId: string, isFull: boolean) => {
    setState(prev => {
      const newParts = { ...prev.artifactParts };
      const newCompleted = [...prev.completedArtifacts];

      if (isFull) {
        if (!newCompleted.includes(artifactId)) {
          newCompleted.push(artifactId);
        }
      } else {
        newParts[artifactId] = (newParts[artifactId] || 0) + 1;
      }

      return {
        ...prev,
        artifactParts: newParts,
        completedArtifacts: newCompleted,
      };
    });
  }, []);

  const deductGachaCost = useCallback((cost: number): boolean => {
    if (state.currency < cost) return false;

    setState(prev => ({
      ...prev,
      currency: prev.currency - cost,
      totalCurrencyEarned: prev.totalCurrencyEarned - cost,
    }));

    return true;
  }, [state.currency]);

  const switchEpoch = useCallback((epochId: EpochId) => {
    if (!state.unlockedEpochs.includes(epochId)) return;
    setState(prev => ({ ...prev, epochId }));
  }, [state.unlockedEpochs]);

  const getOwnedLevel = useCallback((generatorId: string): number => {
    const owned = state.ownedGenerators.find(og => og.generatorId === generatorId);
    return owned?.level || 0;
  }, [state.ownedGenerators]);

  // Load leaderboard
  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    const data = await getLeaderboard(50);
    setLeaderboard(data);

    const telegramId = getTelegramUserId();
    if (telegramId) {
      const rank = await getUserRank(telegramId);
      setUserRank(rank);
    }
    setLeaderboardLoading(false);
  }, []);

  const tapPowerCost = Math.floor(25 * Math.pow(1.8, state.tapPower - 1));
  const telegramId = getTelegramUserId();

  return {
    state,
    epoch,
    tapEvents,
    tap,
    buyGenerator,
    upgradeTapPower,
    switchEpoch,
    getOwnedLevel,
    tapPowerCost,
    addArtifactPart,
    deductGachaCost,
    isLoading,
    telegramId,
    // Referral system
    leaderboard,
    userRank,
    leaderboardLoading,
    loadLeaderboard,
  };
}
