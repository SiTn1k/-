import { useState, useEffect } from 'react';
import { Epoch, Artifact } from '../types/game';
import { ARTIFACTS } from '../data/epochs';
import { hapticImpact, hapticNotification } from '../lib/telegram';
import { X, Sparkles } from 'lucide-react';

interface GachaModalProps {
  epoch: Epoch;
  currency: number;
  onClose: () => void;
}

const GACHA_COST = 100;

export function GachaModal({ epoch, currency, onClose }: GachaModalProps) {
  const [phase, setPhase] = useState<'ready' | 'rolling' | 'result'>('ready');
  const [currentIcon, setCurrentIcon] = useState('🎁');
  const [rollIndex, setRollIndex] = useState(0);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [isPart, setIsPart] = useState(true);

  const availableArtifacts = ARTIFACTS.filter(a =>
    a.epoch === epoch.id || a.epoch === 'trypillia' || a.epoch === 'scythia'
  );

  const rollIcons = ['🎁', '🏺', '👑', '⚔️', '☦️', '📜', '🪙', '💎', '✨', '🎭'];

  const canAfford = currency >= GACHA_COST;

  useEffect(() => {
    if (phase !== 'rolling') return;

    let count = 0;
    const maxRolls = 20 + Math.floor(Math.random() * 10);
    const interval = setInterval(() => {
      setCurrentIcon(rollIcons[Math.floor(Math.random() * rollIcons.length)]);
      setRollIndex(count);
      count++;
      hapticImpact('light');

      if (count >= maxRolls) {
        clearInterval(interval);

        const rand = Math.random();
        let result: Artifact;

        if (rand < 0.03 && availableArtifacts.some(a => a.rarity === 'legendary')) {
          result = availableArtifacts.find(a => a.rarity === 'legendary')!;
        } else if (rand < 0.15 && availableArtifacts.some(a => a.rarity === 'epic')) {
          result = availableArtifacts.find(a => a.rarity === 'epic') || availableArtifacts[0];
        } else if (rand < 0.40 && availableArtifacts.some(a => a.rarity === 'rare')) {
          result = availableArtifacts.find(a => a.rarity === 'rare') || availableArtifacts[0];
        } else {
          result = availableArtifacts.find(a => a.rarity === 'common') || availableArtifacts[0];
        }

        const fullDrop = Math.random() < 0.05;

        setArtifact(result);
        setIsPart(!fullDrop);
        setCurrentIcon(result.icon);
        setPhase('result');
        hapticNotification('success');
      }
    }, 80);

    return () => clearInterval(interval);
  }, [phase, availableArtifacts]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const getRarityGlow = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return 'shadow-yellow-500/50 animate-pulse';
      case 'epic': return 'shadow-purple-500/50';
      case 'rare': return 'shadow-blue-500/50';
      default: return 'shadow-gray-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-gray-900 rounded-3xl overflow-hidden shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
        >
          <X size={24} />
        </button>

        <div className="text-center py-6 px-4 bg-gradient-to-b from-gray-800 to-gray-900">
          <h2 className="text-xl font-bold mb-1">
            {phase === 'result' ? 'Результат!' : 'Скриня артефактів'}
          </h2>
          <p className="text-gray-400 text-sm">
            {phase === 'ready' && `Вартість: ${GACHA_COST} ${epoch.currencyIcon}`}
            {phase === 'rolling' && 'Відкриваємо...'}
            {phase === 'result' && (isPart ? 'Частина артефакту!' : 'Повний артефакт!')}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-8 px-4">
          <div
            className={`text-8xl sm:text-9xl transition-all duration-300 ${
              phase === 'rolling' ? 'animate-bounce' : ''
            } ${phase === 'result' ? getRarityGlow(artifact?.rarity || 'common') + ' drop-shadow-lg scale-110' : ''}`}
          >
            {currentIcon}
          </div>

          {phase === 'rolling' && (
            <div className="flex gap-2 mt-6">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full bg-yellow-400 ${
                    rollIndex % 3 === i ? 'opacity-100' : 'opacity-30'
                  }`}
                />
              ))}
            </div>
          )}

          {phase === 'result' && artifact && (
            <div className="mt-6 text-center animate-fade-in">
              <div className={`text-lg font-bold mb-1 ${
                artifact.rarity === 'legendary' ? 'text-yellow-400' :
                artifact.rarity === 'epic' ? 'text-purple-400' :
                artifact.rarity === 'rare' ? 'text-blue-400' : 'text-gray-300'
              }`}>
                {artifact.name.ua}
              </div>
              <div className="text-sm text-gray-400 mb-2">
                {artifact.rarity === 'legendary' ? 'Легендарний' :
                 artifact.rarity === 'epic' ? 'Епічний' :
                 artifact.rarity === 'rare' ? 'Рідкісний' : 'Звичайний'}
              </div>

              {!isPart && (
                <div className="text-green-400 text-sm font-medium">
                  +{(artifact.bonus.value - 1) * 100}% {artifact.bonus.type === 'xp_multiplier' ? 'XP' : 'валюти'}!
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-800/50">
          {phase === 'ready' && (
            <>
              <button
                onClick={() => { setPhase('rolling'); hapticImpact('medium'); }}
                disabled={!canAfford}
                className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                  canAfford
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Sparkles size={20} />
                Відкрити скриню
              </button>
              {!canAfford && (
                <p className="text-center text-red-400 text-sm mt-2">
                  Недостатньо {epoch.currencyIcon}
                </p>
              )}
            </>
          )}

          {phase === 'result' && (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-medium hover:bg-gray-600 transition-all"
              >
                Закрити
              </button>
              <button
                onClick={() => { setPhase('ready'); setArtifact(null); }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-500 hover:to-pink-500 transition-all"
              >
                Ще раз
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
