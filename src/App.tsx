import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { MatchSetup } from './components/MatchSetup';
import { ScoreBoard } from './components/ScoreBoard';
import { MatchHistory } from './components/MatchHistory';
import { Leaderboard } from './components/Leaderboard';
import { Statistics } from './components/Statistics';
import { Settings } from './components/Settings';
import { PlayerManagement } from './components/PlayerManagement';
import { Toast } from './components/Toast';
import { useStore } from './store';
import './styles/global.css';

// 格式化日期显示
const formatDateDisplay = (dateStr: string) => {
  const [, month, day] = dateStr.split('-');
  return `${month}月${day}日`;
};

function App() {
  const [currentPage, setCurrentPage] = useState('match');
  const [showRestoreNotice, setShowRestoreNotice] = useState(false);
  const [unsettledNotice, setUnsettledNotice] = useState<{ dates: string[]; dismissed: boolean }>({ dates: [], dismissed: false });

  const currentMatch = useStore((state) => state.currentMatch);
  const theme = useStore((state) => state.theme);
  const loadFromCloud = useStore((state) => state.loadFromCloud);
  const loading = useStore((state) => state.loading);
  const getUnsettledDates = useStore((state) => state.getUnsettledDates);
  const matches = useStore((state) => state.matches);
  const daySnapshots = useStore((state) => state.daySnapshots);

  useEffect(() => { loadFromCloud(); }, [loadFromCloud]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  useEffect(() => {
    if (currentMatch && currentMatch.status === 'ongoing') {
      setShowRestoreNotice(true);
      setCurrentPage('match');
    }
  }, []);

  useEffect(() => {
    if (currentMatch && currentMatch.status === 'ongoing') setCurrentPage('match');
  }, [currentMatch?.id]);

  // 检查未清算日期
  useEffect(() => {
    if (loading) return;

    const unsettled = getUnsettledDates();
    setUnsettledNotice((prev) => {
      if (unsettled.length === 0) {
        if (prev.dates.length === 0 && !prev.dismissed) return prev;
        return { dates: [], dismissed: false };
      }

      const sameDates =
        prev.dates.length === unsettled.length &&
        prev.dates.every((date, index) => date === unsettled[index]);

      if (sameDates) return prev;

      return { dates: unsettled, dismissed: false };
    });
  }, [loading, matches, daySnapshots, getUnsettledDates]);

  const handleStartMatch = () => setCurrentPage('match');
  const handleBackToMatch = () => { useStore.getState().finishMatch(); setCurrentPage('match'); };

  const renderPage = () => {
    switch (currentPage) {
      case 'match':
        return currentMatch ? (
          <div>
            {showRestoreNotice && (
              <div className="card" style={{ backgroundColor: 'rgba(24,144,255,0.1)', border: '1px solid rgba(24,144,255,0.3)', marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                📌 已恢复上次进行中的比赛（数据可能不完整，请核实）
                <button style={{ float: 'right', background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '0 4px' }} onClick={() => setShowRestoreNotice(false)}>✕</button>
              </div>
            )}
            <ScoreBoard match={currentMatch} onScore={useStore.getState().addScore} onSetGameScore={useStore.getState().setGameScore} onUndo={useStore.getState().undoScore} />
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              {currentMatch.status === 'completed' && <button className="btn btn-primary btn-full" onClick={handleBackToMatch}>返回比赛设置</button>}
              {currentMatch.status === 'ongoing' && (
                <button className="btn btn-danger btn-full" onClick={() => { if (confirm('确定要放弃当前比赛吗？')) { useStore.getState().finishMatch(); handleBackToMatch(); } }}>放弃比赛</button>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* 未清算提醒条 */}
            {unsettledNotice.dates.length > 0 && !unsettledNotice.dismissed && (
              <div className="card" style={{ backgroundColor: 'rgba(250,173,20,0.1)', border: '1px solid rgba(250,173,20,0.3)', marginBottom: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    ⚠️ {unsettledNotice.dates.map(formatDateDisplay).join('、')} 有比赛未清算
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={{ background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px' }}
                      onClick={() => setCurrentPage('settings')}
                    >
                      立即清算
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 8px', fontSize: '12px' }}
                      onClick={() => setUnsettledNotice({ ...unsettledNotice, dismissed: true })}
                    >
                      稍后
                    </button>
                  </div>
                </div>
              </div>
            )}
            <MatchSetup onStart={handleStartMatch} />
          </div>
        );
      case 'leaderboard': return <Leaderboard />;
      case 'history': return <MatchHistory />;
      case 'stats': return <Statistics />;
      case 'players': return <PlayerManagement />;
      case 'settings': return <Settings />;
      default:
        return <MatchSetup onStart={handleStartMatch} />;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏸</div>
          <div style={{ color: 'var(--text-secondary)' }}>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Toast />
      <Header />
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      <main>{renderPage()}</main>
    </div>
  );
}

export default App;
