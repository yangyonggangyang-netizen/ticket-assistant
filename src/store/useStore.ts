import { create } from 'zustand';
import type { Account, MemberInfo } from '../types';
import { api, setAuth, localApi } from '../api/client';

interface StoreState {
  accounts: Account[];
  activeAccountId: string | null;
  loading: boolean;
  error: string | null;
  cinemas: any[];
  selectedCinemaId: string;

  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  addAccount: (name: string, token: string, memberId: string) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
  refreshActiveAccount: () => Promise<void>;
  getActiveAccount: () => Account | undefined;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  loadCinemas: () => Promise<void>;
  setSelectedCinema: (cinemaId: string) => void;
  clearError: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  loading: false,
  error: null,
  cinemas: [],
  selectedCinemaId: '',

  loadFromStorage: async () => {
    try {
      const data = await localApi.loadAccounts();
      const accounts = data.accounts || [];
      const activeId = data.activeAccountId;
      set({ accounts, activeAccountId: activeId });

      const active = accounts.find((a: Account) => a.id === activeId);
      if (active) {
        setAuth(active.token, active.memberId);
        get().refreshActiveAccount();
      }
      // Load cinemas (no auth needed)
      get().loadCinemas();
    } catch (e) {
      console.error('Failed to load from storage:', e);
    }
  },

  saveToStorage: async () => {
    await localApi.saveAccounts({
      accounts: get().accounts,
      activeAccountId: get().activeAccountId,
    });
  },

  addAccount: async (name: string, token: string, memberId: string) => {
    set({ loading: true, error: null });
    try {
      setAuth(token, memberId);

      // Verify token
      const resp = await api.getMemberInfoById();
      if (!resp.success || !resp.result) {
        throw new Error(resp.message || 'Token 无效或已过期');
      }

      const info = resp.result as MemberInfo;
      const account: Account = {
        id: `acc_${Date.now()}`,
        name: name || info.name || info.phone || `账号${get().accounts.length + 1}`,
        token,
        memberId: info.id || memberId,
        phone: info.phone,
        level: info.level,
        levelDictText: info.levelDictText,
        balance: info.balance,
        score: info.score,
        growthNum: info.growthNum,
        cardNo: info.cardNo,
        wxName: info.wxName,
        wxHeadPortrait: info.wxHeadPortrait,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        tokenValid: true,
      };

      set((state) => ({
        accounts: [...state.accounts, account],
        activeAccountId: state.activeAccountId || account.id,
        loading: false,
      }));
      await get().saveToStorage();
    } catch (e: any) {
      set({ loading: false, error: e.message });
      throw e;
    }
  },

  removeAccount: async (id: string) => {
    set((state) => {
      const accounts = state.accounts.filter((a) => a.id !== id);
      const activeAccountId =
        state.activeAccountId === id ? (accounts[0]?.id || null) : state.activeAccountId;
      return { accounts, activeAccountId };
    });
    await get().saveToStorage();

    const active = get().getActiveAccount();
    if (active) {
      setAuth(active.token, active.memberId);
      get().refreshActiveAccount();
    } else {
      setAuth('', '');
    }
  },

  switchAccount: async (id: string) => {
    const account = get().accounts.find((a) => a.id === id);
    if (!account) return;

    set({ activeAccountId: id, loading: true, error: null });
    setAuth(account.token, account.memberId);

    try {
      const resp = await api.getMemberInfoById();
      if (resp.success && resp.result) {
        const info = resp.result as MemberInfo;
        get().updateAccount(id, {
          phone: info.phone,
          level: info.level,
          levelDictText: info.levelDictText,
          balance: info.balance,
          score: info.score,
          growthNum: info.growthNum,
          cardNo: info.cardNo,
          lastActiveAt: new Date().toISOString(),
          tokenValid: true,
        });
      } else {
        get().updateAccount(id, { tokenValid: false });
      }
      set({ loading: false });
      await get().saveToStorage();
    } catch (e: any) {
      get().updateAccount(id, { tokenValid: false });
      set({ loading: false, error: e.message });
    }
  },

  refreshActiveAccount: async () => {
    const active = get().getActiveAccount();
    if (!active) return;

    set({ loading: true, error: null });
    try {
      const resp = await api.getMemberInfoById();
      if (resp.success && resp.result) {
        const info = resp.result as MemberInfo;
        get().updateAccount(active.id, {
          phone: info.phone,
          level: info.level,
          levelDictText: info.levelDictText,
          balance: info.balance,
          score: info.score,
          growthNum: info.growthNum,
          cardNo: info.cardNo,
          wxName: info.wxName,
          wxHeadPortrait: info.wxHeadPortrait,
          lastActiveAt: new Date().toISOString(),
          tokenValid: true,
        });
      } else {
        get().updateAccount(active.id, { tokenValid: false });
      }
      set({ loading: false });
      await get().saveToStorage();
    } catch (e: any) {
      get().updateAccount(active.id, { tokenValid: false });
      set({ loading: false, error: e.message });
    }
  },

  getActiveAccount: () => {
    const { accounts, activeAccountId } = get();
    return accounts.find((a) => a.id === activeAccountId);
  },

  updateAccount: (id: string, updates: Partial<Account>) => {
    set((state) => ({
      accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  },

  loadCinemas: async () => {
    try {
      const resp = await api.getCinemaList();
      if (resp.success && resp.result) {
        const cinemas = resp.result.filter((c: any) => c.id !== '0'); // exclude "总部"
        set({ cinemas });
        if (cinemas.length > 0 && !get().selectedCinemaId) {
          set({ selectedCinemaId: cinemas[0].id });
        }
      }
    } catch (e) {
      console.error('Failed to load cinemas:', e);
    }
  },

  setSelectedCinema: (cinemaId: string) => {
    set({ selectedCinemaId: cinemaId });
  },

  clearError: () => set({ error: null }),
}));
