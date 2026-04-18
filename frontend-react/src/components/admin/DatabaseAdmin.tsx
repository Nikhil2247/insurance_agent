import { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { getIndexStats, isDataLoaded, forceReloadData } from '@/services/langgraph/data/carrierDataIndex';
import { clearFirebaseCache } from '@/services/langgraph/data/firebaseDataService';

interface Stats {
  totalCarriers: number;
  totalRecords: number;
  totalLobs: number;
  totalRules: number;
  loaded: boolean;
  dataSource: 'firebase' | 'none';
}

export function DatabaseAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = () => {
    try {
      if (isDataLoaded()) {
        const indexStats = getIndexStats();
        setStats({
          totalCarriers: indexStats.totalCarriers,
          totalRecords: indexStats.lobIndex + indexStats.carrierIndex,
          totalLobs: indexStats.totalLobs,
          totalRules: indexStats.totalRules,
          loaded: indexStats.loaded,
          dataSource: indexStats.dataSource,
        });
      } else {
        setStats({
          totalCarriers: 0,
          totalRecords: 0,
          totalLobs: 0,
          totalRules: 0,
          loaded: false,
          dataSource: 'none',
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleReloadFromDB = async () => {
    setIsReloading(true);
    setMessage(null);
    try {
      await forceReloadData();
      setMessage({
        type: 'success',
        text: 'Data reloaded from Firebase successfully!'
      });
      loadStats();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error reloading from Firebase: ${error.message}`
      });
    } finally {
      setIsReloading(false);
    }
  };

  const handleClearCache = () => {
    clearFirebaseCache();
    setMessage({
      type: 'success',
      text: 'Firebase cache cleared successfully! Data will be reloaded on next use.'
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-8 h-8 text-gray-900" />
          <h1 className="text-2xl font-bold text-gray-900">Database Administration</h1>
        </div>
        <p className="text-gray-600">
          Manage the insurance carrier database. Data is loaded from Firebase Firestore.
        </p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Stats Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Data (In Memory)</h2>
        {stats ? (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Carriers:</span>
              <span className="font-medium">{stats.totalCarriers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Index Records:</span>
              <span className="font-medium">{stats.totalRecords}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Lines of Business:</span>
              <span className="font-medium">{stats.totalLobs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Rules:</span>
              <span className="font-medium">{stats.totalRules}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Data Source:</span>
              <span className={`font-medium ${stats.dataSource === 'firebase' ? 'text-green-600' : 'text-yellow-600'}`}>
                {stats.dataSource === 'firebase' ? 'Firebase' : 'Not Loaded'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className={`font-medium ${stats.loaded ? 'text-green-600' : 'text-yellow-600'}`}>
                {stats.loaded ? 'Loaded' : 'Not Loaded'}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">Loading stats...</div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>

        <div className="space-y-4">
          {/* Reload from Database */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Reload from Firebase</h3>
              <p className="text-sm text-gray-600">
                Clear cache and reload all data from Firebase Firestore.
              </p>
            </div>
            <button
              onClick={handleReloadFromDB}
              disabled={isReloading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {isReloading ? 'Reloading...' : 'Reload from Firebase'}
            </button>
          </div>

          {/* Clear Cache */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Clear Firebase Cache</h3>
              <p className="text-sm text-gray-600">
                Clear the in-memory cache. Data will be reloaded from Firebase on next use.
              </p>
            </div>
            <button
              onClick={handleClearCache}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              <RefreshCw className="w-4 h-4" />
              Clear Cache
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Data is loaded from Firebase Firestore (aiReadyLongform or carrierAppetites collection)</li>
          <li>Data is cached in memory for 30 minutes to minimize Firebase reads</li>
          <li>Use "Reload from Firebase" to force refresh the data</li>
          <li>Use "Clear Cache" to clear the in-memory cache</li>
        </ol>
      </div>
    </div>
  );
}
