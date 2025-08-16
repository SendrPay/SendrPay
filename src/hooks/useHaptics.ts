import { useEffect, useState } from 'react';

// Type definitions are in utils/api.ts

export const useHaptics = () => {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(!!window.Telegram?.WebApp?.HapticFeedback);
  }, []);

  const impactLight = () => {
    if (isSupported) {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    }
  };

  const impactMedium = () => {
    if (isSupported) {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
    }
  };

  const impactHeavy = () => {
    if (isSupported) {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
    }
  };

  const notificationSuccess = () => {
    if (isSupported) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    }
  };

  const notificationError = () => {
    if (isSupported) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
  };

  const notificationWarning = () => {
    if (isSupported) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning');
    }
  };

  const selectionChanged = () => {
    if (isSupported) {
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    }
  };

  return {
    isSupported,
    impactLight,
    impactMedium,
    impactHeavy,
    notificationSuccess,
    notificationError,
    notificationWarning,
    selectionChanged,
  };
};