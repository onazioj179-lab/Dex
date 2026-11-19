// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Maximized DEX covers the whole monitor, Windows taskbar included.
//!
//! DEX is the desktop: when it is maximized (double-click the top bar, Win+Up,
//! drag to the top edge) it fills the screen like fullscreen does. tao clips a
//! maximized borderless window to the monitor's WORK AREA (its WM_NCCALCSIZE
//! handler) so the taskbar stayed visible under DEX. A subclass installed on
//! top of tao's lets tao run first, then widens the maximized client area to
//! the whole monitor. Windows then treats DEX as a full-screen window and keeps
//! the taskbar below it while DEX is in front (Win key still opens Start).

#[cfg(windows)]
mod imp {
    type Hwnd = isize;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Rect { left: i32, top: i32, right: i32, bottom: i32 }

    #[repr(C)]
    struct NcCalcSizeParams { rgrc: [Rect; 3], lppos: *mut core::ffi::c_void }

    #[repr(C)]
    #[derive(Default)]
    struct MonitorInfo { cb_size: u32, rc_monitor: Rect, rc_work: Rect, flags: u32 }

    const WM_NCCALCSIZE: u32 = 0x0083;
    const MONITOR_DEFAULTTONEAREST: u32 = 2;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;
    const SUBCLASS_ID: usize = 0x00DE_C0F7;

    type SubclassProc = unsafe extern "system" fn(Hwnd, u32, usize, isize, usize, usize) -> isize;

    #[link(name = "user32")]
    extern "system" {
        fn IsZoomed(hwnd: Hwnd) -> i32;
        fn MonitorFromWindow(hwnd: Hwnd, flags: u32) -> isize;
        fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfo) -> i32;
        fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
    }
    #[link(name = "comctl32")]
    extern "system" {
        fn SetWindowSubclass(hwnd: Hwnd, proc_: SubclassProc, id: usize, data: usize) -> i32;
        fn DefSubclassProc(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize) -> isize;
    }

    unsafe extern "system" fn proc_(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize, _id: usize, _data: usize) -> isize {
        let r = DefSubclassProc(hwnd, msg, wparam, lparam);
        if msg == WM_NCCALCSIZE && wparam != 0 && lparam != 0 && IsZoomed(hwnd) != 0 {
            let mut mi = MonitorInfo { cb_size: std::mem::size_of::<MonitorInfo>() as u32, ..Default::default() };
            let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            if mon != 0 && GetMonitorInfoW(mon, &mut mi) != 0 {
                let params = &mut *(lparam as *mut NcCalcSizeParams);
                params.rgrc[0] = mi.rc_monitor;
            }
        }
        r
    }

    pub fn install(hwnd: Hwnd) -> bool {
        unsafe {
            let ok = SetWindowSubclass(hwnd, proc_, SUBCLASS_ID, 0) != 0;
            // Recompute the frame now so an already-maximized window updates.
            SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
            ok
        }
    }
}

/// Install on the main window. Returns false off Windows or on failure.
pub fn install(window: &tauri::WebviewWindow) -> bool {
    #[cfg(windows)]
    {
        match window.hwnd() {
            Ok(h) => imp::install(h.0 as isize),
            Err(_) => false,
        }
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        false
    }
}
