use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppInfo {
    pub version: String,
    pub name: String,
}

#[tauri::command]
pub fn get_app_version() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        name: env!("CARGO_PKG_NAME").to_string(),
    }
}

#[tauri::command]
pub fn get_app_path(app: AppHandle, key: String) -> Option<String> {
    app.path()
        .ok()
        .and_then(|p| match key.as_str() {
            "appData" => p.app_data_dir().ok().map(|p| p.to_string_lossy().to_string()),
            "appCache" => p.app_cache_dir().ok().map(|p| p.to_string_lossy().to_string()),
            "appLog" => p.app_log_dir().ok().map(|p| p.to_string_lossy().to_string()),
            "home" => p.home_dir().ok().map(|p| p.to_string_lossy().to_string()),
            "temp" => p.temp_dir().ok().map(|p| p.to_string_lossy().to_string()),
            _ => None,
        })
}

#[tauri::command]
pub async fn open_external_link(app: AppHandle, url: String) -> Result<(), String> {
    app.shell()
        .open(&url, None)
        .map_err(|e| e.to_string())
}
