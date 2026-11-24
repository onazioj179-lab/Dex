// =============================================================================
// DEX Ledger — money in integer minor units.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Every amount in the ledger is an `i64` count of the currency's minor unit
//! (cents for USD/EUR, yen for JPY, fils for KWD). Text is parsed digit by digit;
//! no binary floating point is ever involved, so 0.1 + 0.2 is exactly 0.3.

/// ISO 4217 minor-unit exponent for a currency code. Codes not listed use 2.
pub fn minor_digits(code: &str) -> u32 {
    match code {
        "BIF" | "CLP" | "DJF" | "GNF" | "ISK" | "JPY" | "KMF" | "KRW" | "PYG" | "RWF" | "UGX"
        | "UYI" | "VND" | "VUV" | "XAF" | "XOF" | "XPF" => 0,
        "BHD" | "IQD" | "JOD" | "KWD" | "LYD" | "OMR" | "TND" => 3,
        _ => 2,
    }
}

/// A currency code is three ASCII uppercase letters.
pub fn is_valid_code(code: &str) -> bool {
    code.len() == 3 && code.bytes().all(|b| b.is_ascii_uppercase())
}

/// Plain decimal text for CSV export: `-1234.56` (no grouping, `.` separator).
pub fn format_minor(minor: i64, digits: u32) -> String {
    if digits == 0 {
        return minor.to_string();
    }
    let neg = minor < 0;
    let abs = minor.unsigned_abs();
    let scale = 10u64.pow(digits);
    let whole = abs / scale;
    let frac = abs % scale;
    format!(
        "{}{}.{:0width$}",
        if neg { "-" } else { "" },
        whole,
        frac,
        width = digits as usize
    )
}

/// Parse human/bank amount text into minor units.
///
/// Accepts `1,234.56`, `1.234,56` (with `decimal = ','`), `(12.00)` and
/// `12.00-` as negatives, leading `+`/`-`, currency symbols and spaces.
/// More fractional digits than the currency allows is an error unless the
/// extra digits are zeros (no silent rounding of money).
pub fn parse_amount(text: &str, decimal: char, digits: u32) -> Result<i64, String> {
    let raw = text.trim();
    if raw.is_empty() {
        return Err("empty amount".into());
    }
    let mut neg = false;
    let mut s: String = raw.to_string();
    if s.starts_with('(') && s.ends_with(')') {
        neg = true;
        s = s[1..s.len() - 1].to_string();
    }
    let s = s.trim();
    let mut body = String::new();
    let mut seen_digit = false;
    for (i, ch) in s.chars().enumerate() {
        match ch {
            '0'..='9' => {
                seen_digit = true;
                body.push(ch);
            }
            '-' | '\u{2212}' => {
                // leading or trailing minus only
                if !seen_digit || i == s.chars().count() - 1 {
                    neg = !neg;
                } else {
                    return Err(format!("unexpected '-' in \"{raw}\""));
                }
            }
            '+' => {}
            c if c == decimal => body.push('.'),
            ',' | '.' | '\'' | ' ' | '\u{a0}' | '\u{202f}' | '_' => {} // grouping
            c if c.is_alphabetic() || "$€£¥₦₹₩₽₺₪₫₱₴₲₵₡₸฿¤".contains(c) =>
                {} // symbols / codes
            _ => return Err(format!("unrecognised character '{ch}' in \"{raw}\"")),
        }
    }
    if !seen_digit {
        return Err(format!("no digits in \"{raw}\""));
    }
    let mut parts = body.splitn(3, '.');
    let whole = parts.next().unwrap_or("");
    let frac = parts.next().unwrap_or("");
    if parts.next().is_some() {
        return Err(format!("more than one decimal separator in \"{raw}\""));
    }
    let frac_trimmed = if frac.len() > digits as usize {
        let (keep, extra) = frac.split_at(digits as usize);
        if extra.bytes().any(|b| b != b'0') {
            return Err(format!("\"{raw}\" has more than {digits} decimal places"));
        }
        keep.to_string()
    } else {
        format!("{frac:0<width$}", width = digits as usize)
    };
    let scale = 10i64.checked_pow(digits).ok_or("bad currency exponent")?;
    let whole_v: i64 = if whole.is_empty() {
        0
    } else {
        whole
            .parse()
            .map_err(|_| format!("amount too large: \"{raw}\""))?
    };
    let frac_v: i64 = if frac_trimmed.is_empty() {
        0
    } else {
        frac_trimmed
            .parse()
            .map_err(|_| "bad fraction".to_string())?
    };
    let v = whole_v
        .checked_mul(scale)
        .and_then(|w| w.checked_add(frac_v))
        .ok_or_else(|| format!("amount too large: \"{raw}\""))?;
    Ok(if neg { -v } else { v })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digits_follow_iso_4217() {
        assert_eq!(minor_digits("USD"), 2);
        assert_eq!(minor_digits("JPY"), 0);
        assert_eq!(minor_digits("KWD"), 3);
        assert_eq!(minor_digits("NGN"), 2);
        assert!(is_valid_code("EUR"));
        assert!(!is_valid_code("eur"));
    }

    #[test]
    fn parses_common_formats_exactly() {
        assert_eq!(parse_amount("1,234.56", '.', 2).unwrap(), 123456);
        assert_eq!(parse_amount("1.234,56", ',', 2).unwrap(), 123456);
        assert_eq!(parse_amount("(12.00)", '.', 2).unwrap(), -1200);
        assert_eq!(parse_amount("12.00-", '.', 2).unwrap(), -1200);
        assert_eq!(parse_amount("-$0.10", '.', 2).unwrap(), -10);
        assert_eq!(parse_amount("€ 7", '.', 2).unwrap(), 700);
        assert_eq!(parse_amount("1500", '.', 0).unwrap(), 1500);
        assert_eq!(parse_amount("1.250", '.', 3).unwrap(), 1250);
        assert_eq!(parse_amount("2.500", '.', 2).unwrap(), 250);
        assert!(parse_amount("2.505", '.', 2).is_err());
        assert!(parse_amount("abc", '.', 2).is_err());
        assert!(parse_amount("", '.', 2).is_err());
    }

    #[test]
    fn formats_minor_units() {
        assert_eq!(format_minor(123456, 2), "1234.56");
        assert_eq!(format_minor(-5, 2), "-0.05");
        assert_eq!(format_minor(1500, 0), "1500");
        assert_eq!(format_minor(1250, 3), "1.250");
        // 0.1 + 0.2 is exactly 0.3 in minor units
        assert_eq!(format_minor(10 + 20, 2), "0.30");
    }
}
