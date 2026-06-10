// =============================================================================
// DEX 6.0 — Shared native helpers (Tauri shell)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Small cross-subsystem helpers. One implementation each — subsystem modules
//! must use these rather than growing local copies (Refinement initiative:
//! no duplicate functionality).

/// A UUIDv4-shaped identifier seeded from the wall clock and process id, mixed
/// through SplitMix64. Used where Electron used `crypto.randomUUID()` for local
/// row ids / session labels — collision resistance across one machine's
/// processes is all that is required, so this does not need to be (and is not)
/// cryptographically random.
pub fn pseudo_uuid_v4() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut seed = nanos ^ ((std::process::id() as u64) << 32);
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

/// UTC now as a JS `new Date().toISOString()` equivalent:
/// `YYYY-MM-DDTHH:MM:SS.mmmZ`. Self-contained (no chrono); converts days since
/// the epoch to a civil date with the standard Gregorian algorithm.
pub fn iso_utc_now() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let millis_total = dur.as_millis() as i64;
    let secs = millis_total.div_euclid(1000);
    let millis = millis_total.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let secs_of_day = secs.rem_euclid(86_400);
    let (h, m, s) = (secs_of_day / 3600, (secs_of_day % 3600) / 60, secs_of_day % 60);

    // civil_from_days (Howard Hinnant) — days since 1970-01-01 to (y, m, d).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mth <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, mth, d, h, m, s, millis
    )
}
