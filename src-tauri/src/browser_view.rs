// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Native web content for the Browser app.
//!
//! The Browser was written against Electron's `<webview>` tag, which WebView2
//! does not have, so under Tauri every tab rendered blank. Each tab is now a
//! real child webview of the DEX window, positioned over a placeholder element
//! the renderer measures (see `components/NativeWebview.tsx`).
//!
//! Remote pages get no DEX IPC: Tauri rejects custom commands from non-local
//! origins unless a `remote` capability grants them, and DEX defines none.
//! Lifecycle events go only to the window that owns the view, never to the
//! child webviews themselves.

use serde_json::{json, Value};
use tauri::{Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Url};

const LABEL_PREFIX: &str = "dexbrowser-";
const EVENT: &str = "browser-view";
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Tab ids come from the renderer; keep labels to the characters Tauri accepts.
fn label_for(id: &str) -> Option<String> {
    let clean: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(64)
        .collect();
    if clean.is_empty() { None } else { Some(format!("{LABEL_PREFIX}{clean}")) }
}

/// Only web pages. `file:`, `javascript:` and app-internal schemes stay out.
fn parse_web_url(raw: &str) -> Option<Url> {
    let url = Url::parse(raw.trim()).ok()?;
    match url.scheme() {
        "http" | "https" => Some(url),
        _ => None,
    }
}

#[derive(Clone, Copy)]
struct Rect { x: f64, y: f64, w: f64, h: f64 }

fn rect_arg(v: Option<&Value>) -> Rect {
    let n = |k: &str| v.and_then(|o| o.get(k)).and_then(|x| x.as_f64()).unwrap_or(0.0);
    Rect { x: n("x"), y: n("y"), w: n("w").max(1.0), h: n("h").max(1.0) }
}

fn emit(app: &tauri::AppHandle, owner: &str, payload: Value) {
    let _ = app.emit_to(EventTarget::webview_window(owner), EVENT, payload);
}

fn create(app: &tauri::AppHandle, window: &tauri::Window, id: &str, url: &str, rect: Rect, visible: bool) -> Value {
    let Some(label) = label_for(id) else { return json!({ "success": false, "error": "bad id" }) };
    let Some(url) = parse_web_url(url) else { return json!({ "success": false, "error": "only http(s) pages can be opened" }) };
    // A main-window reload leaves child views behind; reuse the label cleanly.
    if let Some(old) = app.get_webview(&label) {
        let _ = old.close();
    }
    let owner = window.label().to_string();
    let tab = id.to_string();

    let (a1, o1, t1) = (app.clone(), owner.clone(), tab.clone());
    let (a2, o2, t2) = (app.clone(), owner.clone(), tab.clone());
    let (a3, o3, t3) = (app.clone(), owner.clone(), tab.clone());
    let builder = tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(url))
        .user_agent(USER_AGENT)
        .on_page_load(move |_wv, payload| {
            let state = match payload.event() {
                tauri::webview::PageLoadEvent::Started => "started",
                tauri::webview::PageLoadEvent::Finished => "finished",
            };
            emit(&a1, &o1, json!({ "id": t1, "type": "load", "state": state, "url": payload.url().as_str() }));
        })
        .on_document_title_changed(move |_wv, title| {
            emit(&a2, &o2, json!({ "id": t2, "type": "title", "title": title }));
        })
        .on_new_window(move |url, _features| {
            // Popups and target=_blank become tabs in the Browser, not OS windows.
            emit(&a3, &o3, json!({ "id": t3, "type": "new-window", "url": url.as_str() }));
            tauri::webview::NewWindowResponse::Deny
        });

    match window.add_child(builder, LogicalPosition::new(rect.x, rect.y), LogicalSize::new(rect.w, rect.h)) {
        Ok(wv) => {
            if !visible {
                let _ = wv.hide();
            }
            json!({ "success": true })
        }
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
}

fn with_view(app: &tauri::AppHandle, id: &str, f: impl FnOnce(&tauri::Webview) -> tauri::Result<()>) -> Value {
    let Some(label) = label_for(id) else { return json!({ "success": false, "error": "bad id" }) };
    match app.get_webview(&label) {
        Some(wv) => match f(&wv) {
            Ok(()) => json!({ "success": true }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        },
        None => json!({ "success": false, "error": "no such view" }),
    }
}

/// Run a script and wait (bounded) for its JSON-serialised result. Runs on the
/// IPC blocking pool, never the UI thread, so the wait cannot freeze DEX.
fn eval_result(app: &tauri::AppHandle, id: &str, js: String) -> Value {
    let Some(label) = label_for(id) else { return json!({ "success": false, "error": "bad id" }) };
    let Some(wv) = app.get_webview(&label) else { return json!({ "success": false, "error": "no such view" }) };
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    // Exceptions are not reported on Windows; wrap so a throw still answers.
    let wrapped = format!("(function(){{try{{return ({js});}}catch(e){{return {{__dexEvalError:String(e)}};}}}})()");
    if let Err(e) = wv.eval_with_callback(wrapped, move |res| { let _ = tx.send(res); }) {
        return json!({ "success": false, "error": e.to_string() });
    }
    match rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(res) => json!({ "success": true, "result": res }),
        Err(_) => json!({ "success": false, "error": "timed out" }),
    }
}

fn close_all(app: &tauri::AppHandle, owner: &str) -> Value {
    let mut closed = 0;
    for (label, wv) in app.webviews() {
        if label.starts_with(LABEL_PREFIX) && wv.window().label() == owner {
            if wv.close().is_ok() {
                closed += 1;
            }
        }
    }
    json!({ "success": true, "closed": closed })
}

/// `browserView:*` channels. Args are positional: `[id, ...]`.
pub fn dispatch(app: &tauri::AppHandle, window: &tauri::Window, channel: &str, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    match channel {
        "browserView:create" => create(
            app,
            window,
            id,
            args.get(1).and_then(|v| v.as_str()).unwrap_or(""),
            rect_arg(args.get(2)),
            args.get(3).and_then(|v| v.as_bool()).unwrap_or(true),
        ),
        "browserView:setBounds" => {
            let r = rect_arg(args.get(1));
            with_view(app, id, |wv| {
                wv.set_position(LogicalPosition::new(r.x, r.y))?;
                wv.set_size(LogicalSize::new(r.w, r.h))
            })
        }
        "browserView:show" => with_view(app, id, |wv| wv.show()),
        "browserView:hide" => with_view(app, id, |wv| wv.hide()),
        "browserView:focus" => with_view(app, id, |wv| wv.set_focus()),
        "browserView:navigate" => match parse_web_url(args.get(1).and_then(|v| v.as_str()).unwrap_or("")) {
            Some(url) => with_view(app, id, |wv| wv.navigate(url)),
            None => json!({ "success": false, "error": "only http(s) pages can be opened" }),
        },
        "browserView:reload" => with_view(app, id, |wv| wv.reload()),
        "browserView:back" => with_view(app, id, |wv| wv.eval("history.back()")),
        "browserView:forward" => with_view(app, id, |wv| wv.eval("history.forward()")),
        "browserView:stop" => with_view(app, id, |wv| wv.eval("window.stop()")),
        "browserView:eval" => {
            let js = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
            with_view(app, id, |wv| wv.eval(js))
        }
        "browserView:evalResult" => {
            let js = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
            eval_result(app, id, js)
        }
        "browserView:zoom" => {
            let f = args.get(1).and_then(|v| v.as_f64()).unwrap_or(1.0).clamp(0.25, 5.0);
            with_view(app, id, |wv| wv.set_zoom(f))
        }
        "browserView:close" => with_view(app, id, |wv| wv.close()),
        "browserView:closeAll" => close_all(app, window.label()),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::{label_for, parse_web_url};

    #[test]
    fn labels_are_sanitized() {
        assert_eq!(label_for("tab_1_ab").as_deref(), Some("dexbrowser-tab_1_ab"));
        assert_eq!(label_for("a b/../c").as_deref(), Some("dexbrowser-abc"));
        assert_eq!(label_for("../"), None);
    }

    #[test]
    fn only_web_urls_open() {
        assert!(parse_web_url("https://example.com").is_some());
        assert!(parse_web_url("http://example.com/x?y=1").is_some());
        assert!(parse_web_url("file:///C:/Windows/win.ini").is_none());
        assert!(parse_web_url("javascript:alert(1)").is_none());
        assert!(parse_web_url("tauri://localhost").is_none());
        assert!(parse_web_url("not a url").is_none());
    }
}
