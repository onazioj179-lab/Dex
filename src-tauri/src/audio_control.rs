// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use serde_json::{json, Value};

enum Change {
    Volume(f32),
    Mute(bool),
}

fn change(args: &Value) -> Result<Change, String> {
    match args[2].as_str() {
        Some("volume") => args[3]
            .as_u64()
            .filter(|v| *v <= 100)
            .map(|v| Change::Volume(v as f32 / 100.0))
            .ok_or_else(|| "Volume must be an integer from 0 to 100".into()),
        Some("mute") => args[3]
            .as_bool()
            .map(Change::Mute)
            .ok_or_else(|| "Mute requires a boolean".into()),
        _ => Err("Unknown audio operation".into()),
    }
}

pub fn dispatch(channel: &str, args: &Value) -> Value {
    #[cfg(windows)]
    let result = match channel {
        "audio-control:snapshot" => windows_audio::snapshot(),
        "audio-control:change" => {
            change(args).and_then(|change| windows_audio::apply(args, change))
        }
        "audio-control:systemSettings" => {
            let uri = if args[0].as_bool() == Some(true) {
                "ms-settings:apps-volume"
            } else {
                "ms-settings:sound"
            };
            open::that(uri)
                .map(|_| json!({ "success": true }))
                .map_err(|e| e.to_string())
        }
        _ => Err("Unknown audio control operation".to_string()),
    };
    #[cfg(not(windows))]
    let result: Result<Value, String> = {
        let _ = (channel, args);
        Err("Native Audio Control is available on Windows in this build.".into())
    };
    result.unwrap_or_else(|error| json!({ "success": false, "error": error }))
}

pub fn start(app: &tauri::AppHandle) {
    #[cfg(windows)]
    windows_audio::watch(app.clone());
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod windows_audio {
    use super::*;
    use std::ptr::null;
    use tauri::Emitter;
    use windows::{
        core::{implement, Interface, PCWSTR, PWSTR},
        Win32::{
            Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
            Foundation::{CloseHandle, PROPERTYKEY},
            Media::Audio::{
                eMultimedia, eRender, AudioSessionStateActive, AudioSessionStateExpired, EDataFlow,
                ERole, Endpoints::IAudioEndpointVolume, IAudioSessionControl2,
                IAudioSessionEnumerator, IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator,
                IMMNotificationClient, IMMNotificationClient_Impl, ISimpleAudioVolume,
                MMDeviceEnumerator, DEVICE_STATE, DEVICE_STATE_ACTIVE,
            },
            System::{
                Com::{
                    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                    StructuredStorage::{PropVariantClear, PropVariantToStringAlloc},
                    CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
                },
                Threading::{
                    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                    PROCESS_QUERY_LIMITED_INFORMATION,
                },
            },
        },
    };

    struct Apartment;
    impl Apartment {
        fn enter() -> windows::core::Result<Self> {
            unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
            Ok(Self)
        }
    }
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() }
        }
    }

    fn enumerator() -> windows::core::Result<IMMDeviceEnumerator> {
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
    }

    fn take_string(raw: PWSTR) -> windows::core::Result<String> {
        if raw.is_null() {
            return Ok(String::new());
        }
        unsafe {
            let result = raw.to_string();
            CoTaskMemFree(Some(raw.0.cast()));
            Ok(result?)
        }
    }

    fn device_label(device: &IMMDevice) -> windows::core::Result<String> {
        unsafe {
            let store = device.OpenPropertyStore(STGM_READ)?;
            let mut name = store.GetValue(&PKEY_Device_FriendlyName)?;
            let string = PropVariantToStringAlloc(&name);
            let _ = PropVariantClear(&mut name);
            take_string(string?)
        }
    }

    fn process_name(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buffer = [0; 2048];
            let mut size = buffer.len() as u32;
            let result = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut size,
            );
            let _ = CloseHandle(handle);
            result.ok()?;
            let path = String::from_utf16_lossy(&buffer[..size as usize]);
            std::path::Path::new(&path)
                .file_stem()?
                .to_str()
                .map(str::to_owned)
        }
    }

    fn sessions(device: &IMMDevice) -> windows::core::Result<IAudioSessionEnumerator> {
        let manager: IAudioSessionManager2 = unsafe { device.Activate(CLSCTX_ALL, None)? };
        unsafe { manager.GetSessionEnumerator() }
    }

    pub fn snapshot() -> Result<Value, String> {
        read_snapshot().map_err(|e| e.to_string())
    }

    fn read_snapshot() -> windows::core::Result<Value> {
        let _apartment = Apartment::enter()?;
        let enumerator = enumerator()?;
        let devices = unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)? };
        let current = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) }
            .and_then(|device| unsafe { device.GetId() })
            .and_then(take_string)
            .ok();
        let mut outputs = Vec::new();
        let mut rows = Vec::new();
        for i in 0..unsafe { devices.GetCount()? } {
            let Ok(device) = (unsafe { devices.Item(i) }) else {
                continue;
            };
            let Ok(id) = unsafe { device.GetId() }.and_then(take_string) else {
                continue;
            };
            let master = if current.as_deref() == Some(&id) {
                (|| -> windows::core::Result<Value> {
                    let volume: IAudioEndpointVolume = unsafe { device.Activate(CLSCTX_ALL, None)? };
                    let percent = unsafe { volume.GetMasterVolumeLevelScalar()? } * 100.0;
                    Ok(json!({ "volume": percent.round(), "muted": unsafe { volume.GetMute()? }.as_bool() }))
                })().ok()
            } else {
                None
            };
            outputs.push(json!({ "id": id, "name": device_label(&device).unwrap_or_else(|_| format!("Playback device {}", i + 1)), "master": master }));
            let Ok(list) = sessions(&device) else {
                continue;
            };
            for index in 0..unsafe { list.GetCount().unwrap_or_default() } {
                if let Ok(Some(row)) = session_row(&list, index, &id) {
                    rows.push(row);
                }
            }
        }
        Ok(
            json!({ "success": true, "currentOutput": current, "outputs": outputs, "sessions": rows }),
        )
    }

    fn session_row(
        list: &IAudioSessionEnumerator,
        index: i32,
        device: &str,
    ) -> windows::core::Result<Option<Value>> {
        let control: IAudioSessionControl2 = unsafe { list.GetSession(index)? }.cast()?;
        let state = unsafe { control.GetState()? };
        if state == AudioSessionStateExpired {
            return Ok(None);
        }
        let id = take_string(unsafe { control.GetSessionInstanceIdentifier()? })?;
        let pid = unsafe { control.GetProcessId() }.unwrap_or_default();
        let mut name = unsafe { control.GetDisplayName() }
            .and_then(take_string)
            .unwrap_or_default();
        if name.is_empty() || name.starts_with('@') {
            name = if unsafe { control.IsSystemSoundsSession() }.0 == 0 {
                "System sounds".into()
            } else {
                process_name(pid).unwrap_or_else(|| format!("Audio session ({pid})"))
            };
        }
        let volume: ISimpleAudioVolume = control.cast()?;
        let percent = unsafe { volume.GetMasterVolume()? } * 100.0;
        Ok(Some(
            json!({ "id": id, "device": device, "name": name, "active": state == AudioSessionStateActive,
            "volume": percent.round(), "muted": unsafe { volume.GetMute()? }.as_bool() }),
        ))
    }

    pub fn apply(args: &Value, change: Change) -> Result<Value, String> {
        let endpoint = args[0]
            .as_str()
            .filter(|id| id.len() <= 1024)
            .ok_or("Playback device required")?;
        let session = args[1].as_str().filter(|id| id.len() <= 8192);
        if !args[1].is_null() && session.is_none() {
            return Err("Invalid audio session identifier".into());
        }
        alter(endpoint, session, change).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true }))
    }

    fn alter(endpoint: &str, session: Option<&str>, change: Change) -> windows::core::Result<()> {
        let _apartment = Apartment::enter()?;
        let enumerator = enumerator()?;
        let unavailable = || {
            windows::core::Error::new(
                windows::core::HRESULT(0x80070490_u32 as i32),
                "The selected device or audio session has changed. Refresh Audio Control.",
            )
        };
        let devices = unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)? };
        for i in 0..unsafe { devices.GetCount()? } {
            let Ok(device) = (unsafe { devices.Item(i) }) else {
                continue;
            };
            if unsafe { device.GetId() }
                .and_then(take_string)
                .ok()
                .as_deref()
                != Some(endpoint)
            {
                continue;
            }
            if let Some(session) = session {
                let list = sessions(&device)?;
                for index in 0..unsafe { list.GetCount()? } {
                    let Ok(control) = unsafe { list.GetSession(index) }
                        .and_then(|item| item.cast::<IAudioSessionControl2>())
                    else {
                        continue;
                    };
                    if unsafe { control.GetSessionInstanceIdentifier() }
                        .and_then(take_string)
                        .ok()
                        .as_deref()
                        != Some(session)
                        || unsafe { control.GetState()? } == AudioSessionStateExpired
                    {
                        continue;
                    }
                    let volume: ISimpleAudioVolume = control.cast()?;
                    return unsafe {
                        match change {
                            Change::Volume(value) => volume.SetMasterVolume(value, null()),
                            Change::Mute(value) => volume.SetMute(value, null()),
                        }
                    };
                }
            } else {
                let current = unsafe {
                    enumerator
                        .GetDefaultAudioEndpoint(eRender, eMultimedia)?
                        .GetId()?
                };
                if take_string(current)? != endpoint {
                    return Err(unavailable());
                }
                let volume: IAudioEndpointVolume = unsafe { device.Activate(CLSCTX_ALL, None)? };
                return unsafe {
                    match change {
                        Change::Volume(value) => volume.SetMasterVolumeLevelScalar(value, null()),
                        Change::Mute(value) => volume.SetMute(value, null()),
                    }
                };
            }
        }
        Err(unavailable())
    }

    #[implement(IMMNotificationClient)]
    struct EndpointEvents(tauri::AppHandle);

    impl EndpointEvents {
        fn changed(&self) -> windows::core::Result<()> {
            let _ = self.0.emit_to("main", "dex-audio-devices-changed", ());
            Ok(())
        }
    }

    #[allow(non_snake_case)]
    impl IMMNotificationClient_Impl for EndpointEvents_Impl {
        fn OnDeviceStateChanged(&self, _: &PCWSTR, _: DEVICE_STATE) -> windows::core::Result<()> {
            self.changed()
        }
        fn OnDeviceAdded(&self, _: &PCWSTR) -> windows::core::Result<()> {
            self.changed()
        }
        fn OnDeviceRemoved(&self, _: &PCWSTR) -> windows::core::Result<()> {
            self.changed()
        }
        fn OnDefaultDeviceChanged(
            &self,
            flow: EDataFlow,
            role: ERole,
            _: &PCWSTR,
        ) -> windows::core::Result<()> {
            if flow == eRender && role == eMultimedia {
                self.changed()?;
            }
            Ok(())
        }
        fn OnPropertyValueChanged(
            &self,
            _: &PCWSTR,
            key: &PROPERTYKEY,
        ) -> windows::core::Result<()> {
            if key == &PKEY_Device_FriendlyName {
                self.changed()?;
            }
            Ok(())
        }
    }

    pub fn watch(app: tauri::AppHandle) {
        let handle = std::thread::Builder::new()
            .name("dex-audio-endpoints".into())
            .spawn(move || {
                let Ok(_apartment) = Apartment::enter() else {
                    return;
                };
                let Ok(enumerator) = enumerator() else { return };
                let listener: IMMNotificationClient = EndpointEvents(app).into();
                if unsafe { enumerator.RegisterEndpointNotificationCallback(&listener) }.is_ok() {
                    loop {
                        std::thread::park();
                    }
                }
            });
        if let Err(error) = handle {
            eprintln!("[DEX Audio] {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_and_unsafe_volume_values() {
        assert!(matches!(
            change(&json!(["device", null, "volume", 75])),
            Ok(Change::Volume(0.75))
        ));
        for value in [json!(101), json!(-1), json!(5.5), json!("100"), Value::Null] {
            assert!(change(&json!(["device", null, "volume", value])).is_err());
        }
        assert!(matches!(
            change(&json!(["device", "session", "mute", true])),
            Ok(Change::Mute(true))
        ));
    }
}
