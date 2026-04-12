import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { exportData, importData } from '../utils/helpers';
import { RATING } from '../constants';
import type { SettlementResult, DaySnapshot } from '../types';

// 获取今天的日期字符串
const getTodayDate = () => new Date().toISOString().split('T')[0];

export const Settings: React.FC = () => {
  const players = useStore((state) => state.players);
  const matches = useStore((state) => state.matches);
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);
  const doImportData = useStore((state) => state.importData);
  const clearAllData = useStore((state) => state.clearAllData);
  const resetAllRatings = useStore((state) => state.resetAllRatings);
  const getUnsettledDates = useStore((state) => state.getUnsettledDates);
  const settleDay = useStore((state) => state.settleDay);
  const confirmSettlement = useStore((state) => state.confirmSettlement);
  const rollbackDay = useStore((state) => state.rollbackDay);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);

  // 清算相关状态
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [settlementDate, setSettlementDate] = useState<string>(getTodayDate());
  const [rollbackDate, setRollbackDate] = useState<string>('');
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null);
  const [unsettledDates, setUnsettledDates] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载未清算日期
  useEffect(() => {
    if (showSettlementModal || showRollbackModal) {
      setUnsettledDates(getUnsettledDates());
    }
  }, [showSettlementModal, showRollbackModal, getUnsettledDates]);

  const handleExport = () => {
    exportData(players, matches);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importData(file);
      doImportData(data.players, data.matches);
      alert('数据导入成功！');
    } catch {
      alert('导入失败，请检查文件格式');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClear = () => {
    if (confirm('确定要清除所有数据吗？此操作不可撤销！')) {
      clearAllData();
    }
  };

  const handleResetRatings = () => {
    if (confirmStep === 0) {
      setConfirmStep(1);
    } else {
      resetAllRatings();
      setShowResetConfirm(false);
      setConfirmStep(0);
    }
  };

  const handleCancelReset = () => {
    setShowResetConfirm(false);
    setConfirmStep(0);
  };

  // 清算相关处理函数
  const handleSettleDay = async () => {
    if (!settlementDate) return;
    setProcessing(true);
    setError(null);
    setSettlementResult(null);
    try {
      const result = await settleDay(settlementDate);
      setSettlementResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '清算失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmSettlement = async () => {
    if (!settlementResult) return;
    setProcessing(true);
    try {
      await confirmSettlement(settlementResult);
      setShowSettlementModal(false);
      setSettlementResult(null);
      setSettlementDate(getTodayDate());
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认清算失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackDate) return;
    setProcessing(true);
    setError(null);
    try {
      await rollbackDay(rollbackDate);
      setShowRollbackModal(false);
      setRollbackDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '回滚失败');
    } finally {
      setProcessing(false);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${month}月${day}日`;
  };

  return (
    <div className="fade-in">
      {/* Theme */}
      <div className="card">
        <div className="card-title">主题设置</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
            onClick={() => { if (theme !== 'light') toggleTheme(); }}
          >
            ☀️ 浅色
          </button>
          <button
            className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
            onClick={() => { if (theme !== 'dark') toggleTheme(); }}
          >
            🌙 深色
          </button>
        </div>
      </div>

      {/* Rating Management */}
      <div className="card">
        <div className="card-title">积分管理</div>
        <button
          className="btn btn-danger btn-full"
          onClick={() => setShowResetConfirm(true)}
          disabled={players.length === 0}
        >
          🔄 重置所有球员积分
        </button>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
          将所有球员积分重置为初始值 ({RATING.INITIAL_RATING})
        </p>
      </div>

      {/* 比赛日清算管理 */}
      <div className="card">
        <div className="card-title">比赛日清算</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            className="btn btn-primary btn-full"
            onClick={() => {
              setShowSettlementModal(true);
              setSettlementResult(null);
              setError(null);
            }}
          >
            📋 日终清算
          </button>
          <button
            className="btn btn-danger btn-full"
            onClick={() => {
              setShowRollbackModal(true);
              setError(null);
            }}
          >
            ⏪ 回滚比赛日
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
          清算：核对比赛日积分并归档 | 回滚：回退积分和排名到指定日期前
        </p>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="modal-overlay" onClick={handleCancelReset}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {confirmStep === 0 ? '确认重置积分' : '再次确认'}
            </div>
            <div className="modal-body">
              {confirmStep === 0 ? (
                <p>确定要将所有球员的积分重置为 {RATING.INITIAL_RATING} 吗？此操作不可撤销！</p>
              ) : (
                <p style={{ color: 'var(--danger-color)', fontWeight: '600' }}>
                  ⚠️ 最后确认：所有球员积分将被重置，请再次点击确认按钮执行操作。
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={handleCancelReset}>
                取消
              </button>
              <button className="btn btn-danger" onClick={handleResetRatings}>
                {confirmStep === 0 ? '下一步' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Management */}
      <div className="card">
        <div className="card-title">数据管理</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="btn btn-primary btn-full" onClick={handleExport}>
            📤 导出数据 (JSON)
          </button>
          <button className="btn btn-secondary btn-full" onClick={() => fileInputRef.current?.click()}>
            📥 导入数据 (JSON)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button className="btn btn-danger btn-full" onClick={handleClear}>
            🗑️ 清除所有数据
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px' }}>
          当前数据：{players.length} 名球员，{matches.length} 场比赛
        </p>
      </div>

      {/* About */}
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏸</div>
        <div className="card-title" style={{ marginBottom: '4px' }}>云行智远，羽你共舞</div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          版本 1.0.0 | 数据存储在本地浏览器中
        </p>
      </div>

      {/* 清算模态框 */}
      {showSettlementModal && (
        <div className="modal-overlay" onClick={() => !processing && setShowSettlementModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-title">📋 日终清算</div>
            <div className="modal-body">
              {!settlementResult ? (
                <>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    选择要清算的比赛日期：
                  </p>
                  {unsettledDates.length > 0 && (
                    <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--primary-color)' }}>
                      未清算日期：{unsettledDates.map(formatDateDisplay).join('、')}
                    </div>
                  )}
                  <input
                    type="date"
                    className="input"
                    value={settlementDate}
                    onChange={(e) => setSettlementDate(e.target.value)}
                    max={getTodayDate()}
                    style={{ width: '100%', fontSize: '16px' }}
                  />
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                      清算日期：{formatDateDisplay(settlementResult.date)}
                    </div>
                    {(() => {
                      const totalDelta = settlementResult.playerResults.reduce((s, pr) => s + pr.diff, 0);
                      const balanced = Math.abs(totalDelta) < 0.01;
                      return (
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: balanced ? 'rgba(82,196,26,0.1)' : 'rgba(245,34,45,0.1)',
                          color: balanced ? 'var(--success-color, #52c41a)' : 'var(--danger-color)',
                        }}>
                          {balanced ? `✅ 积分守恒：加分与减分总和一致` : `⚠️ 积分不守恒：总分偏差 ${totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(1)}`}
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>积分变动：</div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {settlementResult.playerResults.map((pr) => (
                      <div key={pr.playerId} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px',
                        borderBottom: '1px solid var(--border-color)',
                      }}>
                        <span>{pr.name}</span>
                        <div style={{ textAlign: 'right', fontSize: '13px' }}>
                          <span>{pr.ratingBefore}</span>
                          <span style={{ margin: '0 6px' }}>→</span>
                          <span style={{ fontWeight: '600' }}>{pr.ratingAfter}</span>
                          <span style={{
                            marginLeft: '8px',
                            color: pr.diff > 0 ? 'var(--success-color, #52c41a)' : pr.diff < 0 ? 'var(--danger-color)' : 'var(--text-secondary)',
                          }}>
                            ({pr.diff >= 0 ? '+' : ''}{pr.diff})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {error && (
                <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'rgba(245,34,45,0.1)', borderRadius: '6px', color: 'var(--danger-color)', fontSize: '14px' }}>
                  ❌ {error}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowSettlementModal(false);
                  setSettlementResult(null);
                  setSettlementDate(getTodayDate());
                }}
                disabled={processing}
              >
                取消
              </button>
              {!settlementResult ? (
                <button
                  className="btn btn-primary"
                  onClick={handleSettleDay}
                  disabled={processing || !settlementDate}
                >
                  {processing ? '清算中...' : '开始清算'}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmSettlement}
                  disabled={processing}
                >
                  {processing ? '确认中...' : '确认清算'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 回滚模态框 */}
      {showRollbackModal && (
        <div className="modal-overlay" onClick={() => !processing && setShowRollbackModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-title">⏪ 回滚比赛日</div>
            <div className="modal-body">
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                ⚠️ 回滚将恢复球员积分和排名到该日期之前的状态，比赛记录不会被删除。此操作不可撤销！
              </p>
              <p style={{ fontSize: '14px', marginBottom: '12px' }}>
                选择要回滚的比赛日期：
              </p>
              {unsettledDates.length > 0 && (
                <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--primary-color)' }}>
                  有比赛的日期：{unsettledDates.map(formatDateDisplay).join('、')}
                </div>
              )}
              <input
                type="date"
                className="input"
                value={rollbackDate}
                onChange={(e) => setRollbackDate(e.target.value)}
                max={getTodayDate()}
                style={{ width: '100%', fontSize: '16px' }}
              />

              {error && (
                <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'rgba(245,34,45,0.1)', borderRadius: '6px', color: 'var(--danger-color)', fontSize: '14px' }}>
                  ❌ {error}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowRollbackModal(false);
                  setRollbackDate('');
                }}
                disabled={processing}
              >
                取消
              </button>
              <button
                className="btn btn-danger"
                onClick={handleRollback}
                disabled={processing || !rollbackDate}
              >
                {processing ? '回滚中...' : '确认回滚'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
