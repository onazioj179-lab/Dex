// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, EventTarget, Manager, Url};
use tauri_plugin_dialog::{DialogExt, FilePath};
use webview2_com::{
    take_pwstr, BytesReceivedChangedEventHandler, DownloadStartingEventHandler,
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Deferral, ICoreWebView2DownloadOperation,
        ICoreWebView2DownloadStartingEventArgs, ICoreWebView2_4,
        COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON,
        COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_CANCELED, COREWEBVIEW2_DOWNLOAD_STATE,
        COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED, COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS,
    },
    StateChangedEventHandler,
};
use windows::core::{Interface, HSTRING, PWSTR};

const MAX_ACTIVE: usize = 8;
const MAX_RETAINED: usize = 100;
const EVENT: &str = "dex-browser-download";
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Status {
    Waiting,
    Choosing,
    Downloading,
    Completed,
    Canceled,
    Failed,
}

impl Status {
    fn active(self) -> bool {
        matches!(self, Self::Waiting | Self::Choosing | Self::Downloading)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Download {
    id: u64,
    revision: u64,
    tab: String,
    host: String,
    name: String,
    status: Status,
    received: u64,
    total: Option<u64>,
    #[serde(skip)]
    owner: String,
    #[serde(skip)]
    instance: u64,
}

fn records() -> &'static Mutex<BTreeMap<u64, Download>> {
    static RECORDS: OnceLock<Mutex<BTreeMap<u64, Download>>> = OnceLock::new();
    RECORDS.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn owned_record(owner: &str, id: u64) -> Option<Download> {
    records()
        .lock()
        .ok()
        .and_then(|list| list.get(&id).filter(|entry| entry.owner == owner).cloned())
}

// COM handles stay on the WebView2 UI thread. IPC and the picker callback only
// move validated data back to that thread.
struct Pending {
    args: ICoreWebView2DownloadStartingEventArgs,
    deferral: ICoreWebView2Deferral,
    operation: ICoreWebView2DownloadOperation,
    approved: bool,
}

impl Drop for Pending {
    fn drop(&mut self) {
        // The request starts canceled. Only an accepted Save dialog clears it.
        unsafe {
            if !self.approved {
                let _ = self.args.SetCancel(true);
            }
            let _ = self.deferral.Complete();
        }
    }
}

struct Active {
    operation: ICoreWebView2DownloadOperation,
    bytes_token: i64,
    state_token: i64,
}

impl Drop for Active {
    fn drop(&mut self) {
        unsafe {
            let _ = self.operation.remove_BytesReceivedChanged(self.bytes_token);
            let _ = self.operation.remove_StateChanged(self.state_token);
        }
    }
}

thread_local! {
    static PENDING: RefCell<BTreeMap<u64, Pending>> = const { RefCell::new(BTreeMap::new()) };
    static ACTIVE: RefCell<BTreeMap<u64, Active>> = const { RefCell::new(BTreeMap::new()) };
}

fn download_origin(address: &str) -> Option<String> {
    if address.len() > 16_384 {
        return None;
    }
    let url = Url::parse(address).ok()?;
    let target = if url.scheme() == "blob" {
        Url::parse(url.path()).ok()?
    } else {
        url
    };
    if !crate::browser_pages::allowed(&target) {
        return None;
    }
    target.host_str().map(str::to_string)
}

fn suggest_name(path: &str) -> String {
    let name = path.rsplit(['/', '\\']).next().unwrap_or_default();
    let safe: String = name
        .chars()
        .filter(|ch| !ch.is_control() && !matches!(ch,
            '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'
        ))
        .take(180)
        .collect();
    let safe = safe.trim().trim_end_matches(['.', ' ']);
    if safe.is_empty() {
        "download".into()
    } else {
        safe.into()
    }
}

fn emit(app: &AppHandle, download: &Download) {
    let _ = app.emit_to(
        EventTarget::webview_window(&download.owner),
        EVENT,
        download,
    );
}

fn publish(app: &AppHandle, id: u64, change: impl FnOnce(&mut Download)) {
    let record = records().lock().ok().and_then(|mut records| {
        let record = records.get_mut(&id)?;
        if !record.status.active() {
            return None;
        }
        change(record);
        record.revision += 1;
        Some(record.clone())
    });
    if let Some(record) = record {
        emit(app, &record);
    }
}

fn admit(download: &Download) -> bool {
    let Ok(mut records) = records().lock() else {
        return false;
    };
    let active = records.values().filter(|record| record.status.active());
    if active.clone().count() >= MAX_ACTIVE
        || active.clone().any(|record| {
            record.instance == download.instance
                && matches!(record.status, Status::Waiting | Status::Choosing)
        })
    {
        return false;
    }
    if records.len() >= MAX_RETAINED {
        let oldest = records
            .values()
            .find(|record| !record.status.active())
            .map(|record| record.id);
        if let Some(id) = oldest {
            records.remove(&id);
        }
    }
    records.insert(download.id, download.clone());
    true
}

pub fn watch(
    app: AppHandle,
    view: &ICoreWebView2,
    owner: String,
    tab: String,
    instance: u64,
) -> windows::core::Result<()> {
    let view = view.cast::<ICoreWebView2_4>()?;
    unsafe {
        view.add_DownloadStarting(
            &DownloadStartingEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                args.SetCancel(true)?;
                args.SetHandled(true)?;
                let operation = args.DownloadOperation()?;
                let mut uri = PWSTR::null();
                operation.Uri(&mut uri)?;
                let Some(host) = download_origin(&take_pwstr(uri)) else {
                    return Ok(());
                };
                let mut destination = PWSTR::null();
                args.ResultFilePath(&mut destination)?;
                let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
                let item = Download {
                    id,
                    revision: 0,
                    tab: tab.clone(),
                    host,
                    name: suggest_name(&take_pwstr(destination)),
                    status: Status::Waiting,
                    received: 0,
                    total: None,
                    owner: owner.clone(),
                    instance,
                };
                let deferral = args.GetDeferral()?;
                let pending = Pending {
                    args,
                    deferral,
                    operation,
                    approved: false,
                };
                if admit(&item) {
                    PENDING.with(|entries| entries.borrow_mut().insert(id, pending));
                    emit(&app, &item);
                }
                Ok(())
            })),
            &mut 0,
        )
    }
}

fn progress(operation: &ICoreWebView2DownloadOperation) -> (u64, Option<u64>) {
    let mut received = 0;
    let mut total = -1;
    unsafe {
        let _ = operation.BytesReceived(&mut received);
        let _ = operation.TotalBytesToReceive(&mut total);
    }
    (received.max(0) as u64, u64::try_from(total).ok())
}

fn start(
    app: &AppHandle,
    id: u64,
    pending: &mut Pending,
    path: &Path,
    file_name: String,
) -> windows::core::Result<()> {
    let bytes_app = app.clone();
    let previous = Cell::new(None::<Instant>);
    let mut bytes_token = 0;
    let mut state_token = 0;
    let operation = pending.operation.clone();
    unsafe {
        operation.add_BytesReceivedChanged(
            &BytesReceivedChangedEventHandler::create(Box::new(move |operation, _| {
                let Some(operation) = operation else {
                    return Ok(());
                };
                let now = Instant::now();
                if previous
                    .get()
                    .is_some_and(|time| now.duration_since(time) < Duration::from_millis(250))
                {
                    return Ok(());
                }
                previous.set(Some(now));
                let (received, total) = progress(&operation);
                publish(&bytes_app, id, |item| {
                    item.received = received;
                    item.total = total;
                });
                Ok(())
            })),
            &mut bytes_token,
        )?;
        let state_app = app.clone();
        let state_handler = StateChangedEventHandler::create(Box::new(move |operation, _| {
            let Some(operation) = operation else {
                return Ok(());
            };
            let mut state = COREWEBVIEW2_DOWNLOAD_STATE::default();
            operation.State(&mut state)?;
            if state != COREWEBVIEW2_DOWNLOAD_STATE_IN_PROGRESS {
                let (received, total) = progress(&operation);
                let mut reason = COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON::default();
                let _ = operation.InterruptReason(&mut reason);
                publish(&state_app, id, |item| {
                    item.received = received;
                    item.total = total;
                    item.status = if state == COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED {
                        Status::Completed
                    } else if reason == COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_CANCELED {
                        Status::Canceled
                    } else {
                        Status::Failed
                    };
                });
                drop(ACTIVE.with(|entries| entries.borrow_mut().remove(&id)));
            }
            Ok(())
        }));
        if let Err(error) = operation.add_StateChanged(&state_handler, &mut state_token) {
            let _ = operation.remove_BytesReceivedChanged(bytes_token);
            return Err(error);
        }
        let active = Active {
            operation,
            bytes_token,
            state_token,
        };
        pending
            .args
            .SetResultFilePath(&HSTRING::from(path.as_os_str()))?;
        pending.args.SetCancel(false)?;
        ACTIVE.with(|entries| entries.borrow_mut().insert(id, active));
        pending.approved = true;
    }
    publish(app, id, |item| {
        item.status = Status::Downloading;
        item.name = file_name;
    });
    Ok(())
}

fn chosen(app: &AppHandle, id: u64, file: Option<FilePath>) {
    let pending = PENDING.with(|entries| entries.borrow_mut().remove(&id));
    let Some(mut pending) = pending else { return };
    let Some(file) = file else {
        publish(app, id, |item| item.status = Status::Canceled);
        return;
    };
    let Ok(path) = file.into_path() else {
        publish(app, id, |item| item.status = Status::Failed);
        return;
    };
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned());
    let Some(file_name) = file_name.filter(|_| path.is_absolute()) else {
        publish(app, id, |item| item.status = Status::Failed);
        return;
    };
    if start(app, id, &mut pending, &path, file_name).is_err() {
        publish(app, id, |item| item.status = Status::Failed);
    }
}

fn cancel(app: &AppHandle, id: u64) -> Result<(), &'static str> {
    let pending = PENDING.with(|entries| entries.borrow_mut().remove(&id));
    if let Some(pending) = pending {
        publish(app, id, |item| item.status = Status::Canceled);
        drop(pending);
        return Ok(());
    }
    let operation = ACTIVE.with(|entries| {
        entries
            .borrow()
            .get(&id)
            .map(|active| active.operation.clone())
    });
    if let Some(operation) = operation {
        unsafe { operation.Cancel() }.map_err(|_| "WebView2 could not cancel this download.")?;
        publish(app, id, |item| item.status = Status::Canceled);
        drop(ACTIVE.with(|entries| entries.borrow_mut().remove(&id)));
        return Ok(());
    }
    Err("This download is no longer active.")
}

fn act(app: &AppHandle, owner: &str, id: u64, action: &str) -> Result<(), &'static str> {
    let record = owned_record(owner, id).ok_or("This download is unavailable.")?;
    match action {
        "cancel" if record.status.active() => cancel(app, id),
        "save" if record.status == Status::Waiting => {
            publish(app, id, |item| item.status = Status::Choosing);
            let mut dialog = app
                .dialog()
                .file()
                .set_title("Save Browser download")
                .set_file_name(record.name);
            if let Some(owner) = app.get_webview_window(owner) {
                dialog = dialog.set_parent(&owner);
            }
            let dialog_app = app.clone();
            dialog.save_file(move |file| {
                let app = dialog_app.clone();
                let _ = dialog_app.run_on_main_thread(move || chosen(&app, id, file));
            });
            Ok(())
        }
        _ => Err("This download no longer accepts that action."),
    }
}

pub fn dispatch(app: &AppHandle, owner: &str, channel: &str, args: &Value) -> Value {
    if channel == "browser:downloads" {
        return records()
            .lock()
            .ok()
            .map(|list| {
                let items: Vec<_> = list
                    .values()
                    .rev()
                    .filter(|item| item.owner == owner)
                    .collect();
                json!({"success": true, "supported": true, "downloads": items})
            })
            .unwrap_or_else(|| json!({"success": false, "error": "Downloads are unavailable."}));
    }
    let Some(id) = args[0].as_u64() else {
        return json!({"success": false, "error": "Invalid download."});
    };
    let action = args[1].as_str().unwrap_or_default().to_owned();
    let owner = owner.to_owned();
    let task_app = app.clone();
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    if app
        .run_on_main_thread(move || {
            let _ = tx.send(act(&task_app, &owner, id, &action));
        })
        .is_err()
    {
        return json!({"success": false, "error": "The Browser window did not respond."});
    }
    match rx.recv_timeout(Duration::from_secs(3)) {
        Ok(Ok(())) => json!({"success": true}),
        Ok(Err(error)) => json!({"success": false, "error": error}),
        Err(_) => json!({"success": false, "error": "The Browser window did not respond."}),
    }
}

pub fn tab_has_download(owner: &str, tab: &str) -> bool {
    records().lock().is_ok_and(|list| {
        list.values()
            .any(|item| item.owner == owner && item.tab == tab && item.status.active())
    })
}

pub fn close_page(app: &AppHandle, instance: u64) {
    let app_for_task = app.clone();
    let _ = app.run_on_main_thread(move || {
        let ids: Vec<_> = records()
            .lock()
            .map(|list| {
                list.values()
                    .filter(|item| item.instance == instance && item.status.active())
                    .map(|item| item.id)
                    .collect()
            })
            .unwrap_or_default();
        for id in ids {
            if cancel(&app_for_task, id).is_err() {
                drop(ACTIVE.with(|entries| entries.borrow_mut().remove(&id)));
                publish(&app_for_task, id, |item| item.status = Status::Failed);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downloads_keep_the_existing_origin_policy_including_blob_origins() {
        assert_eq!(
            download_origin("https://example.org/item?q=token").as_deref(),
            Some("example.org")
        );
        assert_eq!(
            download_origin("blob:https://example.org/327").as_deref(),
            Some("example.org")
        );
        for rejected in [
            "http://example.org/file",
            "blob:null/327",
            "file:///C:/secrets",
            "https://user:secret@example.org/",
            "blob:https://tauri.localhost/327",
            "https://[::ffff:127.0.0.1]/",
            "data:text/plain,download",
        ] {
            assert_eq!(download_origin(rejected), None, "{rejected}");
        }
        assert_eq!(
            suggest_name("C:\\Users\\Documents\\report.pdf"),
            "report.pdf"
        );
        assert_eq!(
            suggest_name("/private/bad\u{202e}name?.txt "),
            "badname.txt"
        );
        assert_eq!(suggest_name("/private/.."), "download");
    }

    #[test]
    fn queued_downloads_are_owner_scoped_and_bounded() {
        records().lock().unwrap().clear();
        let make = |id, instance, owner: &str| Download {
            id,
            revision: 0,
            tab: "tab-one".into(),
            host: "example.org".into(),
            name: "report.pdf".into(),
            status: Status::Waiting,
            received: 0,
            total: None,
            owner: owner.into(),
            instance,
        };
        let desktop = make(1, 91, "main");
        assert!(admit(&desktop));
        assert!(tab_has_download("main", "tab-one"));
        assert!(owned_record("dex-detached-browser", 1).is_none());
        assert!(!tab_has_download("dex-detached-browser", "tab-one"));
        assert!(!admit(&make(2, 91, "main")));
        for id in 2..=MAX_ACTIVE as u64 {
            assert!(admit(&make(id, 91 + id, "dex-detached-browser")));
        }
        assert!(!admit(&make(50, 102, "main")));
        records().lock().unwrap().get_mut(&1).unwrap().status = Status::Completed;
        assert!(!tab_has_download("main", "tab-one"));
        assert!(admit(&make(50, 102, "main")));
        records().lock().unwrap().clear();
    }
}
