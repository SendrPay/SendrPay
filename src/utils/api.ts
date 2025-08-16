declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  // Check if we have initData
  const initData = window.Telegram?.WebApp?.initData;
  
  if (!initData && endpoint !== '/test') {
    throw new Error('No Telegram authentication data available. Please open this app through Telegram.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };

  if (initData) {
    headers['X-Telegram-Init-Data'] = initData;
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'API call failed' }));
    throw new Error(error.error || 'API call failed');
  }

  return response.json();
}