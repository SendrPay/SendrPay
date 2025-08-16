import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { useClipboard } from '../hooks/useClipboard';
import { useHaptics } from '../hooks/useHaptics';
import { useToast } from '../ui/Toast';
import { apiCall } from '../utils/api';
import QRCode from 'qrcode';

interface ReceiveProps {
  onNavigate: (screen: string) => void;
}

interface UserData {
  user: {
    id: string;
    first_name: string;
    username?: string;
  };
  wallet: {
    address: string;
  };
}

export const Receive: React.FC<ReceiveProps> = ({ onNavigate }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
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
      
      // Generate QR code for the wallet address
      if (data.wallet.address) {
        const qrUrl = await QRCode.toDataURL(data.wallet.address, {
          width: 256,
          margin: 2,
          color: {
            dark: '#0E1116',
            light: '#FFFFFF',
          },
        });
        setQrDataUrl(qrUrl);
      }
    } catch (error) {
      addToast('Failed to load wallet information', 'error');
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
        addToast('Address copied to clipboard!', 'success');
      } else {
        addToast('Failed to copy address', 'error');
      }
    }
  };

  const handleShare = async () => {
    if (userData?.wallet.address) {
      impactLight();
      
      const shareText = `Send me crypto to my SendrPay wallet: ${userData.wallet.address}`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'My SendrPay Wallet',
            text: shareText,
          });
          notificationSuccess();
        } catch (error) {
          // User cancelled share or share failed
          await copyToClipboard(shareText);
          addToast('Share text copied to clipboard!', 'success');
        }
      } else {
        // Fallback to copying
        const success = await copyToClipboard(shareText);
        if (success) {
          addToast('Share text copied to clipboard!', 'success');
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] safe-area-inset flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] safe-area-inset flex items-center justify-center">
        <Card className="text-center">
          <h2 className="text-lg font-semibold text-white mb-2">Error</h2>
          <p className="text-gray-400">Failed to load wallet information</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] safe-area-inset">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-gray-800">
        <IconButton
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          }
          onClick={() => onNavigate('home')}
          variant="ghost"
        />
        <h1 className="text-lg font-semibold text-white">Receive</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <div className="p-4 space-y-6">
        {/* QR Code Card */}
        <Card className="text-center">
          <h2 className="text-lg font-semibold text-white mb-4">Your Wallet Address</h2>
          
          {/* QR Code */}
          <div className="flex justify-center mb-6">
            <div className="bg-white p-4 rounded-lg">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Wallet QR Code" className="w-48 h-48" />
              ) : (
                <div className="w-48 h-48 bg-gray-200 rounded flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Address Display */}
          <div className="bg-[var(--color-bg)] rounded-lg p-4 mb-4">
            <p className="text-sm text-[var(--color-muted)] mb-2">Wallet Address</p>
            <p className="text-white font-mono text-sm break-all">
              {userData.wallet.address}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button onClick={handleCopyAddress} variant="outline" className="flex-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copy
            </Button>
            <Button onClick={handleShare} className="flex-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Share
            </Button>
          </div>
        </Card>

        {/* Information Card */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[var(--color-warning)] bg-opacity-20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[var(--color-warning)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-medium mb-1">Important Note</h3>
              <p className="text-[var(--color-muted)] text-sm">
                You need a little SOL for network fees when sending transactions. 
                Make sure you have some SOL in your wallet to cover transaction costs.
              </p>
            </div>
          </div>
        </Card>

        {/* Supported Tokens */}
        <Card>
          <h3 className="text-white font-medium mb-3">Supported Tokens</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">SOL</span>
              </div>
              <div>
                <div className="text-white font-medium">Solana</div>
                <div className="text-[var(--color-muted)] text-sm">Native SOL token</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">USDC</span>
              </div>
              <div>
                <div className="text-white font-medium">USD Coin</div>
                <div className="text-[var(--color-muted)] text-sm">Stablecoin pegged to USD</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={() => onNavigate('send')} 
            variant="outline"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            }
          >
            Send
          </Button>
          <Button 
            onClick={() => onNavigate('history')} 
            variant="outline"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          >
            History
          </Button>
        </div>
      </div>
    </div>
  );
};