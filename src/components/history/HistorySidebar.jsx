import React, { useState } from 'react';
import { History, MessageSquare, Plus, X, Calendar, MapPin, Edit3, Trash2, Check } from 'lucide-react';
import { deleteStoredConversation, updateStoredConversationTitle } from '../../services/storage';

export default function HistorySidebar({
  isOpen,
  onClose,
  conversations,
  setConversations,
  onSelectConversation,
  onNewThread,
  activeConversationId
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  if (!isOpen) return null;

  const handleStartEdit = (e, conv) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleSaveEdit = async (e, convId) => {
    e.stopPropagation();
    if (editingTitle.trim()) {
      await updateStoredConversationTitle(convId, editingTitle.trim());
      if (setConversations) {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: editingTitle.trim() } : c));
      }
    }
    setEditingId(null);
  };

  const handleDelete = async (e, convId) => {
    e.stopPropagation();
    await deleteStoredConversation(convId);
    if (setConversations) {
      setConversations(prev => prev.filter(c => c.id !== convId));
    }
  };

  return (
    <aside style={{
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: 360,
      backgroundColor: '#121215',
      backdropFilter: 'blur(20px)',
      borderRight: '1px solid #27272a',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '8px 0 32px rgba(0, 0, 0, 0.85)',
      animation: 'slide-in 200ms ease-out',
      color: '#ffffff'
    }}>
      {/* Sidebar Header */}
      <div style={{
        padding: '18px 20px',
        borderBottom: '1px solid #27272a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, color: '#ffffff', fontSize: 13.5, letterSpacing: '0.3px' }}>
          <History size={17} style={{ color: '#38bdf8' }} />
          GOAT GPT Mission History
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <X size={16} />
        </button>
      </div>

      {/* New Thread Button */}
      <div style={{ padding: '16px 20px 8px 20px' }}>
        <button
          onClick={() => {
            if (onNewThread) onNewThread();
            if (onClose) onClose();
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: '#38bdf8',
            color: '#09090b',
            fontWeight: 700,
            fontSize: 12.5,
            padding: '11px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={16} />
          Start New Mission Thread
        </button>
      </div>

      {/* Conversations List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {!conversations || conversations.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40, fontSize: 12.5 }}>
            No past GOAT mission threads stored in memory.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const isEditing = editingId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (onSelectConversation) onSelectConversation(conv.id);
                    if (onClose) onClose();
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    backgroundColor: isActive ? 'rgba(56, 189, 248, 0.12)' : '#18181b',
                    border: isActive ? '1px solid #38bdf8' : '1px solid #27272a',
                    cursor: 'pointer',
                    transition: 'all 150ms ease-out',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(e, conv.id)}
                          style={{
                            flex: 1,
                            backgroundColor: '#09090b',
                            border: '1px solid #38bdf8',
                            color: '#ffffff',
                            borderRadius: 4,
                            padding: '3px 8px',
                            fontSize: 12
                          }}
                          autoFocus
                        />
                        <button onClick={(e) => handleSaveEdit(e, conv.id)} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', padding: 2 }}>
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontWeight: 700, color: '#ffffff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <MessageSquare size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</span>
                      </div>
                    )}

                    {!isEditing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={(e) => handleStartEdit(e, conv)}
                          title="Rename thread"
                          style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: 2, display: 'flex' }}
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, conv.id)}
                          title="Delete thread"
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 2, display: 'flex' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} />
                      {conv.city || 'India'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} />
                      {conv.timestamp || 'Recent'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
