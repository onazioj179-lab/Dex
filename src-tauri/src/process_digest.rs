// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! What UKI knows about running processes: all of them, in a few hundred bytes.
//!
//! A busy PC runs 1,000+ processes; `system:getProcesses` keeps the top 500 for
//! Task Manager's table. UKI needs the whole picture but cannot read 1,000 rows
//! (slow, and it buries the answer), so `system:processDigest` summarises
//! everything natively:
//!   - totals: process count, CPU (% of the whole machine), memory;
//!   - programs: same-named processes added up (chrome.exe x 46 = one row),
//!     the top programs by CPU and by memory;
//!   - kinds: DEX's own tree, apps with a window, background;
//!   - a name search (`query`) that lists every matching program and its PIDs.
//! Read-only; nothing is stopped or changed.

use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Proc {
    pub pid: u32,
    pub name: String,
    /// Percent of ONE core (sysinfo); divided by the core count for machine %.
    pub cpu: f32,
    pub memory_mb: u64,
    pub kind: &'static str,
}

#[derive(Default, Clone, Debug)]
struct Group {
    name: String,
    count: usize,
    cpu: f32,
    memory_mb: u64,
    pids: Vec<u32>,
    windowed: bool,
}

/// "chrome.exe", "Chrome" and "chrome" are the same program.
fn program_key(name: &str) -> String {
    let lower = name.trim().to_ascii_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

fn round1(v: f32) -> f64 { (v as f64 * 10.0).round() / 10.0 }

pub fn digest(procs: &[Proc], cores: usize, total_memory_mb: u64, query: Option<&str>, top: usize) -> Value {
    let cores = cores.max(1) as f32;
    let mut groups: HashMap<String, Group> = HashMap::new();
    let (mut cpu_sum, mut mem_sum) = (0f32, 0u64);
    let mut kinds: HashMap<&'static str, (usize, u64)> = HashMap::new();
    for p in procs {
        cpu_sum += p.cpu;
        mem_sum += p.memory_mb;
        let k = kinds.entry(p.kind).or_default();
        k.0 += 1;
        k.1 += p.memory_mb;
        let g = groups.entry(program_key(&p.name)).or_insert_with(|| Group { name: p.name.clone(), ..Default::default() });
        g.count += 1;
        g.cpu += p.cpu;
        g.memory_mb += p.memory_mb;
        if g.pids.len() < 50 { g.pids.push(p.pid); }
        g.windowed |= p.kind == "app";
    }
    let row = |g: &Group| json!({
        "name": g.name, "count": g.count, "cpu": round1(g.cpu / cores), "memoryMb": g.memory_mb, "windowed": g.windowed,
    });
    let mut by_cpu: Vec<&Group> = groups.values().collect();
    by_cpu.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal).then(b.memory_mb.cmp(&a.memory_mb)));
    let mut by_mem: Vec<&Group> = groups.values().collect();
    by_mem.sort_by(|a, b| b.memory_mb.cmp(&a.memory_mb).then(a.name.cmp(&b.name)));
    let mut out = json!({
        "processes": procs.len(),
        "programs": groups.len(),
        "cpu": round1(cpu_sum / cores),
        "memoryMb": mem_sum,
        "totalMemoryMb": total_memory_mb,
        "kinds": kinds.iter().map(|(k, (n, m))| (k.to_string(), json!({ "count": n, "memoryMb": m }))).collect::<serde_json::Map<_, _>>(),
        "topCpu": by_cpu.iter().take(top).map(|g| row(g)).collect::<Vec<_>>(),
        "topMemory": by_mem.iter().take(top).map(|g| row(g)).collect::<Vec<_>>(),
    });
    if let Some(q) = query.map(|q| q.trim().to_ascii_lowercase()).filter(|q| !q.is_empty()) {
        let q = q.strip_suffix(".exe").unwrap_or(&q).to_string();
        let mut hits: Vec<&Group> = groups.iter().filter(|(k, _)| k.contains(&q)).map(|(_, g)| g).collect();
        hits.sort_by(|a, b| b.memory_mb.cmp(&a.memory_mb));
        out["query"] = json!(q);
        out["matches"] = json!(hits.iter().take(20).map(|g| {
            let mut r = row(g);
            r["pids"] = json!(g.pids);
            r
        }).collect::<Vec<_>>());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(pid: u32, name: &str, cpu: f32, mem: u64, kind: &'static str) -> Proc {
        Proc { pid, name: name.into(), cpu, memory_mb: mem, kind }
    }

    #[test]
    fn groups_programs_and_adds_them_up() {
        let procs = vec![
            p(1, "chrome.exe", 40.0, 300, "app"), p(2, "chrome.exe", 20.0, 200, "background"), p(3, "Chrome", 0.0, 100, "background"),
            p(4, "svchost.exe", 2.0, 50, "background"), p(5, "dex-tauri.exe", 8.0, 400, "dex"),
        ];
        let d = digest(&procs, 4, 16_000, None, 3);
        assert_eq!(d["processes"], 5);
        assert_eq!(d["programs"], 3);
        assert_eq!(d["cpu"], 17.5); // 70% of one core on 4 cores
        assert_eq!(d["topCpu"][0]["name"], "chrome.exe");
        assert_eq!(d["topCpu"][0]["count"], 3);
        assert_eq!(d["topCpu"][0]["cpu"], 15.0);
        assert_eq!(d["topCpu"][0]["windowed"], true);
        assert_eq!(d["topMemory"][0]["memoryMb"], 600);
        assert_eq!(d["kinds"]["dex"]["memoryMb"], 400);
    }

    #[test]
    fn finds_programs_by_name() {
        let procs = vec![p(10, "Code.exe", 1.0, 500, "app"), p(11, "Code.exe", 1.0, 200, "background"), p(12, "notepad.exe", 0.0, 20, "app")];
        let d = digest(&procs, 8, 8_000, Some("code"), 5);
        assert_eq!(d["matches"].as_array().unwrap().len(), 1);
        assert_eq!(d["matches"][0]["count"], 2);
        assert_eq!(d["matches"][0]["pids"], json!([10, 11]));
        assert!(digest(&procs, 8, 8_000, Some("zoom"), 5)["matches"].as_array().unwrap().is_empty());
    }

    /// Stress: 5,000 processes in 300 programs summarise quickly and stay small.
    #[test]
    fn summarises_thousands_of_processes_compactly() {
        let procs: Vec<Proc> = (0..5000u32)
            .map(|i| p(i, &format!("prog{}.exe", i % 300), (i % 7) as f32, (i % 97) as u64 * 3, if i % 10 == 0 { "app" } else { "background" }))
            .collect();
        let t = std::time::Instant::now();
        let d = digest(&procs, 16, 32_000, Some("prog12"), 10);
        let ms = t.elapsed().as_millis();
        assert_eq!(d["processes"], 5000);
        assert_eq!(d["programs"], 300);
        let size = d.to_string().len();
        eprintln!("process digest: 5000 processes, {ms} ms, {size} bytes");
        assert!(ms < 200, "digest took {ms} ms");
        assert!(size < 8_000, "digest is {size} bytes");
    }
}
