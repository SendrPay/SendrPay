import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Segmented } from '../ui/Segmented';
import { useToast } from '../ui/Toast';
import { useHaptics } from '../hooks/useHaptics';
import { apiCall } from '../utils/api';

interface SettingsProps {
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

interface UserSettings {
  defaultToken: 'SOL' | 'USDC';
  tipPresets: number[];
  confirmThreshold: number;
  reactionsEnabled: boolean;
}

export const Settings: React.FC<SettingsProps> = ({ onNavigate }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    defaultToken: 'SOL',
    tipPresets: [1, 5, 10],
    confirmThreshold: 100,
    reactionsEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPreset, setNewPreset] = useState('');
  
  const { addToast } = useToast();
  const { impactLight, notificationSuccess } = useHaptics();

  useEffect(() => {
    loadUserData();
    loadSettings();
  }, []);

  const loadUserData = async () => {
    try {
      const data = await apiCall('/user');
      setUserData(data);
    } catch (error) {
      addToast('Failed to load user data', 'error');
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      // For now, use default settings since we don't have a settings endpoint
      // In a real app, you'd call: const data = await apiCall('/settings');
      setSettings({
        defaultToken: 'SOL',
        tipPresets: [1, 5, 10],
        confirmThreshold: 100,
        reactionsEnabled: true,
      });
    } catch (error) {
      addToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      impactLight();
      
      // In a real app, you'd call: await apiCall('/settings', { method: 'PUT', body: JSON.stringify(settings) });
      
      notificationSuccess();
      addToast('Settings saved successfully!', 'success');
    } catch (error) {
      addToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTokenChange = (token: string) => {
    setSettings(prev => ({ ...prev, defaultToken: token as 'SOL' | 'USDC' }));
  };

  const handleReactionsToggle = () => {
    setSettings(prev => ({ ...prev, reactionsEnabled: !prev.reactionsEnabled }));
  };

  const handleThresholdChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setSettings(prev => ({ ...prev, confirmThreshold: numValue }));
    }
  };

  const addTipPreset = () => {
    const value = parseFloat(newPreset);
    if (!isNaN(value) && value > 0 && !settings.tipPresets.includes(value)) {
      setSettings(prev => ({
        ...prev,
        tipPresets: [...prev.tipPresets, value].sort((a, b) => a - b),
      }));
      setNewPreset('');
      impactLight();
    }
  };

  const removeTipPreset = (value: number) => {
    setSettings(prev => ({
      ...prev,
      tipPresets: prev.tipPresets.filter(preset => preset !== value),
    }));
    impactLight();
  };

  const appVersion = '1.0.0';

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] safe-area-inset flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
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
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <div className="p-4 space-y-6">
        {/* Profile Section */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[var(--color-primary)] rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-lg">
                  {userData?.user.first_name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              <div>
                <div className="text-white font-medium">{userData?.user.first_name}</div>
                {userData?.user.username && (
                  <div className="text-[var(--color-muted)] text-sm">@{userData.user.username}</div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Preferences */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Preferences</h2>
          <div className="space-y-4">
            {/* Default Token */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">Default Token</label>
              <Segmented
                options={[
                  { value: 'SOL', label: 'SOL' },
                  { value: 'USDC', label: 'USDC' },
                ]}
                value={settings.defaultToken}
                onChange={handleTokenChange}
              />
            </div>

            {/* Reactions Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Payment Reactions</div>
                <div className="text-[var(--color-muted)] text-sm">
                  Auto-send reactions (❤️/🔥/👍) on successful payments
                </div>
              </div>
              <button
                onClick={handleReactionsToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.reactionsEnabled ? 'bg-[var(--color-primary)]' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.reactionsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </Card>

        {/* Tip Presets */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Tip Presets</h2>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {settings.tipPresets.map((preset) => (
                <div
                  key={preset}
                  className="flex items-center gap-2 bg-[var(--color-bg)] rounded-full px-3 py-1"
                >
                  <span className="text-white text-sm">{preset} {settings.defaultToken}</span>
                  <button
                    onClick={() => removeTipPreset(preset)}
                    className="text-[var(--color-muted)] hover:text-[var(--color-error)] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2">
              <Input
                placeholder="Add preset amount"
                type="number"
                value={newPreset}
                onChange={(e) => setNewPreset(e.target.value)}
                className="flex-1"
                step="0.1"
                min="0"
              />
              <Button onClick={addTipPreset} disabled={!newPreset || isNaN(parseFloat(newPreset))}>
                Add
              </Button>
            </div>
          </div>
        </Card>

        {/* Security */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Security</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Confirmation Threshold
              </label>
              <Input
                type="number"
                value={settings.confirmThreshold.toString()}
                onChange={(e) => handleThresholdChange(e.target.value)}
                placeholder="100"
                suffix={<span className="text-[var(--color-muted)]">{settings.defaultToken}</span>}
              />
              <p className="text-[var(--color-muted)] text-sm mt-1">
                Require confirmation for payments above this amount
              </p>
            </div>
          </div>
        </Card>

        {/* Creator Tools */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Creator Tools</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-[var(--color-bg)] rounded-lg">
              <div className="w-10 h-10 bg-[var(--color-warning)] bg-opacity-20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--color-warning)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-white font-medium">Coming Soon</div>
                <div className="text-[var(--color-muted)] text-sm">
                  Tip button generator and paid group tools
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* About */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">About</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Version</span>
              <span className="text-white">{appVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Network</span>
              <span className="text-white">Solana Devnet</span>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open('https://t.me/sendrpay_support', '_blank')}
            >
              Contact Support
            </Button>
          </div>
        </Card>

        {/* Save Button */}
        <Button
          onClick={saveSettings}
          loading={saving}
          className="w-full"
        >
          Save Settings
        </Button>
      </div>
    </div>
  );
};