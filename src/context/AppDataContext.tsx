import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getErrorMessage } from '../lib/api';
import type { Material, Part } from '../../shared/types';

interface AppDataValue {
  materials: Material[];
  parts: Part[];
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
  refreshParts: () => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMaterials = useCallback(async () => {
    const next = await api.materials.list();
    setMaterials(next);
  }, []);

  const refreshParts = useCallback(async () => {
    const next = await api.parts.list();
    setParts(next);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setError(null);
      const [nextMaterials, nextParts] = await Promise.all([api.materials.list(), api.parts.list()]);
      setMaterials(nextMaterials);
      setParts(nextParts);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const value = useMemo(
    () => ({
      materials,
      parts,
      loading,
      error,
      refreshAll,
      refreshMaterials,
      refreshParts,
    }),
    [materials, parts, loading, error, refreshAll, refreshMaterials, refreshParts],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider');
  return context;
}
