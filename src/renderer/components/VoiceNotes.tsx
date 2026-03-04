/**
 * DEX Voice Notes
 * Record, playback, and manage voice memos with transcription-ready architecture
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useRef, memo, useEffect, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceNote {
  id: string;
  title: string;
  duration: number; // seconds
  createdAt: number;
  blob?: Blob;
  blobUrl: string;
  transcript: string;
  tags: string[];
  favorite: boolean;
}

interface RecorderState {
  isRecording: boolean;
  isPaused: boolean;
  elapsed: number;
  mediaRecorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
}

// ============================================================================
// STORAGE (metadata only -- audio stored in memory/IndexedDB for real apps)
// ============================================================================

const STORAGE_KEY = 'dex-voice-notes';

interface VoiceNoteMeta {
  id: string;
  title: string;
  duration: number;
  createdAt: number;
  transcript: string;
  tags: string[];
  favorite: boolean;
}

function loadMeta(): VoiceNoteMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveMeta(metas: VoiceNoteMeta[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(metas)); } catch {}
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// COMPONENT
// ============================================================================

export const VoiceNotes: React.FC = memo(() => {
  const [metas, setMetas] = useState<VoiceNoteMeta[]>(loadMeta);
  const [recordings, setRecordings] = useState<Map<string, string>>(new Map()); // id -> blobUrl
  const [recorder, setRecorder] = useState<RecorderState>({
    isRecording: false, isPaused: false, elapsed: 0, mediaRecorder: null, stream: null, chunks: [],
  });
  const [playing, setPlaying] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [micError, setMicError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const persist = useCallback((m: VoiceNoteMeta[]) => { setMetas(m); saveMeta(m); }, []);

  // Timer for recording elapsed
  useEffect(() => {
    if (recorder.isRecording && !recorder.isPaused) {
      timerRef.current = setInterval(() => {
        setRecorder(prev => ({ ...prev, elapsed: prev.elapsed + 1 }));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recorder.isRecording, recorder.isPaused]);

  const startRecording = useCallback(async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);
        const id = `vn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const meta: VoiceNoteMeta = {
          id,
          title: `Recording ${metas.length + 1}`,
          duration: Math.floor(recorder.elapsed),
          createdAt: Date.now(),
          transcript: '',
          tags: [],
          favorite: false,
        };
        persist([meta, ...metas]);
        setRecordings(prev => new Map(prev).set(id, blobUrl));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      setRecorder({ isRecording: true, isPaused: false, elapsed: 0, mediaRecorder, stream, chunks });
    } catch (err) {
      setMicError('Microphone access denied or unavailable.');
    }
  }, [metas, recorder.elapsed, persist]);

  const stopRecording = useCallback(() => {
    if (recorder.mediaRecorder && recorder.mediaRecorder.state !== 'inactive') {
      recorder.mediaRecorder.stop();
    }
    setRecorder(prev => ({ ...prev, isRecording: false, isPaused: false }));
  }, [recorder.mediaRecorder]);

  const pauseRecording = useCallback(() => {
    if (recorder.mediaRecorder?.state === 'recording') {
      recorder.mediaRecorder.pause();
      setRecorder(prev => ({ ...prev, isPaused: true }));
    }
  }, [recorder.mediaRecorder]);

  const resumeRecording = useCallback(() => {
    if (recorder.mediaRecorder?.state === 'paused') {
      recorder.mediaRecorder.resume();
      setRecorder(prev => ({ ...prev, isPaused: false }));
    }
  }, [recorder.mediaRecorder]);

  const playNote = useCallback((id: string) => {
    const url = recordings.get(id);
    if (!url) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(url);
    audio.onended = () => setPlaying(null);
    audio.play();
    audioRef.current = audio;
    setPlaying(id);
  }, [recordings]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(null);
  }, []);

  const deleteNote = useCallback((id: string) => {
    persist(metas.filter(m => m.id !== id));
    const url = recordings.get(id);
    if (url) URL.revokeObjectURL(url);
    setRecordings(prev => { const n = new Map(prev); n.delete(id); return n; });
    if (playing === id) stopPlayback();
  }, [metas, recordings, playing, persist, stopPlayback]);

  const toggleFavorite = useCallback((id: string) => {
    persist(metas.map(m => m.id === id ? { ...m, favorite: !m.favorite } : m));
  }, [metas, persist]);

  const saveEdit = useCallback(() => {
    if (!editId) return;
    persist(metas.map(m => m.id === editId ? { ...m, title: editTitle.trim() || m.title, transcript: editTranscript } : m));
    setEditId(null);
  }, [editId, editTitle, editTranscript, metas, persist]);

  const filtered = useMemo(() => {
    if (!search.trim()) return metas;
    const q = search.toLowerCase();
    return metas.filter(m => m.title.toLowerCase().includes(q) || m.transcript.toLowerCase().includes(q) || m.tags.some(t => t.toLowerCase().includes(q)));
  }, [metas, search]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Voice Notes</h2>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{metas.length} recording{metas.length !== 1 ? 's' : ''}</span>
      </div>

      {micError && <div style={styles.errorBanner}>{micError}</div>}

      {/* Recording controls */}
      <div style={styles.recorderPanel}>
        {recorder.isRecording ? (
          <>
            <div style={styles.recordingIndicator}>
              <span style={styles.recordDot} />
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{formatTime(recorder.elapsed)}</span>
              {recorder.isPaused && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>PAUSED</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {recorder.isPaused ? (
                <button onClick={resumeRecording} style={styles.controlBtn}>Resume</button>
              ) : (
                <button onClick={pauseRecording} style={styles.controlBtn}>Pause</button>
              )}
              <button onClick={stopRecording} style={{ ...styles.controlBtn, background: '#ef4444' }}>Stop</button>
            </div>
          </>
        ) : (
          <button onClick={startRecording} style={styles.recordBtn} aria-label="Start recording">
            <span style={styles.recordBtnDot} />
            <span>Record</span>
          </button>
        )}
      </div>

      {/* Search */}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search recordings..." style={styles.searchInput} aria-label="Search voice notes" />

      {/* Notes list */}
      <div style={styles.noteList}>
        {filtered.length === 0 ? (
          <div style={styles.emptyState}>
            {search ? 'No matching recordings' : 'No recordings yet. Tap the record button to start.'}
          </div>
        ) : (
          filtered.map(note => (
            <div key={note.id} style={styles.noteCard}>
              {editId === note.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    style={styles.editInput} placeholder="Title" aria-label="Edit title" />
                  <textarea value={editTranscript} onChange={e => setEditTranscript(e.target.value)}
                    style={{ ...styles.editInput, minHeight: 40, resize: 'vertical' }}
                    placeholder="Transcript / notes" aria-label="Transcript" />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={saveEdit} style={styles.controlBtn}>Save</button>
                    <button onClick={() => setEditId(null)} style={{ ...styles.controlBtn, background: 'rgba(255,255,255,0.06)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{note.title}</span>
                      {note.favorite && <span style={{ fontSize: 10, color: '#f59e0b' }}>*</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {formatTime(note.duration)} -- {formatDate(note.createdAt)}
                    </div>
                    {note.transcript && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {note.transcript}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {recordings.has(note.id) && (
                      playing === note.id ? (
                        <button onClick={stopPlayback} style={styles.playBtn} aria-label="Stop playback">Stop</button>
                      ) : (
                        <button onClick={() => playNote(note.id)} style={styles.playBtn} aria-label="Play recording">Play</button>
                      )
                    )}
                    <button onClick={() => toggleFavorite(note.id)} style={{ ...styles.actionBtn, color: note.favorite ? '#f59e0b' : 'var(--color-text-muted)' }}>Fav</button>
                    <button onClick={() => { setEditId(note.id); setEditTitle(note.title); setEditTranscript(note.transcript); }} style={styles.actionBtn}>Edit</button>
                    <button onClick={() => deleteNote(note.id)} style={{ ...styles.actionBtn, color: '#ef4444' }}>Del</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

VoiceNotes.displayName = 'VoiceNotes';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  errorBanner: { padding: '6px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 12, fontWeight: 600 },
  recorderPanel: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))' },
  recordBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 24, border: 'none', background: '#ef4444', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  recordBtnDot: { width: 12, height: 12, borderRadius: '50%', background: '#fff' },
  recordingIndicator: { display: 'flex', alignItems: 'center', gap: 8 },
  recordDot: { width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s ease-in-out infinite' },
  controlBtn: { padding: '6px 14px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  searchInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, outline: 'none', fontFamily: 'inherit' },
  noteList: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  noteCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', gap: 8 },
  playBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  actionBtn: { fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' },
  editInput: { padding: '4px 8px', borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, fontFamily: 'inherit', outline: 'none' },
  emptyState: { textAlign: 'center', padding: 30, fontSize: 13, color: 'var(--color-text-muted)' },
};

export default VoiceNotes;
