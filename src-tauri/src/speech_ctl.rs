// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! speech:* -- UKI voice through Windows' own speech recognizer
//! (Windows.Media.SpeechRecognition, free dictation = Microsoft's online speech
//! service). WebView2 exposes `webkitSpeechRecognition` but never starts it
//! (there is no speech service behind it), so the packaged app had no working
//! voice input. Owner direction (2026-11-17): voice is online, always.
//!
//! Channels:
//!   speech:start { lang? }  -> { success, error? }  starts continuous dictation
//!   speech:stop             -> { success }
//!   speech:status           -> { success, listening }
//! Events: speech:hypothesis { text } (partial), speech:result { text } (final),
//!         speech:error { error }, speech:ended {}.
//!
//! One session at a time, owned by a worker thread (MTA) that keeps the
//! recognizer alive until speech:stop. Windows needs Settings > Privacy >
//! Speech > "Online speech recognition" on; when it is off, speech:start
//! reports that plainly instead of failing silently.

use serde_json::{json, Value};
use std::sync::{mpsc, Mutex};

static SESSION: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "speech:start" => {
            let lang = args
                .get(0)
                .and_then(|a| a.get("lang"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            start(app, lang)
        }
        "speech:stop" => {
            if let Some(tx) = SESSION.lock().ok().and_then(|mut g| g.take()) {
                let _ = tx.send(());
            }
            json!({ "success": true })
        }
        "speech:status" => {
            let listening = SESSION.lock().map(|g| g.is_some()).unwrap_or(false);
            json!({ "success": true, "listening": listening })
        }
        _ => json!({ "success": false, "error": format!("unknown speech channel {channel}") }),
    }
}

/// Plain-language message for the HRESULTs Windows returns here.
pub(crate) fn explain_hresult(code: i32) -> String {
    match code as u32 {
        // SPERR_SPEECH_PRIVACY_POLICY_NOT_ACCEPTED
        0x8004_5509 => "Turn on Online speech recognition in Windows Settings > Privacy & security > Speech, then try again.".into(),
        // Microphone access denied for desktop apps
        0x8007_0005 => "Windows blocked the microphone. Allow desktop apps to use it in Settings > Privacy & security > Microphone.".into(),
        // No audio endpoint
        0x8004_5510 | 0x8889_0004 => "No microphone was found.".into(),
        c => format!("Speech recognition failed (0x{c:08X})."),
    }
}

#[cfg(windows)]
fn start(app: &tauri::AppHandle, lang: String) -> Value {
    use windows::core::HSTRING;
    use windows::Foundation::TypedEventHandler;
    use windows::Globalization::Language;
    use windows::Media::SpeechRecognition::{
        SpeechContinuousRecognitionCompletedEventArgs, SpeechContinuousRecognitionResultGeneratedEventArgs,
        SpeechContinuousRecognitionSession, SpeechRecognitionHypothesisGeneratedEventArgs,
        SpeechRecognitionResultStatus, SpeechRecognizer,
    };

    // Already listening: a second start is a no-op success.
    if SESSION.lock().map(|g| g.is_some()).unwrap_or(false) {
        return json!({ "success": true, "already": true });
    }

    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let app = app.clone();

    std::thread::spawn(move || {
        let fail = |e: windows::core::Error| explain_hresult(e.code().0);
        let run = || -> Result<(), String> {
            let rec = if lang.is_empty() {
                SpeechRecognizer::new().map_err(fail)?
            } else {
                let l = Language::CreateLanguage(&HSTRING::from(lang.as_str())).map_err(fail)?;
                SpeechRecognizer::Create(&l).map_err(fail)?
            };
            let compiled = rec.CompileConstraintsAsync().map_err(fail)?.get().map_err(fail)?;
            if compiled.Status().map_err(fail)? != SpeechRecognitionResultStatus::Success {
                return Err("Speech recognition is not available on this PC (no dictation language).".into());
            }

            let a1 = app.clone();
            rec.HypothesisGenerated(&TypedEventHandler::<SpeechRecognizer, SpeechRecognitionHypothesisGeneratedEventArgs>::new(
                move |_, args| {
                    if let Some(a) = args.as_ref() {
                        if let Ok(t) = a.Hypothesis().and_then(|h| h.Text()) {
                            crate::native_ops::emit_event(&a1, "speech:hypothesis", &json!({ "text": t.to_string() }));
                        }
                    }
                    Ok(())
                },
            ))
            .map_err(fail)?;

            let session: SpeechContinuousRecognitionSession = rec.ContinuousRecognitionSession().map_err(fail)?;
            let a2 = app.clone();
            session
                .ResultGenerated(&TypedEventHandler::<SpeechContinuousRecognitionSession, SpeechContinuousRecognitionResultGeneratedEventArgs>::new(
                    move |_, args| {
                        if let Some(a) = args.as_ref() {
                            if let Ok(t) = a.Result().and_then(|r| r.Text()) {
                                let text = t.to_string();
                                if !text.trim().is_empty() {
                                    crate::native_ops::emit_event(&a2, "speech:result", &json!({ "text": text }));
                                }
                            }
                        }
                        Ok(())
                    },
                ))
                .map_err(fail)?;
            let a3 = app.clone();
            session
                .Completed(&TypedEventHandler::<SpeechContinuousRecognitionSession, SpeechContinuousRecognitionCompletedEventArgs>::new(
                    move |_, args| {
                        let status = args.as_ref().and_then(|a| a.Status().ok());
                        if let Some(s) = status {
                            if s != SpeechRecognitionResultStatus::Success && s != SpeechRecognitionResultStatus::UserCanceled {
                                crate::native_ops::emit_event(&a3, "speech:error", &json!({ "error": format!("Speech recognition stopped ({:?}).", s.0) }));
                            }
                        }
                        Ok(())
                    },
                ))
                .map_err(fail)?;

            session.StartAsync().map_err(fail)?.get().map_err(fail)?;
            let _ = ready_tx.send(Ok(()));
            // Keep the recognizer alive until speech:stop (or the app exits).
            let _ = stop_rx.recv();
            let _ = session.StopAsync().and_then(|op| op.get());
            drop(rec);
            Ok(())
        };
        if let Err(e) = run() {
            let _ = ready_tx.send(Err(e));
        }
        if let Ok(mut g) = SESSION.lock() { *g = None; }
        crate::native_ops::emit_event(&app, "speech:ended", &json!({}));
    });

    if let Ok(mut g) = SESSION.lock() { *g = Some(stop_tx); }
    match ready_rx.recv_timeout(std::time::Duration::from_secs(12)) {
        Ok(Ok(())) => json!({ "success": true }),
        Ok(Err(e)) => {
            if let Ok(mut g) = SESSION.lock() { *g = None; }
            json!({ "success": false, "error": e })
        }
        Err(_) => json!({ "success": false, "error": "Speech recognition did not start in time." }),
    }
}

#[cfg(not(windows))]
fn start(_app: &tauri::AppHandle, _lang: String) -> Value {
    json!({ "success": false, "error": "Speech recognition needs Windows." })
}

#[cfg(test)]
mod tests {
    use super::explain_hresult;
    #[test]
    fn privacy_setting_is_explained_in_plain_words() {
        assert!(explain_hresult(0x8004_5509u32 as i32).contains("Online speech recognition"));
        assert!(explain_hresult(0x8007_0005u32 as i32).contains("microphone"));
        assert!(explain_hresult(0x1234_5678).contains("0x12345678"));
    }
}
