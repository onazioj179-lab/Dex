// =============================================================================
// DEX Ledger — calendar dates (YYYY-MM-DD) without a date library.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Ledger dates are civil calendar days stored as `YYYY-MM-DD` text (sortable,
//! timezone-free). Budget months are `YYYY-MM`. Conversions use Howard
//! Hinnant's days-from-civil algorithm so arithmetic is exact.

/// Parse and validate `YYYY-MM-DD` (real day-of-month, years 1900..=2999).
pub fn parse(s: &str) -> Option<(i64, u32, u32)> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let y: i64 = s[0..4].parse().ok()?;
    let m: u32 = s[5..7].parse().ok()?;
    let d: u32 = s[8..10].parse().ok()?;
    if !(1900..=2999).contains(&y) || !(1..=12).contains(&m) || d < 1 || d > days_in_month(y, m) {
        return None;
    }
    Some((y, m, d))
}

pub fn is_valid(s: &str) -> bool {
    parse(s).is_some()
}

/// Validate `YYYY-MM`.
pub fn is_valid_month(s: &str) -> bool {
    s.len() == 7 && parse(&format!("{s}-01")).is_some()
}

pub fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

pub fn days_in_month(y: i64, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => if is_leap(y) { 29 } else { 28 },
        _ => 0,
    }
}

pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = m as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn fmt(y: i64, m: u32, d: u32) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}

/// Days between two valid dates (b - a).
pub fn diff_days(a: &str, b: &str) -> Option<i64> {
    let (ya, ma, da) = parse(a)?;
    let (yb, mb, db) = parse(b)?;
    Some(days_from_civil(yb, mb, db) - days_from_civil(ya, ma, da))
}

pub fn add_days(s: &str, n: i64) -> Option<String> {
    let (y, m, d) = parse(s)?;
    let (y2, m2, d2) = civil_from_days(days_from_civil(y, m, d) + n);
    Some(fmt(y2, m2, d2))
}

/// Add months, clamping the day to the target month's length (Jan 31 + 1 = Feb 28/29).
pub fn add_months(s: &str, n: i64) -> Option<String> {
    let (y, m, d) = parse(s)?;
    let idx = y * 12 + (m as i64 - 1) + n;
    let ny = idx.div_euclid(12);
    let nm = (idx.rem_euclid(12) + 1) as u32;
    let nd = d.min(days_in_month(ny, nm));
    Some(fmt(ny, nm, nd))
}

/// `YYYY-MM` shifted by n months.
pub fn shift_month(month: &str, n: i64) -> Option<String> {
    add_months(&format!("{month}-01"), n).map(|d| d[0..7].to_string())
}

/// Last calendar day of a `YYYY-MM` month.
pub fn month_end(month: &str) -> Option<String> {
    let (y, m, _) = parse(&format!("{month}-01"))?;
    Some(fmt(y, m, days_in_month(y, m)))
}

/// Today's UTC date. The renderer normally passes the user's local `today`.
pub fn today_utc() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let (y, m, d) = civil_from_days(secs.div_euclid(86400));
    fmt(y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_dates() {
        assert!(is_valid("2024-02-29"));
        assert!(!is_valid("2023-02-29"));
        assert!(!is_valid("2024-13-01"));
        assert!(!is_valid("2024-1-01"));
        assert!(is_valid_month("2026-11"));
        assert!(!is_valid_month("2026-00"));
    }

    #[test]
    fn month_arithmetic_clamps() {
        assert_eq!(add_months("2024-01-31", 1).unwrap(), "2024-02-29");
        assert_eq!(add_months("2023-01-31", 1).unwrap(), "2023-02-28");
        assert_eq!(add_months("2024-12-15", 1).unwrap(), "2025-01-15");
        assert_eq!(shift_month("2026-01", -1).unwrap(), "2025-12");
        assert_eq!(month_end("2024-02").unwrap(), "2024-02-29");
    }

    #[test]
    fn day_arithmetic_round_trips() {
        assert_eq!(add_days("2024-02-28", 2).unwrap(), "2024-03-01");
        assert_eq!(diff_days("2024-01-01", "2025-01-01").unwrap(), 366);
        let z = days_from_civil(2026, 11, 4);
        assert_eq!(civil_from_days(z), (2026, 11, 4));
    }
}
