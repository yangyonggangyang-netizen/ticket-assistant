import { useState, useEffect } from 'react';
import { useStore } from './store/useStore';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Accounts from './components/Accounts';
import Movies from './components/Movies';
import Schedules from './components/Schedules';
import OrderList from './components/OrderList';
import MemberInfo from './components/MemberInfo';
import Mall from './components/Mall';
import Ledger from './components/Ledger';

export type Page = 'dashboard' | 'movies' | 'schedules' | 'orders' | 'member' | 'mall' | 'accounts' | 'ledger';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const { loadFromStorage, accounts } = useStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (accounts.length === 0) {
      setPage('accounts');
    }
  }, [accounts.length]);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar page={page} setPage={setPage} />
      <main className="flex-1 overflow-auto">
        {page === 'dashboard' && <Dashboard setPage={setPage} />}
        {page === 'movies' && <Movies />}
        {page === 'schedules' && <Schedules />}
        {page === 'orders' && <OrderList />}
        {page === 'member' && <MemberInfo />}
        {page === 'mall' && <Mall />}
        {page === 'ledger' && <Ledger />}
        {page === 'accounts' && <Accounts />}
      </main>
    </div>
  );
}
