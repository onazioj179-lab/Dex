// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Collaboration Chat Panel
// Real-time messaging for project collaborators (Claude-inspired, better colors)
// =============================================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AssistedTextarea } from './AssistedTextarea';
import {
  useCollaborationStore,
  useChatMessages,
  useOnlineCollaborators,
  ChatMessage
} from '../services/CollaborationSystem';
import { Z_DROPDOWN_BASE } from '../../shared/zIndex';
import { space, radius, fontSize } from '../styles/tokens';

// ---------------------------------------------------------------------------
// STYLES (Claude-inspired with DEX colors)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    right: 0,
    top: 0,
    bottom: 0,
    width: 'min(380px, calc(100vw - 48px))',
    background: 'linear-gradient(180deg, var(--color-bg-elevated, #1a1a1c) 0%, var(--color-bg-surface, #141416) 100%)',
    borderLeft: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
    display: 'flex',
    flexDirection: 'column',
    zIndex: Z_DROPDOWN_BASE + 500,
    boxShadow: '-8px 0 40px var(--color-shadow-strong, rgba(0,0,0,0.3))',
    animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${space[4]}px ${space[5]}px`,
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
    background: 'rgba(255,255,255,0.02)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: space[3],
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary, #fff)',
    margin: 0,
  },
  onlineCount: {
    padding: `${space[1]}px ${space[2]}px`,
    fontSize: fontSize.xs,
    fontWeight: 600,
    background: 'var(--color-success-muted, rgba(48,209,88,0.15))',
    color: 'var(--color-success, #30d158)',
    borderRadius: radius.xl,
  },
  closeBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: radius.lg,
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  presenceBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px var(--space-5)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    overflowX: 'auto',
  },
  presenceAvatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--color-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fontSize.xs,
    fontWeight: 600,
    color: '#fff',
    border: '2px solid var(--color-bg-elevated, #1a1a1c)',
    position: 'relative',
    flexShrink: 0,
  },
  presenceOnline: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    background: 'var(--color-success, #30d158)',
    borderRadius: '50%',
    border: '2px solid var(--color-bg-elevated, #1a1a1c)',
  },
  messagesContainer: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `${space[4]}px 0`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  messageGroup: {
    padding: `0 ${space[5]}px`,
  },
  messageWrapper: {
    display: 'flex',
    gap: 10,
    marginBottom: space[1],
  },
  messageWrapperOwn: {
    flexDirection: 'row-reverse',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'var(--color-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fontSize.sm,
    fontWeight: 600,
    color: '#fff',
    flexShrink: 0,
    alignSelf: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: fontSize.base,
    lineHeight: 1.45,
    color: 'var(--color-text-primary)',
    background: 'var(--color-bg-hover)',
    borderBottomLeftRadius: radius.sm,
  },
  messageBubbleOwn: {
    background: 'var(--color-accent)',
    color: '#fff',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: radius.sm,
  },
  messageBubbleSystem: {
    background: 'transparent',
    color: 'var(--color-text-tertiary, #8e8e93)',
    fontSize: fontSize.sm,
    padding: `${space[2]}px 0`,
    textAlign: 'center',
    maxWidth: '100%',
    fontStyle: 'italic',
  },
  messageSender: {
    fontSize: fontSize.xs,
    fontWeight: 600,
    color: 'var(--color-text-tertiary, #8e8e93)',
    marginBottom: space[1],
    marginLeft: 2,
  },
  messageTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    marginTop: space[1],
    textAlign: 'right',
  },
  messageReactions: {
    display: 'flex',
    gap: space[1],
    marginTop: space[1],
    flexWrap: 'wrap',
  },
  reaction: {
    padding: '2px 6px',
    fontSize: fontSize.sm,
    background: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    border: 'none',
    color: '#fff',
  },
  reactionCount: {
    fontSize: 10,
    opacity: 0.7,
  },
  typingIndicator: {
    padding: `${space[2]}px ${space[5]}px`,
    fontSize: fontSize.sm,
    color: 'var(--color-text-tertiary, #8e8e93)',
    fontStyle: 'italic',
  },
  inputContainer: {
    padding: `${space[3]}px ${space[4]}px ${space[4]}px`,
    borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
    background: 'rgba(255,255,255,0.02)',
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: space[2],
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: '6px 6px 6px var(--space-4)',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  inputWrapperFocused: {
    borderColor: 'color-mix(in srgb, var(--color-text-primary) 30%, transparent)',
    boxShadow: 'none',
  },
  textarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text-primary, #fff)',
    fontSize: fontSize.base,
    lineHeight: 1.4,
    resize: 'none',
    maxHeight: 100,
    padding: '6px 0',
    fontFamily: 'inherit',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'var(--color-accent-fill)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    background: 'rgba(255,255,255,0.1)',
    cursor: 'not-allowed',
  },
  emojiBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: '50%',
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  dateDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: space[3],
    padding: `${space[3]}px ${space[5]}px`,
  },
  dateDividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--color-border-subtle, rgba(255,255,255,0.06))',
  },
  dateDividerText: {
    fontSize: fontSize.xs,
    color: 'var(--color-text-tertiary, #636366)',
    fontWeight: 500,
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[10],
    textAlign: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[4],
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary, #fff)',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: 'var(--color-text-tertiary, #8e8e93)',
    lineHeight: 1.5,
  },
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const QUICK_REACTIONS = ['Like', 'Love', 'Done', 'Hot', 'Seen', '100'];

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  projectId: string;
  onClose: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ projectId, onClose }) => {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const messages = useChatMessages(projectId);
  const onlineUsers = useOnlineCollaborators();
  const { currentUser, sendMessage, addReaction, typingUsers, setUserTyping } = useCollaborationStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [message]);

  // Typing indicator
  useEffect(() => {
    if (message.length > 0 && currentUser) {
      setUserTyping(currentUser.id, true);
      const timeout = setTimeout(() => setUserTyping(currentUser.id, false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [message, currentUser, setUserTyping]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !currentUser || isSending) return;
    
    setIsSending(true);
    setSendError(null);
    
    try {
      await sendMessage(projectId, message.trim());
      setMessage('');
      textareaRef.current?.focus();
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to send message';
      setSendError(errorMsg);
      // Auto-dismiss error after 5 seconds
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setIsSending(false);
    }
  }, [message, projectId, currentUser, sendMessage, isSending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') onClose();
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = '';
    
    messages.forEach(msg => {
      const date = formatDate(msg.timestamp);
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    
    return groups;
  }, [messages]);

  const typingNames = useMemo(() => {
    return Array.from(typingUsers)
      .filter(id => id !== currentUser?.id)
      .map(id => onlineUsers.find(u => u.id === id)?.name || 'Someone')
      .slice(0, 3);
  }, [typingUsers, currentUser, onlineUsers]);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h3 style={styles.headerTitle}>Team Chat</h3>
          {onlineUsers.length > 0 && (
            <span style={styles.onlineCount}>{onlineUsers.length} online</span>
          )}
        </div>
        <button
          style={styles.closeBtn}
          onClick={onClose}
          aria-label="Close chat"
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Online Users Bar */}
      {onlineUsers.length > 0 && (
        <div style={styles.presenceBar}>
          {onlineUsers.map(user => (
            <div
              key={user.id}
              style={{
                ...styles.presenceAvatar,
                background: user.cursor?.color || 'var(--color-accent)',
              }}
              title={user.name}
            >
              {user.name[0].toUpperCase()}
              <div style={styles.presenceOnline} />
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary, #8e8e93)" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div style={styles.emptyTitle}>Start the conversation</div>
            <div style={styles.emptyDesc}>
              Messages with your collaborators will appear here
            </div>
          </div>
        ) : (
          groupedMessages.map((group, gi) => (
            <div key={gi}>
              {/* Date Divider */}
              <div style={styles.dateDivider}>
                <div style={styles.dateDividerLine} />
                <span style={styles.dateDividerText}>{group.date}</span>
                <div style={styles.dateDividerLine} />
              </div>

              {/* Messages */}
              <div style={styles.messageGroup}>
                {group.messages.map((msg, mi) => {
                  const isOwn = msg.senderId === currentUser?.id;
                  const isSystem = msg.type === 'system';
                  const showAvatar = mi === 0 || group.messages[mi - 1]?.senderId !== msg.senderId;
                  
                  if (isSystem) {
                    return (
                      <div key={msg.id} style={styles.messageBubbleSystem}>
                        {msg.content}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      style={{
                        ...styles.messageWrapper,
                        ...(isOwn ? styles.messageWrapperOwn : {}),
                      }}
                    >
                      {showAvatar && !isOwn && (
                        <div
                          style={styles.messageAvatar}
                          title={msg.senderName}
                        >
                          {msg.senderName[0].toUpperCase()}
                        </div>
                      )}
                      {!showAvatar && !isOwn && <div style={{ width: 32 }} />}
                      
                      <div style={{ maxWidth: '75%' }}>
                        {showAvatar && !isOwn && (
                          <div style={styles.messageSender}>{msg.senderName}</div>
                        )}
                        <div
                          style={{
                            ...styles.messageBubble,
                            ...(isOwn ? styles.messageBubbleOwn : {}),
                          }}
                          onDoubleClick={() => setShowReactions(showReactions === msg.id ? null : msg.id)}
                        >
                          {msg.content}
                        </div>
                        
                        {/* Reactions */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div style={styles.messageReactions}>
                            {Object.entries(msg.reactions).map(([emoji, users]) => (
                              users.length > 0 && (
                                <button
                                  key={emoji}
                                  style={styles.reaction}
                                  onClick={() => addReaction(projectId, msg.id, emoji)}
                                >
                                  {emoji}
                                  <span style={styles.reactionCount}>{users.length}</span>
                                </button>
                              )
                            ))}
                          </div>
                        )}

                        {/* Quick Reactions Popup */}
                        {showReactions === msg.id && (
                          <div style={{
                            display: 'flex',
                            gap: space[1],
                            marginTop: space[1],
                            padding: '4px 6px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: 10,
                            width: 'fit-content',
                          }}>
                            {QUICK_REACTIONS.map(emoji => (
                              <button
                                key={emoji}
                                style={{ ...styles.reaction, background: 'transparent' }}
                                onClick={() => {
                                  addReaction(projectId, msg.id, emoji);
                                  setShowReactions(null);
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        
                        <div style={styles.messageTime}>{formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        
        {/* Typing Indicator */}
        {typingNames.length > 0 && (
          <div style={styles.typingIndicator}>
            {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputContainer}>
        {/* Send Error */}
        {sendError && (
          <div style={{
            padding: `${space[2]}px ${space[3]}px`,
            marginBottom: space[2],
            background: 'var(--color-error-muted, rgba(255,69,58,0.15))',
            borderRadius: radius.lg,
            color: 'var(--color-error, #ff453a)',
            fontSize: fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{sendError}</span>
            <button
              onClick={() => setSendError(null)}
              style={{ background: 'none', border: 'none', color: 'var(--color-error, #ff453a)', cursor: 'pointer', padding: 2 }}
              aria-label="Dismiss"
            >
              x
            </button>
          </div>
        )}
        <div style={{
          ...styles.inputWrapper,
          ...(isFocused ? styles.inputWrapperFocused : {}),
        }}>
          <AssistedTextarea
            ref={textareaRef}
            style={styles.textarea}
            placeholder="Message your team..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            rows={1}
            disabled={isSending}
          />
          <button
            style={{
              ...styles.sendBtn,
              ...(message.trim() && !isSending ? {} : styles.sendBtnDisabled),
            }}
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            aria-label="Send message"
          >
            {isSending ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ChatPanel;
