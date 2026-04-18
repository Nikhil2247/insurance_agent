import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { AuthPage } from '@/pages/AuthPage'
import { DatabaseAdmin } from '@/components/admin/DatabaseAdmin'
import { preloadCarrierData } from '@/services/langgraph/data/firebaseDataService'

// Preload carrier data on app start (runs once, uses localStorage cache)
// This ensures data is ready before first user query - 0 Firestore reads if cached
preloadCarrierData();

function AppContent() {
  const { user, loading } = useAuth()
  const [currentPath, setCurrentPath] = useState(window.location.hash)

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  // Admin page (accessible without login for initial setup)
  if (currentPath === '#/admin') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <a href="#/" className="text-sm text-gray-600 hover:text-gray-900">
              ← Back to Chat
            </a>
            {user && (
              <span className="text-sm text-gray-600">Logged in as {user.name}</span>
            )}
          </div>
        </div>
        <DatabaseAdmin />
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return <ChatInterface />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
