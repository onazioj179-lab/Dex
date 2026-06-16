// =============================================================================
// DEX 6.0 — Native Cache Manager (GOAL-6A)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Bounded in-memory cache: LRU eviction + optional per-entry TTL. One shared
//! primitive so callers stop hand-rolling ad-hoc `HashMap` caches (each with its
//! own, subtly-different eviction). Pure `std`, no dependencies.
//!
//! - **LRU** is driven by a monotonic access counter, NOT the wall clock, so
//!   eviction order is fully deterministic and test-stable.
//! - **TTL** is optional, per entry (or a cache-wide default); expired entries are
//!   dropped lazily on access and preferred first when evicting for capacity.

use std::collections::HashMap;
use std::hash::Hash;
use std::time::{Duration, Instant};

struct Entry<V> {
    value: V,
    /// Monotonic access stamp for LRU ordering (higher = more recently used).
    used: u64,
    /// Absolute expiry instant; `None` = never expires.
    expires_at: Option<Instant>,
}

/// A bounded cache holding at most `capacity` live entries.
pub struct Cache<K, V> {
    map: HashMap<K, Entry<V>>,
    capacity: usize,
    tick: u64,
    default_ttl: Option<Duration>,
}

impl<K: Eq + Hash + Clone, V> Cache<K, V> {
    /// New cache holding at most `capacity` entries (floored at 1). No default TTL.
    pub fn new(capacity: usize) -> Self {
        Self { map: HashMap::new(), capacity: capacity.max(1), tick: 0, default_ttl: None }
    }

    /// New cache that stamps every insert with `ttl` unless an explicit TTL is given.
    pub fn with_ttl(capacity: usize, ttl: Duration) -> Self {
        Self { map: HashMap::new(), capacity: capacity.max(1), tick: 0, default_ttl: Some(ttl) }
    }

    fn next_tick(&mut self) -> u64 {
        self.tick = self.tick.wrapping_add(1);
        self.tick
    }

    fn is_expired(entry: &Entry<V>, now: Instant) -> bool {
        matches!(entry.expires_at, Some(t) if now >= t)
    }

    /// Insert or replace `key`, applying the cache's default TTL (if any).
    pub fn insert(&mut self, key: K, value: V) {
        let ttl = self.default_ttl;
        self.insert_inner(key, value, ttl);
    }

    /// Insert or replace `key` with an explicit TTL for this entry.
    pub fn insert_with_ttl(&mut self, key: K, value: V, ttl: Duration) {
        self.insert_inner(key, value, Some(ttl));
    }

    fn insert_inner(&mut self, key: K, value: V, ttl: Option<Duration>) {
        let used = self.next_tick();
        let expires_at = ttl.map(|d| Instant::now() + d);
        self.map.insert(key, Entry { value, used, expires_at });
        self.evict_if_needed();
    }

    /// Fetch a live (non-expired) value, refreshing its LRU recency. Expired
    /// entries are removed and reported as a miss.
    pub fn get(&mut self, key: &K) -> Option<&V> {
        let now = Instant::now();
        let expired = self.map.get(key).map(|e| Self::is_expired(e, now)).unwrap_or(false);
        if expired {
            self.map.remove(key);
            return None;
        }
        let used = self.next_tick();
        let entry = self.map.get_mut(key)?;
        entry.used = used;
        Some(&entry.value)
    }

    /// Whether a live entry exists for `key`. Does NOT refresh LRU recency.
    pub fn contains_key(&self, key: &K) -> bool {
        self.map
            .get(key)
            .map(|e| !Self::is_expired(e, Instant::now()))
            .unwrap_or(false)
    }

    /// Remove `key`, returning its value if present (even if expired).
    pub fn remove(&mut self, key: &K) -> Option<V> {
        self.map.remove(key).map(|e| e.value)
    }

    pub fn clear(&mut self) {
        self.map.clear();
    }

    /// Stored entry count (may include not-yet-purged expired entries; call
    /// [`Cache::purge_expired`] first, or [`Cache::contains_key`] for liveness).
    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Drop every expired entry; returns how many were removed.
    pub fn purge_expired(&mut self) -> usize {
        let now = Instant::now();
        let before = self.map.len();
        self.map.retain(|_, e| !Self::is_expired(e, now));
        before - self.map.len()
    }

    /// Evict down to capacity: expired entries go first (free wins), then the
    /// least-recently-used. O(n) per eviction, which is fine for bounded caches
    /// that evict at most one entry per insert.
    fn evict_if_needed(&mut self) {
        if self.map.len() <= self.capacity {
            return;
        }
        self.purge_expired();
        while self.map.len() > self.capacity {
            let lru = self
                .map
                .iter()
                .min_by_key(|(_, e)| e.used)
                .map(|(k, _)| k.clone());
            match lru {
                Some(k) => {
                    self.map.remove(&k);
                }
                None => break,
            }
        }
    }
}

impl<K: Eq + Hash + Clone, V> Default for Cache<K, V> {
    fn default() -> Self {
        Self::new(128)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evicts_least_recently_used() {
        let mut c: Cache<&str, i32> = Cache::new(2);
        c.insert("a", 1);
        c.insert("b", 2);
        // Touch "a" so "b" becomes the least-recently-used.
        assert_eq!(c.get(&"a"), Some(&1));
        c.insert("c", 3); // over capacity -> evict LRU ("b")
        assert_eq!(c.len(), 2);
        assert!(c.contains_key(&"a"));
        assert!(c.contains_key(&"c"));
        assert!(!c.contains_key(&"b"), "least-recently-used entry should be evicted");
    }

    #[test]
    fn insert_replaces_in_place() {
        let mut c: Cache<&str, i32> = Cache::new(8);
        c.insert("k", 1);
        c.insert("k", 2);
        assert_eq!(c.len(), 1, "re-inserting a key must not duplicate it");
        assert_eq!(c.get(&"k"), Some(&2));
    }

    #[test]
    fn zero_ttl_is_immediately_expired() {
        let mut c: Cache<&str, i32> = Cache::new(8);
        c.insert_with_ttl("k", 1, Duration::from_millis(0));
        assert_eq!(c.get(&"k"), None, "a 0ms TTL entry is expired on the next access");
        assert_eq!(c.len(), 0, "a missed-because-expired get purges the entry");
    }

    #[test]
    fn ttl_entry_lives_then_expires() {
        let mut c: Cache<&str, i32> = Cache::new(8);
        c.insert_with_ttl("k", 7, Duration::from_millis(30));
        assert_eq!(c.get(&"k"), Some(&7), "still live before TTL elapses");
        std::thread::sleep(Duration::from_millis(80));
        assert_eq!(c.get(&"k"), None, "gone after TTL elapses");
    }

    #[test]
    fn purge_expired_removes_only_expired() {
        let mut c: Cache<&str, i32> = Cache::new(8);
        c.insert("keep", 1); // never expires
        c.insert_with_ttl("drop", 2, Duration::from_millis(0));
        assert_eq!(c.purge_expired(), 1);
        assert_eq!(c.len(), 1);
        assert!(c.contains_key(&"keep"));
    }

    #[test]
    fn remove_and_clear() {
        let mut c: Cache<&str, i32> = Cache::new(8);
        c.insert("a", 1);
        c.insert("b", 2);
        assert_eq!(c.remove(&"a"), Some(1));
        assert_eq!(c.remove(&"a"), None);
        assert_eq!(c.len(), 1);
        c.clear();
        assert!(c.is_empty());
    }

    #[test]
    fn capacity_is_floored_at_one() {
        let mut c: Cache<&str, i32> = Cache::new(0);
        assert_eq!(c.capacity(), 1);
        c.insert("a", 1);
        c.insert("b", 2); // evicts "a"
        assert_eq!(c.len(), 1);
        assert!(c.contains_key(&"b"));
    }

    #[test]
    fn default_ttl_applies_to_inserts() {
        let mut c: Cache<&str, i32> = Cache::with_ttl(8, Duration::from_millis(0));
        c.insert("k", 1); // uses the default 0ms TTL
        assert_eq!(c.get(&"k"), None);
    }
}
