import { CheckCircle, AlertCircle, Shield, MapPin, FileText, TrendingUp, Award } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CarrierRecommendation } from '@/types'
import { cn } from '@/lib/utils'

interface CarrierDetailModalProps {
  carrier: CarrierRecommendation | null
  rank: number
  open: boolean
  onOpenChange: (open: boolean) => void
  requestInfo?: {
    state?: string
    lob?: string
    coverage?: number
  }
}

export function CarrierDetailModal({
  carrier,
  rank,
  open,
  onOpenChange,
  requestInfo
}: CarrierDetailModalProps) {
  if (!carrier) return null

  const scorePercentage = Math.round(carrier.score * 100)

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-emerald-600'
    if (score >= 0.5) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 0.7) return 'bg-emerald-500'
    if (score >= 0.5) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🏆'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `#${rank}`
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-4 pr-8">
            <span className="text-4xl">{getRankIcon(rank)}</span>
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-3">
                {carrier.carrier}
                <span className={cn(
                  'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
                  carrier.appetite_status === 'yes'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                )}>
                  {carrier.appetite_status === 'yes' ? (
                    <><CheckCircle className="w-4 h-4 mr-1.5" /> Strong Appetite</>
                  ) : (
                    <><AlertCircle className="w-4 h-4 mr-1.5" /> Conditional</>
                  )}
                </span>
              </DialogTitle>
              <p className="text-muted-foreground mt-1">
                Ranked #{rank} for your insurance needs
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Score Section */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Match Score</h3>
                  <p className="text-sm text-muted-foreground">Based on your requirements</p>
                </div>
              </div>
              <div className={cn('text-4xl font-bold', getScoreColor(carrier.score))}>
                {scorePercentage}%
              </div>
            </div>
            <div className="h-3 bg-white rounded-full overflow-hidden shadow-inner">
              <div
                className={cn('h-full rounded-full transition-all duration-700', getScoreBgColor(carrier.score))}
                style={{ width: `${scorePercentage}%` }}
              />
            </div>
          </div>

          {/* Request Summary */}
          {requestInfo && (requestInfo.state || requestInfo.lob || requestInfo.coverage) && (
            <div className="grid grid-cols-3 gap-4">
              {requestInfo.lob && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">Coverage Type</span>
                  </div>
                  <p className="font-semibold text-blue-900">{requestInfo.lob}</p>
                </div>
              )}
              {requestInfo.state && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">State</span>
                  </div>
                  <p className="font-semibold text-green-900">{requestInfo.state}</p>
                </div>
              )}
              {requestInfo.coverage && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                  <div className="flex items-center gap-2 text-purple-600 mb-1">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">Coverage Amount</span>
                  </div>
                  <p className="font-semibold text-purple-900">${requestInfo.coverage.toLocaleString()}</p>
                </div>
              )}
            </div>
          )}

          {/* Reasons to Choose */}
          {carrier.reasons.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Award className="w-5 h-5 text-emerald-600" />
                Why Choose {carrier.carrier}
              </h3>
              <div className="space-y-2">
                {carrier.reasons.map((reason, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <p className="text-emerald-800">{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Caveats / Considerations */}
          {carrier.caveats.length > 0 && (
            <div>
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Important Considerations
              </h3>
              <div className="space-y-2">
                {carrier.caveats.map((caveat, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100"
                  >
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-amber-800">{caveat}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coverage Info */}
          {carrier.coverage_info && (
            <div className="bg-slate-50 rounded-lg p-4 border">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                Coverage Details
              </h3>
              <p className="text-muted-foreground">{carrier.coverage_info}</p>
            </div>
          )}

          {/* Notes */}
          {carrier.notes && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
              <h3 className="font-semibold mb-2 text-blue-900">Additional Notes</h3>
              <p className="text-blue-800">{carrier.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
