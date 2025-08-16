import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { IconButton } from '../ui/IconButton';
import { useToast } from '../ui/Toast';
import { useHaptics } from '../hooks/useHaptics';
import { useBalance } from '../hooks/useBalance';
import { formatAmount } from '../utils/format';
import { apiCall } from '../utils/api';

interface SendProps {
  onNavigate: (screen: string) => void;
}

type SendStep = 'recipient' | 'amount' | 'review';

export const Send: React.FC<SendProps> = ({ onNavigate }) => {
  const [currentStep, setCurrentStep] = useState<SendStep>('recipient');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<'SOL' | 'USDC'>('SOL');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { balances } = useBalance();
  const { addToast } = useToast();
  const { notificationSuccess, notificationError, impactLight } = useHaptics();

  // Recent recipients (mock data for now)
  const recentRecipients = ['alice', 'bob', 'charlie'];
  const favoriteRecipients = ['alice', 'team'];

  const resetForm = () => {
    setCurrentStep('recipient');
    setRecipient('');
    setAmount('');
    setNote('');
    setErrors({});
  };

  const validateRecipient = () => {
    if (!recipient.trim()) {
      setErrors({ recipient: 'Recipient is required' });
      return false;
    }
    setErrors({});
    return true;
  };

  const validateAmount = () => {
    const numAmount = parseFloat(amount);
    const availableBalance = parseFloat(balances[token]);
    
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setErrors({ amount: 'Please enter a valid amount' });
      return false;
    }
    
    if (numAmount > availableBalance) {
      setErrors({ amount: 'Insufficient balance' });
      return false;
    }
    
    setErrors({});
    return true;
  };

  const handleNext = () => {
    impactLight();
    
    if (currentStep === 'recipient') {
      if (validateRecipient()) {
        setCurrentStep('amount');
      }
    } else if (currentStep === 'amount') {
      if (validateAmount()) {
        setCurrentStep('review');
      }
    }
  };

  const handleBack = () => {
    impactLight();
    
    if (currentStep === 'amount') {
      setCurrentStep('recipient');
    } else if (currentStep === 'review') {
      setCurrentStep('amount');
    } else {
      onNavigate('home');
    }
  };

  const handleSend = async () => {
    if (!validateAmount()) return;
    
    try {
      setLoading(true);
      
      await apiCall('/send', {
        method: 'POST',
        body: JSON.stringify({
          recipient: recipient.replace('@', ''),
          amount: parseFloat(amount),
          token,
          note: note || undefined,
        }),
      });
      
      notificationSuccess();
      addToast('Payment sent successfully!', 'success');
      onNavigate('home');
      resetForm();
    } catch (error) {
      notificationError();
      addToast(error instanceof Error ? error.message : 'Failed to send payment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const feePercent = token === 'SOL' ? 0.0025 : 0.0025; // 0.25% fee
  const numAmount = parseFloat(amount) || 0;
  const fee = numAmount * feePercent;
  const netToRecipient = numAmount - fee;

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
          onClick={handleBack}
          variant="ghost"
        />
        <h1 className="text-lg font-semibold text-white">Send Payment</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Progress Indicator */}
      <div className="flex items-center justify-center p-4">
        <div className="flex items-center space-x-2">
          {(['recipient', 'amount', 'review'] as const).map((step, index) => (
            <React.Fragment key={step}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep === step
                    ? 'bg-[var(--color-primary)] text-white'
                    : index < (['recipient', 'amount', 'review'] as const).indexOf(currentStep)
                    ? 'bg-[var(--color-success)] text-white'
                    : 'bg-[var(--color-card)] text-[var(--color-muted)]'
                }`}
              >
                {index + 1}
              </div>
              {index < 2 && (
                <div
                  className={`w-8 h-0.5 ${
                    index < (['recipient', 'amount', 'review'] as const).indexOf(currentStep)
                      ? 'bg-[var(--color-success)]'
                      : 'bg-[var(--color-card)]'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Step 1: Recipient */}
        {currentStep === 'recipient' && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold text-white mb-4">Who are you sending to?</h2>
              
              <Input
                label="Recipient Username"
                placeholder="@username"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                error={errors.recipient}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
              />
            </Card>

            {/* Recent Recipients */}
            {recentRecipients.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-[var(--color-muted)] mb-2">Recent</h3>
                <div className="flex flex-wrap gap-2">
                  {recentRecipients.map((username) => (
                    <button
                      key={username}
                      onClick={() => setRecipient(`@${username}`)}
                      className="px-3 py-2 bg-[var(--color-card)] text-white text-sm rounded-full hover:bg-opacity-80 transition-colors"
                    >
                      @{username}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Favorites */}
            {favoriteRecipients.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-[var(--color-muted)] mb-2">Favorites</h3>
                <div className="flex flex-wrap gap-2">
                  {favoriteRecipients.map((username) => (
                    <button
                      key={username}
                      onClick={() => setRecipient(`@${username}`)}
                      className="px-3 py-2 bg-[var(--color-card)] text-white text-sm rounded-full hover:bg-opacity-80 transition-colors border border-[var(--color-primary)]"
                    >
                      ⭐ @{username}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleNext} className="w-full">
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Amount */}
        {currentStep === 'amount' && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold text-white mb-4">How much?</h2>
              
              <div className="space-y-4">
                <Input
                  label="Amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  error={errors.amount}
                  step="0.001"
                  min="0"
                />

                {/* Token Selector */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Token</label>
                  <div className="flex bg-[var(--color-bg)] rounded-lg p-1">
                    {(['SOL', 'USDC'] as const).map((tokenOption) => (
                      <button
                        key={tokenOption}
                        onClick={() => setToken(tokenOption)}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                          token === tokenOption
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'text-[var(--color-muted)] hover:text-white'
                        }`}
                      >
                        {tokenOption}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-sm text-[var(--color-muted)]">
                    Available: {formatAmount(balances[token], token)} {token}
                  </div>
                </div>
              </div>
            </Card>

            {/* Fee Preview */}
            {numAmount > 0 && (
              <Card padding="sm">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Amount</span>
                    <span className="text-white">{formatAmount(numAmount, token)} {token}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Platform fee (0.25%)</span>
                    <span className="text-white">{formatAmount(fee, token)} {token}</span>
                  </div>
                  <div className="border-t border-gray-700 pt-2 flex justify-between font-medium">
                    <span className="text-white">Net to recipient</span>
                    <span className="text-[var(--color-success)]">{formatAmount(netToRecipient, token)} {token}</span>
                  </div>
                </div>
              </Card>
            )}

            <Button onClick={handleNext} className="w-full" disabled={!amount || parseFloat(amount) <= 0}>
              Continue
            </Button>
          </div>
        )}

        {/* Step 3: Review */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold text-white mb-4">Review Payment</h2>
              
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="text-3xl font-bold text-white mb-1">
                    {formatAmount(numAmount, token)} {token}
                  </div>
                  <div className="text-[var(--color-muted)]">to {recipient}</div>
                </div>

                <div className="bg-[var(--color-bg)] rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">To</span>
                    <span className="text-white">{recipient}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Amount</span>
                    <span className="text-white">{formatAmount(numAmount, token)} {token}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Platform fee</span>
                    <span className="text-white">{formatAmount(fee, token)} {token}</span>
                  </div>
                  <div className="border-t border-gray-700 pt-2 flex justify-between font-medium">
                    <span className="text-white">Net to recipient</span>
                    <span className="text-[var(--color-success)]">{formatAmount(netToRecipient, token)} {token}</span>
                  </div>
                </div>

                <Input
                  label="Note (optional)"
                  placeholder="Payment note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button onClick={handleSend} loading={loading} className="flex-1">
                Send Payment
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};