import { useState, useRef, useEffect } from 'react';
import { Settings2, MessageSquare, LogOut, Menu, Database, FileDown } from 'lucide-react';
import { exportChatToPDF } from '@/services/pdfExport';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SuggestionCards } from './SuggestionCards';
import { ChatSidebar } from './ChatSidebar';
import { Message, DataStats, AnalysisData, DetailedRecommendation } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserChats,
  getChat,
  createChat,
  addMessageToChat,
  updateChatTitle,
  deleteChat,
  generateTitle
} from '@/services/chatService';
import { chat as aiChat, initializeAgent, getDataStats } from '@/services/aiAgent';
import { generateId } from '@/lib/utils';

interface ChatItem {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
}

// Parse JSON from response text
function parseAnalysisData(responseText: string): { summary: string; analysisData: AnalysisData | null } {
  try {
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1];
      const analysisData = JSON.parse(jsonStr) as AnalysisData;
      const summary = responseText.substring(0, responseText.indexOf('```json')).trim();
      return { summary, analysisData };
    }
  } catch (e) {
    console.error('Failed to parse analysis data:', e);
  }
  return { summary: responseText, analysisData: null };
}

export function ChatInterface() {
  const { user, logout } = useAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<DataStats | null>(null);
  const [agentReady, setAgentReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initAgent();
  }, []);

  useEffect(() => {
    if (user) {
      loadChats();
    }
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const initAgent = async () => {
    try {
      await initializeAgent();
      const dataStats = getDataStats();
      setStats({
        carriers: dataStats.totalCarriers,
        lobs: dataStats.totalLobs,
        records: dataStats.totalRecords,
        rules: dataStats.totalRules,
        loadedFromDB: dataStats.loadedFromDB
      });
      setAgentReady(true);
    } catch (error) {
      console.error('Failed to initialize agent:', error);
      setStats({ carriers: 177, lobs: 459, records: 13637, rules: 855, loadedFromDB: false });
      setAgentReady(true);
    }
  };

  const loadChats = async () => {
    if (!user) return;
    try {
      const chatList = await getUserChats(user.id);
      setChats(chatList.map(c => ({
        id: c.id,
        title: c.title || 'New Chat',
        lastMessage: c.lastMessage || '',
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : new Date().toISOString()
      })));
    } catch (error) {
      console.error('Failed to load chats:', error);
      setChats([]);
    }
  };

  const loadChat = async (chatId: string) => {
    if (!user) return;
    try {
      const chatData = await getChat(chatId, user.id);
      if (chatData) {
        setActiveChatId(chatId);
        setMessages(chatData.messages.map((m) => ({
          id: generateId(),
          role: m.role,
          content: m.role === 'assistant' && m.analysisData
            ? (m.content.indexOf('```json') > -1 ? m.content.substring(0, m.content.indexOf('```json')).trim() : m.content)
            : m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(),
          analysisData: m.analysisData,
        })));
      }
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  };

  const handleNewChat = async () => {
    if (!user) return;
    try {
      const newChat = await createChat(user.id);
      setChats(prev => [{
        id: newChat.id,
        title: newChat.title,
        lastMessage: '',
        updatedAt: new Date().toISOString()
      }, ...prev]);
      setActiveChatId(newChat.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await deleteChat(chatId);
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const handleSelectCarrier = (carrier: DetailedRecommendation) => {
    const selectionMessage = `I'd like to proceed with **${carrier.carrier}** (${carrier.matchScore}% match). Please provide more details about this carrier and next steps for placement.`;
    sendMessage(selectionMessage);
  };

  const sendMessage = async (content: string) => {
    if (!user) return;
    setError(null);

    // Create new chat if none active
    let chatId = activeChatId;
    if (!chatId) {
      try {
        const newChat = await createChat(user.id);
        chatId = newChat.id;
        setActiveChatId(chatId);
        setChats(prev => [{
          id: newChat.id,
          title: newChat.title,
          lastMessage: '',
          updatedAt: new Date().toISOString()
        }, ...prev]);
      } catch (error) {
        console.error('Failed to create chat:', error);
        setError('Failed to create chat. Please try again.');
        return;
      }
    }

    // Add user message to UI
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Save user message to Firestore (don't block on this)
    try {
      await addMessageToChat(chatId, {
        role: 'user',
        content,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to save user message:', error);
    }

    // Update chat title if this is the first message
    if (messages.length === 0) {
      const newTitle = generateTitle(content);
      try {
        await updateChatTitle(chatId, newTitle);
        setChats(prev => prev.map(c =>
          c.id === chatId ? { ...c, title: newTitle, lastMessage: content } : c
        ));
      } catch (error) {
        console.error('Failed to update chat title:', error);
      }
    }

    // Add loading message
    const loadingMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    setMessages(prev => [...prev, loadingMessage]);
    setIsLoading(true);

    try {
      // Get chat history for context
      const history = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

      // Call AI agent
      const result = await aiChat(content, history);

      const { summary, analysisData } = parseAnalysisData(result.response);

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: summary,
        timestamp: new Date(),
        analysisData: analysisData || undefined,
      };

      // Save assistant message to Firestore (don't block on this)
      try {
        await addMessageToChat(chatId, {
          role: 'assistant',
          content: result.response,
          analysisData: analysisData,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Failed to save assistant message:', error);
      }

      setMessages(prev => prev.slice(0, -1).concat(assistantMessage));
    } catch (error: any) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => prev.slice(0, -1).concat(errorMessage));
    } finally {
      setIsLoading(false);
    }
  };

  const hasMessages = messages.length > 0;

  const handleExportPDF = async () => {
    if (messages.length === 0) return;
    try {
      await exportChatToPDF(messages, {
        title: chats.find(c => c.id === activeChatId)?.title || 'Insurance Chat',
        includeTimestamps: true
      });
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={loadChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-gray-200">
          <div className="px-3 sm:px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-medium text-gray-900 text-sm sm:text-base truncate">Insurance Placement AI</h1>
                {stats && (
                  <p className="text-xs text-gray-500 truncate">
                    {stats.carriers} carriers · {stats.records.toLocaleString()} records
                    {!agentReady && ' · Loading data...'}
                    {agentReady && stats.loadedFromDB && ' · DB'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {user && (
                <span className="text-sm text-gray-600 mr-1 sm:mr-2 hidden sm:inline">{user.name}</span>
              )}
              {hasMessages && (
                <button
                  onClick={handleExportPDF}
                  className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
                  title="Export to PDF"
                >
                  <FileDown className="w-4 h-4" />
                </button>
              )}
              <a
                href="#/admin"
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 hidden sm:flex"
                title="Database Admin"
              >
                <Database className="w-4 h-4" />
              </a>
              <button
                onClick={logout}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <button className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 hidden sm:flex">
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          {!hasMessages ? (
            <div className="h-full flex flex-col items-center justify-center p-4 sm:p-6">
              <div className="text-center mb-6 sm:mb-8 max-w-xl px-2">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gray-900 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
                  Insurance Carrier Analysis
                </h2>
                <p className="text-sm sm:text-base text-gray-600">
                  Get detailed carrier recommendations based on state, line of business,
                  and coverage requirements.
                </p>
              </div>
              <SuggestionCards onSelect={sendMessage} />
            </div>
          ) : (
            <ScrollArea className="h-full" ref={scrollRef}>
              <div className="pb-4">
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onSelectCarrier={handleSelectCarrier}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Input */}
        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}
