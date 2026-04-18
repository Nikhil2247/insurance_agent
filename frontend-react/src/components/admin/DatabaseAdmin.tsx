import { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle, AlertCircle, Loader2, Upload, Search } from 'lucide-react';
import { getIndexStats, isDataLoaded, forceReloadData, getAllLobKeys } from '@/services/langgraph/data/carrierDataIndex';
import { clearFirebaseCache } from '@/services/langgraph/data/firebaseDataService';
import {
  getDatabaseStats,
  seedAIReadyLongform,
  verifyAIReadyData,
  seedDatabaseFromCSV
} from '@/services/databaseService';

interface Stats {
  totalCarriers: number;
  totalRecords: number;
  totalLobs: number;
  totalRules: number;
  loaded: boolean;
  dataSource: 'firebase' | 'none';
}

interface FirestoreStats {
  totalCarriers: number;
  totalAppetites: number;
  totalCoverageTypes: number;
  aiReadyRecords: number;
}

interface VerificationResult {
  isValid: boolean;
  recordCount: number;
  sampleLobs: string[];
  sampleCarriers: string[];
  issues: string[];
}

export function DatabaseAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [firestoreStats, setFirestoreStats] = useState<FirestoreStats | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [indexedLobs, setIndexedLobs] = useState<string[]>([]);

  useEffect(() => {
    loadStats();
    loadFirestoreStats();
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
        setIndexedLobs(getAllLobKeys());
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

  const loadFirestoreStats = async () => {
    try {
      const stats = await getDatabaseStats();
      setFirestoreStats(stats);
    } catch (error) {
      console.error('Error loading Firestore stats:', error);
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
      loadFirestoreStats();
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

  const handleSeedAIReady = async () => {
    setIsSeeding(true);
    setMessage({ type: 'info', text: 'Seeding AI Ready collection from CSV... This may take a minute.' });

    try {
      const result = await seedAIReadyLongform();
      setMessage({
        type: 'success',
        text: `AI Ready seeding complete: ${result.recordsCount} records, ${result.carriersCount} carriers, ${result.lobsCount} LOBs`
      });

      // Reload stats and data
      await loadFirestoreStats();
      clearFirebaseCache();
      await forceReloadData();
      loadStats();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error seeding AI Ready: ${error.message}`
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedLegacy = async () => {
    setIsSeeding(true);
    setMessage({ type: 'info', text: 'Seeding legacy collections from CSV... This may take a minute.' });

    try {
      const result = await seedDatabaseFromCSV();
      setMessage({
        type: 'success',
        text: `Legacy seeding complete: ${result.carriersCount} carriers, ${result.appetitesCount} appetites`
      });
      await loadFirestoreStats();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error seeding legacy: ${error.message}`
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleVerifyData = async () => {
    setIsVerifying(true);
    setMessage(null);

    try {
      const result = await verifyAIReadyData();
      setVerificationResult(result);

      if (result.isValid) {
        setMessage({
          type: 'success',
          text: `Verification passed: ${result.recordCount} records, ${result.sampleLobs.length} unique LOBs`
        });
      } else {
        setMessage({
          type: 'error',
          text: `Verification found issues: ${result.issues.length} problems detected`
        });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `Error verifying data: ${error.message}`
      });
    } finally {
      setIsVerifying(false);
    }
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
          message.type === 'success' ? 'bg-green-50 text-green-800' :
          message.type === 'error' ? 'bg-red-50 text-red-800' :
          'bg-blue-50 text-blue-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : message.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-red-600" />
          ) : (
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Firestore Stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Firestore Collections</h2>
        {firestoreStats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">{firestoreStats.aiReadyRecords}</div>
              <div className="text-sm text-gray-600">AI Ready Records</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{firestoreStats.totalCarriers}</div>
              <div className="text-sm text-gray-600">Carriers</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600">{firestoreStats.totalAppetites}</div>
              <div className="text-sm text-gray-600">Legacy Appetites</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-orange-600">{firestoreStats.totalCoverageTypes}</div>
              <div className="text-sm text-gray-600">Coverage Types</div>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">Loading Firestore stats...</div>
        )}
      </div>

      {/* In-Memory Stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">In-Memory Index (Agent Data)</h2>
        {stats ? (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Carriers Indexed:</span>
              <span className="font-medium">{stats.totalCarriers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Lines of Business:</span>
              <span className="font-medium">{stats.totalLobs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Index Records:</span>
              <span className="font-medium">{stats.totalRecords}</span>
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
            {indexedLobs.length > 0 && (
              <div className="mt-4">
                <span className="text-gray-600 text-sm">Indexed LOBs:</span>
                <div className="flex flex-wrap gap-1 mt-2">
                  {indexedLobs.slice(0, 15).map(lob => (
                    <span key={lob} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      {lob}
                    </span>
                  ))}
                  {indexedLobs.length > 15 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      +{indexedLobs.length - 15} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-500">Loading in-memory stats...</div>
        )}
      </div>

      {/* Verification Result */}
      {verificationResult && (
        <div className={`mb-6 p-4 rounded-lg border ${
          verificationResult.isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <h3 className="font-semibold mb-2">
            {verificationResult.isValid ? 'Data Verification Passed' : 'Data Verification Issues'}
          </h3>
          <div className="text-sm space-y-2">
            <div>Record Count: <strong>{verificationResult.recordCount}</strong></div>
            {verificationResult.sampleLobs.length > 0 && (
              <div>
                <span>Sample LOBs: </span>
                <span className="text-gray-600">{verificationResult.sampleLobs.slice(0, 10).join(', ')}</span>
              </div>
            )}
            {verificationResult.sampleCarriers.length > 0 && (
              <div>
                <span>Sample Carriers: </span>
                <span className="text-gray-600">{verificationResult.sampleCarriers.slice(0, 10).join(', ')}</span>
              </div>
            )}
            {verificationResult.issues.length > 0 && (
              <div className="text-red-600">
                <span>Issues: </span>
                <ul className="list-disc list-inside">
                  {verificationResult.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Seeding</h2>

        <div className="space-y-4">
          {/* Seed AI Ready Collection */}
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
            <div>
              <h3 className="font-medium text-gray-900">Seed AI Ready Collection</h3>
              <p className="text-sm text-gray-600">
                Seed aiReadyLongform collection from CSV. <strong>Recommended for the AI agent.</strong>
              </p>
            </div>
            <button
              onClick={handleSeedAIReady}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSeeding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isSeeding ? 'Seeding...' : 'Seed AI Ready'}
            </button>
          </div>

          {/* Seed Legacy Collections */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Seed Legacy Collections</h3>
              <p className="text-sm text-gray-600">
                Seed carriers, carrierAppetites, and coverageTypes collections (legacy format).
              </p>
            </div>
            <button
              onClick={handleSeedLegacy}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSeeding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isSeeding ? 'Seeding...' : 'Seed Legacy'}
            </button>
          </div>

          {/* Verify Data */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <h3 className="font-medium text-gray-900">Verify AI Ready Data</h3>
              <p className="text-sm text-gray-600">
                Check that aiReadyLongform has proper field structure for the agent.
              </p>
            </div>
            <button
              onClick={handleVerifyData}
              disabled={isVerifying}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {isVerifying ? 'Verifying...' : 'Verify Data'}
            </button>
          </div>
        </div>
      </div>

      {/* Cache Management */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Cache Management</h2>

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
              {isReloading ? 'Reloading...' : 'Reload Data'}
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
        <h2 className="text-lg font-semibold text-blue-900 mb-3">Setup Instructions</h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li><strong>Seed AI Ready Collection</strong> - This creates the aiReadyLongform collection with proper field names for the agent</li>
          <li><strong>Verify Data</strong> - Check that the data structure is correct</li>
          <li><strong>Reload Data</strong> - Force refresh the in-memory cache from Firebase</li>
          <li>The agent will now use the properly formatted data for carrier recommendations</li>
        </ol>
        <div className="mt-4 text-sm text-blue-700">
          <strong>Note:</strong> The AI Ready format uses fields like <code>carrier_key</code>, <code>lob_key</code>, <code>appetite_status</code> which are optimized for the LangGraph agent.
        </div>
      </div>
    </div>
  );
}
