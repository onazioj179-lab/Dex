// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tempfile::TempPath;

struct Preview {
    canceled: Arc<AtomicBool>,
    file: Option<TempPath>,
}

#[derive(Default)]
pub(crate) struct MediaPreviews(Mutex<HashMap<(String, String), Preview>>);

fn prepare_video(source: &Path, destination: &Path, canceled: &AtomicBool) -> Result<(), String> {
    if canceled.load(Ordering::Relaxed) {
        return Err("Video preparation canceled.".into());
    }
    let mut child = crate::video_ctl::media_tool_command("ffmpeg")
        .args(["-nostdin", "-hide_banner", "-loglevel", "error", "-abort_on", "empty_output", "-filter_threads", "2", "-y"])
        .args(["-protocol_whitelist", "file", "-format_whitelist", "avi,asf,matroska,webm,mov,mp4,flv,mpeg,mpegts,ogg", "-i"])
        .arg(source)
        .args(["-map", "0:V:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1"])
        .args(["-vf", "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"])
        .args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-threads", "4"])
        .args(["-c:a", "aac", "-ac", "2", "-b:a", "160k", "-movflags", "+faststart", "-f", "mp4"])
        .arg(destination)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => "Video preparation requires FFmpeg with H.264 encoding.".into(),
            _ => format!("Could not start video preparation: {error}"),
        })?;
    loop {
        if canceled.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Video preparation canceled.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(_)) => return Err("Could not prepare this video. Check that the file is readable and FFmpeg supports its codec and H.264 encoding.".into()),
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Could not finish video preparation: {error}"));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires FFmpeg with libx264 and the lavfi test source"]
    fn prepares_seekable_video_from_local_avi() {
        let directory = tempfile::tempdir().unwrap();
        let input = directory.path().join("source with spaces.avi");
        let output = directory.path().join("preview.mp4");
        let status = crate::video_ctl::media_tool_command("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x180:rate=25",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440",
                "-t",
                "1",
                "-c:v",
                "mpeg4",
                "-c:a",
                "pcm_s16le",
            ])
            .arg(&input)
            .status()
            .unwrap();
        assert!(status.success());

        prepare_video(&input, &output, &AtomicBool::new(false)).unwrap();
        let checked = crate::video_ctl::media_tool_command("ffmpeg")
            .args(["-v", "error", "-ss", "0.5", "-i"])
            .arg(&output)
            .args([
                "-map", "0:v:0", "-map", "0:a:0", "-t", "0.2", "-f", "null", "-",
            ])
            .status()
            .unwrap();
        assert!(checked.success());
    }
}

fn decode(
    app: &AppHandle,
    owner: &str,
    token: &str,
    source: &str,
    video: bool,
) -> Result<Value, String> {
    if token.len() != 36
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
    {
        return Err("Invalid media preview request.".into());
    }
    let path = Path::new(source);
    if !path.is_absolute() || !path.is_file() {
        return Err("The local media file is unavailable.".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_ascii_lowercase()));
    if !extension.as_deref().is_some_and(|ext| {
        if video {
            crate::gallery_media::VIDEOS.contains(&ext)
        } else {
            ext == ".webm" || crate::gallery_media::AUDIO.contains(&ext)
        }
    }) {
        return Err("This file is not a supported media source.".into());
    }
    let state = app.state::<MediaPreviews>();
    let key = (owner.to_owned(), token.to_owned());
    let canceled = Arc::new(AtomicBool::new(false));
    {
        let mut previews = state
            .0
            .lock()
            .map_err(|_| "Media preview service is unavailable.")?;
        if previews.contains_key(&key) {
            return Err("This media preview is already active.".into());
        }
        previews.insert(
            key.clone(),
            Preview {
                canceled: canceled.clone(),
                file: None,
            },
        );
    }
    let prepared = (|| {
        let mut file = tempfile::Builder::new()
            .prefix("dex-preview-")
            .suffix(if video { ".mp4" } else { ".wav" })
            .tempfile()
            .map_err(|error| error.to_string())?;
        if video {
            let output = file.into_temp_path();
            prepare_video(path, &output, &canceled)?;
            return Ok(output);
        }
        dex_audio::prepare_playback_wav(source, file.as_file_mut(), || {
            canceled.load(Ordering::Relaxed)
        })?;
        Ok::<_, String>(file.into_temp_path())
    })();
    let mut previews = state
        .0
        .lock()
        .map_err(|_| "Media preview service is unavailable.")?;
    let result: Result<Value, String> = (|| {
        let file = prepared?;
        let preview = previews
            .get_mut(&key)
            .filter(|entry| Arc::ptr_eq(&entry.canceled, &canceled))
            .ok_or("Media preparation canceled.")?;
        let path = file.to_string_lossy().into_owned();
        app.asset_protocol_scope()
            .allow_file(&file)
            .map_err(|error| error.to_string())?;
        preview.file = Some(file);
        Ok(json!({"success": true, "path": path}))
    })();
    if result.is_err()
        && previews
            .get(&key)
            .is_some_and(|entry| Arc::ptr_eq(&entry.canceled, &canceled))
    {
        previews.remove(&key);
    }
    result
}

fn cancel(preview: Preview) {
    preview.canceled.store(true, Ordering::Relaxed);
}

pub(crate) fn close_window(app: &AppHandle, owner: &str) {
    let state = app.state::<MediaPreviews>();
    if let Ok(mut previews) = state.0.lock() {
        previews.retain(|(window, _), preview| {
            if window == owner {
                preview.canceled.store(true, Ordering::Relaxed);
                false
            } else {
                true
            }
        });
    };
}

pub(crate) fn dispatch(app: &AppHandle, owner: &str, channel: &str, args: &Value) -> Value {
    let token = args[0].as_str().unwrap_or("");
    if matches!(channel, "media:prepareAudio" | "media:prepareVideo") {
        return decode(
            app,
            owner,
            token,
            args[1].as_str().unwrap_or(""),
            channel == "media:prepareVideo",
        )
        .unwrap_or_else(|error| json!({"success": false, "error": error}));
    }
    let state = app.state::<MediaPreviews>();
    if let Ok(mut previews) = state.0.lock() {
        if let Some(preview) = previews.remove(&(owner.to_owned(), token.to_owned())) {
            cancel(preview);
        }
    }
    json!({"success": true})
}
