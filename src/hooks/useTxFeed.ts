import { useState, useEffect } from 'react';
import { apiCall } from '../utils/api';

interface Transaction {
  id: string;
  amount: string;
  tokenTicker: string;
  recipientTelegramId: string;
  senderTelegramId: string;
  note?: string;
  createdAt: string;
  signature: string;
}

type TxFilter = 'all' | 'sent' | 'received' | 'tips';

export const useTxFeed = (filter: TxFilter = 'all') => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall('/history');
      
      let filteredTxs = data.transactions;
      
      // Apply filter (this would need user context for sent/received)
      // For now, we'll show all transactions
      
      setTransactions(filteredTxs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [filter]);

  return {
    transactions,
    loading,
    error,
    refresh: fetchTransactions,
  };
};