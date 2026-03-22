import { useState, useEffect } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, FirebaseUser, OperationType, handleFirestoreError } from '../firebase';
import { Trade } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, Percent, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'motion/react';

interface DashboardProps {
  user: FirebaseUser;
}

export default function Dashboard({ user }: DashboardProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'trades'),
      where('userId', '==', user.uid),
      orderBy('entryDate', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
      setTrades(tradesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => unsubscribe();
  }, [user.uid]);

  const totalPnL = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const winRate = trades.length > 0 
    ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100 
    : 0;
  const avgPnL = trades.length > 0 ? totalPnL / trades.length : 0;

  const chartData = trades.reduce((acc: any[], trade, index) => {
    const prevPnL = index > 0 ? acc[index - 1].cumulativePnL : 0;
    acc.push({
      date: format(new Date(trade.entryDate), 'MMM dd'),
      cumulativePnL: prevPnL + trade.pnl,
      pnl: trade.pnl
    });
    return acc;
  }, []);

  const stats = [
    { label: 'Total P&L', value: `$${totalPnL.toFixed(2)}`, icon: DollarSign, color: totalPnL >= 0 ? 'text-emerald-500' : 'text-red-500', bg: totalPnL >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10' },
    { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, icon: Percent, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Total Trades', value: trades.length, icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Avg. Trade', value: `$${avgPnL.toFixed(2)}`, icon: BarChart3, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  if (loading) return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white mb-2">Trading Dashboard</h1>
        <p className="text-neutral-400">Welcome back, {user.displayName || 'Trader'}. Here's your performance overview.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <p className="text-neutral-500 text-sm font-medium mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-white mb-6">Equity Curve</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="date" stroke="#737373" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#737373" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px' }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Area type="monotone" dataKey="cumulativePnL" stroke="#10b981" fillOpacity={1} fill="url(#colorPnL)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl">
          <h3 className="text-lg font-semibold text-white mb-6">Recent Performance</h3>
          <div className="space-y-4">
            {trades.slice(-5).reverse().map((trade, i) => (
              <div key={trade.id || i} className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${trade.pnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    {trade.pnl >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{trade.symbol}</p>
                    <p className="text-xs text-neutral-500">{trade.type} • {format(new Date(trade.entryDate), 'MMM dd')}</p>
                  </div>
                </div>
                <p className={`text-sm font-bold ${trade.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                </p>
              </div>
            ))}
            {trades.length === 0 && (
              <div className="text-center py-10">
                <p className="text-neutral-500 text-sm">No trades yet. Start backtesting!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
