import { useState, useEffect } from 'react';
import { onAuthStateChanged, auth, FirebaseUser, signInWithPopup, googleProvider, signOut } from './firebase';
import { UserProfile } from './types';
import Dashboard from './components/Dashboard';
import Backtesting from './components/Backtesting';
import News from './components/News';
import { Layout } from './components/Layout';
import { LogIn, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'backtesting' | 'news'>('dashboard');
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      // Ignore errors caused by user closing the popup
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return;
      }
      
      console.error('Login failed:', error);
      setLoginError('Failed to sign in. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <TrendingUp className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">TradeBack</h1>
          <p className="text-neutral-400 mb-8">
            Master the markets with our professional trading backtesting platform.
          </p>
          
          {loginError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
            >
              {loginError}
            </motion.div>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={handleLogout}
      user={user}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
          className="w-full"
        >
          {activeTab === 'dashboard' && <Dashboard user={user} />}
          {activeTab === 'backtesting' && <Backtesting user={user} />}
          {activeTab === 'news' && <News />}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
