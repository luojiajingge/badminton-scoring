import React from 'react';
import { useTheme } from '../hooks/useTheme';

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="header">
      <div>
        <h1>云行智远，羽你共舞</h1>
        <div className="header-subtitle">羽毛球比分记录系统</div>
      </div>
      <button className="theme-toggle" onClick={toggleTheme}>
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
    </header>
  );
};
