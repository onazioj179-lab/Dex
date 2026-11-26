// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    Emitter, EventTarget, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};

pub const PAGE_PREFIX: &str = "dex-browser-page-";
const MAX_OPEN_PAGES: usize = 8;
static PAGE_CREATION: Mutex<()> = Mutex::new(());
static NEXT_INSTANCE: AtomicU64 = AtomicU64::new(1);
const PAGE_EVENT: &str = "dex-browser-page-state";

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageState {
    tab: String,
    instance: u64,
    revision: u64,
    url: String,
    title: String,
    status: &'static str,
    error: Option<&'static str>,
    can_go_back: Option<bool>,
    can_go_forward: Option<bool>,
    can_find: bool,
}

type PageKey = (String, String);
fn pages() -> &'static Mutex<HashMap<PageKey, PageState>> {
    static PAGES: OnceLock<Mutex<HashMap<PageKey, PageState>>> = OnceLock::new();
    PAGES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn page_key(owner: &str, tab: &Value) -> Result<PageKey, String> {
    let tab = tab.as_str().unwrap_or_default();
    if tab.is_empty()
        || tab.len() > 64
        || !tab
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Invalid browser tab identifier".into());
    }
    Ok((owner.into(), tab.into()))
}

fn page_label(key: &PageKey) -> String {
    let owner: String = key.0.bytes().map(|byte| format!("{byte:02x}")).collect();
    format!("{PAGE_PREFIX}{owner}-{}", key.1)
}

fn emit(app: &tauri::AppHandle, owner: &str, state: PageState) {
    let _ = app.emit_to(EventTarget::webview_window(owner), PAGE_EVENT, state);
}

fn update_page(
    app: &tauri::AppHandle,
    key: &PageKey,
    instance: u64,
    apply: impl FnOnce(&mut PageState),
) {
    let snapshot = pages().lock().ok().and_then(|mut active| {
        let state = active
            .get_mut(key)
            .filter(|entry| entry.instance == instance)?;
        let previous = state.clone();
        apply(state);
        if *state == previous {
            return None;
        }
        state.revision += 1;
        Some(state.clone())
    });
    if let Some(state) = snapshot {
        emit(app, &key.0, state);
    }
}

fn close_page(app: &tauri::AppHandle, key: &PageKey, instance: u64) {
    let snapshot = pages().lock().ok().and_then(|mut active| {
        if active.get(key)?.instance != instance {
            return None;
        }
        let mut state = active.remove(key)?;
        state.revision += 1;
        state.status = "closed";
        Some(state)
    });
    if let Some(state) = snapshot {
        emit(app, &key.0, state);
    }
}

pub(crate) fn allowed(url: &Url) -> bool {
    url.as_str().len() <= 16_384
        && url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|host| {
            let host = host.trim_end_matches('.');
            host != "localhost"
                && host != "tauri.localhost"
                && !host.ends_with(".localhost")
                && !host.ends_with(".onion")
                && !host
                    .trim_matches(['[', ']'])
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| {
                        let ip = ip.to_canonical();
                        ip.is_loopback() || ip.is_unspecified()
                    })
        })
}

pub fn dispatch(app: &tauri::AppHandle, owner: &str, channel: &str, args: &Value) -> Value {
    let result = match channel {
        "browser:openPageWindow" => {
            open_page(app, owner, args).map(|page| json!({ "success": true, "page": page }))
        }
        "browser:pageWindows" => pages()
            .lock()
            .map(|active| {
                let snapshots: Vec<_> = active
                    .iter()
                    .filter(|(key, _)| key.0 == owner)
                    .map(|(_, page)| page)
                    .collect();
                json!({ "success": true, "pages": snapshots })
            })
            .map_err(|_| "Browser windows unavailable".into()),
        "browser:pageAction" => page_action(app, owner, args).map(|()| json!({ "success": true })),
        _ => Err("Unknown browser page command".into()),
    };
    match result {
        Ok(response) => response,
        Err(error) => json!({ "success": false, "error": error }),
    }
}

fn open_page(app: &tauri::AppHandle, owner: &str, args: &Value) -> Result<PageState, String> {
    let key = page_key(owner, &args[0])?;
    let address = args[1]
        .as_str()
        .filter(|s| s.len() <= 16_384)
        .ok_or("Invalid address")?;
    let url = Url::parse(address).map_err(|_| "Invalid address")?;
    if !allowed(&url) {
        return Err("This address cannot be opened in a DEX web page window".into());
    }
    let label = page_label(&key);
    let _guard = PAGE_CREATION
        .lock()
        .map_err(|_| "Browser windows unavailable")?;
    if let Some(window) = app.get_webview_window(&label) {
        if args[2].as_bool() == Some(true) {
            window.navigate(url).map_err(|e| e.to_string())?;
        }
        window
            .unminimize()
            .and_then(|()| window.set_focus())
            .map_err(|e| e.to_string())?;
        return page_snapshot(&key);
    }
    if app
        .webview_windows()
        .keys()
        .filter(|name| name.starts_with(PAGE_PREFIX))
        .count()
        >= MAX_OPEN_PAGES
    {
        return Err(format!("Close a web page window before opening another. {MAX_OPEN_PAGES} page windows are open."));
    }
    let profile = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("browser-pages");
    std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
    let host = url.host_str().unwrap_or_default().to_owned();
    let instance = NEXT_INSTANCE.fetch_add(1, Ordering::Relaxed);
    let initial = PageState {
        tab: key.1.clone(),
        instance,
        revision: 0,
        url: url.to_string(),
        title: host.clone(),
        status: "opening",
        error: None,
        can_go_back: None,
        can_go_forward: None,
        can_find: false,
    };
    pages()
        .lock()
        .map_err(|_| "Browser windows unavailable")?
        .insert(key.clone(), initial.clone());
    let load_key = key.clone();
    let title_key = key.clone();
    let downloads_enabled = Arc::new(AtomicBool::new(false));
    let download_gate = downloads_enabled.clone();
    // Create the isolated engine first so the first network navigation is
    // observed by the same handlers as later navigations.
    let initial_document = Url::parse("about:blank").expect("valid internal blank document");
    let built = WebviewWindowBuilder::new(app, label, WebviewUrl::External(initial_document))
        .title(format!("{host} — DEX Browser"))
        .inner_size(1080.0, 740.0)
        .visible(false)
        .data_directory(profile)
        .on_navigation(allowed)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(move |_, event| {
            download_gate.load(Ordering::Acquire)
                || !matches!(event, tauri::webview::DownloadEvent::Requested { .. })
        })
        .on_page_load(move |window, event| {
            let url = event.url();
            if !allowed(url) {
                return;
            }
            if let Some(host) = url.host_str() {
                let _ = window.set_title(&format!("{host} — DEX Browser"));
            }
            let started = event.event() == PageLoadEvent::Started;
            update_page(window.app_handle(), &load_key, instance, |state| {
                if state.url != url.as_str() {
                    state.title = url.host_str().unwrap_or_default().into();
                }
                state.url = url.to_string();
                if started {
                    state.status = "opening";
                    state.error = None;
                } else if state.status != "failed" {
                    state.status = "open";
                }
            });
            if !started {
                update_history_flags(&window, load_key.clone(), instance, url.to_string());
            }
        })
        .on_document_title_changed(move |window, title| {
            let title: String = title
                .chars()
                .filter(|character| !character.is_control())
                .take(256)
                .collect();
            if !title.trim().is_empty() && title != "about:blank" {
                update_page(window.app_handle(), &title_key, instance, |state| {
                    state.title = title
                });
            }
        })
        .devtools(false)
        .build();
    let window = match built {
        Ok(window) => window,
        Err(error) => {
            close_page(app, &key, instance);
            return Err(error.to_string());
        }
    };
    let closed_app = app.clone();
    let closed_key = key.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            #[cfg(windows)]
            crate::browser_downloads::close_page(&closed_app, instance);
            close_page(&closed_app, &closed_key, instance);
        }
    });
    let opened =
        watch_navigation(&window, key.clone(), instance, downloads_enabled).and_then(|()| {
            window
                .navigate(url)
                .and_then(|()| window.show())
                .and_then(|()| window.set_focus())
                .map_err(|error| error.to_string())
        });
    if let Err(error) = opened {
        let _ = window.close();
        close_page(app, &key, instance);
        return Err(error);
    }
    page_snapshot(&key)
}

fn page_snapshot(key: &PageKey) -> Result<PageState, String> {
    pages()
        .lock()
        .ok()
        .and_then(|active| active.get(key).cloned())
        .ok_or("The page window is no longer open.".into())
}

fn page_action(app: &tauri::AppHandle, owner: &str, args: &Value) -> Result<(), String> {
    let key = page_key(owner, &args[0])?;
    let action = args[1].as_str().unwrap_or_default();
    if action == "close" {
        let _guard = PAGE_CREATION
            .lock()
            .map_err(|_| "Browser windows unavailable")?;
        #[cfg(windows)]
        if crate::browser_downloads::tab_has_download(owner, &key.1) {
            return Err("Finish or cancel this tab’s downloads before closing it.".into());
        }
        return app
            .get_webview_window(&page_label(&key))
            .map_or(Ok(()), |window| {
                window.close().map_err(|error| error.to_string())
            });
    }
    let window = app
        .get_webview_window(&page_label(&key))
        .ok_or("Open the page window first.")?;
    match action {
        "reload" => window.reload().map_err(|error| error.to_string()),
        "back" => navigate_history(&window, false),
        "forward" => navigate_history(&window, true),
        "find" => {
            window
                .unminimize()
                .and_then(|()| window.set_focus())
                .map_err(|error| error.to_string())?;
            return open_find(&window);
        }
        _ => Err("Unknown page action.".into()),
    }?;
    window
        .unminimize()
        .and_then(|()| window.set_focus())
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn watch_navigation(
    window: &WebviewWindow,
    key: PageKey,
    instance: u64,
    downloads_enabled: Arc<AtomicBool>,
) -> Result<(), String> {
    use webview2_com::{
        take_pwstr, HistoryChangedEventHandler,
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Environment15, ICoreWebView2_28, COREWEBVIEW2_WEB_ERROR_STATUS,
            COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
        },
        NavigationCompletedEventHandler, NavigationStartingEventHandler, SourceChangedEventHandler,
    };
    use windows::core::Interface;
    let app = window.app_handle().clone();
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    window
        .with_webview(move |platform| unsafe {
            let Ok(view) = platform.controller().CoreWebView2() else {
                let _ = tx.send(false);
                return;
            };
            let download_watcher = crate::browser_downloads::watch(
                app.clone(),
                &view,
                key.0.clone(),
                key.1.clone(),
                instance,
            );
            downloads_enabled.store(download_watcher.is_ok(), Ordering::Release);
            let can_find = view.cast::<ICoreWebView2_28>().is_ok()
                && platform
                    .environment()
                    .cast::<ICoreWebView2Environment15>()
                    .is_ok();
            update_page(&app, &key, instance, |page| page.can_find = can_find);
            let navigation = std::sync::Arc::new(AtomicU64::new(0));
            let starting = navigation.clone();
            let _ = view.add_NavigationStarting(
                &NavigationStartingEventHandler::create(Box::new(move |_, args| {
                    if let Some(args) = args {
                        let mut id = 0;
                        args.NavigationId(&mut id)?;
                        starting.store(id, Ordering::Relaxed);
                    }
                    Ok(())
                })),
                &mut 0,
            );

            let completed_key = key.clone();
            let completed_app = app.clone();
            let completed = view.add_NavigationCompleted(
                &NavigationCompletedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    let mut id = 0;
                    args.NavigationId(&mut id)?;
                    let latest = navigation.load(Ordering::Relaxed);
                    if latest != 0 && latest != id {
                        return Ok(());
                    }
                    let mut succeeded = false.into();
                    args.IsSuccess(&mut succeeded)?;
                    if succeeded.as_bool() {
                        return Ok(());
                    }
                    let mut status = COREWEBVIEW2_WEB_ERROR_STATUS(0);
                    args.WebErrorStatus(&mut status)?;
                    if status != COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED {
                        update_page(&completed_app, &completed_key, instance, |page| {
                            page.status = "failed";
                            page.error = Some("The browser engine could not load this page.");
                        });
                    }
                    Ok(())
                })),
                &mut 0,
            );

            let history_key = key.clone();
            let history_app = app.clone();
            let _ = view.add_HistoryChanged(
                &HistoryChangedEventHandler::create(Box::new(move |view, _| {
                    let Some(view) = view else { return Ok(()) };
                    let mut back = false.into();
                    let mut forward = false.into();
                    view.CanGoBack(&mut back)?;
                    view.CanGoForward(&mut forward)?;
                    update_page(&history_app, &history_key, instance, |page| {
                        page.can_go_back = Some(back.as_bool());
                        page.can_go_forward = Some(forward.as_bool());
                    });
                    Ok(())
                })),
                &mut 0,
            );

            let _ = view.add_SourceChanged(
                &SourceChangedEventHandler::create(Box::new(move |view, args| {
                    let (Some(view), Some(args)) = (view, args) else {
                        return Ok(());
                    };
                    let mut new_document = false.into();
                    args.IsNewDocument(&mut new_document)?;
                    if new_document.as_bool() {
                        return Ok(());
                    }
                    let mut source = windows::core::PWSTR::null();
                    view.Source(&mut source)?;
                    let source = take_pwstr(source);
                    let Ok(url) = Url::parse(&source) else {
                        return Ok(());
                    };
                    if allowed(&url) {
                        update_page(&app, &key, instance, |page| page.url = url.to_string());
                    }
                    Ok(())
                })),
                &mut 0,
            );
            let _ = tx.send(completed.is_ok());
        })
        .map_err(|error| error.to_string())?;
    if rx.recv_timeout(std::time::Duration::from_secs(3)) == Ok(true) {
        Ok(())
    } else {
        Err("WebView2 navigation events are unavailable.".into())
    }
}

#[cfg(not(windows))]
fn watch_navigation(
    _: &WebviewWindow,
    _: PageKey,
    _: u64,
    _: Arc<AtomicBool>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn update_history_flags(window: &WebviewWindow, key: PageKey, instance: u64, url: String) {
    let app = window.app_handle().clone();
    let _ = window.with_webview(move |view| {
        let flags = unsafe {
            let Ok(view) = view.controller().CoreWebView2() else {
                return;
            };
            let mut back = false.into();
            let mut forward = false.into();
            if view.CanGoBack(&mut back).is_err() || view.CanGoForward(&mut forward).is_err() {
                return;
            }
            (back.as_bool(), forward.as_bool())
        };
        update_page(&app, &key, instance, |state| {
            if state.url == url && state.status == "open" {
                state.can_go_back = Some(flags.0);
                state.can_go_forward = Some(flags.1);
            }
        });
    });
}

#[cfg(not(windows))]
fn update_history_flags(_: &WebviewWindow, _: PageKey, _: u64, _: String) {}

#[cfg(windows)]
fn navigate_history(window: &WebviewWindow, forward: bool) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    window
        .with_webview(move |webview| {
            let result = (|| unsafe {
                let view = webview
                    .controller()
                    .CoreWebView2()
                    .map_err(|error| error.to_string())?;
                let mut available = false.into();
                if forward {
                    view.CanGoForward(&mut available)
                } else {
                    view.CanGoBack(&mut available)
                }
                .map_err(|error| error.to_string())?;
                if !available.as_bool() {
                    return Err("No page is available in that direction.".into());
                }
                if forward {
                    view.GoForward()
                } else {
                    view.GoBack()
                }
                .map_err(|error| error.to_string())
            })();
            let _ = tx.send(result);
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(3))
        .map_err(|_| "The page window did not respond.")?
}

#[cfg(not(windows))]
fn navigate_history(_: &WebviewWindow, _: bool) -> Result<(), String> {
    Err("Native page history is unavailable on this platform.".into())
}

#[cfg(windows)]
fn open_find(window: &WebviewWindow) -> Result<(), String> {
    use webview2_com::{
        FindStartCompletedHandler,
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment15, ICoreWebView2_28},
    };
    use windows::core::Interface;

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    window
        .with_webview(move |platform| {
            let completion = tx.clone();
            let started = (|| unsafe {
                let view = platform
                    .controller()
                    .CoreWebView2()?
                    .cast::<ICoreWebView2_28>()?;
                let options = platform
                    .environment()
                    .cast::<ICoreWebView2Environment15>()?
                    .CreateFindOptions()?;
                options.SetFindTerm(windows::core::w!(""))?;
                options.SetSuppressDefaultFindDialog(false)?;
                view.Find()?.Start(
                    &options,
                    &FindStartCompletedHandler::create(Box::new(move |result| {
                        let _ = completion
                            .try_send(result.map_err(|_| "WebView2 could not start Find in page."));
                        Ok(())
                    })),
                )
            })();
            if started.is_err() {
                let _ = tx.try_send(Err("Find in page could not open on this WebView2 runtime."));
            }
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(3))
        .map_err(|_| "The page window did not respond to Find in page.")?
        .map_err(str::to_string)
}

#[cfg(not(windows))]
fn open_find(_: &WebviewWindow) -> Result<(), String> {
    Err("Native Find in page is unavailable on this platform.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_windows_cannot_navigate_to_shell_origins_or_dangerous_schemes() {
        for rejected in [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "http://127.0.0.1:5173",
            "http://[::1]",
            "http://localhost.",
            "https://127.0.0.1/",
            "https://[::ffff:127.0.0.1]/",
            "https://0.0.0.0/",
            "https://user@example.org",
            "file:///C:/Windows",
            "https://example.onion",
            "https://sub.localhost",
        ] {
            assert!(!allowed(&Url::parse(rejected).unwrap()), "{rejected}");
        }
        assert!(allowed(&Url::parse("https://example.org/").unwrap()));
    }

    #[test]
    fn identical_tab_identifiers_remain_scoped_to_their_browser_window() {
        let tab = json!("tab-1");
        let desktop = page_key("main", &tab).unwrap();
        let detached = page_key("dex-detached-browser", &tab).unwrap();
        assert_ne!(page_label(&desktop), page_label(&detached));
        assert!(page_label(&desktop).starts_with(PAGE_PREFIX));
        assert!(page_label(&detached).starts_with(PAGE_PREFIX));
        assert!(page_key("main", &json!("../../main")).is_err());
        assert!(page_key("main", &json!("a".repeat(65))).is_err());
    }
}
