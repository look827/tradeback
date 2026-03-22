import React, { useState, useEffect, useRef } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, doc, OperationType, handleFirestoreError, auth } from '../firebase';
import { Trade } from '../types';
import { Plus, Trash2, Calendar, DollarSign, TrendingUp, Info, X, Play, Pause, SkipForward, SkipBack, Rewind, Settings, Maximize2, Minimize2, Layout, Target, ShieldAlert, ArrowRightCircle } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, CandlestickSeries, IPriceLine } from 'lightweight-charts';

export default function Backtesting() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [chartInterval, setChartInterval] = useState('1h');
  const [showSidebar, setShowSidebar] = useState(true);

  const COMMON_SYMBOLS = [
    { label: 'BTC', value: 'BTCUSDT', category: 'Crypto' },
    { label: 'ETH', value: 'ETHUSDT', category: 'Crypto' },
    { label: 'SOL', value: 'SOLUSDT', category: 'Crypto' },
    { label: 'GOLD', value: 'PAXGUSDT', category: 'Commodity' },
    { label: 'EUR', value: 'EURUSDT', category: 'Forex' },
    { label: 'GBP', value: 'GBPUSDT', category: 'Forex' },
    { label: 'AUD', value: 'AUDUSDT', category: 'Forex' },
    { label: 'USDC', value: 'USDCUSDT', category: 'Stable' },
  ];
  
  // Replay State
  const [allData, setAllData] = useState<CandlestickData<Time>[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(500); // ms per candle

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Price Lines Refs
  const entryLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);

  // Form State
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString());
  const [exitDate, setExitDate] = useState(new Date().toISOString());
  const [size, setSize] = useState('1');
  const [side, setSide] = useState<'Long' | 'Short'>('Long');
  const [error, setError] = useState<string | null>(null);
  const [activeTrade, setActiveTrade] = useState<{
    entryPrice: number;
    tp: number | null;
    sl: number | null;
    side: 'Long' | 'Short';
    size: number;
    entryDate: string;
  } | null>(null);
  const [currentPnL, setCurrentPnL] = useState<number | null>(null);
  const [tradeClosed, setTradeClosed] = useState<{
    exitPrice: number;
    pnl: number;
    reason: 'TP' | 'SL' | 'Manual';
    exitDate: string;
  } | null>(null);

  // Fetch Historical Data from Binance
  const fetchHistory = async (targetSymbol: string, targetInterval: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const endpoints = [
        `https://api.binance.com/api/v3/klines?symbol=${targetSymbol}&interval=${targetInterval}&limit=1000`,
        `https://api1.binance.com/api/v3/klines?symbol=${targetSymbol}&interval=${targetInterval}&limit=1000`,
        `https://api2.binance.com/api/v3/klines?symbol=${targetSymbol}&interval=${targetInterval}&limit=1000`,
        `https://api3.binance.com/api/v3/klines?symbol=${targetSymbol}&interval=${targetInterval}&limit=1000`,
        `https://fapi.binance.com/fapi/v1/klines?symbol=${targetSymbol}&interval=${targetInterval}&limit=1000` // Try Futures API as fallback
      ];

      let response = null;
      let lastErrorStatus = null;
      let lastErrorMessage = '';

      for (const url of endpoints) {
        try {
          response = await fetch(url);
          if (response.ok) break;
          
          if (response.status === 400) {
            const errData = await response.json();
            lastErrorMessage = errData.msg || 'Invalid symbol or parameters';
            lastErrorStatus = 400;
            // If it's a 400, the symbol is likely wrong, no point in trying other endpoints
            break;
          }
          lastErrorStatus = response.status;
        } catch (err) {
          console.warn(`Failed to fetch from ${url}, trying next...`);
        }
      }

      if (!response || !response.ok) {
        if (lastErrorStatus === 400) {
          throw new Error(`Invalid Symbol: "${targetSymbol}" is not supported on Binance Spot or Futures. ${lastErrorMessage}`);
        }
        if (lastErrorStatus === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
        }
        throw new Error('Unable to connect to Binance API. This might be due to network restrictions or the symbol being unavailable. Please try a different symbol like BTCUSDT.');
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`No data found for ${targetSymbol}.`);
      }

      const formattedData: CandlestickData<Time>[] = data.map((d: any) => ({
        time: (d[0] / 1000) as Time,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
      }));
      setAllData(formattedData);
      setVisibleCount(Math.min(100, formattedData.length));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(symbol, chartInterval);
  }, [symbol, chartInterval]);

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f1f1f' },
        horzLines: { color: '#1f1f1f' },
      },
      width: chartContainerRef.current.clientWidth,
      height: isFullScreen ? window.innerHeight : 800,
      timeScale: {
        borderColor: '#333',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: isFullScreen ? window.innerHeight : 800
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [isFullScreen]);

  // Update Price Lines on Chart
  useEffect(() => {
    if (!seriesRef.current) return;

    // Clear existing lines
    if (entryLineRef.current) seriesRef.current.removePriceLine(entryLineRef.current);
    if (tpLineRef.current) seriesRef.current.removePriceLine(tpLineRef.current);
    if (slLineRef.current) seriesRef.current.removePriceLine(slLineRef.current);

    if (entryPrice) {
      entryLineRef.current = seriesRef.current.createPriceLine({
        price: parseFloat(entryPrice),
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'ENTRY',
      });
    }

    if (tpPrice) {
      tpLineRef.current = seriesRef.current.createPriceLine({
        price: parseFloat(tpPrice),
        color: '#10b981',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'TP',
      });
    }

    if (slPrice) {
      slLineRef.current = seriesRef.current.createPriceLine({
        price: parseFloat(slPrice),
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'SL',
      });
    }
  }, [entryPrice, tpPrice, slPrice]);

  // Update Chart Data
  const prevVisibleCount = useRef(visibleCount);
  useEffect(() => {
    if (seriesRef.current && allData.length > 0) {
      const visibleData = allData.slice(0, visibleCount);
      seriesRef.current.setData(visibleData);
      
      // Only auto-scroll if we are playing and were already near the end
      if (isPlaying && visibleCount > prevVisibleCount.current) {
        chartRef.current?.timeScale().scrollToPosition(0, false);
      }
      prevVisibleCount.current = visibleCount;
    }
  }, [allData, visibleCount, isPlaying]);

  // Simulation Logic: P&L Tracking and TP/SL Detection
  useEffect(() => {
    if (!activeTrade || tradeClosed || allData.length === 0) return;

    const lastCandle = allData[visibleCount - 1];
    if (!lastCandle) return;

    // Calculate Floating P&L
    const floatingPnL = activeTrade.side === 'Long'
      ? (lastCandle.close - activeTrade.entryPrice) * activeTrade.size
      : (activeTrade.entryPrice - lastCandle.close) * activeTrade.size;
    
    setCurrentPnL(floatingPnL);

    // Check for TP/SL hits
    let hit: 'TP' | 'SL' | null = null;
    let hitPrice = 0;

    if (activeTrade.side === 'Long') {
      if (activeTrade.tp && lastCandle.high >= activeTrade.tp) {
        hit = 'TP';
        hitPrice = activeTrade.tp;
      } else if (activeTrade.sl && lastCandle.low <= activeTrade.sl) {
        hit = 'SL';
        hitPrice = activeTrade.sl;
      }
    } else {
      if (activeTrade.tp && lastCandle.low <= activeTrade.tp) {
        hit = 'TP';
        hitPrice = activeTrade.tp;
      } else if (activeTrade.sl && lastCandle.high >= activeTrade.sl) {
        hit = 'SL';
        hitPrice = activeTrade.sl;
      }
    }

    if (hit) {
      const finalPnL = activeTrade.side === 'Long'
        ? (hitPrice - activeTrade.entryPrice) * activeTrade.size
        : (activeTrade.entryPrice - hitPrice) * activeTrade.size;
      
      console.log(`Simulation Hit: ${hit} at ${hitPrice}. P&L: ${finalPnL}`);
      
      setTradeClosed({
        exitPrice: hitPrice,
        pnl: finalPnL,
        reason: hit,
        exitDate: new Date((lastCandle.time as number) * 1000).toISOString()
      });
      setIsPlaying(false);
    }
  }, [visibleCount, activeTrade, tradeClosed, allData]);

  // Replay Logic
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (isPlaying && allData.length > 0) {
      intervalId = setInterval(() => {
        setVisibleCount(prev => {
          if (prev >= allData.length) {
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, allData.length, playbackSpeed]);

  // Stop playback when reaching the end
  useEffect(() => {
    if (isPlaying && visibleCount >= allData.length && allData.length > 0) {
      setIsPlaying(false);
    }
  }, [visibleCount, allData.length, isPlaying]);

  // Fetch User Trades
  useEffect(() => {
    if (!auth.currentUser) return;
    
    const q = query(
      collection(db, 'trades'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('entryDate', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tradesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
      setTrades(tradesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trades');
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const handleStartSimulation = () => {
    setError(null);
    const entry = parseFloat(entryPrice);
    const tp = tpPrice ? parseFloat(tpPrice) : null;
    const sl = slPrice ? parseFloat(slPrice) : null;
    const s = parseFloat(size);

    if (isNaN(entry) || isNaN(s)) {
      setError('Entry Price and Size are required');
      return;
    }

    console.log('Starting simulation with:', { entry, tp, sl, side, s });

    setActiveTrade({
      entryPrice: entry,
      tp,
      sl,
      side,
      size: s,
      entryDate: entryDate || new Date().toISOString()
    });
    setTradeClosed(null);
    setCurrentPnL(0);
  };

  const handleCloseManual = () => {
    if (!activeTrade) return;
    const lastCandle = allData[visibleCount - 1];
    const exit = lastCandle.close;
    const pnl = activeTrade.side === 'Long'
      ? (exit - activeTrade.entryPrice) * activeTrade.size
      : (activeTrade.entryPrice - exit) * activeTrade.size;

    setTradeClosed({
      exitPrice: exit,
      pnl,
      reason: 'Manual',
      exitDate: new Date((lastCandle.time as number) * 1000).toISOString()
    });
    setIsPlaying(false);
  };

  const handleSaveToJournal = async () => {
    if (!activeTrade || !tradeClosed || !auth.currentUser) return;

    const newTrade: Omit<Trade, 'id'> = {
      userId: auth.currentUser.uid,
      symbol,
      entryPrice: activeTrade.entryPrice,
      exitPrice: tradeClosed.exitPrice,
      quantity: activeTrade.size,
      type: activeTrade.side === 'Long' ? 'BUY' : 'SELL',
      pnl: tradeClosed.pnl,
      tp: activeTrade.tp || null,
      sl: activeTrade.sl || null,
      entryDate: activeTrade.entryDate,
      exitDate: tradeClosed.exitDate,
    };

    try {
      await addDoc(collection(db, 'trades'), newTrade);
      setActiveTrade(null);
      setTradeClosed(null);
      setCurrentPnL(null);
      setEntryPrice('');
      setExitPrice('');
      setTpPrice('');
      setSlPrice('');
      setSize('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'trades');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const tp = tpPrice ? parseFloat(tpPrice) : null;
    const sl = slPrice ? parseFloat(slPrice) : null;

    // Validation
    if (isNaN(entry) || isNaN(exit) || isNaN(parseFloat(size))) {
      setError('Entry, Exit, and Size are required for manual recording');
      return;
    }
    if (tp !== null) {
      if (side === 'Long' && tp <= entry) {
        setError('Take Profit must be above Entry Price for Long trades');
        return;
      }
      if (side === 'Short' && tp >= entry) {
        setError('Take Profit must be below Entry Price for Short trades');
        return;
      }
    }

    if (sl !== null) {
      if (side === 'Long' && sl >= entry) {
        setError('Stop Loss must be below Entry Price for Long trades');
        return;
      }
      if (side === 'Short' && sl <= entry) {
        setError('Stop Loss must be above Entry Price for Short trades');
        return;
      }
    }

    const profit = side === 'Long' 
      ? (exit - entry) * parseFloat(size)
      : (entry - exit) * parseFloat(size);

    if (!auth.currentUser) {
      setError('You must be logged in to record a trade');
      return;
    }

    const newTrade: Omit<Trade, 'id'> = {
      userId: auth.currentUser.uid,
      symbol,
      entryPrice: entry,
      exitPrice: exit,
      quantity: parseFloat(size),
      type: side === 'Long' ? 'BUY' : 'SELL',
      pnl: profit,
      tp: tp || null,
      sl: sl || null,
      entryDate,
      exitDate,
    };

    try {
      await addDoc(collection(db, 'trades'), newTrade);
      setEntryPrice('');
      setExitPrice('');
      setTpPrice('');
      setSlPrice('');
      setSize('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'trades');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'trades', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'trades');
    }
  };

  const setEntryToCurrent = () => {
    const current = allData[visibleCount - 1];
    if (current) {
      setEntryPrice(current.close.toString());
      setEntryDate(new Date((current.time as number) * 1000).toISOString());
    }
  };

  const setExitToCurrent = () => {
    const current = allData[visibleCount - 1];
    if (current) {
      setExitPrice(current.close.toString());
      setExitDate(new Date((current.time as number) * 1000).toISOString());
    }
  };

  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winRate = trades.length > 0 
    ? (trades.filter(t => (t.pnl || 0) >= 0).length / trades.length) * 100 
    : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Bar Replay Backtesting</h1>
          <p className="text-neutral-400">Step through history and test your edge in real-time.</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {COMMON_SYMBOLS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSymbol(s.value)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all border ${
                  symbol === s.value 
                    ? 'bg-emerald-500 border-emerald-500 text-neutral-950' 
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-1">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol (e.g. BTCUSDT, PAXGUSDT)"
              className="bg-transparent border-none text-white px-3 py-1.5 focus:outline-none w-48 text-sm font-bold uppercase"
            />
            <select
              value={chartInterval}
              onChange={(e) => setChartInterval(e.target.value)}
              className="bg-neutral-800 border-none text-white px-3 py-1.5 rounded-lg focus:outline-none text-sm font-bold"
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="30m">30m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1w">1w</option>
            </select>
          </div>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-xl border transition-all ${showSidebar ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500' : 'bg-neutral-900 border-neutral-800 text-neutral-400'}`}
          >
            <Layout className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="text-neutral-400 font-medium">Total Profit</span>
          </div>
          <p className={`text-3xl font-bold ${totalPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            ${totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-neutral-400 font-medium">Win Rate</span>
          </div>
          <p className="text-3xl font-bold text-white">{winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Calendar className="w-5 h-5 text-purple-500" />
            </div>
            <span className="text-neutral-400 font-medium">Total Trades</span>
          </div>
          <p className="text-3xl font-bold text-white">{trades.length}</p>
        </div>
      </div>

      {/* Main Content Area: Chart + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-6 h-[800px]">
        {/* Chart Area */}
        <div className={`flex-1 bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden relative shadow-2xl group transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[100] rounded-none h-screen w-screen' : 'h-full'}`}>
          <div ref={chartContainerRef} className="w-full h-full" />
          
          {/* Top Controls Overlay */}
          <div className="absolute top-6 left-6 z-10 flex gap-3">
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="bg-neutral-950/80 backdrop-blur-md border border-neutral-800 p-3 rounded-xl hover:bg-neutral-800 transition-all text-white flex items-center gap-2 shadow-xl"
            >
              {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              <span className="text-xs font-bold uppercase tracking-wider">{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
          </div>

          {/* Replay Control Bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-neutral-950/90 backdrop-blur-xl border border-neutral-800 p-4 rounded-2xl flex items-center gap-6 shadow-2xl border-t border-t-white/5">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setVisibleCount(100)}
                className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
                title="Reset Replay"
              >
                <Rewind className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setVisibleCount(prev => Math.max(100, prev - 1))}
                className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
                title="Previous Candle"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-3 rounded-xl transition-all ${isPlaying ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'}`}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
              <button 
                onClick={() => setVisibleCount(prev => Math.min(prev + 1, allData.length))}
                className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
                title="Next Candle"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="h-8 w-px bg-neutral-800" />

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-neutral-500" />
                <select 
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="bg-neutral-800 border-none text-white px-2 py-1 rounded-lg text-xs font-bold focus:outline-none"
                >
                  <option value={2000}>2.0s</option>
                  <option value={1000}>1.0s</option>
                  <option value={500}>0.5s</option>
                  <option value={200}>0.2s</option>
                  <option value={100}>0.1s</option>
                </select>
              </div>
              <div className="text-xs font-mono text-neutral-500">
                {visibleCount} / {allData.length} Candles
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="w-full lg:w-80 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col gap-6 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ArrowRightCircle className="w-5 h-5 text-emerald-500" />
                  {activeTrade ? 'Active Simulation' : 'Take Trade'}
                </h3>
                <button onClick={() => setShowSidebar(false)} className="text-neutral-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {activeTrade ? (
                <div className="space-y-6">
                  <div className="p-6 bg-neutral-950 rounded-2xl border border-neutral-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 text-xs font-bold uppercase">Floating P&L</span>
                      <span className={`text-xl font-bold ${currentPnL !== null && currentPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {currentPnL !== null ? `${currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2)}` : '0.00'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-neutral-500 mb-1">Entry</p>
                        <p className="text-white font-bold">${activeTrade.entryPrice}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500 mb-1">Current Price</p>
                        <p className="text-white font-bold">${allData[visibleCount - 1]?.close || '-'}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500 mb-1">Side</p>
                        <p className={`font-bold ${activeTrade.side === 'Long' ? 'text-emerald-500' : 'text-red-500'}`}>{activeTrade.side}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500 mb-1">Size</p>
                        <p className="text-white font-bold">{activeTrade.size}</p>
                      </div>
                    </div>
                  </div>

                  {tradeClosed ? (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="p-6 bg-emerald-500/10 border border-emerald-500 rounded-2xl space-y-4"
                    >
                      <div className="flex items-center gap-2 text-emerald-500 font-bold">
                        <Target className="w-5 h-5" />
                        Trade Closed ({tradeClosed.reason})
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-400">Exit Price</span>
                          <span className="text-white font-bold">${tradeClosed.exitPrice}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-400">Final P&L</span>
                          <span className={`font-bold ${tradeClosed.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            ${tradeClosed.pnl.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={handleSaveToJournal}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-bold py-3 rounded-xl transition-all"
                      >
                        Save to Journal
                      </button>
                      <button
                        onClick={() => { setActiveTrade(null); setTradeClosed(null); }}
                        className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2 rounded-xl transition-all text-xs"
                      >
                        Discard
                      </button>
                    </motion.div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        onClick={handleCloseManual}
                        className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/50 font-bold py-3 rounded-xl transition-all"
                      >
                        Close Trade Now
                      </button>
                      <p className="text-[10px] text-neutral-500 text-center">
                        Trade will automatically close if TP (${activeTrade.tp || '-'}) or SL (${activeTrade.sl || '-'}) is hit during replay.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Side</label>
                    <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => setSide('Long')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${side === 'Long' ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:text-white'}`}
                      >
                        Long
                      </button>
                      <button
                        type="button"
                        onClick={() => setSide('Short')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${side === 'Short' ? 'bg-red-500 text-white' : 'text-neutral-400 hover:text-white'}`}
                      >
                        Short
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-xs font-medium flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        {error}
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                          <Plus className="w-3 h-3" /> Entry Price
                        </label>
                        <button 
                          type="button"
                          onClick={setEntryToCurrent}
                          className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 uppercase tracking-tighter"
                        >
                          Set to Current
                        </button>
                      </div>
                      <input
                        required
                        type="number"
                        step="any"
                        value={entryPrice}
                        onChange={(e) => setEntryPrice(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                        <Target className="w-3 h-3 text-emerald-500" /> Take Profit
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={tpPrice}
                        onChange={(e) => setTpPrice(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                        placeholder="Optional"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                        <ShieldAlert className="w-3 h-3 text-red-500" /> Stop Loss
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                        placeholder="Optional"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Position Size</label>
                      <input
                        required
                        type="number"
                        step="any"
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                        placeholder="Units"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleStartSimulation}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm"
                      >
                        Start Simulation
                      </button>
                    </div>

                    <div className="h-px bg-neutral-800 my-2" />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Exit Price (Manual Log)</label>
                        <button 
                          type="button"
                          onClick={setExitToCurrent}
                          className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 uppercase tracking-tighter"
                        >
                          Set to Current
                        </button>
                      </div>
                      <input
                        type="number"
                        step="any"
                        value={exitPrice}
                        onChange={(e) => setExitPrice(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 rounded-xl transition-all border border-neutral-700 text-sm"
                  >
                    Record Manual Result
                  </button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Trade History */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Backtesting History</h2>
          <div className="flex items-center gap-2 text-neutral-500 text-sm">
            <Info className="w-4 h-4" />
            <span>Click "Record Trade" in the sidebar to log your results.</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-neutral-950/50 text-neutral-400 text-sm uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Symbol</th>
                <th className="px-6 py-4 font-semibold">Side</th>
                <th className="px-6 py-4 font-semibold">Entry Date</th>
                <th className="px-6 py-4 font-semibold">Entry/Exit</th>
                <th className="px-6 py-4 font-semibold">TP/SL</th>
                <th className="px-6 py-4 font-semibold">Profit</th>
                <th className="px-6 py-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {trades.map((trade) => (
                <tr key={trade.id} className="hover:bg-neutral-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-white font-bold">{trade.symbol}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${trade.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {trade.type === 'BUY' ? 'Long' : 'Short'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-neutral-400 text-sm">
                    {format(new Date(trade.entryDate), 'MMM dd, HH:mm')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-white font-medium">${trade.entryPrice.toLocaleString()}</span>
                      <span className="text-neutral-500 text-xs">${trade.exitPrice.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {trade.tp && <span className="text-emerald-500 text-xs font-bold">TP: ${trade.tp.toLocaleString()}</span>}
                      {trade.sl && <span className="text-red-500 text-xs font-bold">SL: ${trade.sl.toLocaleString()}</span>}
                      {!trade.tp && !trade.sl && <span className="text-neutral-600 text-xs">-</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-bold ${(trade.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {(trade.pnl || 0) >= 0 ? '+' : ''}${(trade.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => trade.id && handleDelete(trade.id)}
                      className="p-2 text-neutral-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {trades.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-neutral-500">
                    No backtesting history yet. Start by taking a trade!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
