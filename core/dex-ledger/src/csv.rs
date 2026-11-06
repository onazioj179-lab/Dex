// =============================================================================
// DEX Ledger — RFC 4180 CSV reader/writer.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Small, dependency-free CSV handling for bank exports: quoted fields with
//! embedded delimiters/newlines/escaped quotes, CRLF or LF, a UTF-8 BOM, and
//! comma / semicolon / tab delimiters (auto-detected from the header line).

/// Pick the delimiter that splits the first line into the most fields.
pub fn detect_delimiter(text: &str) -> char {
    let first = text.trim_start_matches('\u{feff}').lines().next().unwrap_or("");
    let mut best = (',', 0usize);
    for d in [',', ';', '\t', '|'] {
        let n = parse_with(first, d).first().map(|r| r.len()).unwrap_or(0);
        if n > best.1 {
            best = (d, n);
        }
    }
    best.0
}

pub fn parse(text: &str) -> Vec<Vec<String>> {
    parse_with(text, detect_delimiter(text))
}

pub fn parse_with(text: &str, delim: char) -> Vec<Vec<String>> {
    let text = text.trim_start_matches('\u{feff}');
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = text.chars().peekable();
    let mut row_has_content = false;
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
            continue;
        }
        match c {
            '"' => {
                in_quotes = true;
                row_has_content = true;
            }
            c if c == delim => {
                row.push(std::mem::take(&mut field));
                row_has_content = true;
            }
            '\r' => {}
            '\n' => {
                if row_has_content || !field.is_empty() {
                    row.push(std::mem::take(&mut field));
                    rows.push(std::mem::take(&mut row));
                }
                row_has_content = false;
            }
            _ => {
                field.push(c);
                row_has_content = true;
            }
        }
    }
    if row_has_content || !field.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows
}

/// Quote a field when it contains a delimiter, quote, or newline. Fields that
/// start with a formula trigger are prefixed with `'` so a spreadsheet never
/// executes imported text (CSV injection).
pub fn escape(field: &str) -> String {
    let guarded = match field.chars().next() {
        Some('=') | Some('+') | Some('@') | Some('\t') => format!("'{field}"),
        Some('-') if field.len() > 1 && !field[1..].starts_with(|c: char| c.is_ascii_digit() || c == '.') => format!("'{field}"),
        _ => field.to_string(),
    };
    if guarded.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", guarded.replace('"', "\"\""))
    } else {
        guarded
    }
}

pub fn write_row(fields: &[String]) -> String {
    let mut s = fields.iter().map(|f| escape(f)).collect::<Vec<_>>().join(",");
    s.push_str("\r\n");
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quotes_and_newlines() {
        let rows = parse("Date,Payee,Amount\r\n2026-01-02,\"Shop, Inc\",\"-1,200.00\"\n2026-01-03,\"He said \"\"hi\"\"\",5\n");
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[1], vec!["2026-01-02", "Shop, Inc", "-1,200.00"]);
        assert_eq!(rows[2][1], "He said \"hi\"");
    }

    #[test]
    fn detects_semicolons_and_bom() {
        let rows = parse("\u{feff}Datum;Betrag\n01.02.2026;-12,50\n");
        assert_eq!(rows[0], vec!["Datum", "Betrag"]);
        assert_eq!(rows[1][1], "-12,50");
    }

    #[test]
    fn escapes_and_guards_formulas() {
        assert_eq!(escape("a,b"), "\"a,b\"");
        assert_eq!(escape("=SUM(A1)"), "'=SUM(A1)");
        assert_eq!(escape("-12.50"), "-12.50");
        assert_eq!(escape("-cmd"), "'-cmd");
    }
}
