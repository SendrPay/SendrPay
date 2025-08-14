// Temporary payment storage for Discord confirmations
// In production, this should use Redis or database

interface PendingPayment {
  userId: string;
  targetHandle: string;
  targetPlatform: "telegram" | "discord" | null;
  amount: number;
  token: string;
  note?: string;
  resolvedPayeeId: number;
  timestamp: number;
}

const pendingPayments = new Map<string, PendingPayment>();

export function storePendingPayment(paymentId: string, payment: PendingPayment) {
  pendingPayments.set(paymentId, payment);
  
  // Auto-cleanup after 10 minutes
  setTimeout(() => {
    pendingPayments.delete(paymentId);
  }, 10 * 60 * 1000);
}

export function getPendingPayment(paymentId: string): PendingPayment | undefined {
  return pendingPayments.get(paymentId);
}

export function removePendingPayment(paymentId: string) {
  pendingPayments.delete(paymentId);
}