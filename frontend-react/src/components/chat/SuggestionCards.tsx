import { Home, Car, Umbrella, ArrowRight } from 'lucide-react'
import { QuickAction } from '@/types'

const suggestions: QuickAction[] = [
  {
    id: '1',
    title: 'Home Insurance',
    description: 'TX, $400k coverage',
    icon: 'home',
    query: 'I need Home insurance in TX with coverage of $400,000',
    color: '',
  },
  {
    id: '2',
    title: 'Auto Insurance',
    description: 'CA, standard driver',
    icon: 'car',
    query: 'I need Auto insurance in CA for a standard driver',
    color: '',
  },
  {
    id: '3',
    title: 'Umbrella Policy',
    description: 'FL, $1M coverage',
    icon: 'umbrella',
    query: 'I need Umbrella insurance in FL with coverage of $1,000,000',
    color: '',
  },
]

const IconComponent = ({ icon }: { icon: string }) => {
  const iconClass = "w-5 h-5 text-gray-600"
  switch (icon) {
    case 'home':
      return <Home className={iconClass} />
    case 'car':
      return <Car className={iconClass} />
    case 'umbrella':
      return <Umbrella className={iconClass} />
    default:
      return <Home className={iconClass} />
  }
}

interface SuggestionCardsProps {
  onSelect: (query: string) => void
}

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 max-w-2xl mx-auto w-full px-2 sm:px-0">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          className="group flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all text-left"
          onClick={() => onSelect(suggestion.query)}
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200 transition-colors">
            <IconComponent icon={suggestion.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">
              {suggestion.title}
            </div>
            <div className="text-xs text-gray-500">
              {suggestion.description}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      ))}
    </div>
  )
}
