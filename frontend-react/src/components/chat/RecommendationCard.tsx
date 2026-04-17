import { CheckCircle, AlertCircle, MapPin, Shield, FileText, ArrowRight } from 'lucide-react'
import { DetailedRecommendation } from '@/types'
import { cn } from '@/lib/utils'

interface RecommendationCardProps {
  recommendation: DetailedRecommendation
  onSelect: () => void
}

export function RecommendationCard({ recommendation, onSelect }: RecommendationCardProps) {
  // Safely destructure with defaults
  const {
    rank = 1,
    carrier = 'Unknown Carrier',
    matchScore = 0,
    appetiteStatus = 'Unknown',
    overview = '',
    stateAnalysis = { eligible: false, details: '' },
    coverageAnalysis = { acceptable: false, details: '' },
    underwritingNotes = '',
    strengths: rawStrengths = [],
    considerations: rawConsiderations = [],
    recommendation: finalRec = ''
  } = recommendation || {}

  // Ensure strengths and considerations are arrays
  const strengths = Array.isArray(rawStrengths)
    ? rawStrengths
    : (typeof rawStrengths === 'string' && rawStrengths ? [rawStrengths] : [])

  const considerations = Array.isArray(rawConsiderations)
    ? rawConsiderations
    : (typeof rawConsiderations === 'string' && rawConsiderations ? [rawConsiderations] : [])

  const getRankLabel = (rank: number) => {
    switch (rank) {
      case 1: return 'Top Pick'
      case 2: return '2nd Choice'
      case 3: return '3rd Choice'
      default: return `#${rank}`
    }
  }

  return (
    <div className="flex flex-col h-full border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">
            {getRankLabel(rank)}
          </span>
          <span className={cn(
            'text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded',
            appetiteStatus === 'Strong Appetite' ? 'bg-green-100 text-green-700' :
            appetiteStatus === 'Conditional' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-700'
          )}>
            {appetiteStatus}
          </span>
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{carrier}</h3>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 sm:h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-700 rounded-full"
              style={{ width: `${matchScore}%` }}
            />
          </div>
          <span className="text-xs sm:text-sm font-medium text-gray-700">{matchScore}%</span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Overview */}
        {overview && (
          <div>
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">{overview}</p>
          </div>
        )}

        {/* State Analysis */}
        {stateAnalysis && stateAnalysis.details && (
          <div className="border-t border-gray-100 pt-3 sm:pt-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              <h4 className="text-xs sm:text-sm font-medium text-gray-900">State Eligibility</h4>
              {stateAnalysis.eligible && <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />}
            </div>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{stateAnalysis.details}</p>
          </div>
        )}

        {/* Coverage Analysis */}
        {coverageAnalysis && coverageAnalysis.details && (
          <div className="border-t border-gray-100 pt-3 sm:pt-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              <h4 className="text-xs sm:text-sm font-medium text-gray-900">Coverage Analysis</h4>
              {coverageAnalysis.acceptable && <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />}
            </div>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{coverageAnalysis.details}</p>
          </div>
        )}

        {/* Underwriting Notes */}
        {underwritingNotes && (
          <div className="border-t border-gray-100 pt-3 sm:pt-4">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              <h4 className="text-xs sm:text-sm font-medium text-gray-900">Underwriting Notes</h4>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{underwritingNotes}</p>
          </div>
        )}

        {/* Strengths */}
        {strengths && strengths.length > 0 && (
          <div className="border-t border-gray-100 pt-3 sm:pt-4">
            <h4 className="text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">Strengths</h4>
            <ul className="space-y-1 sm:space-y-1.5">
              {strengths.map((strength, idx) => (
                <li key={idx} className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                  <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Considerations */}
        {considerations && considerations.length > 0 && (
          <div className="border-t border-gray-100 pt-3 sm:pt-4">
            <h4 className="text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">Considerations</h4>
            <ul className="space-y-1 sm:space-y-1.5">
              {considerations.map((consideration, idx) => (
                <li key={idx} className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 mt-0.5 shrink-0" />
                  <span>{consideration}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Final Recommendation */}
        {finalRec && (
          <div className="border-t border-gray-100 pt-3 sm:pt-4">
            <h4 className="text-xs sm:text-sm font-medium text-gray-900 mb-1.5 sm:mb-2">Recommendation</h4>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{finalRec}</p>
          </div>
        )}
      </div>

      {/* Footer - Select Button */}
      <div className="p-3 sm:p-4 border-t border-gray-100 bg-gray-50">
        <button
          onClick={onSelect}
          className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-900 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <span className="truncate">Select {carrier}</span>
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
        </button>
      </div>
    </div>
  )
}
