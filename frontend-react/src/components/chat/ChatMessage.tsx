import { User, Bot, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Message, DetailedRecommendation } from '@/types'
import { RecommendationCard } from './RecommendationCard'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessageProps {
  message: Message
  onSelectCarrier?: (carrier: DetailedRecommendation) => void
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-2">
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

function RecommendationSkeletons() {
  return (
    <div className="mt-3 sm:mt-4">
      <div className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3">
        Analyzing eligible carriers and building recommendations...
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start gap-3 sm:gap-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="border border-gray-200 rounded-lg bg-white overflow-hidden animate-pulse">
            <div className="p-3 sm:p-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-6 w-24 bg-gray-200 rounded" />
              </div>
              <div className="h-7 w-40 bg-gray-200 rounded mb-3" />
              <div className="h-2 w-full bg-gray-200 rounded" />
            </div>
            <div className="p-3 sm:p-4 space-y-3">
              <div className="h-4 w-full bg-gray-200 rounded" />
              <div className="h-4 w-4/5 bg-gray-200 rounded" />
              <div className="h-px bg-gray-100" />
              <div className="h-4 w-1/2 bg-gray-200 rounded" />
            </div>
            <div className="p-3 sm:p-4 border-t border-gray-100 bg-gray-50">
              <div className="h-10 w-full bg-gray-200 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExcludedCarriersList({ excluded }: { excluded?: Array<{ carrier: string; reason: string }> }) {
  const [expanded, setExpanded] = useState(false)

  if (!excluded || excluded.length === 0) return null

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {excluded.length} carriers excluded
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {excluded.map((item, idx) => (
            <div key={idx} className="text-sm">
              <span className="font-medium text-gray-700">{item.carrier}:</span>
              <span className="text-gray-500 ml-1">{item.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatMessage({ message, onSelectCarrier }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null)

  // Safely check for analysis data and recommendations
  const analysisData = message.analysisData
  const recommendations = analysisData?.recommendations
  const hasAnalysisData = Array.isArray(recommendations) && recommendations.length > 0

  const handleSelectRecommendation = (rec: DetailedRecommendation) => {
    if (selectedCarrier) return
    setSelectedCarrier(rec.carrier)
    onSelectCarrier?.(rec)
  }

  return (
    <div className={cn(
      'py-4 sm:py-6 border-b border-gray-100 last:border-0',
      isUser ? 'bg-white' : 'bg-gray-50'
    )}>
      <div className="max-w-4xl mx-auto px-3 sm:px-4">
        <div className="flex gap-3 sm:gap-4">
          {/* Avatar */}
          <div className={cn(
            'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
            isUser ? 'bg-gray-200' : 'bg-gray-900'
          )}>
            {isUser ? (
              <User className="w-4 h-4 text-gray-600" />
            ) : (
              <Bot className="w-4 h-4 text-white" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-gray-900 mb-2">
              {isUser ? 'You' : 'Insurance AI'}
            </div>

            {message.isLoading ? (
              <div>
                <TypingIndicator />
                {!isUser && <RecommendationSkeletons />}
              </div>
            ) : (
              <div>
                {/* Summary Text */}
                {message.content && (
                  <div className="prose prose-gray prose-sm max-w-none mb-4 prose-ul:list-disc prose-ol:list-decimal prose-li:marker:text-gray-500">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => (
                          <p className="text-gray-700 mb-3 leading-relaxed">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-gray-900">{children}</strong>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-6 mb-3">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mt-5 mb-2 pb-2 border-b border-gray-200">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mt-4 mb-2">{children}</h3>
                        ),
                        h4: ({ children }) => (
                          <h4 className="text-sm sm:text-base font-semibold text-gray-900 mt-3 mb-1">{children}</h4>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc ml-4 pl-2 space-y-1.5 mb-3 text-gray-700">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal ml-4 pl-2 space-y-1.5 mb-3 text-gray-700">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-gray-700 leading-relaxed [&>ul]:mt-1.5 [&>ol]:mt-1.5">{children}</li>
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4 rounded-lg border border-gray-200">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => (
                          <thead className="bg-gray-50">{children}</thead>
                        ),
                        tbody: ({ children }) => (
                          <tbody className="bg-white divide-y divide-gray-200">{children}</tbody>
                        ),
                        tr: ({ children }) => (
                          <tr className="hover:bg-gray-50">{children}</tr>
                        ),
                        th: ({ children }) => (
                          <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">{children}</th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3 sm:px-4 py-2 sm:py-3 text-gray-700 align-top">{children}</td>
                        ),
                        code: ({ children, className }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                          ) : (
                            <code className="block bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-sm font-mono">{children}</code>
                          );
                        },
                        pre: ({ children }) => (
                          <pre className="bg-gray-900 text-gray-100 p-3 sm:p-4 rounded-lg overflow-x-auto my-3 text-sm">{children}</pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-gray-300 pl-4 py-1 my-3 text-gray-600 italic">{children}</blockquote>
                        ),
                        hr: () => (
                          <hr className="my-4 border-gray-200" />
                        ),
                        a: ({ children, href }) => (
                          <a href={href} className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">{children}</a>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}

                {/* Recommendation Cards - Responsive Grid */}
                {hasAnalysisData && (
                  <div className="mt-3 sm:mt-4">
                    <div className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3">
                      Found {analysisData?.totalCandidates || recommendations.length} eligible carriers. Select a recommendation to continue:
                    </div>

                    {/* Responsive Grid - 1 column on mobile, 2 on tablet, 3 on desktop */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-start gap-3 sm:gap-4">
                      {recommendations.map((rec, idx) => (
                        <div key={rec?.rank || idx}>
                          <RecommendationCard
                            recommendation={rec}
                            onSelect={() => handleSelectRecommendation(rec)}
                            isSelected={selectedCarrier === rec.carrier}
                            isSelectionLocked={selectedCarrier !== null}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Market Insights */}
                    {analysisData?.marketInsights && (
                      <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-white border border-gray-200 rounded-lg">
                        <h4 className="text-xs sm:text-sm font-medium text-gray-900 mb-1 sm:mb-2">Market Insights</h4>
                        <p className="text-xs sm:text-sm text-gray-600">{analysisData.marketInsights}</p>
                      </div>
                    )}

                    {/* Excluded Carriers */}
                    <ExcludedCarriersList excluded={analysisData?.excluded} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
