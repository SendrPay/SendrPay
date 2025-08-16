import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { useBalance } from '../hooks/useBalance';
import { useClipboard } from '../hooks/useClipboard';
import { useHaptics } from '../hooks/useHaptics';
import { useToast } from '../ui/Toast';
import { formatAmount, shortenAddress, formatDate } from '../utils/format';
import { useTxFeed } from '../hooks/useTxFeed';
import { apiCall } from '../utils/api';

interface User {
  id: string;
  first_name: string;
  username?: string;
}

interface UserData {
  user: User;
  wallet: {
    address: string;
  };
}

interface HomeProps {
  onNavigate: (screen: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [selectedToken, setSelectedToken] = useState<'SOL' | 'USDC'>('SOL');
  const [loading, setLoading] = useState(true);
  const { balance, balances, refresh: refreshBalance } = useBalance();
  const { transactions } = useTxFeed('all');
  const { copyToClipboard } = useClipboard();
  const { notificationSuccess, impactLight } = useHaptics();
  const { addToast } = useToast();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const data = await apiCall('/user');
      setUserData(data);
    } catch (error) {
      addToast('Failed to load user data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async () => {
    if (userData?.wallet.address) {
      impactLight();
      const success = await copyToClipboard(userData.wallet.address);
      if (success) {
        notificationSuccess();
        addToast('Address copied!', 'success');
      } else {
        addToast('Failed to copy address', 'error');
      }
    }
  };

  const handleRefresh = async () => {
    impactLight();
    await refreshBalance();
    addToast('Balance updated', 'success');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="text-center">
          <h2 className="text-lg font-semibold text-white mb-2">Authentication Required</h2>
          <p className="text-gray-400">Please open this app through Telegram</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] safe-area-inset">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          {/* SendrPay Logo */}
          <div className="w-8 h-8 bg-[var(--color-primary)] rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">SendrPay</h1>
        </div>
        <IconButton
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
          onClick={() => window.Telegram?.WebApp?.close()}
          variant="ghost"
        />
      </header>

      <div className="p-4 space-y-6">
        {/* Welcome Message */}
        <div className="text-center">
          <h2 className="text-lg font-medium text-white">Welcome, {userData.user.first_name}!</h2>
          
          {/* Address Pill */}
          <button
            onClick={handleCopyAddress}
            className="mt-2 px-3 py-1 bg-[var(--color-card)] text-[var(--color-muted)] text-sm rounded-full hover:bg-opacity-80 transition-colors"
          >
            {shortenAddress(userData.wallet.address)}
          </button>
        </div>

        {/* Balance Card */}
        <Card className="text-center">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <div className="text-3xl font-bold text-white mb-1">
                {formatAmount(balances[selectedToken], selectedToken)}
              </div>
              <div className="text-[var(--color-muted)]">{selectedToken}</div>
            </div>
            
            {/* Token Switcher */}
            <div className="flex bg-[var(--color-bg)] rounded-lg p-1">
              {(['SOL', 'USDC'] as const).map((token) => (
                <button
                  key={token}
                  onClick={() => setSelectedToken(token)}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                    selectedToken === token
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'text-[var(--color-muted)] hover:text-white'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => onNavigate('send')}
              className="flex-1"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              }
            >
              Send
            </Button>
            <Button
              onClick={() => onNavigate('receive')}
              variant="outline"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7l-7 7-7-7" />
                </svg>
              }
            >
              Receive
            </Button>
          </div>
        </Card>

        {/* Quick Utils */}
        <div className="flex justify-center gap-4">
          <IconButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 16h4.01M4 7h4.01M4 11h1M4 15h2.01M8 15h4" />
              </svg>
            }
            onClick={() => onNavigate('receive')}
            variant="secondary"
            size="lg"
          />
          <IconButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            onClick={() => onNavigate('history')}
            variant="secondary"
            size="lg"
          />
          <IconButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            }
            onClick={handleRefresh}
            variant="secondary"
            size="lg"
          />
          <IconButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            onClick={() => onNavigate('settings')}
            variant="secondary"
            size="lg"
          />
        </div>

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
              <button
                onClick={() => onNavigate('history')}
                className="text-[var(--color-primary)] text-sm font-medium hover:underline"
              >
                View All
              </button>
            </div>
            
            <div className="space-y-2">
              {transactions.slice(0, 3).map((tx) => {
                const isReceived = tx.recipientTelegramId === userData.user.id.toString();
                const amount = (parseFloat(tx.amount) / Math.pow(10, 9)).toFixed(4);
                
                return (
                  <Card key={tx.id} padding="sm" className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isReceived ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'
                      }`}>
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {isReceived ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7l-7 7-7-7" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          )}
                        </svg>
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {isReceived ? 'Received' : 'Sent'}
                        </div>
                        <div className="text-[var(--color-muted)] text-sm">
                          {formatDate(tx.createdAt)}
                          {tx.note && ` • ${tx.note}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${
                        isReceived ? 'text-[var(--color-success)]' : 'text-white'
                      }`}>
                        {isReceived ? '+' : '-'}{amount} {tx.tokenTicker}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};