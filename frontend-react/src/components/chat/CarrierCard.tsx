import { CheckCircle, AlertCircle, Eye } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { CarrierRecommendation } from '@/types'
import { cn } from '@/lib/utils'

interface CarrierCardProps {
  carrier: CarrierRecommendation
  rank: number
  onClick?: () => void
  compact?: boolean
}

export function CarrierCard({ carrier, rank, onClick, compact = true }: CarrierCardProps) {
  const scorePercentage = Math.round(carrier.score * 100)

  const getRankStyles = (rank: number) => {
    switch (rank) {
      case 1:
        return {
          gradient: 'from-yellow-400 via-yellow-500 to-amber-500',
          border: 'border-yellow-200 hover:border-yellow-300',
          glow: 'shadow-yellow-100',
          icon: '🏆',
          label: 'Best Match'
        }
      case 2:
        return {
          gradient: 'from-slate-300 via-slate-400 to-slate-500',
          border: 'border-slate-200 hover:border-slate-300',
          glow: 'shadow-slate-100',
          icon: '🥈',
          label: '2nd Best'
        }
      case 3:
        return {
          gradient: 'from-amber-500 via-amber-600 to-orange-600',
          border: 'border-amber-200 hover:border-amber-300',
          glow: 'shadow-amber-100',
          icon: '🥉',
          label: '3rd Best'
        }
      default:
        return {
          gradient: 'from-slate-400 to-slate-500',
          border: 'border-slate-200 hover:border-slate-300',
          glow: 'shadow-slate-100',
          icon: `#${rank}`,
          label: `#${rank}`
        }
    }
  }

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

  const styles = getRankStyles(rank)

  if (compact) {
    return (
      <Card
        className={cn(
          'overflow-hidden transition-all duration-300 cursor-pointer group',
          'hover:shadow-lg hover:-translate-y-1',
          styles.border,
          styles.glow,
          rank === 1 && 'ring-2 ring-yellow-300'
        )}
        onClick={onClick}
      >
        <CardContent className="p-0">
          {/* Rank Badge Header */}
          <div className={cn('bg-gradient-to-r p-3 text-white', styles.gradient)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{styles.icon}</span>
                <span className="text-sm font-medium opacity-90">{styles.label}</span>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-medium">
                {scorePercentage}% Match
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Carrier Name & Status */}
            <div className="mb-3">
              <h4 className="font-bold text-lg text-foreground mb-1">{carrier.carrier}</h4>
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                carrier.appetite_status === 'yes'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              )}>
                {carrier.appetite_status === 'yes' ? (
                  <><CheckCircle className="w-3 h-3 mr-1" /> Strong Appetite</>
                ) : (
                  <><AlertCircle className="w-3 h-3 mr-1" /> Conditional</>
                )}
              </span>
            </div>

            {/* Score Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Match Score</span>
                <span className={cn('font-semibold', getScoreColor(carrier.score))}>
                  {scorePercentage}%
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', getScoreBgColor(carrier.score))}
                  style={{ width: `${scorePercentage}%` }}
                />
              </div>
            </div>

            {/* Top Reason Preview */}
            {carrier.reasons.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg p-2 mb-3">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{carrier.reasons[0]}</span>
              </div>
            )}

            {/* Click to View More */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground group-hover:text-primary transition-colors pt-2 border-t">
              <Eye className="w-4 h-4" />
              <span>Click to view full details</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full view (non-compact)
  return (
    <Card className={cn('overflow-hidden transition-all', styles.border, rank === 1 && 'ring-2 ring-yellow-300')}>
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{styles.icon}</span>
            <div>
              <h4 className="font-semibold text-lg">{carrier.carrier}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  carrier.appetite_status === 'yes'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                )}>
                  {carrier.appetite_status === 'yes' ? (
                    <><CheckCircle className="w-3 h-3 mr-1" /> Strong Appetite</>
                  ) : (
                    <><AlertCircle className="w-3 h-3 mr-1" /> Conditional</>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Score */}
          <div className="text-right">
            <div className={cn('text-2xl font-bold', getScoreColor(carrier.score))}>
              {scorePercentage}%
            </div>
            <div className="text-xs text-muted-foreground">Match Score</div>
          </div>
        </div>

        {/* Score Bar */}
        <div className="px-4 pb-3">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                getScoreBgColor(carrier.score)
              )}
              style={{ width: `${scorePercentage}%` }}
            />
          </div>
        </div>

        {/* Reasons */}
        {carrier.reasons.length > 0 && (
          <div className="px-4 pb-4 space-y-2">
            {carrier.reasons.map((reason, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-emerald-600">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Caveats */}
        {carrier.caveats.length > 0 && (
          <div className="px-4 pb-4 space-y-2 border-t pt-3">
            <h5 className="text-sm font-medium text-amber-700">Considerations</h5>
            {carrier.caveats.map((caveat, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-amber-600">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{caveat}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
