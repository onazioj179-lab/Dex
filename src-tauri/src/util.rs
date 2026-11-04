// =============================================================================
// DEX 6.0 — Shared native helpers (Tauri shell)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Small cross-subsystem helpers. One implementation each — subsystem modules
//! must use these rather than growing local copies (Refinement initiative:
//! no duplicate functionality).

/// Stack for DEX's background threads. Rust's default is 2 MiB; DEX's workers
/// call into sysinfo/WMI, SQLite and serde on large payloads, and an earlier
/// packaged run died with "thread '<unknown>' has overflowed its stack".
pub const WORKER_STACK_BYTES: usize = 8 * 1024 * 1024;

/// Spawn a background thread with a name (so a crash report says which one)
/// and an 8 MiB stack.
pub fn spawn_named<F, T>(name: &str, f: F) -> std::thread::JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    let builder = std::thread::Builder::new()
        .name(format!("dex-{name}"))
        .stack_size(WORKER_STACK_BYTES);
    // `spawn` consumes the closure, so a failed Builder spawn cannot retry
    // with the same one; it only fails when the OS is out of threads/memory,
    // where a plain spawn would fail too.
    builder.spawn(f).expect("failed to spawn DEX worker thread")
}

/// A UUIDv4-shaped identifier seeded from the wall clock, process id, and a
/// per-process monotonic counter, mixed through SplitMix64. Used where Electron
/// used `crypto.randomUUID()` for local row ids / session labels — collision
/// resistance across one machine's processes is all that is required, so this
/// does not need to be (and is not) cryptographically random.
///
/// The counter is load-bearing: `nanos ^ pid` alone repeats whenever two ids are
/// minted inside the same clock tick (trivial in a tight loop — a row-id
/// generator's exact hot path), which would hand out duplicate "unique" ids.
/// `fetch_add` gives every call within a process a distinct seed, across threads
/// too, so successive ids never collide.
pub fn pseudo_uuid_v4() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut seed = nanos
        ^ ((std::process::id() as u64) << 32)
        ^ count.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    let mut next = || {
        seed = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = seed;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    };
    let (hi, lo) = (next(), next());
    let mut bytes = [0u8; 16];
    bytes[..8].copy_from_slice(&hi.to_be_bytes());
    bytes[8..].copy_from_slice(&lo.to_be_bytes());
    bytes[6] = (bytes[6] & 0x0F) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3F) | 0x80; // RFC 4122 variant
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// Shape must be a canonical UUIDv4 string: 8-4-4-4-12 lowercase hex with the
    /// version nibble pinned to `4` and the variant nibble in {8,9,a,b}.
    #[test]
    fn pseudo_uuid_v4_has_canonical_shape() {
        for _ in 0..1_000 {
            let id = pseudo_uuid_v4();
            let parts: Vec<&str> = id.split('-').collect();
            assert_eq!(parts.len(), 5, "expected 5 dash groups in {id}");
            assert_eq!(
                parts.iter().map(|p| p.len()).collect::<Vec<_>>(),
                vec![8, 4, 4, 4, 12],
                "group lengths wrong in {id}"
            );
            assert!(
                id.chars().all(|c| c == '-' || c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
                "non lowercase-hex character in {id}"
            );
            assert_eq!(&parts[2][..1], "4", "version nibble must be 4 in {id}");
            assert!(
                matches!(&parts[3][..1], "8" | "9" | "a" | "b"),
                "variant nibble must be 8/9/a/b in {id}"
            );
        }
    }

    /// Regression: minting ids in a tight loop must not collide. The old
    /// `nanos ^ pid` seed repeated within a single clock tick and produced
    /// duplicates here; the per-process counter fixes it.
    #[test]
    fn pseudo_uuid_v4_is_unique_in_a_tight_loop() {
        let n = 100_000;
        let mut seen = HashSet::with_capacity(n);
        for _ in 0..n {
            assert!(seen.insert(pseudo_uuid_v4()), "duplicate id minted in a tight loop");
        }
        assert_eq!(seen.len(), n);
    }

    /// Distinct ids across threads minted concurrently (the counter is atomic).
    #[test]
    fn pseudo_uuid_v4_is_unique_across_threads() {
        let per_thread = 20_000;
        let handles: Vec<_> = (0..4)
            .map(|_| std::thread::spawn(move || (0..per_thread).map(|_| pseudo_uuid_v4()).collect::<Vec<_>>()))
            .collect();
        let mut seen = HashSet::with_capacity(per_thread * 4);
        for h in handles {
            for id in h.join().expect("thread panicked") {
                assert!(seen.insert(id), "duplicate id minted across threads");
            }
        }
        assert_eq!(seen.len(), per_thread * 4);
    }
}


#[cfg(test)]
mod spawn_named_tests {
    use super::spawn_named;

    // ~4 MiB of stack: overflows Rust's default 2 MiB thread stack.
    fn deep(n: u32) -> u64 {
        let pad = [n as u8; 1024];
        if n == 0 { return pad[0] as u64; }
        deep(n - 1) + pad[(n % 1024) as usize] as u64
    }

    #[test]
    fn worker_threads_are_named_and_have_room() {
        let h = spawn_named("probe", || (std::thread::current().name().map(String::from), deep(3_500)));
        let (name, _) = h.join().expect("worker panicked");
        assert_eq!(name.as_deref(), Some("dex-probe"));
    }
}
