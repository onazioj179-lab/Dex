// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Phase 8: Zero-copy networking.
// Platform-specific zero-copy file transfer paths:
// - Linux: sendfile (io_uring planned for kernel 6.0+)
// - Windows: TransmitFile via IOCP
// - macOS: sendfile via libc

use std::path::Path;

/// Send a file to a remote host using the most efficient platform path.
/// Returns total bytes transferred.
pub async fn zero_copy_send(
    source_path: &str,
    dest_host: &str,
    dest_port: u16,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    let path = source_path.to_string();
    let host = dest_host.to_string();
    let port = dest_port;

    tokio::task::spawn_blocking(move || {
        platform_send_file(&path, &host, port)
    })
    .await?
}

// ---------------------------------------------------------------------------
// Platform implementations
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
fn platform_send_file(
    path: &str,
    host: &str,
    port: u16,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    use std::net::TcpStream;
    use std::os::unix::io::AsRawFd;

    let file = std::fs::File::open(path)?;
    let file_size = file.metadata()?.len();
    let stream = TcpStream::connect((host, port))?;
    let out_fd = stream.as_raw_fd();
    let in_fd = file.as_raw_fd();

    let mut offset: i64 = 0;
    let mut remaining = file_size as usize;

    while remaining > 0 {
        let chunk = remaining.min(1 << 30); // 1GB max per call
        // SAFETY: sendfile is a well-defined syscall. Both fds are valid
        // open file descriptors owned by this function. offset is a valid
        // pointer to a stack variable. The kernel reads from in_fd and
        // writes to out_fd without copying through user space.
        let sent = unsafe {
            libc::sendfile(out_fd, in_fd, &mut offset, chunk)
        };
        if sent < 0 {
            return Err(format!(
                "sendfile failed: {}",
                std::io::Error::last_os_error()
            )
            .into());
        }
        remaining -= sent as usize;
    }
    Ok(file_size)
}

#[cfg(target_os = "macos")]
fn platform_send_file(
    path: &str,
    host: &str,
    port: u16,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    use std::net::TcpStream;
    use std::os::unix::io::AsRawFd;

    let file = std::fs::File::open(path)?;
    let file_size = file.metadata()?.len();
    let stream = TcpStream::connect((host, port))?;
    let out_fd = stream.as_raw_fd();
    let in_fd = file.as_raw_fd();

    let mut offset: i64 = 0;
    let mut len: i64 = file_size as i64;

    // macOS sendfile: sendfile(fd, s, offset, &len, NULL, 0)
    // SAFETY: sendfile is a well-defined syscall on macOS. Both fds are
    // valid open descriptors. offset and len are stack variables with valid
    // addresses. The kernel performs zero-copy transfer from in_fd to out_fd.
    let result = unsafe {
        libc::sendfile(in_fd, out_fd, offset, &mut len, std::ptr::null_mut(), 0)
    };
    if result < 0 {
        return Err(format!(
            "sendfile failed: {}",
            std::io::Error::last_os_error()
        )
        .into());
    }
    Ok(len as u64)
}

#[cfg(target_os = "windows")]
fn platform_send_file(
    path: &str,
    host: &str,
    port: u16,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    // On Windows, use standard Rust async I/O with buffered copy.
    // TransmitFile requires Winsock2 handles which are complex to set up
    // via the windows crate. This fallback is still efficient with 128KB buffers.
    use std::io::{BufReader, Read, Write};
    use std::net::TcpStream;

    let file = std::fs::File::open(path)?;
    let _file_size = file.metadata()?.len();
    let mut reader = BufReader::with_capacity(128 * 1024, file);
    let mut stream = TcpStream::connect((host, port))?;

    let mut buf = vec![0u8; 128 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        stream.write_all(&buf[..n])?;
        total += n as u64;
    }
    stream.flush()?;
    Ok(total)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn platform_send_file(
    path: &str,
    host: &str,
    port: u16,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    use std::io::{BufReader, Read, Write};
    use std::net::TcpStream;

    let file = std::fs::File::open(path)?;
    let mut reader = BufReader::with_capacity(128 * 1024, file);
    let mut stream = TcpStream::connect((host, port))?;

    let mut buf = vec![0u8; 128 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        stream.write_all(&buf[..n])?;
        total += n as u64;
    }
    stream.flush()?;
    Ok(total)
}
