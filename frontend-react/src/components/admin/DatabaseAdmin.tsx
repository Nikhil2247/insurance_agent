import { useState, useEffect } from 'react';
import { Database, Upload, RefreshCw, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { seedDatabase, clearCache, getDataStats, reloadFromDatabase, reloadFromCSV } from '@/services/insuranceData';
import { clearDatabase, getDatabaseStats } from '@/services/databaseService';

interface Stats {
  totalCarriers: number;
  totalRecords: number;
  totalLobs: number;
  loaded: boolean;
  loadedFromDB: boolean;
}

interface DBStats {
  totalCarriers: number;
  totalAppetites: number;
  totalCoverageTypes: number;
}

export function DatabaseAdmin() {
  const [localStats, setLocalStats] = useState<Stats | null>(null);
  const [dbStats, setDbStats] = useState<DBStats | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const local = getDataStats();
      setLocalStats({
        totalCarriers: local.totalCarriers,
        totalRecords: local.totalRecords,
        totalLobs: local.totalLobs,
        loaded: local.loaded,
        loadedFromDB: local.loadedFromDB
      });

      const db = await getDatabaseStats();
      setDbStats({
        totalCarriers: db.totalCarriers,
        totalAppetites: db.totalAppetites,
        totalCoverageTypes: db.totalCoverageTypes
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    setMessage(null);
    try {
      const result = await seedDatabase();
      setMessage({
        type: 'success',
        text: `Database seeded successfully! ${result.carriersCount} carriers, ${result.appetitesCount} appetite records, ${result.coverageTypesCount} coverage types.`
      });
      await loadStats();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error seeding database: ${error.message}`
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('Are you sure you want to clear all data from the database? This action cannot be undone.')) {
      return;
    }

    setIsClearing(true);
    setMessage(null);
    try {
      await clearDatabase();
      clearCache();
      setMessage({
        type: 'success',
        text: 'Database cleared successfully!'
      });
      await loadStats();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error clearing database: ${error.message}`
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleReloadFromDB = async () => {
    setIsReloading(true);
    setMessage(null);
    try {
      const success = await reloadFromDatabase();
      if (success) {
        setMessage({
          type: 'success',
          text: 'Data reloaded from Firestore successfully!'
        });
      } else {
        setMessage({
          type: 'error',
          text: 'Database is empty. Please seed the database first.'
        });
      }
      await loadStats();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error reloading from database: ${error.message}`
      });
    } finally {
      setIsReloading(false);
    }
  };

  const handleReloadFromCSV = async () => {
    setIsReloading(true);
    setMessage(null);
    try {
      await reloadFromCSV();
      setMessage({
        type: 'success',
        text: 'Data reloaded from CSV successfully!'
      });
      await loadStats();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error reloading from CSV: ${error.message}`
      });
    } finally {
      setIsReloading(false);
    }
  };

  const handleClearCache = () => {
    clearCache();
    setMessage({
      type: 'success',
      text: 'Local cache cleared successfully!'
    });
    loadStats();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-8 h-8 text-gray-900" />
          <h1 className="text-2xl font-bold text-gray-900">Database Administration</h1>
        </div>
        <p className="text-gray-600">
          Manage the insurance carrier database. Seed data from CSV to Firestore for persistent storage.
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Local/Cache Stats */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Data (In Memory)</h2>
          {localStats ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Carriers:</span>
                <span className="font-medium">{localStats.totalCarriers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Appetite Records:</span>
                <span className="font-medium">{localStats.totalRecords}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Coverage Types:</span>
                <span className="font-medium">{localStats.totalLobs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Data Source:</span>
                <span className={`font-medium ${localStats.loadedFromDB ? 'text-green-600' : 'text-blue-600'}`}>
                  {localStats.loadedFromDB ? 'Firestore' : 'CSV File'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${localStats.loaded ? 'text-green-600' : 'text-yellow-600'}`}>
                  {localStats.loaded ? 'Loaded' : 'Not Loaded'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Loading stats...</div>
          )}
        </div>

        {/* Firestore Stats */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Firestore Database</h2>
          {dbStats ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Carriers:</span>
                <span className="font-medium">{dbStats.totalCarriers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Appetite Records:</span>
                <span className="font-medium">{dbStats.totalAppetites}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Coverage Types:</span>
                <span className="font-medium">{dbStats.totalCoverageTypes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${dbStats.totalCarriers > 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {dbStats.totalCarriers > 0 ? 'Seeded' : 'Empty'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Loading stats...</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>

        <div className="space-y-4">
          {/* Seed Database */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Seed Database from CSV</h3>
              <p className="text-sm text-gray-600">
                Parse the CSV file and upload all carrier data to Firestore. This will replace existing data.
              </p>
            </div>
            <button
              onClick={handleSeedDatabase}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSeeding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isSeeding ? 'Seeding...' : 'Seed Database'}
            </button>
          </div>

          {/* Reload from Database */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Reload from Firestore</h3>
              <p className="text-sm text-gray-600">
                Clear cache and reload data from Firestore database.
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
              Reload from DB
            </button>
          </div>

          {/* Reload from CSV */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Reload from CSV</h3>
              <p className="text-sm text-gray-600">
                Clear cache and reload data directly from CSV file (bypasses Firestore).
              </p>
            </div>
            <button
              onClick={handleReloadFromCSV}
              disabled={isReloading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Reload from CSV
            </button>
          </div>

          {/* Clear Cache */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Clear Local Cache</h3>
              <p className="text-sm text-gray-600">
                Clear the browser's local storage cache. Data will be reloaded on next use.
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

          {/* Clear Database */}
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
            <div>
              <h3 className="font-medium text-red-900">Clear Firestore Database</h3>
              <p className="text-sm text-red-700">
                Delete all carrier data from Firestore. This action cannot be undone!
              </p>
            </div>
            <button
              onClick={handleClearDatabase}
              disabled={isClearing}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClearing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {isClearing ? 'Clearing...' : 'Clear Database'}
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>The application first checks if data exists in Firestore</li>
          <li>If Firestore has data, it loads from there (faster for subsequent visits)</li>
          <li>If Firestore is empty, it falls back to parsing the CSV file</li>
          <li>Data is cached locally in browser storage for 24 hours</li>
          <li>Use "Seed Database" to upload CSV data to Firestore for persistent storage</li>
        </ol>
      </div>
    </div>
  );
}
