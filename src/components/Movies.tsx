import { useEffect, useState } from 'react';
import { Film, RefreshCw, Calendar } from 'lucide-react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';

export default function Movies() {
  const { selectedCinemaId, cinemas } = useStore();
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const loadMovies = async () => {
    if (!selectedCinemaId) return;
    setLoading(true);
    try {
      const resp = await api.getNowPlayMovies(selectedCinemaId, 1, 999);
      if (resp.success && resp.result) {
        setMovies(resp.result.records || []);
        setTotal(resp.result.total || 0);
      }
    } catch (e) {
      console.error('Failed to load movies:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMovies();
  }, [selectedCinemaId]);

  const cinema = cinemas.find((c: any) => c.id === selectedCinemaId);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">正在上映</h2>
          <p className="text-sm text-gray-500">
            {cinema?.cinemaName || '全部影院'} · 共 {total} 部
          </p>
        </div>
        <button
          onClick={loadMovies}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {loading ? (
          <p className="col-span-3 text-center py-8 text-gray-400">加载中...</p>
        ) : movies.length === 0 ? (
          <p className="col-span-3 text-center py-8 text-gray-400">暂无在映电影</p>
        ) : (
          movies.map((m: any, i: number) => (
            <div key={i} className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-16 h-20 bg-gradient-to-br from-purple-200 to-pink-200 rounded flex items-center justify-center flex-shrink-0">
                  <Film className="w-8 h-8 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {m.name || m.filmName || `电影 ${m.code || i}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {m.edition && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{m.edition}</span>}
                    {m.filmSchedule?.language && <span>{m.filmSchedule.language}</span>}
                    {m.type && <span>{m.type}</span>}
                  </div>
                  {m.filmSchedule?.startTime && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-pink-500">
                      <Calendar className="w-3 h-3" />
                      {m.filmSchedule.startTime.substring(5, 16)}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    {m.originalPrice != null && (
                      <span className="text-xs text-gray-400 line-through">¥{m.originalPrice}</span>
                    )}
                    {m.lowestPrice != null && m.lowestPrice > 0 && (
                      <span className="text-sm font-medium text-pink-500">¥{m.lowestPrice}起</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
