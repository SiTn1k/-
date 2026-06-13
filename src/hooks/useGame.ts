import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, EpochId, OwnedGenerator, TapEvent } from '../types/game';
import {
  EPOCHS,
  getEpochById,
  getCurrentEpochByLevel,
  getGeneratorCost,
  getGeneratorProduction,
} from '../data/epochs';
import { saveGameState, loadGameState } from '../lib/storage';

const XP_PER_LEVEL_MULTIPLIER = 1.5;
const XP_BASE = 100;
const SAVE_INTERVAL = 5000; // Save every 5 seconds

function calculateXpToLevel(level: number): number {
  return Math.floor(XP_BASE * Math.pow(XP_PER_LEVEL_MULTIPLIER, level - 1));
}

const INITIAL_STATE: GameState = {
  epochId: 'trypillia',
  level: 1,
  xp: 0,
  xpToNextLevel: calculateXpToLevel(1),
  totalXp: 0,
  currency: 20, // Start with enough to buy first generator
  totalCurrencyEarned: 20,
  ownedGenerators: [],
  tapPower: 1,
  passiveXpPerSecond: 0,
  unlockedEpochs: ['trypillia'],
  artifactParts: {},
  completedArtifacts: [],
  lastSavedAt: Date.now(),
};

export function useGame() {
  const [state, setState] = useState<GameState>(() => {
    const saved = loadGameState();
    if (saved) {
      // Calculate offline progress
      const now = Date.now();
      const offlineMs = now - saved.lastSavedAt;
      const maxOfflineMs = 8 * 60 * 60 * 1000; // 8 hours max
      const cappedOfflineMs = Math.min(offlineMs, maxOfflineMs);
      const offlineSeconds = cappedOfflineMs / 1000;

      // Calculate passive income during offline time
      const passiveXp = saved.ownedGenerators.reduce((total, og) => {
        const currentEpoch = getCurrentEpochByLevel(saved.level);
        const epochData = getEpochById(currentEpoch.id);
        const generator = epochData.generators.find(g => g.id === og.generatorId);
        if (!generator) return total;
        return total + getGeneratorProduction(generator, og.level);
      }, 0);

      const offlineXpGain = passiveXp * offlineSeconds;
      const offlineCurrencyGain = (saved.level * 10) * (offlineSeconds / 60); // Level * 10 per minute

      return {
        ...saved,
        xp: saved.xp + offlineXpGain,
        totalXp: saved.totalXp + offlineXpGain,
        currency: saved.currency + offlineCurrencyGain,
        totalCurrencyEarned: saved.totalCurrencyEarned + offlineCurrencyGain,
        lastSavedAt: now,
      };
    }
    return INITIAL_STATE;
  });

  const [tapEvents, setTapEvents] = useState<TapEvent[]>([]);
  const tickRef = useRef<number | null>(null);
  const saveRef = useRef<number | null>(null);

  // Calculate current epoch and passive income
  const currentEpoch = getCurrentEpochByLevel(state.level);
  const epoch = getEpochById(currentEpoch.id);

  // Calculate total passive XP per second
  const calculatePassiveXp = useCallback((owned: OwnedGenerator[]): number => {
    const currentEpoch = getCurrentEpochByLevel(state.level);
    const epochData = getEpochById(currentEpoch.id);

    return owned.reduce((total, og) => {
      const generator = epochData.generators.find(g => g.id === og.generatorId);
      if (!generator) return total;
      return total + getGeneratorProduction(generator, og.level);
    }, 0);
  }, [state.level]);

  // Auto-save
  useEffect(() => {
    saveRef.current = window.setInterval(() => {
      saveGameState(state);
    }, SAVE_INTERVAL);

    return () => {
      if (saveRef.current) clearInterval(saveRef.current);
      saveGameState(state); // Save on unmount
    };
  }, [state]);

  // Game tick - runs every 100ms
  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setState(prev => {
        const passiveXp = calculatePassiveXp(prev.ownedGenerators);
        const newXp = prev.xp + passiveXp / 10;
        const newTotalXp = prev.totalXp + passiveXp / 10;
        const epoch = getCurrentEpochByLevel(prev.level);

        // Check for level up
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
          newCurrency += newLevel * 50; // Currency reward for leveling
          newTotalCurrency += newLevel * 50;

          // Check for epoch unlocks
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
          epochId: epoch.id,
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
  }, [calculatePassiveXp]);

  // Tap function
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

  // Buy generator
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

      const newPassiveXp = calculatePassiveXp(newOwned);

      return {
        ...prev,
        currency: prev.currency - cost,
        ownedGenerators: newOwned,
        passiveXpPerSecond: newPassiveXp,
      };
    });

    return true;
  }, [epoch.generators, state.currency, state.ownedGenerators, calculatePassiveXp]);

  // Upgrade tap power
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

  // Switch epoch (if unlocked)
  const switchEpoch = useCallback((epochId: EpochId) => {
    if (!state.unlockedEpochs.includes(epochId)) return;
    setState(prev => ({ ...prev, epochId }));
  }, [state.unlockedEpochs]);

  // Get generator info
  const getOwnedLevel = useCallback((generatorId: string): number => {
    const owned = state.ownedGenerators.find(og => og.generatorId === generatorId);
    return owned?.level || 0;
  }, [state.ownedGenerators]);

  // Calculate tap power upgrade cost
  const tapPowerCost = Math.floor(25 * Math.pow(1.8, state.tapPower - 1));

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
  };
}
