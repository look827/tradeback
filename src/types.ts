export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  totalPnL?: number;
  winRate?: number;
  totalTrades?: number;
}

export interface Trade {
  id?: string;
  userId: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  tp?: number | null;
  sl?: number | null;
  entryDate: string;
  exitDate: string;
  notes?: string;
}

export interface NewsItem {
  id?: string;
  title: string;
  content: string;
  impact: 'High' | 'Medium' | 'Low';
  timestamp: string;
  category?: string;
}
