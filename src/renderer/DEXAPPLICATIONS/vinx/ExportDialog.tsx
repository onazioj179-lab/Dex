// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Export System
 * Modal dialog with 9 presets, custom settings, queue, progress.
 */

import React, { useCallback, useState, memo, useMemo, useRef, useEffect } from 'react';
import { useVinxStore } from './VinxStore';
import type { ExportSettings, ExportJob, ExportPreset } from './VinxTypes';
import { EXPORT_PRESETS, generateId, formatTimecode } from './VinxTypes';
import { getDiskInfo } from '../../utils/nativeBridge';
import { planExport } from '../../../shared/video/pipeline';
import { isNativeOnlyFormat } from './quickExport';
import DexIcon from '../../components/DexIcon';

// Track active export intervals for cleanup
interface ActiveExport {
  intervalId: ReturnType<typeof setInterval>;
  recorder: MediaRecorder;
  stream: MediaStream;
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'var(--color-bg-overlay, rgba(0,0,0,0.7))',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  width: 'min(560px, calc(100vw - 32px))', maxHeight: 'min(80vh, calc(100vh - 32px))', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-subtle)', borderRadius: 6,
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--color-bg-hover)', flexShrink: 0,
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-4) 4px', fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const presetGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, padding: '0 var(--space-4) var(--space-2)',
};

const presetCardStyle = (selected: boolean): React.CSSProperties => ({
  padding: 'var(--space-2)', borderRadius: 3, cursor: 'pointer',
  border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-bg-hover)'}`,
  background: selected ? 'rgba(74,158,255,0.08)' : 'var(--color-border-subtle)',
});

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px var(--space-4)', minHeight: 28,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--color-text-tertiary)', width: 80, flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1, height: 24, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)',
  borderRadius: 2, padding: '0 6px', fontSize: 11, color: 'var(--color-text-primary)', outline: 'none',
  fontFamily: 'inherit', minWidth: 0,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none', cursor: 'pointer',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'5\' viewBox=\'0 0 8 5\'%3E%3Cpath fill=\'%235A5A5A\' d=\'M0 0l4 5 4-5z\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
  paddingRight: 'var(--space-5)',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '6px var(--space-5)', fontSize: 11, fontWeight: 600, border: 'none',
  borderRadius: 9999, background: 'var(--color-accent)', color: '#000000', cursor: 'pointer',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '6px var(--space-4)', fontSize: 11, fontWeight: 600, borderRadius: 9999,
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
};

const jobRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px var(--space-4)',
  borderBottom: '1px solid var(--color-border-subtle)',
};

// ---------------------------------------------------------------------------
// EXPORT DIALOG
// ---------------------------------------------------------------------------

export const ExportDialog: React.FC = memo(() => {
  const showExportDialog = useVinxStore(s => s.showExportDialog);
  const setShowExportDialog = useVinxStore(s => s.setShowExportDialog);
  const addExportJob = useVinxStore(s => s.addExportJob);
  const exportJobs = useVinxStore(s => s.exportJobs);
  const updateExportJob = useVinxStore(s => s.updateExportJob);
  const removeExportJob = useVinxStore(s => s.removeExportJob);
  const frameRate = useVinxStore(s => s.project.frameRate);
  const projectWidth = useVinxStore(s => s.project.width);
  const projectHeight = useVinxStore(s => s.project.height);
  const projectMarkers = useVinxStore(s => s.project.markers);
  const duration = useVinxStore(s => s.getSequenceDuration());

  // Track active exports for cleanup on unmount
  const activeExportsRef = useRef<Map<string, ActiveExport>>(new Map());

  // Cleanup all active exports on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      activeExportsRef.current.forEach(({ intervalId, recorder, stream }) => {
        clearInterval(intervalId);
        if (recorder.state === 'recording') {
          try { recorder.stop(); } catch { /* already stopped */ }
        }
        stream.getTracks().forEach(t => t.stop());
      });
      activeExportsRef.current.clear();
    };
  }, []);

  const [selectedPresetId, setSelectedPresetId] = useState(EXPORT_PRESETS[0].id);
  const [customMode, setCustomMode] = useState(false);
  const [settings, setSettings] = useState<ExportSettings>(() => ({
    ...EXPORT_PRESETS[0].settings,
  }));
  const [outputName, setOutputName] = useState('export');
  const [diskFreeGB, setDiskFreeGB] = useState<number | null>(null);
  const [emitCaptions, setEmitCaptions] = useState(false);

  // Refresh free disk space whenever the dialog is opened so users can spot a
  // tight target before queuing a render. Falls back silently if native is unavailable.
  useEffect(() => {
    if (!showExportDialog) return;
    let cancelled = false;
    (async () => {
      try {
        const disks = await getDiskInfo();
        if (cancelled || !Array.isArray(disks) || disks.length === 0) return;
        // Pick the disk with the most free space (typically the user's primary working drive).
        const largest = disks.reduce((best: any, d: any) => {
          const free = Number(d?.available ?? d?.free ?? 0);
          const bestFree = Number(best?.available ?? best?.free ?? 0);
          return free > bestFree ? d : best;
        }, disks[0]);
        const freeBytes = Number(largest?.available ?? largest?.free ?? 0);
        if (freeBytes > 0) setDiskFreeGB(freeBytes / (1024 ** 3));
      } catch { /* native unavailable -- hide indicator */ }
    })();
    return () => { cancelled = true; };
  }, [showExportDialog]);

  const selectedPreset = useMemo(() =>
    EXPORT_PRESETS.find(p => p.id === selectedPresetId),
    [selectedPresetId]
  );

  const handlePresetSelect = useCallback((preset: ExportPreset) => {
    setSelectedPresetId(preset.id);
    setSettings({ ...preset.settings });
    setCustomMode(false);
  }, []);

  const handleExport = useCallback(() => {
    const isAudioOnly = settings.format === 'mp3' || settings.format === 'wav' || settings.format === 'flac';

    // Honest guard: codecs/containers the browser MediaRecorder cannot produce
    // (ProRes, H.265/HEVC, DNxHD, AV1, MXF, etc.) require the native encoder.
    // Do NOT fake a completed render for these — queue a failed job with a clear
    // note and point the user at the working WebM path.
    if (!isAudioOnly && isNativeOnlyFormat(String(settings.format))) {
      const failJob: ExportJob = {
        id: generateId('export'),
        projectId: '',
        settings: { ...settings },
        outputPath: `${outputName}.${settings.format}`,
        filename: outputName,
        status: 'failed',
        progress: 0,
        encodingFps: 0,
        startTime: null,
        endTime: null,
        error: `${String(settings.format).toUpperCase()} needs the native encoder (not bundled). Use WebM or MP4 for an in-app render.`,
      };
      addExportJob(failJob);
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `${String(settings.format).toUpperCase()} requires the native encoder — choose WebM/MP4 for an in-app render` } }));
      return;
    }

    const ext = isAudioOnly ? settings.format : 'webm';

    // ROADMAP-600 #571-572: plan the export through the shared video pipeline.
    // `settings.format` is a codec/format string (h264/h265/prores…/webm via the
    // select cast); derive a pipeline codec + container from it.
    const fmt = String(settings.format);
    const videoCodec = (fmt === 'webm' ? 'vp9'
      : fmt === 'h265' ? 'h265'
      : (fmt === 'prores422' || fmt === 'prores4444' || fmt === 'mov') ? 'prores'
      : fmt === 'dnxhd' ? 'dnxhd'
      : 'h264') as 'vp9' | 'h265' | 'prores' | 'dnxhd' | 'h264';
    const container = (videoCodec === 'vp9' ? 'webm'
      : (videoCodec === 'prores' || videoCodec === 'dnxhd') ? 'mov'
      : 'mp4') as 'webm' | 'mov' | 'mp4';
    const planFps = settings.frameRate || frameRate || 30;
    const planTotalFrames = duration || 1;
    const exportPlan = planExport(planTotalFrames, {
      container,
      videoCodec,
      width: settings.width || projectWidth || 1920,
      height: settings.height || projectHeight || 1080,
      fps: planFps,
      bitrateKbps: (settings.bitrateMbps || 8) * 1000,
      audio: { codec: isAudioOnly ? 'pcm' : 'opus', sampleRate: 48000, channels: 2 },
    });
    // Native containers (MP4/MOV) fall back to the in-app WebM encoder.
    const isVideoFormat = exportPlan.engine === 'native';
    const job: ExportJob = {
      id: generateId('export'),
      projectId: '',
      settings: { ...settings },
      outputPath: `${outputName}.${ext}`,
      filename: outputName,
      status: 'queued',
      progress: 0,
      encodingFps: 0,
      startTime: null,
      endTime: null,
      error: null,
    };
    addExportJob(job);
    if (isVideoFormat) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { message: `Note: ${settings.format.toUpperCase()} requested (exported as WebM — browser-native codec)`, type: 'info' } }));
    }

    // Optional WebVTT sidecar from chapter/standard markers
    if (emitCaptions && projectMarkers.length > 0) {
      try {
        const fps = settings.frameRate || frameRate || 30;
        const totalFr = duration || 1;
        const fmt = (frame: number) => {
          const s = Math.max(0, frame) / fps;
          const hh = Math.floor(s / 3600);
          const mm = Math.floor((s % 3600) / 60);
          const ss = s % 60;
          const sec = Math.floor(ss);
          const ms = Math.round((ss - sec) * 1000);
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
        };
        const sorted = [...projectMarkers].sort((a, b) => a.frame - b.frame);
        const lines: string[] = ['WEBVTT', ''];
        sorted.forEach((m, i) => {
          const startFr = m.frame;
          const endFr = m.duration && m.duration > 0
            ? m.frame + m.duration
            : (sorted[i + 1]?.frame ?? totalFr);
          const label = (m.name || `Marker ${i + 1}`).replace(/-->/g, '--&gt;');
          lines.push(`${i + 1}`);
          lines.push(`${fmt(startFr)} --> ${fmt(Math.max(endFr, startFr + 1))}`);
          lines.push(label);
          lines.push('');
        });
        const vtt = lines.join('\n');
        const vttBlob = new Blob([vtt], { type: 'text/vtt' });
        const vttUrl = URL.createObjectURL(vttBlob);
        const vttLink = document.createElement('a');
        vttLink.href = vttUrl;
        vttLink.download = `${outputName}.vtt`;
        vttLink.click();
        URL.revokeObjectURL(vttUrl);
      } catch (err) {
        console.warn('[Vinx] VTT sidecar emit failed:', err);
      }
    }

    // Real export: capture the program viewer canvas via MediaRecorder
    const programCanvas = document.querySelector('[data-vinx-program-canvas] canvas, [data-vinx-program-canvas] video') as HTMLCanvasElement | HTMLVideoElement | null;
    const targetFps = planFps;
    const totalFrames = planTotalFrames;

    // Create an offscreen canvas to composite the output
    const offscreen = document.createElement('canvas');
    offscreen.width = settings.width || projectWidth || 1920;
    offscreen.height = settings.height || projectHeight || 1080;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      updateExportJob(job.id, { status: 'failed', error: 'Cannot create rendering context' });
      return;
    }

    // Set up MediaRecorder capture from the offscreen canvas
    const stream = (offscreen as any).captureStream(targetFps) as MediaStream;
    const planMime = (exportPlan.mimeType || 'video/webm;codecs=vp9').split(',')[0];
    const mimeType = MediaRecorder.isTypeSupported(planMime)
      ? planMime
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';
    const bitrate = exportPlan.bitrateKbps * 1000;
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      // Remove from active exports tracking
      activeExportsRef.current.delete(job.id);
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${outputName}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      updateExportJob(job.id, { status: 'complete', progress: 100, endTime: Date.now() });
    };
    recorder.onerror = () => {
      // Remove from active exports tracking on error
      activeExportsRef.current.delete(job.id);
      updateExportJob(job.id, { status: 'failed', error: 'MediaRecorder encoding failed' });
    };

    // Start recording and render frames at the target FPS
    recorder.start();
    updateExportJob(job.id, { status: 'encoding', startTime: Date.now(), progress: 0 });
    let frame = 0;
    const intervalMs = 1000 / targetFps;

    const renderInterval = setInterval(() => {
      // Composite current viewer content into offscreen canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      if (programCanvas) {
        try {
          ctx.drawImage(programCanvas, 0, 0, offscreen.width, offscreen.height);
        } catch { /* cross-origin or detached */ }
      }
      frame++;
      const progress = Math.min(99, Math.round((frame / totalFrames) * 100));
      updateExportJob(job.id, { progress, encodingFps: Math.round(1000 / intervalMs) });

      if (frame >= totalFrames) {
        clearInterval(renderInterval);
        activeExportsRef.current.delete(job.id);
        recorder.stop();
      }
    }, intervalMs);

    // Track this export for cleanup on unmount
    activeExportsRef.current.set(job.id, { intervalId: renderInterval, recorder, stream });
  }, [settings, outputName, addExportJob, updateExportJob, frameRate, duration, projectWidth, projectHeight, emitCaptions, projectMarkers]);

  if (!showExportDialog) return null;

  return (
    <div style={overlayStyle} onMouseDown={() => setShowExportDialog(false)}>
      <div style={dialogStyle} onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Export</span>
          <button
            aria-label="Close Export dialog"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 4, display: 'flex', alignItems: 'center' }}
            onClick={() => setShowExportDialog(false)}
          >
            <DexIcon name="close" size={14} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {/* Presets */}
          <div style={sectionHeaderStyle}>Presets</div>
          <div style={presetGridStyle}>
            {EXPORT_PRESETS.map(preset => (
              <div
                key={preset.id}
                style={presetCardStyle(preset.id === selectedPresetId)}
                onClick={() => handlePresetSelect(preset)}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{preset.name}</div>
                <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                  {preset.settings.width > 0 && `${preset.settings.width}x${preset.settings.height}`}
                  {preset.settings.bitrateMbps > 0 && ` / ${preset.settings.bitrateMbps}Mbps`}
                </div>
              </div>
            ))}
          </div>

          {/* Custom toggle */}
          <div style={{ padding: '4px var(--space-4)' }}>
            <button
              aria-label={customMode ? 'Disable custom settings' : 'Enable custom settings'}
              style={{
                ...btnSecondaryStyle,
                background: customMode ? 'rgba(74,158,255,0.08)' : 'transparent',
                color: customMode ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              }}
              onClick={() => setCustomMode(!customMode)}
            >
              Custom Settings
            </button>
          </div>

          {/* Custom settings */}
          {customMode && (
            <>
              <div style={sectionHeaderStyle}>Video</div>
              <div style={rowStyle}>
                <span style={labelStyle}>Format</span>
                <select style={selectStyle} value={settings.format} onChange={e => setSettings(s => ({ ...s, format: e.target.value as any }))}>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="mov">MOV</option>
                  <option value="mp3">Audio Only (MP3)</option>
                </select>
              </div>
              {settings.format !== 'mp3' && settings.format !== 'wav' && settings.format !== 'flac' && (
                <>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Resolution</span>
                    <input type="number" style={{ ...inputStyle, width: 60, flex: 'none' }}
                      value={settings.width} onChange={e => setSettings(s => ({ ...s, width: parseInt(e.target.value) || 0 }))} />
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>x</span>
                    <input type="number" style={{ ...inputStyle, width: 60, flex: 'none' }}
                      value={settings.height} onChange={e => setSettings(s => ({ ...s, height: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Frame Rate</span>
                    <select style={selectStyle} value={settings.frameRate} onChange={e => setSettings(s => ({ ...s, frameRate: parseFloat(e.target.value) }))}>
                      <option value="23.976">23.976</option>
                      <option value="24">24</option>
                      <option value="25">25</option>
                      <option value="29.97">29.97</option>
                      <option value="30">30</option>
                      <option value="50">50</option>
                      <option value="59.94">59.94</option>
                      <option value="60">60</option>
                    </select>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Bitrate (Mbps)</span>
                    <input type="number" style={inputStyle} value={settings.bitrateMbps}
                      onChange={e => setSettings(s => ({ ...s, bitrateMbps: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </>
              )}

              <div style={sectionHeaderStyle}>Audio</div>
              <div style={rowStyle}>
                <span style={labelStyle}>Codec</span>
                <select style={selectStyle} value={settings.audioCodec} onChange={e => setSettings(s => ({ ...s, audioCodec: e.target.value as any }))}>
                  <option value="aac">AAC</option>
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                  <option value="flac">FLAC</option>
                </select>
              </div>
              <div style={rowStyle}>
                <span style={labelStyle}>Bitrate (kbps)</span>
                <input type="number" style={inputStyle} value={settings.audioBitrate}
                  onChange={e => setSettings(s => ({ ...s, audioBitrate: parseInt(e.target.value) || 128 }))} />
              </div>
            </>
          )}

          {/* Output name */}
          <div style={sectionHeaderStyle}>Output</div>
          <div style={rowStyle}>
            <span style={labelStyle}>Filename</span>
            <input style={inputStyle} value={outputName} onChange={e => setOutputName(e.target.value)} />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Captions sidecar</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={emitCaptions}
                onChange={e => setEmitCaptions(e.target.checked)}
                aria-label="Export captions sidecar as WebVTT"
              />
              Export markers as .vtt {projectMarkers.length === 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>(no markers)</span>}
            </label>
          </div>
          <div style={{ padding: '0 var(--space-4)', fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            Duration: {formatTimecode(duration, frameRate)} / {duration} frames
            {diskFreeGB != null && (
              <span style={{ marginLeft: 'var(--space-3)', color: diskFreeGB < 2 ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}>
                &middot; Free disk: {diskFreeGB.toFixed(1)} GB
              </span>
            )}
          </div>

          {/* Queue */}
          {exportJobs.length > 0 && (
            <>
              <div style={sectionHeaderStyle}>Queue</div>
              {exportJobs.map(job => (
                <div key={job.id} style={jobRowStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>{job.outputPath}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{job.status}</div>
                  </div>
                  {(job.status === 'encoding' || job.status === 'queued') && (
                    <div style={{ width: 80 }}>
                      <div style={{
                        height: 4, borderRadius: 2, background: 'var(--color-bg-hover)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${job.progress}%`,
                          background: 'var(--color-accent)', borderRadius: 2,
                        }} />
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                        {job.progress}%
                      </div>
                    </div>
                  )}
                  {job.status === 'complete' && (
                    <span style={{ fontSize: 10, color: 'var(--color-success, #3DAF72)' }}>Done</span>
                  )}
                  {job.status === 'failed' && (
                    <span style={{ fontSize: 10, color: 'var(--color-error, #FF6B6B)' }} title={job.error || 'Export failed'}>{job.error || 'Export failed'}</span>
                  )}
                  <button
                    aria-label={`Remove export job ${job.outputPath}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 4, display: 'flex', alignItems: 'center' }}
                    onClick={() => removeExportJob(job.id)}
                  >
                    <DexIcon name="close" size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: 'var(--space-3) var(--space-4)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)',
          borderTop: '1px solid var(--color-bg-hover)', flexShrink: 0,
        }}>
          <button aria-label="Cancel export" style={btnSecondaryStyle} onClick={() => setShowExportDialog(false)}>Cancel</button>
          <button aria-label="Start export" style={btnPrimaryStyle} onClick={handleExport}>Export</button>
        </div>
      </div>
    </div>
  );
});

ExportDialog.displayName = 'ExportDialog';
