import React from 'react';

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: 'match', label: '比赛' },
  { id: 'history', label: '历史' },
  { id: 'leaderboard', label: '排行' },
  { id: 'report', label: '报告' },
  { id: 'players', label: '球员' },
  { id: 'settings', label: '设置' },
];

export const Navigation: React.FC<NavigationProps> = ({ currentPage, onNavigate }) => {
  return (
    <nav className="nav">
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-btn ${currentPage === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
};
