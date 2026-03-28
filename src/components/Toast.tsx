import React, { useEffect } from 'react';
import { useStore } from '../store';

export const Toast: React.FC = () => {
  const notification = useStore((state) => state.notification);
  const clearNotification = useStore((state) => state.clearNotification);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(clearNotification, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification, clearNotification]);

  if (!notification) return null;

  const bgColors: Record<string, string> = {
    success: 'rgba(82,196,26,0.95)',
    error: 'rgba(245,63,63,0.95)',
    info: 'rgba(24,144,255,0.95)',
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        backgroundColor: bgColors[notification.type] || bgColors.info,
        color: '#fff',
        padding: '10px 24px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxWidth: '90vw',
        textAlign: 'center',
        animation: 'fadeInDown 0.3s ease',
      }}
    >
      {notification.message}
    </div>
  );
};
