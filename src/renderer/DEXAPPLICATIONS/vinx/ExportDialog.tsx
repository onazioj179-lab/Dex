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
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  width: 560, maxHeight: '80vh', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-subtle)', borderRadius: 8,
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--color-bg-hover)', flexShrink: 0,
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: '8px 16px 4px', fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const presetGridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '0 16px 8px',
};

const presetCardStyle = (selected: boolean): React.CSSProperties => ({
  padding: '8px', borderRadius: 4, cursor: 'pointer',
  border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-bg-hover)'}`,
  background: selected ? 'rgba(74,158,255,0.08)' : 'var(--color-border-subtle)',
});

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px', minHeight: 28,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--color-text-tertiary)', width: 80, flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1, height: 24, background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)',
  borderRadius: 3, padding: '0 6px', fontSize: 11, color: 'var(--color-text-primary)', outline: 'none',
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none', cursor: 'pointer',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'5\' viewBox=\'0 0 8 5\'%3E%3Cpath fill=\'%235A5A5A\' d=\'M0 0l4 5 4-5z\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
  paddingRight: 20,
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '6px 20px', fontSize: 11, fontWeight: 600, border: 'none',
  borderRadius: 4, background: 'var(--color-accent)', color: '#000000', cursor: 'pointer',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '6px 16px', fontSize: 11, fontWeight: 600, borderRadius: 4,
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'var(--color-text-secondary)', cursor: 'pointer',
};

const jobRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px',
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
    const ext = isAudioOnly ? settings.format : 'webm';
    const isVideoFormat = !isAudioOnly;
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

    // Real export: capture the program viewer canvas via MediaRecorder
    const programCanvas = document.querySelector('[data-vinx-program-canvas] canvas, [data-vinx-program-canvas] video') as HTMLCanvasElement | HTMLVideoElement | null;
    const targetFps = settings.frameRate || frameRate || 30;
    const totalFrames = duration || 1;
    const durationMs = (totalFrames / targetFps) * 1000;

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
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';
    const bitrate = (settings.bitrateMbps || 8) * 1_000_000;
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
  }, [settings, outputName, addExportJob, updateExportJob, frameRate, duration, projectWidth, projectHeight]);

  if (!showExportDialog) return null;

  return (
    <div style={overlayStyle} onMouseDown={() => setShowExportDialog(false)}>
      <div style={dialogStyle} onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Export</span>
          <button
            aria-label="Close Export dialog"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 16, padding: 4 }}
            onClick={() => setShowExportDialog(false)}
          >
            X
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
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
          <div style={{ padding: '4px 16px' }}>
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
          <div style={{ padding: '0 16px', fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            Duration: {formatTimecode(duration, frameRate)} / {duration} frames
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
                    <span style={{ fontSize: 10, color: '#3DAF72' }}>Done</span>
                  )}
                  {job.status === 'failed' && (
                    <span style={{ fontSize: 10, color: '#FF6B6B' }} title={job.error || 'Export failed'}>{job.error || 'Export failed'}</span>
                  )}
                  <button
                    aria-label={`Remove export job ${job.outputPath}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 10, padding: 4 }}
                    onClick={() => removeExportJob(job.id)}
                  >
                    X
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8,
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
