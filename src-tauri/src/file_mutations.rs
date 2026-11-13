// =============================================================================
// DEX Tauri — file mutations: files:copy / files:move / files:rename
//
// Never overwrite. A copy into a folder that already has the name gets a
// Finder-style "name copy.ext" / "name copy 2.ext" (so copying a file into its
// own folder duplicates it instead of targeting itself); a move or rename onto
// an existing name is refused. Folders copy recursively; symlinks are skipped
// so a link cycle cannot recurse forever; a folder can't go inside itself. A
// cross-volume move removes the original only after a complete copy.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn fail(msg: impl Into<String>) -> Value {
    json!({ "success": false, "error": msg.into() })
}

fn same_path(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// True when `inner` is `outer` or sits anywhere below it.
fn is_within(inner: &Path, outer: &Path) -> bool {
    match (inner.canonicalize(), outer.canonicalize()) {
        (Ok(i), Ok(o)) => i.starts_with(o),
        _ => false,
    }
}

/// `dir/name`, or the first free "stem copy[ N].ext" when that name is taken.
pub fn unique_dest(dir: &Path, name: &std::ffi::OsStr) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = if first.is_dir() {
        (name.to_string_lossy().into_owned(), String::new())
    } else {
        let p = Path::new(name);
        (
            p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
            p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default(),
        )
    };
    let mut n: u32 = 1;
    loop {
        let label = if n == 1 { format!("{stem} copy{ext}") } else { format!("{stem} copy {n}{ext}") };
        let cand = dir.join(label);
        if !cand.exists() {
            return cand;
        }
        n += 1;
    }
}

/// Recursive copy. Returns the number of symlinks skipped.
fn copy_tree(src: &Path, dest: &Path) -> std::io::Result<u64> {
    let meta = std::fs::symlink_metadata(src)?;
    if meta.file_type().is_symlink() {
        return Ok(1);
    }
    if meta.is_file() {
        std::fs::copy(src, dest)?;
        return Ok(0);
    }
    std::fs::create_dir(dest)?;
    let mut skipped = 0;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        skipped += copy_tree(&entry.path(), &dest.join(entry.file_name()))?;
    }
    Ok(skipped)
}

fn remove_partial(src_is_dir: bool, dest: &Path) {
    if src_is_dir {
        let _ = std::fs::remove_dir_all(dest);
    } else {
        let _ = std::fs::remove_file(dest);
    }
}

pub fn copy_into(src: &str, target_dir: &str) -> Value {
    let src_p = Path::new(src);
    let dir = Path::new(target_dir);
    let Some(name) = src_p.file_name() else { return fail("Invalid source path") };
    if !src_p.exists() {
        return fail(format!("{} no longer exists", name.to_string_lossy()));
    }
    if !dir.is_dir() {
        return fail("Destination is not a folder");
    }
    let src_is_dir = src_p.is_dir();
    if src_is_dir && is_within(dir, src_p) {
        return fail("A folder can't be copied into itself");
    }
    let dest = unique_dest(dir, name);
    match copy_tree(src_p, &dest) {
        Ok(skipped) => json!({ "success": true, "path": dest.to_string_lossy(), "skippedLinks": skipped }),
        Err(e) => {
            // Don't leave a half-copied item behind.
            remove_partial(src_is_dir, &dest);
            fail(e.to_string())
        }
    }
}

pub fn move_into(src: &str, target_dir: &str) -> Value {
    let src_p = Path::new(src);
    let dir = Path::new(target_dir);
    let Some(name) = src_p.file_name() else { return fail("Invalid source path") };
    if !src_p.exists() {
        return fail(format!("{} no longer exists", name.to_string_lossy()));
    }
    if !dir.is_dir() {
        return fail("Destination is not a folder");
    }
    let dest = dir.join(name);
    if same_path(src_p, &dest) {
        return json!({ "success": true, "path": dest.to_string_lossy(), "unchanged": true });
    }
    let src_is_dir = src_p.is_dir();
    if src_is_dir && is_within(dir, src_p) {
        return fail("A folder can't be moved into itself");
    }
    if dest.exists() {
        return fail(format!("An item named \"{}\" already exists there", name.to_string_lossy()));
    }
    if std::fs::rename(src_p, &dest).is_ok() {
        return json!({ "success": true, "path": dest.to_string_lossy() });
    }
    // rename fails across volumes: copy, then remove the original only once the
    // copy is complete.
    match copy_tree(src_p, &dest) {
        Ok(0) => {
            let res = if src_is_dir { std::fs::remove_dir_all(src_p) } else { std::fs::remove_file(src_p) };
            match res {
                Ok(()) => json!({ "success": true, "path": dest.to_string_lossy() }),
                Err(e) => fail(format!("Copied, but the original could not be removed: {e}")),
            }
        }
        // Links weren't carried over, so the original stays intact.
        Ok(skipped) => json!({
            "success": true, "path": dest.to_string_lossy(), "skippedLinks": skipped, "originalKept": true,
        }),
        Err(e) => {
            remove_partial(src_is_dir, &dest);
            fail(e.to_string())
        }
    }
}

pub fn rename_in_place(old: &str, new_name: &str) -> Value {
    // Only the basename of new_name (prevents path traversal via the name).
    let Some(safe) = Path::new(new_name).file_name() else { return fail("Invalid name") };
    let old_p = Path::new(old);
    let dest = old_p.parent().unwrap_or_else(|| Path::new(".")).join(safe);
    // A case-only rename on a case-insensitive volume points at the same file.
    if dest.exists() && !same_path(old_p, &dest) {
        return fail(format!("An item named \"{}\" already exists", safe.to_string_lossy()));
    }
    match std::fs::rename(old_p, &dest) {
        Ok(()) => json!({ "success": true, "path": dest.to_string_lossy() }),
        Err(e) => fail(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("dex-filemut-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }
    fn ok(v: &Value) -> bool {
        v["success"] == json!(true)
    }

    #[test]
    fn copy_into_same_folder_never_overwrites() {
        let d = scratch("copy-same");
        let f = d.join("a.txt");
        crate::write_atomic(&f, b"original").unwrap();
        assert!(ok(&copy_into(&s(&f), &s(&d))));
        assert!(ok(&copy_into(&s(&f), &s(&d))));
        assert_eq!(std::fs::read(&f).unwrap(), b"original");
        assert_eq!(std::fs::read(d.join("a copy.txt")).unwrap(), b"original");
        assert!(d.join("a copy 2.txt").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn copy_folder_recursively() {
        let d = scratch("copy-tree");
        let src = d.join("src");
        std::fs::create_dir_all(src.join("nested/deeper")).unwrap();
        crate::write_atomic(src.join("nested/deeper/x.bin"), vec![7u8; 4096]).unwrap();
        for i in 0..200 {
            crate::write_atomic(src.join(format!("f{i}.txt")), format!("{i}")).unwrap();
        }
        let out = d.join("out");
        std::fs::create_dir(&out).unwrap();
        let r = copy_into(&s(&src), &s(&out));
        assert!(ok(&r), "{r}");
        assert_eq!(std::fs::read(out.join("src/nested/deeper/x.bin")).unwrap(), vec![7u8; 4096]);
        assert_eq!(std::fs::read_to_string(out.join("src/f199.txt")).unwrap(), "199");
        // Copying the folder again into the same place gets "src copy".
        assert!(ok(&copy_into(&s(&src), &s(&out))));
        assert!(out.join("src copy/nested/deeper/x.bin").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn folder_cannot_go_into_itself() {
        let d = scratch("self");
        let src = d.join("box");
        std::fs::create_dir_all(src.join("inner")).unwrap();
        assert!(!ok(&copy_into(&s(&src), &s(&src.join("inner")))));
        assert!(!ok(&move_into(&s(&src), &s(&src.join("inner")))));
        assert!(src.join("inner").is_dir());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn move_refuses_to_overwrite_and_same_folder_is_noop() {
        let d = scratch("move");
        let a = d.join("a");
        let b = d.join("b");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        crate::write_atomic(a.join("n.txt"), b"from-a").unwrap();
        crate::write_atomic(b.join("n.txt"), b"from-b").unwrap();
        assert!(!ok(&move_into(&s(&a.join("n.txt")), &s(&b))));
        assert_eq!(std::fs::read(b.join("n.txt")).unwrap(), b"from-b");
        assert_eq!(std::fs::read(a.join("n.txt")).unwrap(), b"from-a");
        let r = move_into(&s(&a.join("n.txt")), &s(&a));
        assert!(ok(&r) && r["unchanged"] == json!(true));
        std::fs::remove_file(b.join("n.txt")).unwrap();
        assert!(ok(&move_into(&s(&a.join("n.txt")), &s(&b))));
        assert!(!a.join("n.txt").exists());
        assert_eq!(std::fs::read(b.join("n.txt")).unwrap(), b"from-a");
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn rename_refuses_existing_name_and_strips_paths() {
        let d = scratch("rename");
        crate::write_atomic(d.join("one.txt"), b"1").unwrap();
        crate::write_atomic(d.join("two.txt"), b"2").unwrap();
        assert!(!ok(&rename_in_place(&s(&d.join("one.txt")), "two.txt")));
        assert_eq!(std::fs::read(d.join("two.txt")).unwrap(), b"2");
        assert!(ok(&rename_in_place(&s(&d.join("one.txt")), "../escaped.txt")));
        assert!(d.join("escaped.txt").exists());
        // Case-only rename is allowed (same file on case-insensitive volumes).
        assert!(ok(&rename_in_place(&s(&d.join("escaped.txt")), "ESCAPED.txt")));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_source_is_reported() {
        let d = scratch("missing");
        let r = copy_into(&s(&d.join("ghost.txt")), &s(&d));
        assert!(!ok(&r));
        assert!(r["error"].as_str().unwrap().contains("no longer exists"));
        let _ = std::fs::remove_dir_all(&d);
    }
}
