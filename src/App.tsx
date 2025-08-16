import React, { useState, useEffect } from 'react';
import { Router, Route, Switch } from 'wouter';
import { ThemeProvider } from './theme/ThemeProvider';
import { ToastProvider } from './ui/Toast';
import { Home } from './screens/Home';
import { Send } from './screens/Send';
import { Receive } from './screens/Receive';
import { History } from './screens/History';
import { Settings } from './screens/Settings';
import './theme/global.css';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initData?: string;
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

function App() {
  const [currentScreen, setCurrentScreen] = useState('home');

  useEffect(() => {
    // Initialize Telegram WebApp
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  }, []);

  const navigate = (screen: string) => {
    setCurrentScreen(screen);
  };

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="app">
          {currentScreen === 'home' && <Home onNavigate={navigate} />}
          {currentScreen === 'send' && <Send onNavigate={navigate} />}
          {currentScreen === 'receive' && <Receive onNavigate={navigate} />}
          {currentScreen === 'history' && <History onNavigate={navigate} />}
          {currentScreen === 'settings' && <Settings onNavigate={navigate} />}
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;