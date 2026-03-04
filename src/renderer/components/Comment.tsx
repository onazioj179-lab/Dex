/**
 * DEX Comment & Discussion Components
 * Collaborative commenting system
 */

import React, { useState, useCallback } from 'react';

// ==================== TYPES ====================

interface User {
  id: string;
  name: string;
  avatar?: string;
}

interface Reaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted?: boolean;
}

interface Comment {
  id: string;
  author: User;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  reactions?: Reaction[];
  replies?: Comment[];
  isEdited?: boolean;
  isPinned?: boolean;
  mentions?: string[];
}

interface CommentBoxProps {
  onSubmit: (content: string, mentions?: string[]) => void;
  placeholder?: string;
  avatar?: string;
  maxLength?: number;
  mentionUsers?: User[];
  replyTo?: Comment | null;
  onCancelReply?: () => void;
}

interface CommentItemProps {
  comment: Comment;
  currentUserId?: string;
  onReply?: (comment: Comment) => void;
  onEdit?: (commentId: string, newContent: string) => void;
  onDelete?: (commentId: string) => void;
  onReact?: (commentId: string, emoji: string) => void;
  onPin?: (commentId: string) => void;
  depth?: number;
  maxDepth?: number;
}

interface CommentListProps {
  comments: Comment[];
  currentUserId?: string;
  onReply?: (comment: Comment) => void;
  onEdit?: (commentId: string, newContent: string) => void;
  onDelete?: (commentId: string) => void;
  onReact?: (commentId: string, emoji: string) => void;
  onPin?: (commentId: string) => void;
  sortBy?: 'newest' | 'oldest' | 'popular';
  emptyMessage?: string;
}

// ==================== COMMENT BOX ====================

export const CommentBox: React.FC<CommentBoxProps> = ({
  onSubmit,
  placeholder = 'Write a comment...',
  avatar,
  maxLength = 2000,
  mentionUsers = [],
  replyTo,
  onCancelReply,
}) => {
  const [content, setContent] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);

  const handleSubmit = () => {
    if (!content.trim()) return;
    onSubmit(content, mentions);
    setContent('');
    setMentions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === '@') {
      setShowMentions(true);
      setMentionSearch('');
    }
    if (e.key === ' ' || e.key === 'Escape') {
      setShowMentions(false);
    }
  };

  const handleMention = (user: User) => {
    const lastAtIndex = content.lastIndexOf('@');
    const before = content.slice(0, lastAtIndex);
    setContent(`${before}@${user.name} `);
    setMentions([...mentions, user.id]);
    setShowMentions(false);
  };

  const filteredUsers = mentionUsers.filter((u) =>
    u.name.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const styles: Record<string, React.CSSProperties> = {
    container: {
      background: 'var(--color-bg-secondary)',
      borderRadius: 8,
      padding: 12,
    },
    replyBanner: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      marginBottom: 12,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 4,
      fontSize: 13,
    },
    inputArea: {
      display: 'flex',
      gap: 12,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: 14,
      fontWeight: 600,
      flexShrink: 0,
    },
    inputWrapper: {
      flex: 1,
      position: 'relative',
    },
    textarea: {
      width: '100%',
      minHeight: 80,
      padding: 12,
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      resize: 'vertical',
      fontFamily: 'inherit',
      fontSize: 14,
      lineHeight: 1.5,
    },
    footer: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    charCount: {
      fontSize: 12,
      color: content.length > maxLength * 0.9
        ? 'var(--color-warning)'
        : 'var(--color-text-muted)',
    },
    submitBtn: {
      padding: '8px 16px',
      border: 'none',
      borderRadius: 4,
      background: 'var(--color-accent)',
      color: 'white',
      cursor: content.trim() ? 'pointer' : 'not-allowed',
      opacity: content.trim() ? 1 : 0.5,
      fontSize: 13,
      fontWeight: 500,
    },
    mentions: {
      position: 'absolute',
      bottom: '100%',
      left: 0,
      marginBottom: 4,
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      maxHeight: 200,
      overflow: 'auto',
      zIndex: 100,
    },
    mentionItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      cursor: 'pointer',
      fontSize: 13,
    },
  };

  return (
    <div style={styles.container}>
      {replyTo && (
        <div style={styles.replyBanner}>
          <span>
            Replying to <strong>{replyTo.author.name}</strong>
          </span>
          <button
            onClick={onCancelReply}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
            }}
          >
            ×
          </button>
        </div>
      )}
      <div style={styles.inputArea}>
        <div style={styles.avatar}>
          {avatar ? (
            <img src={avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          ) : (
            'user'
          )}
        </div>
        <div style={styles.inputWrapper as any}>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              const lastWord = e.target.value.split(' ').pop() || '';
              if (lastWord.startsWith('@')) {
                setMentionSearch(lastWord.slice(1));
                setShowMentions(true);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            style={styles.textarea}
          />
          {showMentions && filteredUsers.length > 0 && (
            <div style={styles.mentions as any}>
              {filteredUsers.slice(0, 5).map((user) => (
                <div
                  key={user.id}
                  style={styles.mentionItem}
                  onClick={() => handleMention(user)}
                >
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 11,
                  }}>
                    {user.avatar ? (
                      <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                    ) : (
                      user.name[0].toUpperCase()
                    )}
                  </span>
                  {user.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={styles.footer}>
        <span style={styles.charCount}>
          {content.length}/{maxLength}
        </span>
        <button
          style={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          {replyTo ? 'Reply' : 'Comment'}
        </button>
      </div>
    </div>
  );
};

// ==================== COMMENT ITEM ====================

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  depth = 0,
  maxDepth = 3,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showActions, setShowActions] = useState(false);

  const isOwner = currentUserId === comment.author.id;

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== comment.content) {
      onEdit?.(comment.id, editContent);
    }
    setIsEditing(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 12,
      padding: '12px 0',
      marginLeft: depth * 32,
      borderLeft: depth > 0 ? '2px solid var(--color-border)' : undefined,
      paddingLeft: depth > 0 ? 16 : 0,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: 14,
      fontWeight: 600,
      flexShrink: 0,
    },
    body: {
      flex: 1,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    name: {
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--color-text)',
    },
    time: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    badge: {
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 10,
      background: 'var(--color-accent)',
      color: 'white',
    },
    content: {
      fontSize: 14,
      lineHeight: 1.6,
      color: 'var(--color-text)',
      marginBottom: 8,
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      fontSize: 13,
    },
    actionBtn: {
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      padding: 0,
      fontSize: 13,
    },
    reactions: {
      display: 'flex',
      gap: 8,
      marginTop: 8,
    },
    reaction: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      borderRadius: 12,
      border: '1px solid var(--color-border)',
      background: 'var(--color-bg)',
      cursor: 'pointer',
      fontSize: 12,
    },
    editArea: {
      marginTop: 8,
    },
    editTextarea: {
      width: '100%',
      minHeight: 60,
      padding: 8,
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      resize: 'vertical',
      fontFamily: 'inherit',
      fontSize: 14,
    },
    editActions: {
      display: 'flex',
      gap: 8,
      marginTop: 8,
    },
  };

  const commonReactions = ['thumbs-up', 'heart', '', 'party', '', ''];

  return (
    <div
      style={styles.container}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div style={styles.avatar}>
        {comment.author.avatar ? (
          <img
            src={comment.author.avatar}
            alt=""
            style={{ width: '100%', height: '100%', borderRadius: '50%' }}
          />
        ) : (
          comment.author.name[0].toUpperCase()
        )}
      </div>
      <div style={styles.body}>
        <div style={styles.header}>
          <span style={styles.name}>{comment.author.name}</span>
          <span style={styles.time}>{formatDate(comment.createdAt)}</span>
          {comment.isEdited && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>(edited)</span>
          )}
          {comment.isPinned && <span style={styles.badge}>Pinned</span>}
        </div>

        {isEditing ? (
          <div style={styles.editArea}>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              style={styles.editTextarea}
              autoFocus
            />
            <div style={styles.editActions}>
              <button
                onClick={handleSaveEdit}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--color-accent)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.content}>{comment.content}</div>
        )}

        {comment.reactions && comment.reactions.length > 0 && (
          <div style={styles.reactions}>
            {comment.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                style={{
                  ...styles.reaction,
                  background: reaction.hasReacted ? 'var(--color-accent-light)' : 'var(--color-bg)',
                }}
                onClick={() => onReact?.(comment.id, reaction.emoji)}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        )}

        <div style={{ ...styles.actions, opacity: showActions ? 1 : 0.5 }}>
          {onReact && (
            <div style={{ position: 'relative' }}>
              <button style={styles.actionBtn}>
                +
              </button>
            </div>
          )}
          {depth < maxDepth && onReply && (
            <button style={styles.actionBtn} onClick={() => onReply(comment)}>
              Reply
            </button>
          )}
          {isOwner && onEdit && (
            <button style={styles.actionBtn} onClick={() => setIsEditing(true)}>
              Edit
            </button>
          )}
          {isOwner && onDelete && (
            <button
              style={{ ...styles.actionBtn, color: 'var(--color-error)' }}
              onClick={() => onDelete(comment.id)}
            >
              Delete
            </button>
          )}
          {onPin && (
            <button style={styles.actionBtn} onClick={() => onPin(comment.id)}>
              {comment.isPinned ? 'Unpin' : 'Pin'}
            </button>
          )}
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                onReact={onReact}
                onPin={onPin}
                depth={depth + 1}
                maxDepth={maxDepth}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== COMMENT LIST ====================

export const CommentList: React.FC<CommentListProps> = ({
  comments,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  sortBy = 'newest',
  emptyMessage = 'No comments yet. Be the first to comment!',
}) => {
  const sortedComments = [...comments].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return b.createdAt.getTime() - a.createdAt.getTime();
      case 'oldest':
        return a.createdAt.getTime() - b.createdAt.getTime();
      case 'popular':
        const aReactions = a.reactions?.reduce((sum, r) => sum + r.count, 0) || 0;
        const bReactions = b.reactions?.reduce((sum, r) => sum + r.count, 0) || 0;
        return bReactions - aReactions;
      default:
        return 0;
    }
  });

  // Pin comments at top
  const pinnedComments = sortedComments.filter((c) => c.isPinned);
  const unpinnedComments = sortedComments.filter((c) => !c.isPinned);

  if (comments.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      {pinnedComments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          currentUserId={currentUserId}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
          onPin={onPin}
        />
      ))}
      {unpinnedComments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          currentUserId={currentUserId}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
          onPin={onPin}
        />
      ))}
    </div>
  );
};

// ==================== DISCUSSION THREAD ====================

interface DiscussionThreadProps {
  title: string;
  comments: Comment[];
  currentUserId?: string;
  onAddComment: (content: string, mentions?: string[]) => void;
  onReply?: (parentId: string, content: string) => void;
  onEdit?: (commentId: string, newContent: string) => void;
  onDelete?: (commentId: string) => void;
  onReact?: (commentId: string, emoji: string) => void;
  mentionUsers?: User[];
}

export const DiscussionThread: React.FC<DiscussionThreadProps> = ({
  title,
  comments,
  currentUserId,
  onAddComment,
  onReply,
  onEdit,
  onDelete,
  onReact,
  mentionUsers,
}) => {
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular'>('newest');

  const handleReply = (comment: Comment) => {
    setReplyTo(comment);
  };

  const handleSubmit = (content: string, mentions?: string[]) => {
    if (replyTo && onReply) {
      onReply(replyTo.id, content);
    } else {
      onAddComment(content, mentions);
    }
    setReplyTo(null);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--color-text)' }}>
          {title} ({comments.length})
        </h3>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            fontSize: 13,
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="popular">Most popular</option>
        </select>
      </div>

      <CommentBox
        onSubmit={handleSubmit}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        mentionUsers={mentionUsers}
      />

      <div style={{ marginTop: 24 }}>
        <CommentList
          comments={comments}
          currentUserId={currentUserId}
          onReply={handleReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
          sortBy={sortBy}
        />
      </div>
    </div>
  );
};

export default CommentBox;
