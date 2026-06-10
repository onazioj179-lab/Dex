// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AUDIO - macOS Music Style Audio Player
 * Clean audio player with playlist
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';
import { useToastHelpers } from '../components/Toast';
import { glassSidebar } from '../styles/glassMenu';
import DexIcon from '../components/DexIcon';
import { loadAudioMetadata } from '../utils/id3Parser';
import { useCreativeSuite } from '../services/CreativeSuiteBridge';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import ContextMenu, { useContextMenu, ContextMenuItem } from '../components/ContextMenu';
import { getAudioPlaybackService } from '../services/media/AudioPlaybackService';

// ===========================================================================
// TYPES
// ===========================================================================

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string;
  url: string;
  genre?: string;
  year?: string;
  composer?: string;
  trackNumber?: string;
}

interface Playlist {
  id: string;
  name: string;
  tracks: number;
}

// Accepted audio MIME types and extensions
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.wma', '.opus', '.webm']);
const isAudioFile = (name: string) => AUDIO_EXTENSIONS.has(name.slice(name.lastIndexOf('.')).toLowerCase());

// ===========================================================================
// ICONS
// ===========================================================================

const Icons = {
  play: <DexIcon name="play" size={20} />,
  pause: <DexIcon name="pause" size={20} />,
  skipBack: <DexIcon name="skip-back" size={18} />,
  skipForward: <DexIcon name="skip-forward" size={18} />,
  shuffle: <DexIcon name="shuffle" size={16} />,
  repeat: <DexIcon name="repeat" size={16} />,
  volume: <DexIcon name="volume-2" size={16} />,
  music: <DexIcon name="music" size={18} />,
  list: <DexIcon name="menu" size={18} />,
  heart: <DexIcon name="heart" size={16} />,
  heartFilled: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-error)">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
    </svg>
  ),
  plus: <DexIcon name="plus" size={16} />,
};

// ===========================================================================
// DATA - Load from system
// ===============================================================================

const DEFAULT_PLAYLISTS: Playlist[] = [
  { id: 'all', name: 'All Songs', tracks: 0 },
  { id: 'favorites', name: 'Favorites', tracks: 0 },
  { id: 'recent', name: 'Recently Added', tracks: 0 },
];

// Load tracks from real file system with timeout
const loadTracks = async (): Promise<{ tracks: Track[]; pendingEnrich: Track[] }> => {
  try {
    if (window.dex?.invoke) {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const filesPromise = window.dex?.invoke('media:getMediaFiles', 'music');
      const files = await Promise.race([filesPromise, timeoutPromise]);
      
      if (files && Array.isArray(files) && files.length > 0) {
        const baseTracks = files.slice(0, 100).map((f: { path?: string; name?: string; extension?: string; size?: number; modified?: string }, i: number) => {
          const rawPath = f.path || '';
          const fileUrl = rawPath ? `file://${rawPath.replace(/\\/g, '/')}` : '';
          return {
            id: rawPath || String(i),
            title: f.name?.replace(/\.[^/.]+$/, '') || 'Unknown',
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 0,
            artwork: '',
            url: fileUrl,
          };
        });

        // Enrich with ID3 metadata in background (first 20 immediately, rest async)
        const enrich = async (track: Track): Promise<Track> => {
          try {
            const meta = await loadAudioMetadata(track.id);
            if (meta) {
              return {
                ...track,
                title: meta.title || track.title,
                artist: meta.artist || track.artist,
                album: meta.album || track.album,
                artwork: meta.artwork || track.artwork,
                genre: meta.genre,
                year: meta.year,
                composer: meta.composer,
                trackNumber: meta.trackNumber,
              };
            }
          } catch { /* metadata parse failed */ }
          return track;
        };

        // Enrich first batch synchronously for faster display
        const first = await Promise.all(baseTracks.slice(0, 20).map(enrich));
        const rest = baseTracks.slice(20);
        // Return first batch enriched + rest unenriched; rest will be enriched in background via callback
        return { tracks: [...first, ...rest], pendingEnrich: rest };
      }
    }
  } catch (err) {
    console.warn('Failed to load audio files from system:', err);
  }
  return { tracks: [], pendingEnrich: [] };
};

// Load/save favorites - persist to backend
const loadFavorites = async (): Promise<string[]> => {
  try {
    if (window.dex?.invoke) {
      const result = await window.dex?.invoke('capability:storage:get', 'dex-audio-favorites');
      if (result) return JSON.parse(result);
    }
  } catch { /* storage unavailable */ }
  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('dex-audio-favorites');
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};

const saveFavorites = async (favs: string[]) => {
  const data = JSON.stringify(favs);
  localStorage.setItem('dex-audio-favorites', data);
  try {
    await window.dex?.invoke?.('capability:storage:set', 'dex-audio-favorites', data);
  } catch { /* backend save failed silently */ }
};

// ===============================================================================
// COMPONENT
// ===============================================================================

export const Audio: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('audio');
  const toast = useToastHelpers();
  const { sendToApp } = useCreativeSuite();
  const { launchApp } = useRunningApps();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(75);
  const [selectedPlaylist, setSelectedPlaylist] = useState('all');
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem('dex-audio-playlists');
      if (saved) return [...DEFAULT_PLAYLISTS, ...JSON.parse(saved)];
    } catch { /* ignore */ }
    return [...DEFAULT_PLAYLISTS];
  });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vizCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizRafRef = useRef(0);
  const crossfadeAudioRef = useRef<HTMLAudioElement | null>(null);
  const crossfadeGainRef = useRef<GainNode | null>(null);
  const mainGainRef = useRef<GainNode | null>(null);
  const [queueDragIdx, setQueueDragIdx] = useState<number | null>(null);
  const [queueOverIdx, setQueueOverIdx] = useState<number | null>(null);

  const [playlistNameDraft, setPlaylistNameDraft] = useState<string | null>(null);

  // === PRO FEATURES STATE ===
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [eqBands, setEqBands] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [eqPreset, setEqPreset] = useState('flat');
  const [showQueue, setShowQueue] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [vizMode, setVizMode] = useState<'bars' | 'wave' | 'spectrum'>('bars');
  const [crossfadeDuration, setCrossfadeDuration] = useState(3);
  const [showCrossfadeSettings, setShowCrossfadeSettings] = useState(false);
  const [gaplessMode, setGaplessMode] = useState(false);

  // Sleep timer
  const [sleepTimer, setSleepTimer] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Library view mode
  const [libraryView, setLibraryView] = useState<'songs' | 'artists' | 'albums' | 'genres' | 'recent'>('songs');

  // Metadata editor state
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [editMeta, setEditMeta] = useState({ title: '', artist: '', album: '', genre: '', year: '', composer: '' });

  const openMetadataEditor = useCallback((track: Track) => {
    setEditingTrack(track);
    setEditMeta({ title: track.title, artist: track.artist, album: track.album, genre: track.genre || '', year: track.year || '', composer: track.composer || '' });
  }, []);

  const saveMetadata = useCallback(() => {
    if (!editingTrack) return;
    setTracks(prev => prev.map(t => t.id === editingTrack.id
      ? { ...t, title: editMeta.title || t.title, artist: editMeta.artist || t.artist, album: editMeta.album || t.album, genre: editMeta.genre || t.genre, year: editMeta.year || t.year, composer: editMeta.composer || t.composer }
      : t
    ));
    if (currentTrack?.id === editingTrack.id) {
      setCurrentTrack(prev => prev ? { ...prev, title: editMeta.title || prev.title, artist: editMeta.artist || prev.artist, album: editMeta.album || prev.album, genre: editMeta.genre || undefined, year: editMeta.year || undefined, composer: editMeta.composer || undefined } : prev);
    }
    setEditingTrack(null);
  }, [editingTrack, editMeta, currentTrack]);

  // Sleep timer effect
  const startSleepTimer = useCallback((minutes: number) => {
    if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    if (minutes <= 0) { setSleepTimer(0); setSleepRemaining(0); return; }
    setSleepTimer(minutes);
    setSleepRemaining(minutes * 60);
    sleepTimerRef.current = setInterval(() => {
      setSleepRemaining(prev => {
        if (prev <= 1) {
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
          setSleepTimer(0);
          if (audioRef.current) { audioRef.current.pause(); }
          setIsPlaying(false);
          toast.info('Sleep timer ended');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [toast]);

  useEffect(() => {
    return () => { if (sleepTimerRef.current) clearInterval(sleepTimerRef.current); };
  }, []);

  // Revoke blob URLs for imported tracks on unmount
  useEffect(() => {
    return () => {
      tracks.forEach(t => {
        if (t.url?.startsWith('blob:')) {
          URL.revokeObjectURL(t.url);
        }
      });
    };
  }, [tracks]);

  // Persist custom playlists
  useEffect(() => {
    const custom = playlists.filter(p => !DEFAULT_PLAYLISTS.some(d => d.id === p.id));
    localStorage.setItem('dex-audio-playlists', JSON.stringify(custom));
  }, [playlists]);

  const createPlaylist = useCallback(() => {
    setPlaylistNameDraft('');
  }, []);

  const submitPlaylistCreate = useCallback(() => {
    const name = playlistNameDraft?.trim();
    setPlaylistNameDraft(null);
    if (!name) return;
    const newPlaylist: Playlist = {
      id: `playlist-${Date.now()}`,
      name,
      tracks: 0,
    };
    setPlaylists(prev => [...prev, newPlaylist]);
    setSelectedPlaylist(newPlaylist.id);
  }, [playlistNameDraft]);

  // Create audio element once
  useEffect(() => {
    const audio = new window.Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      // Only reset UI -- repeat/shuffle/next handled by separate effect
    };
    const onError = () => {
      console.warn('[Audio] Playback error');
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Initialize Web Audio API graph: source → EQ(10 bands) → analyser → gain → destination
  useEffect(() => {
    const initWebAudio = () => {
      if (audioCtxRef.current || !audioRef.current) return;
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        // Resume context (Chromium suspends contexts created before user gesture)
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;
        // Create 10-band parametric EQ
        const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const eqNodes = freqs.map(f => {
          const node = ctx.createBiquadFilter();
          node.type = 'peaking';
          node.frequency.value = f;
          node.Q.value = 1.4;
          node.gain.value = 0;
          return node;
        });
        eqNodesRef.current = eqNodes;
        // Analyser
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        analyserRef.current = analyser;
        // Gain nodes for crossfade
        const mainGain = ctx.createGain();
        mainGainRef.current = mainGain;
        // Connect chain: source → eq0 → eq1 → ... → eq9 → analyser → mainGain → destination
        source.connect(eqNodes[0]);
        for (let i = 0; i < eqNodes.length - 1; i++) eqNodes[i].connect(eqNodes[i + 1]);
        eqNodes[eqNodes.length - 1].connect(analyser);
        analyser.connect(mainGain);
        mainGain.connect(ctx.destination);
      } catch (err) {
        console.warn('[Audio] Failed to initialize WebAudio:', err);
      }
    };
    // AudioContext must be created after user gesture
    const handler = () => { initWebAudio(); window.removeEventListener('click', handler); };
    window.addEventListener('click', handler);
    return () => { window.removeEventListener('click', handler); audioCtxRef.current?.close().catch((e: unknown) => { console.warn('[DEX]', e); }); };
  }, []);

  // Sync EQ band values to BiquadFilterNodes
  useEffect(() => {
    eqNodesRef.current.forEach((node, i) => {
      if (eqBands[i] !== undefined) node.gain.value = eqBands[i];
    });
  }, [eqBands]);

  // Visualizer RAF loop
  useEffect(() => {
    if (!showVisualizer) { cancelAnimationFrame(vizRafRef.current); return; }
    const draw = () => {
      const canvas = vizCanvasRef.current;
      const analyser = analyserRef.current;
      if (!canvas || !analyser) { vizRafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (vizMode === 'bars' || vizMode === 'spectrum') {
        const bufLen = analyser.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        analyser.getByteFrequencyData(data);
        const barCount = vizMode === 'bars' ? 32 : 64;
        const barW = w / barCount - 1;
        for (let i = 0; i < barCount; i++) {
          const idx = Math.floor(i * bufLen / barCount);
          const val = data[idx] / 255;
          const barH = val * h;
          const hue = vizMode === 'bars' ? 210 + i * 3 : 270 + i * 2;
          ctx.fillStyle = `hsl(${hue}, 80%, ${50 + val * 20}%)`;
          ctx.beginPath();
          ctx.roundRect(i * (barW + 1), h - barH, barW, barH, 2);
          ctx.fill();
        }
      } else {
        const bufLen = analyser.fftSize;
        const data = new Uint8Array(bufLen);
        analyser.getByteTimeDomainData(data);
        ctx.strokeStyle = 'var(--color-accent)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < bufLen; i++) {
          const x = (i / bufLen) * w;
          const y = (data[i] / 255) * h;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      vizRafRef.current = requestAnimationFrame(draw);
    };
    vizRafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(vizRafRef.current);
  }, [showVisualizer, vizMode, isPlaying]);


  // Computed filtered tracks (must be before callbacks that reference it)
  const filteredTracks = useMemo(() => tracks.filter(track => {
    if (selectedPlaylist === 'favorites') {
      return favorites.includes(track.id);
    }
    return true;
  }), [tracks, selectedPlaylist, favorites]);

  // Crossfade / Gapless: detect near-end and handle transition
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Skip if both disabled
    if (crossfadeDuration === 0 && !gaplessMode) return;
    let fading = false;
    const checkTransition = () => {
      if (fading || !audio.duration || !isFinite(audio.duration)) return;
      const remaining = audio.duration - audio.currentTime;
      const threshold = gaplessMode ? 2 : crossfadeDuration;
      if (remaining <= threshold && remaining > 0.3 && isPlaying) {
        fading = true;
        const nextIdx = filteredTracks.findIndex(t => t.id === currentTrack?.id);
        const next = filteredTracks[(nextIdx + 1) % filteredTracks.length];
        if (!next || next.id === currentTrack?.id) return;

        if (gaplessMode) {
          // Gapless: preload next track in hidden audio element
          if (!crossfadeAudioRef.current) {
            crossfadeAudioRef.current = new window.Audio();
          }
          crossfadeAudioRef.current!.src = next.url;
          crossfadeAudioRef.current!.preload = 'auto';
          crossfadeAudioRef.current!.volume = audio.volume;
        } else {
          // Crossfade: fade out current
          const mainGain = mainGainRef.current;
          if (mainGain && audioCtxRef.current) {
            const now = audioCtxRef.current.currentTime;
            mainGain.gain.setValueAtTime(1, now);
            mainGain.gain.linearRampToValueAtTime(0, now + remaining);
          }
        }
      }
    };
    audio.addEventListener('timeupdate', checkTransition);
    return () => audio.removeEventListener('timeupdate', checkTransition);
  }, [crossfadeDuration, gaplessMode, isPlaying, currentTrack, filteredTracks]);

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
    // ROADMAP-600 #551: keep the shared playback service's master level in sync
    // so any surface adopting AudioPlaybackService tracks the user's volume.
    getAudioPlaybackService().setVolume01(volume / 100);
  }, [volume]);

  // Respond to system volume from Control Center
  useEffect(() => {
    const handler = (e: Event) => {
      const gainFraction = (e as CustomEvent<number>).detail;
      if (mainGainRef.current) {
        mainGainRef.current.gain.value = gainFraction;
      }
    };
    window.addEventListener('dex-system-volume', handler);
    // Apply current system volume on mount
    const savedVol = Number(localStorage.getItem('dex-system-volume') ?? '80') / 100;
    if (mainGainRef.current) mainGainRef.current.gain.value = savedVol;
    return () => window.removeEventListener('dex-system-volume', handler);
  }, []);


  // Handle ended arrow-right next track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => {
      if (repeat) {
        audio.currentTime = 0;
        audio.play().catch((e: unknown) => { console.warn('[DEX]', e); });
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
        setProgress(0);
        skipToNext();
      }
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [repeat, shuffle, currentTrack, filteredTracks]);

  // Load tracks and favorites on mount - fast with timeout
  React.useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      // Quick load - don't block UI
      try {
        const loadedFavs = await loadFavorites();
        if (mounted) setFavorites(loadedFavs);
      } catch { if (mounted) toast.error('Failed to load favorites'); }
      
      // Load tracks in background with timeout
      if (mounted) setIsLoading(true);
      try {
        const { tracks: loadedTracks, pendingEnrich } = await loadTracks();
        if (mounted) {
          setTracks(loadedTracks);
          if (loadedTracks.length > 0) setCurrentTrack(loadedTracks[0]);
          // Enrich remaining tracks in background and update state
          if (pendingEnrich.length > 0) {
            const enrichTrack = async (track: Track): Promise<Track> => {
              try {
                const meta = await loadAudioMetadata(track.id);
                if (meta) {
                  return { ...track, title: meta.title || track.title, artist: meta.artist || track.artist, album: meta.album || track.album, artwork: meta.artwork || track.artwork, genre: meta.genre, year: meta.year, composer: meta.composer, trackNumber: meta.trackNumber };
                }
              } catch { /* metadata parse failed */ }
              return track;
            };
            Promise.all(pendingEnrich.map(enrichTrack)).then(enriched => {
              if (mounted) {
                setTracks(prev => {
                  const enrichedMap = new Map(enriched.map(t => [t.id, t]));
                  return prev.map(t => enrichedMap.get(t.id) || t);
                });
              }
            }).catch(err => console.warn('[Audio] Background enrichment failed:', err));
          }
        }
      } catch { if (mounted) toast.error('Failed to load audio library'); }
      if (mounted) setIsLoading(false);
    };
    loadData();
    return () => { mounted = false; };
  }, []);

  // Save favorites
  React.useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const { menuState, show: showCtx, close: closeCtx } = useContextMenu();

  const playTrack = useCallback((track: Track) => {
    setCurrentTrack(track);
    setProgress(0);
    setCurrentTime(0);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'audioTracksPlayed', amount: 1 } }));
    if (audioRef.current && (track.url || track.id)) {
      let src = track.url || track.id;
      if (!src.startsWith('http') && !src.startsWith('file://') && !src.startsWith('blob:') && !src.startsWith('data:')) {
        src = `file://${src.replace(/\\/g, '/')}`;
      }
      audioRef.current.src = src;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    } else {
      setIsPlaying(true);
    }
  }, []);

  const buildTrackCtxItems = useCallback((track: Track): ContextMenuItem[] => [
    { id: 'play', label: 'Play', onClick: () => playTrack(track) },
    { id: 'fav', label: favorites.includes(track.id) ? 'Remove from Favorites' : 'Add to Favorites', onClick: () => toggleFavorite(track.id) },
    { id: 'meta', label: 'Edit Metadata', onClick: () => openMetadataEditor(track) },
    { id: 'div1', label: '', divider: true },
    { id: 'imosion', label: 'Open in Imosion', onClick: () => {
      sendToApp({ name: track.title, kind: 'audio', data: track.url || track.id, sourceApp: 'audio' }, 'imosion');
      const def = APP_DEFINITIONS['imosion'];
      launchApp({ id: 'imosion', name: def.name, icon: def.icon, color: def.color });
    }},
    { id: 'vinx', label: 'Send to Vinx', onClick: () => {
      sendToApp({ name: track.title, kind: 'audio', data: track.url || track.id, sourceApp: 'audio' }, 'videoeditor');
      const def = APP_DEFINITIONS['videoeditor'];
      launchApp({ id: 'videoeditor', name: def.name, icon: def.icon, color: def.color });
    }},
    { id: 'forge', label: 'Send to Forge', onClick: () => {
      sendToApp({ name: track.title, kind: 'audio', data: track.url || track.id, sourceApp: 'audio' }, 'forge');
      const def = APP_DEFINITIONS['forge'];
      launchApp({ id: 'forge', name: def.name, icon: def.icon, color: def.color });
    }},
  ], [favorites, playTrack, toggleFavorite, openMetadataEditor, sendToApp, launchApp]);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((e: unknown) => { console.warn('[DEX]', e); });
    }
  }, [isPlaying, currentTrack]);

  const seekTo = useCallback((pct: number) => {
    setProgress(pct);
    if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration)) {
      audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
    }
  }, []);

  const skipToNext = useCallback(() => {
    if (filteredTracks.length === 0) return;
    const idx = currentTrack ? filteredTracks.findIndex(t => t.id === currentTrack.id) : -1;
    let nextIdx: number;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * filteredTracks.length);
    } else {
      nextIdx = idx < filteredTracks.length - 1 ? idx + 1 : 0;
    }
    playTrack(filteredTracks[nextIdx]);
  }, [currentTrack, filteredTracks, shuffle, playTrack]);

  const skipToPrev = useCallback(() => {
    if (filteredTracks.length === 0) return;
    // If >3s in, restart current track
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const idx = currentTrack ? filteredTracks.findIndex(t => t.id === currentTrack.id) : 0;
    const prevIdx = idx > 0 ? idx - 1 : filteredTracks.length - 1;
    playTrack(filteredTracks[prevIdx]);
  }, [currentTrack, filteredTracks, playTrack]);

  // Keyboard shortcuts for playback control
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === ' ') { e.preventDefault(); togglePlayPause(); }
      else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); seekTo(Math.min(100, progress + 5)); }
      else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); seekTo(Math.max(0, progress - 5)); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') { e.preventDefault(); skipToNext(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') { e.preventDefault(); skipToPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlayPause, seekTo, skipToNext, skipToPrev, progress]);

  const getArtworkColor = (id: string): string => {
    const colors = ['#ff375f', 'var(--color-warning)', 'var(--color-success)', '#64d2ff', 'var(--color-accent)', '#5e5ce6', '#bf5af2', 'var(--color-error)'];
    return colors[parseInt(id) % colors.length];
  };

  // ===== DRAG & DROP =====
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const importFiles = useCallback((files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(f => isAudioFile(f.name));
    if (audioFiles.length === 0) return;
    const newTracks: Track[] = audioFiles.map((f, i) => {
      const filePath = (f as File & { path?: string }).path;
      const blobUrl = filePath ? null : URL.createObjectURL(f);
      return {
        id: filePath || blobUrl!,
        title: f.name.replace(/\.[^/.]+$/, ''),
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: 0,
        artwork: '',
        url: filePath ? `file://${filePath.replace(/\\/g, '/')}` : blobUrl!,
      };
    });
    setTracks(prev => {
      const existing = new Set(prev.map(t => t.title));
      const unique = newTracks.filter(t => !existing.has(t.title));
      return [...prev, ...unique];
    });
    if (!currentTrack && newTracks.length > 0) {
      setCurrentTrack(newTracks[0]);
    }
  }, [currentTrack]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      importFiles(e.dataTransfer.files);
    }
  }, [importFiles]);

  const handleBrowseFiles = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';
    input.onchange = () => {
      if (input.files?.length) importFiles(input.files);
    };
    input.click();
  }, [importFiles]);

  return (
    <div
      style={styles.container}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <style>{`
        button { font-family: inherit; transition: all 0.12s ease; }
        button:active { transform: scale(0.97); }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
      `}</style>
      {/* Drag overlay */}
      {isDragging && (
        <div style={styles.dragOverlay}>
          <div style={styles.dragOverlayInner}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 12 }}>Drop audio files here</div>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>MP3, WAV, FLAC, OGG, AAC, M4A</div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Music</span>
        </div>
        
        <div style={styles.playlistList}>
          <div style={styles.sectionLabel}>Library</div>
          {playlists.slice(0, 3).map(playlist => (
            <button
              key={playlist.id}
              style={{
                ...styles.playlistItem,
                background: selectedPlaylist === playlist.id && libraryView === 'songs' ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: selectedPlaylist === playlist.id && libraryView === 'songs' ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}
              onClick={() => { setSelectedPlaylist(playlist.id); setLibraryView('songs'); }}
              aria-label={playlist.name}
            >
              {playlist.id === 'favorites' ? Icons.heartFilled : Icons.music}
              <span style={{ flex: 1 }}>{playlist.name}</span>
              <span style={styles.playlistCount}>{playlist.tracks}</span>
            </button>
          ))}

          <div style={styles.sectionLabel}>Browse</div>
          {([
            { key: 'artists' as const, icon: 'user', label: 'Artists' },
            { key: 'albums' as const, icon: 'disc', label: 'Albums' },
            { key: 'genres' as const, icon: 'music', label: 'Genres' },
            { key: 'recent' as const, icon: 'clock', label: 'Recently Added' },
          ]).map(view => (
            <button
              key={view.key}
              style={{
                ...styles.playlistItem,
                background: libraryView === view.key ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: libraryView === view.key ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}
              onClick={() => setLibraryView(view.key)}
              aria-label={view.label}
            >
              <DexIcon name={view.icon} size={14} />
              <span style={{ flex: 1 }}>{view.label}</span>
            </button>
          ))}
          
          <div style={styles.sectionLabel}>Playlists</div>
          {playlists.slice(3).map(playlist => (
            <button
              key={playlist.id}
              style={{
                ...styles.playlistItem,
                background: selectedPlaylist === playlist.id ? 'rgba(10, 132, 255, 0.2)' : 'transparent',
                color: selectedPlaylist === playlist.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}
              onClick={() => setSelectedPlaylist(playlist.id)}
              aria-label={playlist.name}
            >
              {Icons.list}
              <span style={{ flex: 1 }}>{playlist.name}</span>
              <span style={styles.playlistCount}>{playlist.tracks}</span>
            </button>
          ))}
          
          {playlistNameDraft !== null ? (
            <input
              autoFocus
              value={playlistNameDraft}
              onChange={e => setPlaylistNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitPlaylistCreate(); if (e.key === 'Escape') setPlaylistNameDraft(null); }}
              onBlur={submitPlaylistCreate}
              placeholder="Playlist name"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-accent)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, outline: 'none' }}
            />
          ) : (
            <button style={styles.newPlaylistBtn} onClick={createPlaylist} aria-label="New Playlist">
              {Icons.plus}
              <span>New Playlist</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Library Browse Views */}
        {libraryView !== 'songs' ? (
          <div style={styles.trackList}>
            <div style={styles.trackListHeader}>
              <h2 style={styles.playlistTitle}>
                {libraryView === 'artists' ? 'Artists' : libraryView === 'albums' ? 'Albums' : libraryView === 'genres' ? 'Genres' : 'Recently Added'}
              </h2>
              <span style={styles.trackCount}>{tracks.length} songs</span>
            </div>
            <div style={styles.tracks}>
              {(() => {
                if (libraryView === 'recent') {
                  const sorted = [...tracks].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 50);
                  return sorted.map((track, i) => (
                    <div key={track.id} style={{ ...styles.trackItem, background: currentTrack?.id === track.id ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent' }} onClick={() => playTrack(track)}>
                      <span style={styles.trackNumber}>{i + 1}</span>
                      <div style={{ ...styles.trackArtwork, background: getArtworkColor(track.id) }} />
                      <div style={styles.trackInfo}>
                        <span style={{ ...styles.trackTitle, color: currentTrack?.id === track.id ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{track.title}</span>
                        <span style={styles.trackArtist}>{track.artist}</span>
                      </div>
                      <span style={styles.trackDuration}>{formatTime(track.duration)}</span>
                    </div>
                  ));
                }
                const groupKey = libraryView === 'artists' ? 'artist' : libraryView === 'albums' ? 'album' : 'artist';
                const groups: Record<string, Track[]> = {};
                tracks.forEach(t => {
                  const key = libraryView === 'genres' ? (t.album?.charAt(0)?.toUpperCase() || '#') : (t[groupKey] || 'Unknown');
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(t);
                });
                return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([group, groupTracks]) => (
                  <div key={group}>
                    <div style={{ padding: '12px 16px 6px', fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-bg-hover)' }}>{group}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '2px 16px 8px' }}>{groupTracks.length} {groupTracks.length === 1 ? 'song' : 'songs'}</div>
                    {groupTracks.map((track, i) => (
                      <div key={track.id} style={{ ...styles.trackItem, background: currentTrack?.id === track.id ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent' }} onClick={() => playTrack(track)}>
                        <span style={styles.trackNumber}>{i + 1}</span>
                        <div style={{ ...styles.trackArtwork, background: getArtworkColor(track.id) }} />
                        <div style={styles.trackInfo}>
                          <span style={{ ...styles.trackTitle, color: currentTrack?.id === track.id ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{track.title}</span>
                          {libraryView === 'artists' && <span style={styles.trackArtist}>{track.album}</span>}
                          {libraryView === 'albums' && <span style={styles.trackArtist}>{track.artist}</span>}
                          {libraryView === 'genres' && <span style={styles.trackArtist}>{track.artist} — {track.album}</span>}
                        </div>
                        <span style={styles.trackDuration}>{formatTime(track.duration)}</span>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : (
        /* Track List */
        <div style={styles.trackList}>
          <div style={styles.trackListHeader}>
            <h2 style={styles.playlistTitle}>
              {playlists.find(p => p.id === selectedPlaylist)?.name ?? 'All Songs'}
            </h2>
            <span style={styles.trackCount}>{filteredTracks.length} songs</span>
          </div>
          
          <div style={styles.tracks}>
            {isLoading ? (
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.06}s` }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--color-bg-hover)', flexShrink: 0 }} />
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--color-bg-hover)', flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                      <div style={{ width: '50%', height: 10, borderRadius: 3, background: 'var(--color-border-subtle)' }} />
                      <div style={{ width: '30%', height: 8, borderRadius: 3, background: 'var(--color-border-subtle)' }} />
                    </div>
                    <div style={{ width: 40, height: 10, borderRadius: 3, background: 'var(--color-border-subtle)' }} />
                  </div>
                ))}
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
              </div>
            ) : filteredTracks.length === 0 ? (
              <div style={styles.dropZone} onClick={handleBrowseFiles} role="button" tabIndex={0} aria-label="Drop audio files or click to browse">
                <div style={styles.dropZoneIcon}>
                  <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                </div>
                <div style={styles.dropZoneTitle}>
                  {selectedPlaylist === 'favorites' ? 'No favorites yet' : 'Drop audio files here'}
                </div>
                <div style={styles.dropZoneSubtitle}>
                  {selectedPlaylist === 'favorites'
                    ? 'Heart songs to add them to favorites'
                    : 'or click to browse — MP3, WAV, FLAC, OGG, AAC, M4A'}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleBrowseFiles(); }} aria-label="Browse for audio files" style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Browse Files</button>
                <div style={styles.dropZoneBorder} />
              </div>
            ) : filteredTracks.map((track, index) => (
              <div
                key={track.id}
                style={{
                  ...styles.trackItem,
                  background: currentTrack?.id === track.id ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
                }}
                onClick={() => playTrack(track)}
                onDoubleClick={(e) => { e.stopPropagation(); openMetadataEditor(track); }}
                onContextMenu={e => showCtx(e, buildTrackCtxItems(track))}
              >
                <span style={styles.trackNumber}>{index + 1}</span>
                <div style={{...styles.trackArtwork, background: getArtworkColor(track.id)}}>
                  {currentTrack?.id === track.id && isPlaying && (
                    <span style={styles.nowPlayingIcon}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </span>
                  )}
                </div>
                <div style={styles.trackInfo}>
                  <span style={{
                    ...styles.trackTitle,
                    color: currentTrack?.id === track.id ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  }}>
                    {track.title}
                  </span>
                  <span style={styles.trackArtist}>{track.artist}</span>
                </div>
                <span style={styles.trackAlbum}>{track.album}</span>
                <button
                  style={styles.favBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(track.id);
                  }}
                  aria-label={favorites.includes(track.id) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  {favorites.includes(track.id) ? Icons.heartFilled : Icons.heart}
                </button>
                <button
                  style={{...styles.favBtn, color: 'var(--color-warning)', opacity: 0.7}}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendToApp({ name: track.title, kind: 'audio', data: track.url || track.id, sourceApp: 'audio' }, 'imosion');
                    const def = APP_DEFINITIONS['imosion'];
                    launchApp({ id: 'imosion', name: def.name, icon: def.icon, color: def.color });
                  }}
                  aria-label="Open in Imosion"
                  title="Open in Imosion"
                >
                  <DexIcon name="film" size={14} />
                </button>
                <span style={styles.trackDuration}>{formatTime(track.duration)}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Pro Features Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px 12px', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-solid)', flexWrap: 'wrap' }}>
          {[
            { label: 'Equalizer', fn: () => setShowEqualizer(v => !v), active: showEqualizer },
            { label: 'Queue', fn: () => setShowQueue(v => !v), active: showQueue },
            { label: 'Mini Player', fn: () => setShowMiniPlayer(v => !v), active: showMiniPlayer },
            { label: 'Visualizer', fn: () => setShowVisualizer(v => !v), active: showVisualizer },
            { label: 'Crossfade', fn: () => setShowCrossfadeSettings(v => !v), active: showCrossfadeSettings },
          ].map(b => (
            <button key={b.label} onClick={b.fn} aria-label={`${b.active ? 'Hide' : 'Show'} ${b.label}`} aria-pressed={b.active} style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid ' + (b.active ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border-subtle)'), background: b.active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-border-subtle)', color: b.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3 }}>{b.label}</button>
          ))}
          {/* Sleep Timer */}
          <select
            value={sleepTimer}
            onChange={e => startSleepTimer(Number(e.target.value))}
            aria-label="Sleep timer"
            style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid ' + (sleepTimer > 0 ? 'color-mix(in srgb, var(--color-accent) 30%, transparent)' : 'var(--color-border-subtle)'), background: sleepTimer > 0 ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-border-subtle)', color: sleepTimer > 0 ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            <option value={0}>{sleepRemaining > 0 ? `${Math.ceil(sleepRemaining / 60)}m left` : 'Sleep Timer'}</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
          </select>
        </div>

        {/* ===== PRO FLOATING PANELS ===== */}

        {/* 10-Band Equalizer */}
        {showEqualizer && (
          <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', bottom: 120, transform: 'translateX(-50%)', width: 400, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Equalizer</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowEqualizer(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                {[{ name: 'Flat', vals: [0,0,0,0,0,0,0,0,0,0] }, { name: 'Bass Boost', vals: [6,5,4,2,0,0,0,0,0,0] }, { name: 'Treble', vals: [0,0,0,0,0,1,3,4,5,6] }, { name: 'Rock', vals: [4,3,0,-2,0,2,4,5,5,4] }, { name: 'Pop', vals: [-1,0,2,4,5,4,2,0,-1,-2] }, { name: 'Jazz', vals: [3,2,0,1,2,2,3,4,4,3] }].map(p => (
                  <button key={p.name} onClick={() => { setEqBands(p.vals); setEqPreset(p.name.toLowerCase()); }} aria-label={`Select ${p.name} preset`} aria-pressed={eqPreset === p.name.toLowerCase()} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: eqPreset === p.name.toLowerCase() ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: eqPreset === p.name.toLowerCase() ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{p.name}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120, padding: '0 4px' }}>
                {['32', '64', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'].map((freq, i) => (
                  <div key={freq} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <input type="range" min="-12" max="12" value={eqBands[i]} onChange={e => setEqBands(b => b.map((v, j) => j === i ? Number(e.target.value) : v))} style={{ width: 80, height: 6, accentColor: 'var(--color-accent)', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
                    <span style={{ fontSize: 7, color: 'var(--color-text-tertiary)', marginTop: 30 }}>{freq}</span>
                    <span style={{ fontSize: 7, color: eqBands[i] > 0 ? 'var(--color-success)' : eqBands[i] < 0 ? 'var(--color-error)' : 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{eqBands[i] > 0 ? '+' : ''}{eqBands[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Queue Management */}
        {showQueue && (
          <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, top: 60, width: 280, maxHeight: 400, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Up Next</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setQueue([])} aria-label="Clear queue" style={{ background: 'none', border: '1px solid var(--color-bg-hover)', borderRadius: 6, color: 'var(--color-text-tertiary)', fontSize: 8, padding: '2px 6px', cursor: 'pointer' }}>Clear</button>
                <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowQueue(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {queue.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Queue is empty</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>Songs will appear here</div>
                </div>
              ) : queue.map((t, i) => (
                <div key={t.id + i} draggable onDragStart={() => setQueueDragIdx(i)} onDragOver={(e) => { e.preventDefault(); setQueueOverIdx(i); }} onDragEnd={() => { if (queueDragIdx !== null && queueOverIdx !== null && queueDragIdx !== queueOverIdx) { setQueue(prev => { const next = [...prev]; const [moved] = next.splice(queueDragIdx, 1); next.splice(queueOverIdx, 0, moved); return next; }); } setQueueDragIdx(null); setQueueOverIdx(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 5, marginBottom: 1, cursor: 'grab', background: queueOverIdx === i ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent', opacity: queueDragIdx === i ? 0.4 : 1, transition: 'background 0.15s, opacity 0.15s' }}>
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', width: 14, textAlign: 'center' }}>{i + 1}</span>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--color-bg-hover)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>{t.title}</div>
                    <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)' }}>{t.artist}</div>
                  </div>
                  <button onClick={() => setQueue(q => q.filter((_, j) => j !== i))} aria-label={`Remove ${t.title} from queue`} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 10 }}><DexIcon name="close" size={10} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mini Player */}
        {showMiniPlayer && currentTrack && (
          <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", right: 20, bottom: 80, width: 260, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-popover)', zIndex: 'var(--z-modal)' }}>
            <div style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--color-bg-hover)', flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTrack.title}</div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{currentTrack.artist}</div>
              </div>
              <button onClick={() => setShowMiniPlayer(false)} aria-label="Close mini player" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 12 }}><DexIcon name="close" size={12} /></button>
            </div>
            <div style={{ padding: '0 12px 6px', display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{ flex: 1, height: 3, background: 'var(--color-bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--color-accent)', borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ padding: '0 12px 10px', display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={skipToPrev} aria-label="Previous track" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{Icons.skipBack}</button>
              <button onClick={togglePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'} style={{ background: 'none', border: 'none', color: 'var(--color-text-primary)', cursor: 'pointer' }}>{isPlaying ? Icons.pause : Icons.play}</button>
              <button onClick={skipToNext} aria-label="Next track" style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{Icons.skipForward}</button>
            </div>
          </div>
        )}

        {/* Audio Visualizer */}
        {showVisualizer && (
          <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', top: 100, transform: 'translateX(-50)', width: 380, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Visualizer</span>
                {(['bars', 'wave', 'spectrum'] as const).map(m => (
                  <button key={m} onClick={() => setVizMode(m)} aria-label={`Visualizer mode: ${m}`} aria-pressed={vizMode === m} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-bg-hover)', background: vizMode === m ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'var(--color-border-subtle)', color: vizMode === m ? 'var(--color-accent)' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{m}</button>
                ))}
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowVisualizer(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ height: 160, padding: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: vizMode === 'bars' ? 2 : 0 }}>
              <canvas ref={vizCanvasRef} width={356} height={140} style={{ width: '100%', height: 140, borderRadius: 6 }} />
            </div>
          </div>
        )}

        {/* Crossfade Settings */}
        {showCrossfadeSettings && (
          <div style={{ position: 'fixed', animation: "dex-panel-in 200ms ease-out", left: '50%', bottom: 160, transform: 'translateX(-50%)', width: 280, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--pg-shadow-modal)', zIndex: 'var(--z-modal)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Crossfade</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowCrossfadeSettings(false)} aria-label="Close" title="Close"><DexIcon name="close" size={14} /></button>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ height: 60, background: 'var(--color-border-subtle)', borderRadius: 8, border: '1px solid var(--color-bg-hover)', marginBottom: 10, padding: 8, position: 'relative' }}>
                <svg width="100%" height="44" viewBox="0 0 252 44">
                  <path d={`M0 4 L${126 - crossfadeDuration * 10} 4 Q126 4 ${126 + crossfadeDuration * 10} 40`} fill="none" stroke="var(--color-accent)" strokeWidth="2" opacity="0.7"/>
                  <path d={`M${126 - crossfadeDuration * 10} 40 Q126 40 ${126 + crossfadeDuration * 10} 4 L252 4`} fill="none" stroke="var(--color-success)" strokeWidth="2" opacity="0.7"/>
                  <line x1="126" y1="0" x2="126" y2="44" stroke="var(--color-text-muted)" strokeWidth="0.5" strokeDasharray="2,2"/>
                </svg>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>Duration</span>
                <span style={{ fontSize: 9, color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>{crossfadeDuration}s</span>
              </div>
              <input type="range" min="0" max="12" value={crossfadeDuration} onChange={e => setCrossfadeDuration(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)', marginBottom: 6 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--color-text-tertiary)' }}>
                <span>Off</span><span>12s</span>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Gapless Playback</span>
                <button
                  onClick={() => setGaplessMode(!gaplessMode)}
                  aria-label={gaplessMode ? 'Disable gapless playback' : 'Enable gapless playback'}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: gaplessMode ? 'var(--color-success)' : 'var(--color-border)',
                    position: 'relative', transition: 'background 0.2s ease', padding: 0,
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: 'var(--color-bg-surface)',
                    position: 'absolute', top: 2, left: gaplessMode ? 18 : 2,
                    transition: 'left 0.2s ease', boxShadow: 'var(--pg-shadow-chip)',
                  }} />
                </button>
              </div>
              {gaplessMode && (
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                  Pre-buffers next track for seamless transitions. Crossfade disabled when active.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Metadata Editor */}
        {editingTrack && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={() => setEditingTrack(null)}>
            <div style={{ width: 340, background: 'var(--color-bg-elevated)', borderRadius: 12, border: '1px solid var(--color-border)', boxShadow: 'var(--pg-shadow-modal)', animation: 'dex-panel-in 200ms ease-out' }} onMouseDown={e => e.stopPropagation()}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Edit Track Info</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16 }} onClick={() => setEditingTrack(null)} aria-label="Close"><DexIcon name="close" size={14} /></button>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ width: 80, height: 80, borderRadius: 8, background: editingTrack.artwork ? 'transparent' : getArtworkColor(editingTrack.id), margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {editingTrack.artwork ? (
                    <img src={editingTrack.artwork} alt="Album art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                  )}
                </div>
                {(['title', 'artist', 'album', 'genre', 'year', 'composer'] as const).map(field => (
                  <div key={field}>
                    <label style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{field}</label>
                    <input
                      type="text"
                      value={editMeta[field]}
                      onChange={e => setEditMeta(prev => ({ ...prev, [field]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)', color: '#fff', fontSize: 13, outline: 'none', marginTop: 3 }}
                    />
                  </div>
                ))}
                <button onClick={saveMetadata} style={{ marginTop: 4, padding: '8px 0', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* Now Playing Bar */}
        {currentTrack && (
        <div style={styles.nowPlaying}>
          <div style={styles.nowPlayingLeft}>
            <div style={{...styles.nowPlayingArtwork, background: currentTrack.artwork ? 'transparent' : getArtworkColor(currentTrack.id), overflow: 'hidden'}}>
              {currentTrack.artwork && <img src={currentTrack.artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={styles.nowPlayingInfo}>
              <span style={styles.nowPlayingTitle}>{currentTrack.title}</span>
              <span style={styles.nowPlayingArtist}>{currentTrack.artist}</span>
            </div>
            <button
              style={{...styles.controlBtn, color: favorites.includes(currentTrack.id) ? 'var(--color-error)' : 'var(--color-text-secondary)'}}
              onClick={() => toggleFavorite(currentTrack.id)}
              aria-label={favorites.includes(currentTrack.id) ? 'Remove from favorites' : 'Add to favorites'}
            >
              {favorites.includes(currentTrack.id) ? Icons.heartFilled : Icons.heart}
            </button>
          </div>
          
          <div style={styles.nowPlayingCenter}>
            <div style={styles.controls}>
              <button
                style={{...styles.controlBtn, color: shuffle ? 'var(--color-accent)' : 'var(--color-text-secondary)'}}
                onClick={() => setShuffle(!shuffle)}
                aria-label="Shuffle"
              >
                {Icons.shuffle}
              </button>
              <button style={styles.controlBtn} onClick={skipToPrev} aria-label="Previous track">{Icons.skipBack}</button>
              <button
                style={styles.playBtn}
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? Icons.pause : Icons.play}
              </button>
              <button style={styles.controlBtn} onClick={skipToNext} aria-label="Next track">{Icons.skipForward}</button>
              <button
                style={{...styles.controlBtn, color: repeat ? 'var(--color-accent)' : 'var(--color-text-secondary)'}}
                onClick={() => setRepeat(!repeat)}
                aria-label="Repeat"
              >
                {Icons.repeat}
              </button>
            </div>
            
            <div style={styles.progressSection}>
              <span style={styles.progressTime}>{formatTime(Math.floor(currentTime))}</span>
              <div style={styles.progressBar}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 4, background: 'var(--color-border)', borderRadius: 2, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: `${progress}%`, ...styles.progressFill }} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(e) => seekTo(parseInt(e.target.value))}
                  style={styles.progressInput}
                />
              </div>
              <span style={styles.progressTime}>{formatTime(Math.floor(duration || currentTrack.duration))}</span>
            </div>
          </div>
          
          <div style={styles.nowPlayingRight}>
            <button
              onClick={() => setVolume(v => v > 0 ? 0 : 80)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
              aria-label={volume === 0 ? 'Unmute' : 'Mute'}
            >
              {volume === 0 ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              ) : Icons.volume}
            </button>
            <div style={styles.volumeBar}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 4, background: 'var(--color-border)', borderRadius: 2, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: `${volume}%`, ...styles.volumeFill, background: 'var(--color-accent, #0a84ff)' }} />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                style={styles.volumeInput}
                aria-label="Volume"
              />
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', minWidth: 24, textAlign: 'right' }}>{volume}%</span>
          </div>
        </div>
        )}
      </div>
      {menuState && <ContextMenu items={menuState.items} position={menuState.position} onClose={closeCtx} />}
    </div>
  );
};

// ===========================================================================
// STYLES
// ===========================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    background: 'var(--pg-surface)',
    backdropFilter: 'var(--blur-xl) saturate(180%)',
    WebkitBackdropFilter: 'var(--blur-xl) saturate(180%)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    overflow: 'hidden',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: 'var(--pg-sidebar-width)',
    background: 'var(--pg-sidebar)',
    borderRight: '1px solid var(--pg-border)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  sidebarHeader: {
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 14px',
    borderBottom: '1px solid var(--pg-border)',
  },
  sidebarTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  playlistList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  sectionLabel: {
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    padding: '12px 10px 4px',
    letterSpacing: '0.8px',
  },
  playlistItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    width: '100%',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  playlistCount: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  newPlaylistBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '13px',
    width: '100%',
    marginTop: '8px',
    transition: 'all 0.15s ease',
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  
  // Track List
  trackList: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  trackListHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  playlistTitle: {
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  trackCount: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  tracks: {
    flex: 1,
    overflow: 'auto',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    color: 'var(--color-text-muted)',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  emptySubtitle: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
  // Drag overlay
  dragOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 'var(--z-max)',
    background: 'var(--color-bg-elevated)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  dragOverlayInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: 48,
    borderRadius: 20,
    border: '2px dashed color-mix(in srgb, var(--color-accent) 60%, transparent)',
    background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
  },
  // Large drop zone (empty state replacement)
  dropZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: '360px',
    margin: '24px',
    borderRadius: '16px',
    border: '2px dashed var(--color-border)',
    background: 'var(--color-bg-secondary)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
  },
  dropZoneIcon: {
    color: 'var(--color-text-muted)',
    marginBottom: '16px',
    opacity: 0.6,
  },
  dropZoneTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: '8px',
  },
  dropZoneSubtitle: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    maxWidth: '320px',
  },
  dropZoneBorder: {
    position: 'absolute',
    inset: 0,
    borderRadius: '16px',
    pointerEvents: 'none',
  },
  trackItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '10px 24px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-subtle)',
    transition: 'all 0.15s ease',
  },
  trackNumber: {
    width: '24px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
  },
  trackArtwork: {
    width: '40px',
    height: '40px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingIcon: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '2px',
  },
  trackArtist: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  trackAlbum: {
    width: '180px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  favBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
  },
  trackDuration: {
    width: '50px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    textAlign: 'right',
  },
  
  // Now Playing - Tahoe Glass Bar
  nowPlaying: {
    height: '90px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '20px',
    background: 'var(--color-bg-surface-solid)',
    borderTop: '1px solid var(--color-border-subtle)',
  },
  nowPlayingLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '250px',
  },
  nowPlayingArtwork: {
    width: '56px',
    height: '56px',
    borderRadius: '8px',
  },
  nowPlayingInfo: {
    flex: 1,
    minWidth: 0,
  },
  nowPlayingTitle: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '2px',
  },
  nowPlayingArtist: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  nowPlayingCenter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  playBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--color-accent)',
    color: 'var(--color-text-on-accent, #fff)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 2px 12px color-mix(in srgb, var(--color-accent) 30%, transparent)',
  },
  progressSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    maxWidth: '500px',
  },
  progressTime: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    width: '40px',
  },
  progressBar: {
    flex: 1,
    height: '16px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  progressFill: {
    height: '4px',
    background: 'var(--color-text-primary)',
    borderRadius: '2px',
    willChange: 'width',
    transition: 'width 0.1s linear',
    pointerEvents: 'none',
  },
  progressInput: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    margin: 0,
  },
  nowPlayingRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '150px',
    color: 'var(--color-text-muted)',
  },
  volumeBar: {
    flex: 1,
    height: '16px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  volumeFill: {
    height: '4px',
    background: 'var(--color-text-secondary)',
    borderRadius: '2px',
    willChange: 'width',
    pointerEvents: 'none',
  },
  volumeInput: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    margin: 0,
  },
};

Audio.displayName = 'Audio';
export default memo(Audio);

