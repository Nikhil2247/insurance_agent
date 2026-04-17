import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  arrayUnion,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  analysisData?: any;
  timestamp: Date;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatListItem {
  id: string;
  title: string;
  messageCount: number;
  lastMessage: string;
  createdAt: Date;
  updatedAt: Date;
}

// Get all chats for a user
export async function getUserChats(userId: string): Promise<ChatListItem[]> {
  try {
    const chatsRef = collection(db, 'chats');
    // Simple query without orderBy to avoid index requirement
    const q = query(chatsRef, where('userId', '==', userId));

    const snapshot = await getDocs(q);

    const chats = snapshot.docs.map(doc => {
      const data = doc.data();
      const messages = data.messages || [];
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

      return {
        id: doc.id,
        title: data.title || 'New Chat',
        messageCount: messages.length,
        lastMessage: lastMsg ? String(lastMsg.content || '').substring(0, 100) : '',
        createdAt: data.createdAt?.toDate?.() || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || new Date()
      };
    });

    // Sort client-side by updatedAt descending
    chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return chats;
  } catch (error) {
    console.error('Error getting user chats:', error);
    return [];
  }
}

// Get single chat with all messages
export async function getChat(chatId: string, userId: string): Promise<Chat | null> {
  try {
    const chatDoc = await getDoc(doc(db, 'chats', chatId));

    if (!chatDoc.exists()) return null;

    const data = chatDoc.data();

    // Verify ownership
    if (data.userId !== userId) return null;

    return {
      id: chatDoc.id,
      userId: data.userId,
      title: data.title || 'New Chat',
      messages: (data.messages || []).map((m: any) => ({
        ...m,
        timestamp: m.timestamp?.toDate?.() || new Date()
      })),
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date()
    };
  } catch (error) {
    console.error('Error getting chat:', error);
    return null;
  }
}

// Create new chat
export async function createChat(userId: string): Promise<Chat> {
  const now = new Date();
  const chatData = {
    userId,
    title: 'New Chat',
    messages: [],
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now)
  };

  const docRef = await addDoc(collection(db, 'chats'), chatData);

  return {
    id: docRef.id,
    userId,
    title: 'New Chat',
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

// Add message to chat
export async function addMessageToChat(
  chatId: string,
  message: Omit<ChatMessage, 'id'>
): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', chatId);

    await updateDoc(chatRef, {
      messages: arrayUnion({
        role: message.role,
        content: message.content,
        analysisData: message.analysisData || null,
        timestamp: Timestamp.fromDate(message.timestamp)
      }),
      updatedAt: Timestamp.fromDate(new Date())
    });
  } catch (error) {
    console.error('Error adding message to chat:', error);
    throw error;
  }
}

// Update chat title
export async function updateChatTitle(chatId: string, title: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', chatId);
    await updateDoc(chatRef, {
      title,
      updatedAt: Timestamp.fromDate(new Date())
    });
  } catch (error) {
    console.error('Error updating chat title:', error);
  }
}

// Generate title from first message
export function generateTitle(message: string): string {
  // Take first 50 chars or first sentence
  const cleaned = message.trim();
  const firstSentence = cleaned.split(/[.!?]/)[0];
  const title = firstSentence.length > 50
    ? firstSentence.substring(0, 47) + '...'
    : firstSentence;
  return title || 'New Chat';
}

// Delete chat
export async function deleteChat(chatId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'chats', chatId));
  } catch (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
}
