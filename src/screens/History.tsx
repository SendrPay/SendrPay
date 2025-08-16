import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { useHaptics } from '../hooks/useHaptics';
import { useClipboard } from '../hooks/useClipboard';
import { useTxFeed } from '../hooks/useTxFeed';
import { formatAmount, formatDate, shortenAddress } from '../utils/format';
import { apiCall } from '../utils/api';

interface HistoryProps {
  onNavigate: (screen: string) => void;
}

interface Transaction {
  id: string;
  amount: string;
  tokenTicker: string;
  recipientTelegramId: string;
  senderTelegramId: string;
  note?: string;
  createdAt: string;
  signature: string;
  status?: string;
}

interface UserData {
  user: {
    id: string;
    first_name: string;
    username?: string;
  };
}

type FilterType = 'all' | 'sent' | 'received' | 'tips';

export const History: React.FC<HistoryProps> = ({ onNavigate }) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  
  const { transactions, loading, refresh } = useTxFeed(filter);
  const { addToast } = useToast();
  const { copyToClipboard } = useClipboard();
  const { impactLight, notificationSuccess } = useHaptics();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const data = await apiCall('/user');
      setUserData(data);
    } catch (error) {
      addToast('Failed to load user data', 'error');
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'sent', label: 'Sent' },
    { value: 'received', label: 'Received' },
    { value: 'tips', label: 'Tips' },
  ];

  const filteredTransactions = userData ? transactions.filter((tx) => {
    const isReceived = tx.recipientTelegramId === userData.user.id;
    const isSent = tx.senderTelegramId === userData.user.id;
    
    switch (filter) {
      case 'sent':
        return isSent;
      case 'received':
        return isReceived;
      case 'tips':
        // For now, consider any transaction with a note as a tip
        return tx.note && tx.note.length > 0;
      default:
        return true;
    }
  }) : transactions;

  const groupedTransactions = groupTransactionsByDate(filteredTransactions);

  const handleTxClick = (tx: Transaction) => {
    impactLight();
    setSelectedTx(tx);
  };

  const handleCopyTxHash = async () => {
    if (selectedTx?.signature) {
      const success = await copyToClipboard(selectedTx.signature);
      if (success) {
        notificationSuccess();
        addToast('Transaction hash copied!', 'success');
      }
    }
  };

  const handleViewExplorer = () => {
    if (selectedTx?.signature) {
      window.open(`https://explorer.solana.com/tx/${selectedTx.signature}?cluster=devnet`, '_blank');
    }
  };

  const handleExportCSV = () => {
    impactLight();
    
    if (filteredTransactions.length === 0) {
      addToast('No transactions to export', 'warning');
      return;
    }

    const csvData = generateCSV(filteredTransactions, userData);
    downloadCSV(csvData, `sendrpay-history-${new Date().toISOString().split('T')[0]}.csv`);
    addToast('CSV exported successfully!', 'success');
  };

  const handleRefresh = async () => {
    impactLight();
    await refresh();
    addToast('History updated', 'success');
  };

  if (loading && transactions.length === 0) {
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
        <h1 className="text-lg font-semibold text-white">Transaction History</h1>
        <IconButton
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          }
          onClick={handleExportCSV}
          variant="ghost"
        />
      </header>

      <div className="p-4 space-y-4">
        {/* Filter Controls */}
        <div className="flex items-center justify-between">
          <Segmented
            options={filterOptions}
            value={filter}
            onChange={(value) => setFilter(value as FilterType)}
          />
          <IconButton
            icon={
              loading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )
            }
            onClick={handleRefresh}
            variant="ghost"
          />
        </div>

        {/* Transaction List */}
        {filteredTransactions.length === 0 ? (
          <Card className="text-center py-8">
            <div className="w-16 h-16 bg-[var(--color-card)] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[var(--color-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-white font-medium mb-2">No transactions yet</h3>
            <p className="text-[var(--color-muted)] text-sm mb-4">
              Your transaction history will appear here once you start sending or receiving payments.
            </p>
            <Button onClick={() => onNavigate('send')} variant="outline">
              Send Your First Payment
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedTransactions).map(([date, txs]) => (
              <div key={date}>
                <h3 className="text-[var(--color-muted)] text-sm font-medium mb-2 px-2">
                  {date}
                </h3>
                <div className="space-y-2">
                  {txs.map((tx) => {
                    const isReceived = userData && tx.recipientTelegramId === userData.user.id;
                    const amount = (parseFloat(tx.amount) / Math.pow(10, 9)).toFixed(4);
                    
                    return (
                      <Card
                        key={tx.id}
                        padding="sm"
                        className="flex items-center justify-between cursor-pointer hover:bg-opacity-80"
                        onClick={() => handleTxClick(tx)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isReceived ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'
                          }`}>
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            {isReceived ? '+' : '-'}{formatAmount(amount, tx.tokenTicker)} {tx.tokenTicker}
                          </div>
                          {tx.status && (
                            <div className="text-[var(--color-muted)] text-xs capitalize">
                              {tx.status}
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction Detail Sheet */}
      <Sheet
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title="Transaction Details"
      >
        {selectedTx && userData && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                selectedTx.recipientTelegramId === userData.user.id
                  ? 'bg-[var(--color-success)]'
                  : 'bg-[var(--color-primary)]'
              }`}>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {selectedTx.recipientTelegramId === userData.user.id ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7l-7 7-7-7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  )}
                </svg>
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {selectedTx.recipientTelegramId === userData.user.id ? '+' : '-'}
                {formatAmount((parseFloat(selectedTx.amount) / Math.pow(10, 9)), selectedTx.tokenTicker)} {selectedTx.tokenTicker}
              </div>
              <div className="text-[var(--color-muted)]">
                {selectedTx.recipientTelegramId === userData.user.id ? 'Received' : 'Sent'}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Date</span>
                <span className="text-white">{new Date(selectedTx.createdAt).toLocaleString()}</span>
              </div>
              
              {selectedTx.note && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Note</span>
                  <span className="text-white">{selectedTx.note}</span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Transaction Hash</span>
                <span className="text-white font-mono text-sm">
                  {shortenAddress(selectedTx.signature, 6, 6)}
                </span>
              </div>
              
              {selectedTx.status && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Status</span>
                  <span className="text-[var(--color-success)] capitalize">{selectedTx.status}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleCopyTxHash} variant="outline" className="flex-1">
                Copy Hash
              </Button>
              <Button onClick={handleViewExplorer} className="flex-1">
                View on Explorer
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};

// Helper functions
function groupTransactionsByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  
  transactions.forEach((tx) => {
    const date = new Date(tx.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let dateKey: string;
    if (date.toDateString() === today.toDateString()) {
      dateKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = 'Yesterday';
    } else {
      dateKey = date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
    
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(tx);
  });
  
  return groups;
}

function generateCSV(transactions: Transaction[], userData: UserData | null): string {
  const headers = ['Date', 'Type', 'Amount', 'Token', 'Note', 'Transaction Hash'];
  const rows = transactions.map((tx) => {
    const isReceived = userData && tx.recipientTelegramId === userData.user.id;
    const amount = (parseFloat(tx.amount) / Math.pow(10, 9)).toFixed(4);
    
    return [
      new Date(tx.createdAt).toISOString(),
      isReceived ? 'Received' : 'Sent',
      `${isReceived ? '+' : '-'}${amount}`,
      tx.tokenTicker,
      tx.note || '',
      tx.signature,
    ];
  });
  
  return [headers, ...rows].map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
}

function downloadCSV(csvData: string, filename: string) {
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}