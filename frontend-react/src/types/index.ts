export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  analysisData?: AnalysisData
  isLoading?: boolean
}

export interface AnalysisData {
  request: {
    state: string
    lob: string
    coverage: number
  }
  totalCandidates: number
  recommendations: DetailedRecommendation[]
  excluded: ExcludedCarrier[]
  marketInsights: string
}

export interface DetailedRecommendation {
  rank: number
  carrier: string
  matchScore: number
  appetiteStatus: string
  overview: string
  stateAnalysis: {
    eligible: boolean
    details: string
  }
  coverageAnalysis: {
    acceptable: boolean
    details: string
  }
  underwritingNotes: string
  strengths: string[]
  considerations: string[]
  recommendation: string
}

export interface ExcludedCarrier {
  carrier: string
  reason: string
}

export interface CarrierRecommendation {
  carrier: string
  score: number
  appetite_status: 'yes' | 'conditional' | 'no'
  reasons: string[]
  caveats: string[]
  coverage_info?: string
  notes?: string
}

export interface ChatResponse {
  response: string
  conversation_id: string
  success: boolean
  error?: string
}

export interface QuickAction {
  id: string
  title: string
  description: string
  icon: string
  query: string
  color: string
}

export interface DataStats {
  carriers: number
  lobs: number
  records: number
  rules: number
  loadedFromDB?: boolean
}
