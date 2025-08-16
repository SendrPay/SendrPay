import { useState, useEffect } from 'react';
import { apiCall } from '../utils/api';

interface Balance {
  SOL: string;
  USDC: string;
}

export const useBalance = (token?: 'SOL' | 'USDC') => {
  const [balances, setBalances] = useState<Balance>({ SOL: '0.00', USDC: '0.00' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall('/balance');
      setBalances(data.balances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load balance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  const balance = token ? balances[token] : balances;

  return {
    balance,
    balances,
    loading,
    error,
    refresh: fetchBalance,
  };
};