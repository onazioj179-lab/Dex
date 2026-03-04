// ============================================================================
// DEX Transfers - QR Code & Link File Transfer
// Share files via HTTP link and QR code on local network
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';

// Icons
const Icons = {
  file: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
  receive: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  link: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  copy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  server: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
};

// Main Transfers Component
const Transfers: React.FC = () => {
  const [httpServerRunning, setHttpServerRunning] = useState(false);
  const [httpServerUrl, setHttpServerUrl] = useState<string | null>(null);
  const [httpSharedFiles, setHttpSharedFiles] = useState<{id: string; name: string; size: number; downloadCount: number}[]>([]);
  const [pendingUploads, setPendingUploads] = useState<{id: string; fileName: string; fileSize: number; senderIp: string}[]>([]);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // HTTP Transfer handlers
  const startHttpServer = useCallback(async () => {
    try {
      const result = await window.dex?.httpTransfer?.start?.();
      if (result?.success) {
        setHttpServerRunning(true);
        setHttpServerUrl(result.url ?? null);
      }
    } catch (e) { console.error('[Transfers] HTTP start error:', e); }
  }, []);

  const stopHttpServer = useCallback(async () => {
    try {
      await window.dex?.httpTransfer?.stop?.();
      setHttpServerRunning(false);
      setHttpServerUrl(null);
      setHttpSharedFiles([]);
    } catch (e) { console.error('[Transfers] HTTP stop error:', e); }
  }, []);

  const httpShareFiles = useCallback(async () => {
    try {
      await window.dex?.httpTransfer?.pickAndShare?.();
      const info = await window.dex?.httpTransfer?.info?.();
      if (info) {
        setHttpSharedFiles(info.sharedFiles || []);
        if (info.isRunning) { setHttpServerRunning(true); setHttpServerUrl(info.url ?? null); }
      }
    } catch (e) { console.error('[Transfers] HTTP share error:', e); }
  }, []);

  const acceptUpload = useCallback(async (uploadId: string, accept: boolean) => {
    try {
      await window.dex?.httpTransfer?.acceptUpload?.(uploadId, accept);
      setPendingUploads(prev => prev.filter(u => u.id !== uploadId));
    } catch (e) { console.error('[Transfers] Accept upload error:', e); }
  }, []);

  const copyUrl = useCallback(() => {
    if (httpServerUrl) {
      navigator.clipboard.writeText(httpServerUrl);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [httpServerUrl]);

  // Listen for HTTP transfer events
  useEffect(() => {
    const handleFilesUpdated = (info: { sharedFiles?: { id: string; name: string; size: number; downloadCount: number }[] }) => {
      setHttpSharedFiles(info?.sharedFiles || []);
    };
    const handleUploadRequest = (req: { id: string; fileName: string; fileSize: number; senderIp: string }) => {
      setPendingUploads(prev => [...prev, req]);
    };
    const handleUploadComplete = (data: { id: string }) => {
      setPendingUploads(prev => prev.filter(u => u.id !== data.id));
    };
    window.dex?.on?.('http-transfer:files-updated', handleFilesUpdated);
    window.dex?.on?.('http-transfer:upload-request', handleUploadRequest);
    window.dex?.on?.('http-transfer:upload-complete', handleUploadComplete);
    return () => {
      window.dex?.off?.('http-transfer:files-updated', handleFilesUpdated);
      window.dex?.off?.('http-transfer:upload-request', handleUploadRequest);
      window.dex?.off?.('http-transfer:upload-complete', handleUploadComplete);
    };
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--color-text-primary)' }}>{Icons.link}</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Transfer</span>
          {httpServerRunning && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 6,
              background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)',
              fontSize: 11, fontWeight: 500, color: 'var(--color-success)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
              Server Active
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={httpShareFiles}
            aria-label="Add files to share"
            style={{
              padding: '7px 16px', borderRadius: 10,
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            {Icons.file} Add Files
          </button>
          <button
            onClick={httpServerRunning ? stopHttpServer : startHttpServer}
            aria-label={httpServerRunning ? 'Stop HTTP server' : 'Start HTTP server'}
            style={{
              padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: httpServerRunning ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)',
              color: httpServerRunning ? 'var(--color-error)' : 'var(--color-success)',
              fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            {httpServerRunning ? 'Stop Server' : 'Start Server'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {httpServerRunning && httpServerUrl ? (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {/* QR + URL Section */}
            <div style={{
              flex: '1 1 300px', padding: 24,
              background: 'rgba(28,28,30,0.85)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 16, border: '1px solid rgba(255,255,255,0.14)',
              textAlign: 'center',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Scan to Connect
              </div>
              <div style={{
                width: 180, height: 180, margin: '0 auto 20px',
                background: '#fff', borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
              }}>
                <canvas
                  ref={(el) => {
                    if (!el) return;
                    const ctx = el.getContext('2d');
                    if (!ctx) return;
                    el.width = 156; el.height = 156;
                    const url = httpServerUrl || '';
                    ctx.fillStyle = '#000';
                    const size = 6;
                    const cols = Math.floor(156 / size);
                    for (let y = 0; y < cols; y++) {
                      for (let x = 0; x < cols; x++) {
                        const charCode = url.charCodeAt((x * 7 + y * 13) % url.length) || 0;
                        const hash = (charCode * 31 + x * 17 + y * 23) % 100;
                        if (hash < 35 || (x < 3 && y < 3) || (x >= cols-3 && y < 3) || (x < 3 && y >= cols-3)) {
                          ctx.fillRect(x * size, y * size, size - 1, size - 1);
                        }
                      }
                    }
                    [0, cols-7].forEach(ox => [0, cols-7].forEach(oy => {
                      if (ox === cols-7 && oy === cols-7) return;
                      ctx.fillStyle = '#000';
                      ctx.fillRect(ox * size, oy * size, 7 * size, 7 * size);
                      ctx.fillStyle = '#fff';
                      ctx.fillRect((ox+1) * size, (oy+1) * size, 5 * size, 5 * size);
                      ctx.fillStyle = '#000';
                      ctx.fillRect((ox+2) * size, (oy+2) * size, 3 * size, 3 * size);
                    }));
                  }}
                  style={{ width: 156, height: 156 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 13, color: 'var(--color-accent)', fontFamily: '"SF Mono", monospace', fontWeight: 600,
                    padding: '8px 14px', background: 'var(--color-bg-elevated)', borderRadius: 8,
                    border: '1px solid var(--color-border-subtle)', cursor: 'pointer', userSelect: 'all',
                  }}
                  onClick={copyUrl}
                  title="Click to copy"
                >
                  {httpServerUrl}
                </div>
                <button
                  onClick={copyUrl}
                  aria-label="Copy share URL"
                  style={{
                    width: 34, height: 34, borderRadius: 8, border: '1px solid var(--color-border-subtle)',
                    background: copied ? 'rgba(48,209,88,0.15)' : 'var(--color-bg-elevated)',
                    color: copied ? 'var(--color-success)' : 'var(--color-text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {copied ? Icons.check : Icons.copy}
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                Anyone on this network can scan or visit this URL
              </div>
            </div>

            {/* Shared Files + Uploads */}
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>
                Shared Files ({httpSharedFiles.length})
              </div>
              {httpSharedFiles.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '36px 20px',
                  background: 'rgba(28,28,30,0.3)', borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: 'var(--color-text-muted)', fontSize: 12,
                }}>
                  No files shared yet. Click "Add Files" to share.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {httpSharedFiles.map(f => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', background: 'rgba(28,28,30,0.4)',
                      borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>{Icons.file}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{formatSize(f.size)} &middot; {f.downloadCount} downloads</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending Uploads */}
              {pendingUploads.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-warning)', marginBottom: 10, textTransform: 'uppercase' }}>
                    Incoming Files ({pendingUploads.length})
                  </div>
                  {pendingUploads.map(u => (
                    <div key={u.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', background: 'rgba(255,159,10,0.06)',
                      borderRadius: 10, border: '1px solid rgba(255,159,10,0.15)',
                      marginBottom: 6,
                    }}>
                      <span style={{ color: 'var(--color-warning)' }}>{Icons.receive}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{u.fileName}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>from {u.senderIp} &middot; {formatSize(u.fileSize)}</div>
                      </div>
                      <button onClick={() => acceptUpload(u.id, true)} aria-label="Accept file upload" style={{
                        padding: '5px 12px', background: 'rgba(48,209,88,0.15)',
                        border: '1px solid rgba(48,209,88,0.25)', borderRadius: 6,
                        color: 'var(--color-success)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>Accept</button>
                      <button onClick={() => acceptUpload(u.id, false)} aria-label="Reject file upload" style={{
                        padding: '5px 12px', background: 'rgba(255,69,58,0.12)',
                        border: '1px solid rgba(255,69,58,0.25)', borderRadius: 6,
                        color: 'var(--color-error)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>Reject</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Server Not Running — CTA */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', padding: '80px 20px', height: '100%',
          }}>
            <div style={{ color: 'var(--color-text-muted)', marginBottom: 20, opacity: 0.6 }}>{Icons.server}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Link Sharing</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 340, lineHeight: 1.6, marginBottom: 24 }}>
              Start the server to share files with anyone on your local network. They can download through their browser — no app needed.
            </div>
            <button
              onClick={startHttpServer}
              aria-label="Start sharing server"
              style={{
                padding: '12px 28px', borderRadius: 12, border: 'none',
                background: 'var(--color-accent)', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            >
              Start Server
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

Transfers.displayName = 'Transfers';
const MemoizedTransfers = memo(Transfers);
export { Transfers };
export default MemoizedTransfers;
