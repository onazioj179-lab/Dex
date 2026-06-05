// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Color math for the creative apps (Prism/Forge/Canvas) and a11y contrast
//! checks (Shell). hex <-> rgb <-> hsl, WCAG luminance + contrast. Pure.

/// Parse `#rgb`, `#rrggbb` (or without `#`) into an (r, g, b) triple.
pub fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let s = hex.trim().trim_start_matches('#');
    let full = match s.len() {
        3 => s.chars().flat_map(|c| [c, c]).collect::<String>(),
        6 => s.to_string(),
        _ => return None,
    };
    let r = u8::from_str_radix(&full[0..2], 16).ok()?;
    let g = u8::from_str_radix(&full[2..4], 16).ok()?;
    let b = u8::from_str_radix(&full[4..6], 16).ok()?;
    Some((r, g, b))
}

/// `(r, g, b)` -> `#rrggbb` (lowercase).
pub fn rgb_to_hex(r: u8, g: u8, b: u8) -> String {
    format!("#{:02x}{:02x}{:02x}", r, g, b)
}

/// `(r, g, b)` (0..255) -> `(h 0..360, s 0..1, l 0..1)`.
pub fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let rf = r as f64 / 255.0;
    let gf = g as f64 / 255.0;
    let bf = b as f64 / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let l = (max + min) / 2.0;
    let d = max - min;
    if d.abs() < 1e-12 {
        return (0.0, 0.0, l); // achromatic
    }
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if (max - rf).abs() < 1e-12 {
        ((gf - bf) / d) % 6.0
    } else if (max - gf).abs() < 1e-12 {
        (bf - rf) / d + 2.0
    } else {
        (rf - gf) / d + 4.0
    };
    let mut h = h * 60.0;
    if h < 0.0 {
        h += 360.0;
    }
    (h, s, l)
}

fn hue_to_rgb(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 1.0 / 2.0 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

/// `(h 0..360, s 0..1, l 0..1)` -> `(r, g, b)` (0..255), rounded.
pub fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let hn = ((h % 360.0) + 360.0) % 360.0 / 360.0;
    if s <= 0.0 {
        let v = (l * 255.0).round().clamp(0.0, 255.0) as u8;
        return (v, v, v);
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let r = hue_to_rgb(p, q, hn + 1.0 / 3.0);
    let g = hue_to_rgb(p, q, hn);
    let b = hue_to_rgb(p, q, hn - 1.0 / 3.0);
    (
        (r * 255.0).round().clamp(0.0, 255.0) as u8,
        (g * 255.0).round().clamp(0.0, 255.0) as u8,
        (b * 255.0).round().clamp(0.0, 255.0) as u8,
    )
}

/// WCAG relative luminance (0..1).
pub fn relative_luminance(r: u8, g: u8, b: u8) -> f64 {
    fn ch(c: u8) -> f64 {
        let c = c as f64 / 255.0;
        if c <= 0.03928 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    }
    0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

/// WCAG contrast ratio between two colors (1.0 ..= 21.0).
pub fn contrast_ratio(c1: (u8, u8, u8), c2: (u8, u8, u8)) -> f64 {
    let l1 = relative_luminance(c1.0, c1.1, c1.2);
    let l2 = relative_luminance(c2.0, c2.1, c2.2);
    let (hi, lo) = if l1 >= l2 { (l1, l2) } else { (l2, l1) };
    (hi + 0.05) / (lo + 0.05)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_parsing_and_formatting() {
        assert_eq!(hex_to_rgb("#ffffff"), Some((255, 255, 255)));
        assert_eq!(hex_to_rgb("000000"), Some((0, 0, 0)));
        assert_eq!(hex_to_rgb("#0af"), Some((0, 0xaa, 0xff))); // shorthand expands
        assert_eq!(hex_to_rgb("#12g456"), None); // bad hex digit
        assert_eq!(hex_to_rgb("#abcd"), None); // bad length
        assert_eq!(rgb_to_hex(255, 160, 0), "#ffa000");
    }

    #[test]
    fn rgb_hsl_roundtrips_primaries() {
        let red = rgb_to_hsl(255, 0, 0);
        assert!((red.0 - 0.0).abs() < 1e-6);
        assert!((red.1 - 1.0).abs() < 1e-6);
        assert!((red.2 - 0.5).abs() < 1e-6);
        assert_eq!(hsl_to_rgb(0.0, 1.0, 0.5), (255, 0, 0));
        assert_eq!(hsl_to_rgb(120.0, 1.0, 0.5), (0, 255, 0));
        assert_eq!(hsl_to_rgb(240.0, 1.0, 0.5), (0, 0, 255));
    }

    #[test]
    fn grayscale_is_achromatic() {
        let (h, s, _l) = rgb_to_hsl(128, 128, 128);
        assert_eq!(h, 0.0);
        assert_eq!(s, 0.0);
        assert_eq!(hsl_to_rgb(0.0, 0.0, 0.5), (128, 128, 128));
    }

    #[test]
    fn wcag_luminance_and_contrast() {
        assert!((relative_luminance(255, 255, 255) - 1.0).abs() < 1e-9);
        assert!(relative_luminance(0, 0, 0).abs() < 1e-9);
        // black-on-white is the maximum 21:1
        let cr = contrast_ratio((0, 0, 0), (255, 255, 255));
        assert!((cr - 21.0).abs() < 1e-6);
        // identical colors are 1:1
        assert!((contrast_ratio((100, 100, 100), (100, 100, 100)) - 1.0).abs() < 1e-9);
    }
}
