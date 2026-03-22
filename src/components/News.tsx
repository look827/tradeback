import React, { useState, useEffect, useRef } from 'react';
import { db, collection, query, orderBy, onSnapshot, addDoc, FirebaseUser, auth, OperationType, handleFirestoreError } from '../firebase';
import { NewsItem } from '../types';
import { Newspaper, Clock, AlertCircle, Plus, X, RefreshCw, Globe, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export default function News() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const marketOverviewRef = useRef<HTMLDivElement>(null);
  const economicCalendarRef = useRef<HTMLDivElement>(null);

  // Admin check
  const isAdmin = auth.currentUser?.email === 'sehajintheusa@gmail.com';

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [impact, setImpact] = useState<'High' | 'Medium' | 'Low'>('Medium');

  useEffect(() => {
    // Market Overview Widget
    const script1 = document.createElement('script');
    script1.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script1.async = true;
    script1.innerHTML = JSON.stringify({
      "colorTheme": "dark",
      "dateRange": "12M",
      "showChart": true,
      "locale": "en",
      "largeChartUrl": "",
      "isTransparent": false,
      "showSymbolLogo": true,
      "showFloatingTooltip": false,
      "width": "100%",
      "height": "660",
      "tabs": [
        {
          "title": "Indices",
          "symbols": [
            { "s": "FOREXCOM:SPX500", "d": "S&P 500" },
            { "s": "FOREXCOM:NSXUSD", "d": "US Tech 100" },
            { "s": "FOREXCOM:DJI", "d": "Dow 30" },
            { "s": "INDEX:NKY", "d": "Nikkei 225" },
            { "s": "INDEX:DEU40", "d": "DAX Index" }
          ]
        },
        {
          "title": "Crypto",
          "symbols": [
            { "s": "BINANCE:BTCUSDT", "d": "Bitcoin" },
            { "s": "BINANCE:ETHUSDT", "d": "Ethereum" },
            { "s": "BINANCE:SOLUSDT", "d": "Solana" },
            { "s": "BINANCE:BNBUSDT", "d": "BNB" }
          ]
        },
        {
          "title": "Forex & Commodities",
          "symbols": [
            { "s": "FX:EURUSD", "d": "EUR/USD" },
            { "s": "FX:GBPUSD", "d": "GBP/USD" },
            { "s": "FX:USDJPY", "d": "USD/JPY" },
            { "s": "FX:AUDUSD", "d": "AUD/USD" },
            { "s": "OANDA:XAUUSD", "d": "Gold" },
            { "s": "OANDA:XAGUSD", "d": "Silver" }
          ]
        }
      ]
    });
    if (marketOverviewRef.current) marketOverviewRef.current.appendChild(script1);

    // Economic Calendar Widget
    const script2 = document.createElement('script');
    script2.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
    script2.async = true;
    script2.innerHTML = JSON.stringify({
      "colorTheme": "dark",
      "isTransparent": false,
      "width": "100%",
      "height": "600",
      "locale": "en",
      "importanceFilter": "-1,0,1"
    });
    if (economicCalendarRef.current) economicCalendarRef.current.appendChild(script2);

    return () => {
      if (script1.parentNode) script1.parentNode.removeChild(script1);
      if (script2.parentNode) script2.parentNode.removeChild(script2);
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem));
      setNews(newsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'news');
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newNews: Omit<NewsItem, 'id'> = {
      title,
      content,
      impact,
      timestamp: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, 'news'), newNews);
      setIsAdding(false);
      setTitle('');
      setContent('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'news');
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'High': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'Medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'Low': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      default: return 'text-neutral-500 bg-neutral-500/10 border-neutral-500/20';
    }
  };

  return (
    <div className="space-y-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Market Intelligence</h1>
          <p className="text-neutral-400">Real-time market overview and economic events.</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <button
              onClick={() => setIsAdding(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-all"
            >
              <Plus className="w-5 h-5" />
              Add News
            </button>
          )}
        </div>
      </header>

      {/* TradingView Market Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-white">Global Market Overview</h3>
          </div>
          <div ref={marketOverviewRef} className="tradingview-widget-container" />
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-emerald-500" />
            <h3 className="font-semibold text-white">Economic Calendar</h3>
          </div>
          <div ref={economicCalendarRef} className="tradingview-widget-container" />
        </div>
      </div>

      {/* Community News Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Newspaper className="w-6 h-6 text-emerald-500" />
          <h2 className="text-2xl font-bold text-white">Community Insights</h2>
        </div>
        <div className="grid grid-cols-1 gap-6">
          {news.map((item, i) => (
            <motion.div
              key={item.id || i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl hover:border-neutral-700 transition-all group"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${getImpactColor(item.impact)}`}>
                      {item.impact} Impact
                    </span>
                    <div className="flex items-center gap-1.5 text-neutral-500 text-xs">
                      <Clock className="w-3 h-3" />
                      {format(new Date(item.timestamp), 'MMM dd, HH:mm')}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-emerald-500 transition-colors">{item.title}</h3>
                </div>
              </div>
              <p className="text-neutral-400 leading-relaxed whitespace-pre-wrap">{item.content}</p>
            </motion.div>
          ))}
          {news.length === 0 && !loading && (
            <div className="text-center py-20 bg-neutral-900 border border-neutral-800 rounded-2xl">
              <Newspaper className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
              <p className="text-neutral-500">No community updates at the moment.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add News Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Post Market News</h3>
                <button onClick={() => setIsAdding(false)} className="text-neutral-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Title</label>
                  <input
                    required
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Impact</label>
                  <select
                    value={impact}
                    onChange={(e) => setImpact(e.target.value as any)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="High">High Impact</option>
                    <option value="Medium">Medium Impact</option>
                    <option value="Low">Low Impact</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Content</label>
                  <textarea
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={5}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-3 px-6 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-semibold py-3 px-6 rounded-xl transition-all"
                  >
                    Post News
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
