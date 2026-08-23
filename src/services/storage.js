/**
 * DRISHTI Storage Persistence Service
 * Hybrid LocalStorage + PocketBase Real-time Synchronization
 */

const POCKETBASE_URL = 'http://127.0.0.1:8090';

const STORAGE_KEYS = {
  CONVERSATIONS: 'drishti_conversations',
  MESSAGES: 'drishti_messages_'
};

export const getStoredConversations = async () => {
  // Try fetching from PocketBase first
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/conversations/records?sort=-created`);
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return data.items.map(item => ({
          id: item.id,
          title: item.title,
          state: item.state,
          city: item.city,
          timestamp: item.created ? new Date(item.created).toLocaleDateString('en-GB') : 'Recent',
          created_at: item.created
        }));
      }
    }
  } catch (err) {
    // PocketBase offline fallback
  }

  // LocalStorage Fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    return raw ? JSON.parse(raw) : [
      {
        id: 'conv_default',
        title: 'Flood Analysis - Bhagalpur, Bihar',
        state: 'Bihar',
        city: 'Bhagalpur',
        created_at: new Date().toISOString()
      }
    ];
  } catch (err) {
    return [];
  }
};

export const saveStoredConversation = async (conv) => {
  let isNew = false;

  // Local save
  try {
    const conversations = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONVERSATIONS) || '[]');
    const existingIdx = conversations.findIndex(c => c.id === conv.id);
    if (existingIdx >= 0) {
      conversations[existingIdx] = { ...conversations[existingIdx], ...conv };
    } else {
      conversations.unshift(conv);
      isNew = true;
    }
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
  } catch (err) {}

  // Sync only NEW conversations with PocketBase (prevents duplicate records)
  if (!isNew) return;

  try {
    await fetch(`${POCKETBASE_URL}/api/collections/conversations/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: conv.title,
        state: conv.state,
        city: conv.city
      })
    });
  } catch (err) {}
};

export const getStoredMessages = async (conversationId) => {
  // Try PocketBase
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/messages/records?filter=${encodeURIComponent(`conversation_id="${conversationId}"`)}&sort=created`);
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return data.items.map(m => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          deliverables: m.deliverables ? JSON.parse(m.deliverables) : {}
        }));
      }
    }
  } catch (err) {}

  // LocalStorage Fallback
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.MESSAGES}${conversationId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
};

export const saveStoredMessage = async (conversationId, message) => {
  // Local save
  try {
    const messages = JSON.parse(localStorage.getItem(`${STORAGE_KEYS.MESSAGES}${conversationId}`) || '[]');
    messages.push(message);
    localStorage.setItem(`${STORAGE_KEYS.MESSAGES}${conversationId}`, JSON.stringify(messages));
  } catch (err) {}

  // Sync with PocketBase
  try {
    await fetch(`${POCKETBASE_URL}/api/collections/messages/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender: message.sender,
        text: message.text,
        deliverables: JSON.stringify(message.deliverables || {})
      })
    });
  } catch (err) {}
};
