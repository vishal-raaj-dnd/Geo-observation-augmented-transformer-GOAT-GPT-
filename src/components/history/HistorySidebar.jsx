import React from 'react';
import { History, MessageSquare, Plus, X, Calendar, MapPin } from 'lucide-react';

export default function HistorySidebar({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
  onNewThread,
  activeConversationId
}) {
  if (!isOpen) return null;

  return (
    <aside style={{
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: 360,
      backgroundColor: 'rgba(18, 18, 21, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRight: '1px solid rgba(59, 130, 246, 0.35)',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '8px 0 32px rgba(0, 0, 0, 0.7)',
      animation: 'slide-in 200ms ease-out'
    }}>
      {/* Sidebar Header */}
      <div style={{
        padding: '18px 20px',
        borderBottom: '1px solid #27272a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#ffffff', fontSize: 14 }}>
          <History size={18} style={{ color: '#60a5fa' }} />
          Mission Log & Past Analysis Threads
        </div>
        <button onClick={onClose} className="btn-secondary" style={{ padding: 6, borderRadius: 6, cursor: 'pointer' }}>
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
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center', backgroundColor: '#3b82f6', color: '#ffffff', fontWeight: 700, padding: '12px 16px' }}
        >
          <Plus size={16} />
          Start New Mission Thread
        </button>
      </div>

      {/* Conversations List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {conversations.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
            No past mission threads stored in memory.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (onSelectConversation) onSelectConversation(conv.id);
                    if (onClose) onClose();
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isActive ? 'rgba(59, 130, 246, 0.2)' : 'rgba(9, 9, 11, 0.6)',
                    border: '1px solid',
                    borderColor: isActive ? '#3b82f6' : '#27272a',
                    cursor: 'pointer',
                    transition: 'all 150ms ease-out'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <MessageSquare size={14} style={{ color: '#60a5fa' }} />
                    {conv.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} />
                      {conv.city || 'India'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={12} />
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
