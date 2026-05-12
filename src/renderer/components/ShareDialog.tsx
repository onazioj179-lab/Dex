// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Share Dialog
// Invite collaborators, manage access, and share links
// =============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useCollaborationStore, CollaboratorRole, Collaborator } from '../services/CollaborationSystem';
import { useFocusTrap } from '../utils/useFocusTrap';

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5500,
    animation: 'fadeIn 0.15s ease',
  },
  dialog: {
    width: '100%',
    maxWidth: 520,
    background: 'var(--color-bg-elevated)',
    borderRadius: 16,
    boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1) inset',
    overflow: 'hidden',
    animation: 'slideUp 0.2s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border)',
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  closeBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  body: {
    padding: 20,
    maxHeight: '60vh',
    overflowY: 'auto',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 12,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    fontSize: 14,
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    color: 'var(--color-text-primary)',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  select: {
    padding: '10px 14px',
    fontSize: 14,
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    color: 'var(--color-text-primary)',
    outline: 'none',
    cursor: 'pointer',
    minWidth: 120,
  },
  inviteBtn: {
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 500,
    background: 'var(--color-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  collaboratorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  collaborator: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    background: 'var(--color-bg-base)',
    borderRadius: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-accent), #5856d6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  collaboratorInfo: {
    flex: 1,
    minWidth: 0,
  },
  collaboratorName: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  collaboratorEmail: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  roleSelect: {
    padding: '6px 10px',
    fontSize: 12,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  removeBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'var(--color-bg-base)',
    borderRadius: 10,
  },
  linkToggle: {
    position: 'relative',
    width: 44,
    height: 24,
    background: 'var(--color-border)',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  },
  linkToggleOn: {
    background: 'var(--color-accent)',
  },
  linkToggleKnob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 20,
    height: 20,
    background: '#fff',
    borderRadius: '50%',
    transition: 'transform 0.2s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  linkToggleKnobOn: {
    transform: 'translateX(20px)',
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: 'var(--color-text-primary)',
  },
  copyBtn: {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#30d158',
    position: 'absolute',
    bottom: 0,
    right: 0,
    border: '2px solid var(--color-bg-base)',
  },
  badge: {
    padding: '2px 6px',
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 4,
    background: 'rgba(255,255,255,0.1)',
    color: 'var(--color-text-muted)',
    marginLeft: 6,
  },
  visitorBadge: {
    background: 'rgba(255,159,10,0.15)',
    color: '#ff9f0a',
  },
  accessRequestCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'linear-gradient(135deg, rgba(255,159,10,0.1), rgba(255,159,10,0.05))',
    border: '1px solid rgba(255,159,10,0.2)',
    borderRadius: 10,
    marginBottom: 8,
  },
  accessRequestActions: {
    display: 'flex',
    gap: 6,
  },
  approveBtn: {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    background: '#30d158',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  denyBtn: {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    background: 'transparent',
    color: '#ff453a',
    border: '1px solid rgba(255,69,58,0.3)',
    borderRadius: 6,
    cursor: 'pointer',
  },
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

interface ShareDialogProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({ projectId, projectName, onClose }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CollaboratorRole>('editor');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const {
    projects,
    currentUser,
    inviteCollaborator,
    removeCollaborator,
    updateCollaboratorRole,
    enableLinkSharing,
    disableLinkSharing,
    handleAccessRequest,
    createVisitorInvite,
  } = useCollaborationStore();

  const project = projects.get(projectId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInvite = useCallback(async () => {
    if (!email.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Check if it's a visitor (non-org email)
      const isVisitor = !email.includes('@dex.') && !email.includes('@yourorg.');
      
      if (isVisitor && project?.visitorSharingEnabled) {
        const { pin, link } = createVisitorInvite(projectId, email, role);
        window.dispatchEvent(new CustomEvent('dex-toast', {
          detail: { 
            type: 'success', 
            message: `Visitor invite created. PIN: ${pin}`,
            duration: 8000,
          }
        }));
      } else {
        await inviteCollaborator(projectId, email, role);
        window.dispatchEvent(new CustomEvent('dex-toast', {
          detail: { type: 'success', message: `Invited ${email}` }
        }));
      }
      setEmail('');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to send invite';
      setError(errorMessage);
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { type: 'error', message: errorMessage }
      }));
    } finally {
      setIsLoading(false);
    }
  }, [email, role, projectId, project, inviteCollaborator, createVisitorInvite]);

  const handleToggleLinkSharing = useCallback(() => {
    if (project?.linkSharing.enabled) {
      disableLinkSharing(projectId);
    } else {
      enableLinkSharing(projectId, 'view');
    }
  }, [project, projectId, enableLinkSharing, disableLinkSharing]);

  const handleCopyLink = useCallback(() => {
    if (project?.linkSharing.link) {
      navigator.clipboard.writeText(project.linkSharing.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [project]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && e.target === inputRef.current) handleInvite();
  };

  if (!project) return null;

  const pendingRequests = project.accessRequests.filter(r => r.status === 'pending');

  return (
    <div style={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
      <div ref={trapRef} style={styles.dialog} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Share ${projectName}`}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Share "{projectName}"</h2>
          <button
            style={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div style={{
            padding: '12px 20px',
            background: 'rgba(255,69,58,0.15)',
            borderBottom: '1px solid rgba(255,69,58,0.3)',
            color: '#ff453a',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#ff453a',
                cursor: 'pointer',
                padding: 4,
              }}
              aria-label="Dismiss error"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div style={styles.body}>
          {/* Invite Section */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Invite People</div>
            <div style={styles.inputRow}>
              <input
                ref={inputRef}
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={styles.input}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              />
              <select
                value={role}
                onChange={e => setRole(e.target.value as CollaboratorRole)}
                style={styles.select}
              >
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
              <button
                style={{
                  ...styles.inviteBtn,
                  ...(isLoading ? { opacity: 0.7, cursor: 'not-allowed' } : {}),
                }}
                onClick={handleInvite}
                disabled={isLoading}
                onMouseEnter={e => { if (!isLoading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
              >
                {isLoading ? 'Inviting...' : 'Invite'}
              </button>
            </div>
          </div>

          {/* Access Requests */}
          {pendingRequests.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Access Requests ({pendingRequests.length})</div>
              {pendingRequests.map(req => (
                <div key={req.id} style={styles.accessRequestCard}>
                  <div style={{ ...styles.avatar, width: 32, height: 32, fontSize: 12 }}>
                    {req.requesterName[0].toUpperCase()}
                  </div>
                  <div style={styles.collaboratorInfo}>
                    <div style={styles.collaboratorName}>{req.requesterName}</div>
                    <div style={styles.collaboratorEmail}>{req.requesterEmail}</div>
                  </div>
                  <div style={styles.accessRequestActions}>
                    <button
                      style={styles.approveBtn}
                      onClick={() => handleAccessRequest(projectId, req.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      style={styles.denyBtn}
                      onClick={() => handleAccessRequest(projectId, req.id, false)}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Collaborators */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>People with Access ({project.collaborators.length})</div>
            <div style={styles.collaboratorList}>
              {project.collaborators.map(collab => (
                <div key={collab.id} style={styles.collaborator}>
                  <div style={{ position: 'relative' }}>
                    <div style={styles.avatar}>
                      {collab.avatar ? (
                        <img src={collab.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        collab.name[0].toUpperCase()
                      )}
                    </div>
                    {collab.isOnline && <div style={styles.onlineIndicator} />}
                  </div>
                  <div style={styles.collaboratorInfo}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={styles.collaboratorName}>{collab.name}</span>
                      {collab.id === currentUser?.id && (
                        <span style={styles.badge}>You</span>
                      )}
                      {collab.isVisitor && (
                        <span style={{ ...styles.badge, ...styles.visitorBadge }}>Visitor</span>
                      )}
                    </div>
                    <div style={styles.collaboratorEmail}>{collab.email}</div>
                  </div>
                  {collab.role !== 'owner' && collab.id !== currentUser?.id && (
                    <>
                      <select
                        value={collab.role}
                        onChange={e => updateCollaboratorRole(projectId, collab.id, e.target.value as CollaboratorRole)}
                        style={styles.roleSelect}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="commenter">Commenter</option>
                        <option value="editor">Editor</option>
                      </select>
                      <button
                        style={styles.removeBtn}
                        onClick={() => removeCollaborator(projectId, collab.id)}
                        aria-label={`Remove ${collab.name}`}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ff453a'; e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </>
                  )}
                  {collab.role === 'owner' && (
                    <span style={{ ...styles.roleSelect, border: 'none', background: 'transparent', color: 'var(--color-text-muted)' }}>Owner</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Link Sharing */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Link Sharing</div>
            <div style={styles.linkRow}>
              <div
                style={{
                  ...styles.linkToggle,
                  ...(project.linkSharing.enabled ? styles.linkToggleOn : {}),
                }}
                onClick={handleToggleLinkSharing}
                role="switch"
                aria-checked={project.linkSharing.enabled}
                tabIndex={0}
              >
                <div style={{
                  ...styles.linkToggleKnob,
                  ...(project.linkSharing.enabled ? styles.linkToggleKnobOn : {}),
                }} />
              </div>
              <div style={styles.linkText}>
                {project.linkSharing.enabled
                  ? 'Anyone with the link can view'
                  : 'Only people with access can open'}
              </div>
              {project.linkSharing.enabled && (
                <button
                  style={styles.copyBtn}
                  onClick={handleCopyLink}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                >
                  {copied ? 'Copied' : 'Copy Link'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
};

export default ShareDialog;
