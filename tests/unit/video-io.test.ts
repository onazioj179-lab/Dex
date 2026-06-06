// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { planExport, probeFromMetadata, planThumbnails, planSmartTrim, type ExportTarget, type Clip } from '../../src/shared/video/pipeline';

describe('video I/O planning', () => {
  it('plans an in-app WebM/VP9 export with a MediaRecorder mime', () => {
    const target: ExportTarget = {
      container: 'webm', videoCodec: 'vp9', width: 1920, height: 1080, fps: 30,
      audio: { codec: 'opus', sampleRate: 48000, channels: 2 },
    };
    const job = planExport(300, target);
    expect(job.engine).toBe('inApp');
    expect(job.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(job.totalFrames).toBe(300);
    expect(job.bitrateKbps).toBeGreaterThan(0);
    expect(job.audio).toEqual({ codec: 'opus', sampleRate: 48000, channels: 2 });
  });

  it('routes MP4/H.264 to the native encoder with no browser mime', () => {
    const job = planExport(120, { container: 'mp4', videoCodec: 'h264', width: 1280, height: 720, fps: 24 });
    expect(job.engine).toBe('native');
    expect(job.mimeType).toBeUndefined();
  });

  it('honours an explicit bitrate and floors frames', () => {
    const job = planExport(-5, { container: 'webm', videoCodec: 'vp8', width: 640, height: 360, fps: 25, bitrateKbps: 1500 });
    expect(job.bitrateKbps).toBe(1500);
    expect(job.totalFrames).toBe(0);
    expect(job.mimeType).toBe('video/webm;codecs=vp8');
  });

  it('probes media metadata into frame-accurate duration', () => {
    const probe = probeFromMetadata(1920, 1080, 30, 12.5, 'h264', true);
    expect(probe.durationFrames).toBe(375); // 12.5s * 30fps
    expect(probe.hasAudio).toBe(true);
    expect(probe.codec).toBe('h264');
  });

  it('plans evenly spaced, segment-centred thumbnails with timecodes', () => {
    const thumbs = planThumbnails(300, 3, 30);
    expect(thumbs.map((t) => t.frame)).toEqual([50, 150, 250]);
    expect(thumbs[0].timecode).toBe('00:00:01:20'); // frame 50 @ 30fps
  });

  it('returns no thumbnails for zero count or zero frames', () => {
    expect(planThumbnails(0, 5, 30)).toEqual([]);
    expect(planThumbnails(300, 0, 30)).toEqual([]);
  });

  it('smart-trims a track to a target length (drop + shorten)', () => {
    const clips: Clip[] = [
      { id: 'a', track: 0, start: 0, duration: 100, sourceIn: 0, sourceDuration: 100 },
      { id: 'b', track: 0, start: 100, duration: 100, sourceIn: 0, sourceDuration: 100 },
      { id: 'c', track: 0, start: 200, duration: 50, sourceIn: 0, sourceDuration: 50 },
    ];
    const out = planSmartTrim(clips, 150);
    expect(out.map((c) => [c.id, c.start, c.duration])).toEqual([['a', 0, 100], ['b', 100, 50]]);
  });
});
