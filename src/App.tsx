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
import { DayReport } from './components/DayReport';
import { Toast } from './components/Toast';
import { useStore } from './store';
import { db } from './services/supabase';
import './styles/global.css';

// 密码认证
const AUTH_KEY = 'badminton-auth';
const PWD_CONFIG_KEY = 'password_hash';
const hashPassword = async (pwd: string): Promise<string> => {
  const data = new TextEncoder().encode(pwd + 'badminton-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};
export const isAuthenticated = (): boolean => sessionStorage.getItem(AUTH_KEY) === 'true';
export const setAuthenticated = (): void => sessionStorage.setItem(AUTH_KEY, 'true');
export const verifyPassword = async (input: string): Promise<boolean> => {
  let storedHash = await db.getConfig(PWD_CONFIG_KEY);
  if (!storedHash) {
    // 首次使用，用默认密码的哈希初始化数据库
    const defaultPwd = import.meta.env.VITE_APP_PASSWORD || '';
    storedHash = await hashPassword(defaultPwd);
    await db.setConfig(PWD_CONFIG_KEY, storedHash);
  }
  const inputHash = await hashPassword(input);
  return inputHash === storedHash;
};
export const changePassword = async (oldPwd: string, newPwd: string): Promise<boolean> => {
  const valid = await verifyPassword(oldPwd);
  if (!valid) return false;
  const hash = await hashPassword(newPwd);
  await db.setConfig(PWD_CONFIG_KEY, hash);
  return true;
};

// 格式化日期显示
const formatDateDisplay = (dateStr: string) => {
  const [, month, day] = dateStr.split('-');
  return `${month}月${day}日`;
};

function App() {
  const [currentPage, setCurrentPage] = useState('match');
  const [authenticated, setAuthenticatedState] = useState(isAuthenticated);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState('');
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
      case 'report': return <DayReport />;
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

  // 密码验证页面
  if (!authenticated) {
    const handlePasswordSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const valid = await verifyPassword(password);
        if (valid) {
          setAuthenticated();
          setAuthenticatedState(true);
          setAuthError(false);
          setAuthErrorMsg('');
        } else {
          setAuthError(true);
          setAuthErrorMsg('密码错误，请重试');
          setPassword('');
        }
      } catch (err) {
        setAuthError(true);
        setAuthErrorMsg(err instanceof Error ? err.message : '验证失败，请检查网络连接');
        setPassword('');
      }
    };

    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '16px',
      }}>
        <div className="card fade-in" style={{
          width: '100%',
          maxWidth: '360px',
          textAlign: 'center',
          padding: '32px 24px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏸</div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 600,
            marginBottom: '8px',
            color: 'var(--text-color)',
          }}>
            羽毛球比分记录系统
          </h2>
          <p style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginBottom: '24px',
          }}>
            请输入访问密码
          </p>
          <form onSubmit={handlePasswordSubmit}>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <input
                className="input"
                type={showPwd ? 'text' : 'password'}
                placeholder="请输入密码"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (authError) setAuthError(false);
                }}
                autoFocus
                style={{ textAlign: 'center', paddingRight: '40px' }}
              />
              <span
                onClick={() => setShowPwd(!showPwd)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  userSelect: 'none',
                }}
              >
                {showPwd ? '🔒' : '👁️'}
              </span>
            </div>
            {authError && (
              <div style={{
                fontSize: '13px',
                color: 'var(--error-color, #ff4d4f)',
                marginBottom: '12px',
              }}>
                {authErrorMsg}
              </div>
            )}
            <button className="btn btn-primary btn-full" type="submit">
              进入系统
            </button>
          </form>
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
