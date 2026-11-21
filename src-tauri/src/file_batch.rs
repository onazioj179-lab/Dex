// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use crate::file_transfer::{self, Conflict};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    ffi::OsString,
    fs,
    io::{self, ErrorKind},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

const MAX_ITEMS: usize = 5000;

struct Job {
    id: String,
    cancelled: AtomicBool,
}

static ACTIVE: Mutex<Option<Arc<Job>>> = Mutex::new(None);

struct Registration;
impl Drop for Registration {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE.lock() {
            *active = None;
        }
    }
}

#[derive(Clone, Copy)]
enum Action {
    Copy,
    Move,
    Trash,
}

pub fn trash(path: &Path) -> io::Result<()> {
    trash::delete(path).map_err(|error| io::Error::other(error.to_string()))
}

pub fn error_message(error: &io::Error) -> String {
    if error.kind() == ErrorKind::AlreadyExists {
        "An item with that name already exists at the destination.".into()
    } else {
        error.to_string()
    }
}

pub fn cancel(id: &str) -> Value {
    if let Ok(active) = ACTIVE.lock() {
        if let Some(job) = active.as_ref().filter(|job| job.id == id) {
            job.cancelled.store(true, Ordering::Relaxed);
            return json!({ "success": true });
        }
    }
    json!({ "success": false, "error": "The file operation is no longer running." })
}

pub fn run(request: &Value, progress: impl Fn(Value)) -> Value {
    match execute(request, progress) {
        Ok(items) => json!({ "success": true, "items": items }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

fn register(id: &str) -> Result<(Arc<Job>, Registration), String> {
    let job = Arc::new(Job {
        id: id.into(),
        cancelled: AtomicBool::new(false),
    });
    let mut active = ACTIVE
        .lock()
        .map_err(|_| "File operations are unavailable.")?;
    if active.is_some() {
        return Err("Another file batch is running.".into());
    }
    *active = Some(job.clone());
    Ok((job, Registration))
}

pub fn run_rename(request: &Value) -> Value {
    let result = (|| {
        let entries = request
            .as_array()
            .filter(|entries| !entries.is_empty() && entries.len() <= MAX_ITEMS)
            .ok_or("Select between 1 and 5,000 files.")?;
        let specifications = entries
            .iter()
            .map(|entry| {
                let source = entry["source"]
                    .as_str()
                    .filter(|path| !path.is_empty() && path.len() <= 131_072)
                    .ok_or("An invalid source path was supplied.")?;
                let name = entry["name"]
                    .as_str()
                    .filter(|name| !name.is_empty() && name.len() <= 4096)
                    .ok_or("An invalid filename was supplied.")?;
                Ok::<_, &str>((PathBuf::from(source), OsString::from(name)))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let (_job, _registration) = register("rename-files")?;
        file_transfer::rename_batch(&specifications).map_err(|error| error.to_string())
    })();
    match result {
        Ok(paths) => json!({ "success": true, "paths": paths }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

fn execute(request: &Value, progress: impl Fn(Value)) -> Result<Vec<Value>, String> {
    let id = request["id"]
        .as_str()
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 64
                && id
                    .bytes()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-')
        })
        .ok_or("Invalid batch identifier")?;
    let action = match request["action"].as_str() {
        Some("copy") => Action::Copy,
        Some("move") => Action::Move,
        Some("trash") => Action::Trash,
        _ => return Err("Unknown file operation".into()),
    };
    let sources = request["sources"]
        .as_array()
        .filter(|sources| !sources.is_empty() && sources.len() <= MAX_ITEMS)
        .ok_or("Select between 1 and 5,000 items.")?;
    let sources: Vec<&str> = sources
        .iter()
        .map(|source| {
            source
                .as_str()
                .filter(|path| !path.is_empty() && path.len() <= 131_072)
                .ok_or("An invalid source path was supplied.")
        })
        .collect::<Result<_, _>>()?;
    let destination = match action {
        Action::Trash => None,
        _ => {
            let path = request["destination"]
                .as_str()
                .filter(|path| !path.is_empty())
                .ok_or("Choose a destination folder.")?;
            let directory = Path::new(path)
                .canonicalize()
                .map_err(|error| error.to_string())?;
            if !directory.is_dir() {
                return Err("The destination must be a folder.".into());
            }
            Some(directory)
        }
    };
    let conflict = match request["conflict"].as_str() {
        None | Some("skip") => Conflict::Skip,
        Some("keepBoth") => Conflict::KeepBoth,
        _ => return Err("Unknown conflict option".into()),
    };
    let (job, _registration) = register(id)?;
    progress(json!({ "id": job.id, "finished": 0, "total": sources.len() }));

    let prepared: Vec<_> = sources
        .iter()
        .map(|path| {
            file_transfer::check_cancel(&job.cancelled)?;
            prepare(Path::new(path))
        })
        .collect();
    let folders: HashSet<&Path> = prepared
        .iter()
        .filter_map(|result| {
            result
                .as_ref()
                .ok()
                .filter(|entry| entry.directory)
                .map(|entry| entry.identity.as_path())
        })
        .collect();
    let mut seen = HashSet::new();
    let mut last_update = Instant::now();
    let mut items = Vec::with_capacity(sources.len());
    for (source, entry) in sources.iter().zip(&prepared) {
        let row = match entry {
            Ok(entry) if !seen.insert(entry.identity.as_path()) => {
                json!({ "source": source, "status": "covered", "reason": "Already selected" })
            }
            Ok(entry)
                if entry
                    .identity
                    .ancestors()
                    .skip(1)
                    .any(|parent| folders.contains(parent)) =>
            {
                json!({ "source": source, "status": "covered", "reason": "Included in a selected folder" })
            }
            _ if job.cancelled.load(Ordering::Relaxed) => {
                json!({ "source": source, "status": "cancelled" })
            }
            Ok(entry) => match action {
                Action::Copy | Action::Move => {
                    let directory = destination.as_deref().expect("validated above");
                    let result = file_transfer::transfer(
                        &entry.source,
                        directory,
                        matches!(action, Action::Move),
                        conflict,
                        &job.cancelled,
                        trash,
                    );
                    outcome(source, result.map(Some))
                }
                Action::Trash => outcome(source, trash(&entry.source).map(|()| None)),
            },
            Err(error) => {
                json!({ "source": source, "status": "failed", "reason": error_message(error) })
            }
        };
        items.push(row);
        if items.len() == sources.len() || last_update.elapsed() >= Duration::from_millis(100) {
            progress(json!({ "id": job.id, "finished": items.len(), "total": sources.len() }));
            last_update = Instant::now();
        }
    }
    Ok(items)
}

struct Source {
    source: PathBuf,
    identity: PathBuf,
    directory: bool,
}

fn prepare(path: &Path) -> io::Result<Source> {
    let source = file_transfer::normalize_source(path)?;
    let metadata = fs::symlink_metadata(&source)?;
    let link = file_transfer::is_link(&metadata);
    let identity = if link {
        source.clone()
    } else {
        source.canonicalize()?
    };
    Ok(Source {
        source,
        identity,
        directory: metadata.is_dir() && !link,
    })
}

fn outcome(source: &str, result: io::Result<Option<PathBuf>>) -> Value {
    match result {
        Ok(destination) => {
            json!({ "source": source, "status": "complete", "destination": destination })
        }
        Err(error) if error.kind() == ErrorKind::Interrupted => {
            json!({ "source": source, "status": "cancelled" })
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            json!({ "source": source, "status": "conflict", "reason": error_message(&error) })
        }
        Err(error) => match error
            .get_ref()
            .and_then(|inner| inner.downcast_ref::<file_transfer::PartialMove>())
        {
            Some(partial) => {
                json!({ "source": source, "status": "partial", "destination": partial.destination, "reason": error.to_string() })
            }
            None => {
                json!({ "source": source, "status": "failed", "reason": error_message(&error) })
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    static SERIAL: Mutex<()> = Mutex::new(());

    #[test]
    fn published_copy_is_reported_separately_when_original_is_kept() {
        let result = outcome(
            "source",
            Err(io::Error::other(file_transfer::PartialMove {
                destination: PathBuf::from("destination"),
                reason: "source changed".into(),
            })),
        );
        assert_eq!(result["status"], "partial");
        assert_eq!(result["destination"], "destination");
    }

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn create(label: &str) -> Self {
            let path =
                std::env::temp_dir().join(format!("dex-file-batch-{}-{label}", std::process::id()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn rename_ipc_rejects_unselected_destinations_and_accepts_a_swap() {
        let _serial = SERIAL.lock().unwrap();
        let scratch = TestDirectory::create("rename");
        let first = scratch.0.join("a.txt");
        let second = scratch.0.join("b.txt");
        fs::write(&first, b"a").unwrap();
        fs::write(&second, b"b").unwrap();
        assert_eq!(
            run_rename(&json!([{ "source": first, "name": "b.txt" }]))["success"],
            false
        );
        assert_eq!(
            run_rename(&json!([
                { "source": first, "name": "b.txt" },
                { "source": second, "name": "a.txt" }
            ]))["success"],
            true
        );
        assert_eq!(fs::read(first).unwrap(), b"b");
        assert_eq!(fs::read(second).unwrap(), b"a");
    }

    #[test]
    fn reports_nested_and_duplicate_selections_and_partial_failure() {
        let _serial = SERIAL.lock().unwrap();
        let scratch = TestDirectory::create("partial");
        let source = scratch.0.join("parent");
        let child = source.join("child");
        let missing = scratch.0.join("missing");
        let conflict = scratch.0.join("conflict");
        let destination = scratch.0.join("destination");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&destination).unwrap();
        fs::write(&child, b"snapshot").unwrap();
        fs::write(&conflict, b"new").unwrap();
        fs::write(destination.join("conflict"), b"original").unwrap();
        let updates = RefCell::new(Vec::new());

        let result = run(
            &json!({
                "id": "partial", "action": "copy", "destination": destination,
                "sources": [child, source, source, missing, conflict],
            }),
            |update| updates.borrow_mut().push(update),
        );
        assert_eq!(result["success"], true);
        for (index, status) in ["covered", "complete", "covered", "failed", "conflict"]
            .into_iter()
            .enumerate()
        {
            assert_eq!(result["items"][index]["status"], status);
        }
        assert_eq!(updates.borrow()[0]["finished"], 0);
        assert_eq!(updates.borrow().last().unwrap()["finished"], 5);
        assert_eq!(
            fs::read(destination.join("parent/child")).unwrap(),
            b"snapshot"
        );
        assert_eq!(fs::read(destination.join("conflict")).unwrap(), b"original");
        assert_eq!(cancel("partial")["success"], false);
    }

    #[test]
    fn cancels_the_registered_job_before_any_mutation() {
        let _serial = SERIAL.lock().unwrap();
        let scratch = TestDirectory::create("cancelled");
        let source = scratch.0.join("source");
        let destination = scratch.0.join("destination");
        fs::write(&source, b"original").unwrap();
        fs::create_dir(&destination).unwrap();
        let result = run(
            &json!({ "id": "cancelled", "action": "move",
            "destination": destination, "sources": [source] }),
            |update| {
                if update["finished"] == 0 {
                    assert_eq!(cancel("different-job")["success"], false);
                    assert_eq!(cancel("cancelled")["success"], true);
                }
            },
        );
        assert_eq!(result["items"][0]["status"], "cancelled");
        assert_eq!(fs::read(&source).unwrap(), b"original");
        assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
    }
}
