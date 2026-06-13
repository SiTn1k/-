import { useState, useMemo, useEffect } from 'react';
import { useGame } from './hooks/useGame';
import { TapArea } from './components/TapArea';
import { GeneratorShop } from './components/GeneratorShop';
import { TapUpgrade } from './components/StatsPanel';
import { GachaModal } from './components/GachaModal';
import { EPOCHS, ARTIFACTS } from './data/epochs';
import { initTelegramMiniApp, hapticImpact, hapticNotification } from './lib/telegram';
import { Crown, ShoppingBag, Trophy, Gift } from 'lucide-react';

type Tab = 'shop' | 'epochs' | 'artifacts' | 'stats';

function App() {
  const {
    state,
    epoch,
    tapEvents,
    tap,
    buyGenerator,
    upgradeTapPower,
    tapPowerCost,
  } = useGame();

  const [activeTab, setActiveTab] = useState<Tab>('shop');
  const [showGacha, setShowGacha] = useState(false);

  // Init Telegram Mini App
  useEffect(() => {
    const tg = initTelegramMiniApp();
    if (tg) {
      console.log('Telegram WebApp initialized', tg.version);
    }
  }, []);

  const ownedLevels = useMemo(() => {
    const map = new Map<string, number>();
    state.ownedGenerators.forEach(og => {
      map.set(og.generatorId, og.level);
    });
    return map;
  }, [state.ownedGenerators]);

  const handleBuy = (generatorId: string) => {
    if (buyGenerator(generatorId)) {
      hapticNotification('success');
    }
  };

  const handleUpgradeTap = () => {
    if (upgradeTapPower()) {
      hapticNotification('success');
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.floor(n).toString();
  };

  const completedArtifacts = state.completedArtifacts?.length || 0;
  const availableArtifacts = ARTIFACTS.filter(a => a.epoch === epoch.id || state.unlockedEpochs.includes(a.epoch));

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Main Tap Area */}
      <TapArea
        epoch={epoch}
        onTap={(x, y) => { tap(x, y); hapticImpact('light'); }}
        tapEvents={tapEvents}
        tapPower={state.tapPower}
        level={state.level}
        xp={state.xp}
        xpToNextLevel={state.xpToNextLevel}
        passiveXp={state.passiveXpPerSecond}
        currency={state.currency}
        currencyIcon={epoch.currencyIcon}
      />

      {/* Bottom Content - Responsive height */}
      <div className="bg-gray-900 border-t border-gray-700 flex flex-col h-[50vh] sm:h-[45vh] md:h-[400px]">
        {/* Tab Bar */}
        <div className="flex border-b border-gray-700 shrink-0">
          <TabButton
            active={activeTab === 'shop'}
            onClick={() => setActiveTab('shop')}
            icon={<ShoppingBag size={18} />}
            label="Магазин"
          />
          <TabButton
            active={activeTab === 'epochs'}
            onClick={() => setActiveTab('epochs')}
            icon={<Crown size={18} />}
            label="Епохи"
            badge={state.unlockedEpochs.length}
          />
          <TabButton
            active={activeTab === 'artifacts'}
            onClick={() => setActiveTab('artifacts')}
            icon={<Gift size={18} />}
            label="Артефакти"
            badge={completedArtifacts}
          />
          <TabButton
            active={activeTab === 'stats'}
            onClick={() => setActiveTab('stats')}
            icon={<Trophy size={18} />}
            label="Статистика"
          />
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {activeTab === 'shop' && (
            <div>
              <TapUpgrade
                tapPower={state.tapPower}
                cost={tapPowerCost}
                currency={state.currency}
                onUpgrade={handleUpgradeTap}
              />
              <GeneratorShop
                epoch={epoch}
                currency={state.currency}
                ownedLevels={ownedLevels}
                onBuy={handleBuy}
              />
            </div>
          )}

          {activeTab === 'epochs' && (
            <div className="p-3 sm:p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-base sm:text-lg">Епохи України</h3>
                <span className="text-xs text-gray-400">{state.unlockedEpochs.length}/12</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {EPOCHS.map(e => {
                  const isUnlocked = state.unlockedEpochs.includes(e.id);
                  const isCurrent = e.id === epoch.id;
                  const progress = isUnlocked
                    ? 100
                    : state.level >= e.unlockLevel - 10
                    ? ((state.level - (e.unlockLevel - 10)) / 10) * 100
                    : 0;

                  return (
                    <EpochCard
                      key={e.id}
                      epoch={e}
                      isUnlocked={isUnlocked}
                      isCurrent={isCurrent}
                      progress={progress}
                      unlockLevel={e.unlockLevel}
                      currentLevel={state.level}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className="p-3 sm:p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-base sm:text-lg">Артефакти</h3>
                <button
                  onClick={() => setShowGacha(true)}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all"
                >
                  Відкрити скриню
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {availableArtifacts.map(artifact => {
                  const parts = state.artifactParts?.[artifact.id] || 0;
                  const isComplete = state.completedArtifacts?.includes(artifact.id);

                  return (
                    <div
                      key={artifact.id}
                      className={`p-3 rounded-xl ${
                        isComplete
                          ? 'bg-gradient-to-br from-yellow-600/30 to-amber-600/30 border border-yellow-500'
                          : 'bg-gray-800'
                      }`}
                    >
                      <div className="text-2xl sm:text-3xl mb-1">{artifact.icon}</div>
                      <div className="text-xs font-medium truncate">{artifact.name.ua}</div>
                      <div className={`text-xs ${
                        artifact.rarity === 'legendary' ? 'text-yellow-400' :
                        artifact.rarity === 'epic' ? 'text-purple-400' :
                        artifact.rarity === 'rare' ? 'text-blue-400' : 'text-gray-400'
                      }`}>
                        {artifact.rarity === 'legendary' ? 'Легендарний' :
                         artifact.rarity === 'epic' ? 'Епічний' :
                         artifact.rarity === 'rare' ? 'Рідкісний' : 'Звичайний'}
                      </div>
                      {!isComplete && (
                        <div className="mt-1">
                          <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${(parts / artifact.parts) * 100}%` }} />
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{parts}/{artifact.parts}</div>
                        </div>
                      )}
                      {isComplete && (
                        <div className="text-xs text-green-400 mt-1">+{(artifact.bonus.value - 1) * 100}% XP</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="p-3 sm:p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                <StatCard label="Загальний XP" value={formatNumber(state.totalXp)} />
                <StatCard label="Рівень" value={state.level.toString()} />
                <StatCard label="Пасивний XP/с" value={formatNumber(state.passiveXpPerSecond)} />
                <StatCard label="Сила тапу" value={state.tapPower + ' XP'} />
                <StatCard
                  label="Валюта"
                  value={formatNumber(state.currency)}
                />
                <StatCard
                  label="Генераторів"
                  value={state.ownedGenerators.length.toString()}
                />
              </div>

              <div className="bg-gray-800 rounded-xl p-3 sm:p-4">
                <h4 className="font-semibold mb-2 text-sm sm:text-base">Прогрес епохи: {epoch.name.ua}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Рівні</span>
                    <span>{state.level} / {epoch.levelRange.max}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${Math.min(100, ((state.level - epoch.levelRange.min + 1) / (epoch.levelRange.max - epoch.levelRange.min + 1)) * 100)}%`,
                        background: epoch.bgGradient,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Unlock progress */}
              <div className="bg-gray-800 rounded-xl p-3 sm:p-4">
                <h4 className="font-semibold mb-2 text-sm sm:text-base">Наступна епоха</h4>
                {(() => {
                  const nextEpoch = EPOCHS.find(e => e.unlockLevel > state.level);
                  if (!nextEpoch) {
                    return <div className="text-green-400">Всі епохи відкриті!</div>;
                  }
                  const levelsLeft = nextEpoch.unlockLevel - state.level;
                  return (
                    <div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">{nextEpoch.name.ua}</span>
                        <span>ще {levelsLeft} рівнів</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden mt-2">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                          style={{ width: `${(state.level / nextEpoch.unlockLevel) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gacha Modal */}
      {showGacha && (
        <GachaModal
          epoch={epoch}
          currency={state.currency}
          onClose={() => setShowGacha(false)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      className={`flex-1 py-2 sm:py-3 flex flex-col items-center gap-0.5 sm:gap-1 relative transition-colors touch-manipulation ${
        active ? 'text-yellow-400 bg-gray-800/50' : 'text-gray-400'
      }`}
      onClick={onClick}
    >
      <div className="relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-2 bg-red-500 text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] sm:text-xs">{label}</span>
      {active && <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-yellow-400 rounded-full" />}
    </button>
  );
}

function EpochCard({
  epoch,
  isUnlocked,
  isCurrent,
  progress,
  unlockLevel,
  currentLevel,
}: {
  epoch: typeof EPOCHS[0];
  isUnlocked: boolean;
  isCurrent: boolean;
  progress: number;
  unlockLevel: number;
  currentLevel: number;
}) {
  return (
    <div
      className={`p-2 sm:p-3 rounded-xl transition-all ${
        isCurrent
          ? 'bg-gradient-to-br from-amber-600 to-orange-600 shadow-lg shadow-amber-500/20'
          : isUnlocked
          ? 'bg-gray-800'
          : 'bg-gray-800/50 opacity-70'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="text-xl sm:text-2xl">{epoch.currencyIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs sm:text-sm truncate">{epoch.name.ua}</div>
          <div className="text-[10px] text-gray-400">{epoch.period.ua}</div>
          {isUnlocked && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              isCurrent ? 'bg-yellow-600' : 'bg-green-600'
            }`}>
              {isCurrent ? 'Активна' : 'Відкрита'}
            </span>
          )}
          {!isUnlocked && currentLevel >= unlockLevel - 10 && (
            <div className="mt-1">
              <div className="w-full bg-gray-700 rounded-full h-1 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${progress}%`, background: epoch.bgGradient }}
                />
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {unlockLevel - currentLevel} рівнів
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-2 sm:p-3">
      <div className="text-[10px] sm:text-xs text-gray-400">{label}</div>
      <div className="text-base sm:text-xl font-bold text-white">{value}</div>
    </div>
  );
}

export default App;
