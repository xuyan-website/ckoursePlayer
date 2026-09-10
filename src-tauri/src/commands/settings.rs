use std::io::{Read, Write};
use tauri::Manager;
use tauri::Emitter;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::db::{self, DbState};

#[tauri::command]
pub fn get_all_settings(state: tauri::State<'_, DbState>) -> Result<Vec<(String, String)>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_all_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(
    state: tauri::State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_library_stats(
    state: tauri::State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<db::LibraryStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("ckourse.db");
    db::get_library_stats(&conn, &db_path.to_string_lossy()).map_err(|e| e.to_string())
}

fn screenshot_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("cannot resolve exe parent dir")?;
    Ok(exe_dir.join("Screenshot"))
}

#[derive(serde::Serialize, Clone)]
struct ExportProgressPayload {
    current: usize,
    total: usize,
}

#[tauri::command]
pub async fn export_to_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    path: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let payload = db::export_all_data(&conn).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;

    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    zip.start_file("data.json", options).map_err(|e| e.to_string())?;
    zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;

    // Bundle all screenshots so image notes survive export/import.
    let shot_dir = screenshot_dir()?;
    if shot_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&shot_dir) {
            let files: Vec<_> = entries
                .flatten()
                .filter(|e| e.path().is_file())
                .collect();
            let total = files.len();
            for (i, entry) in files.iter().enumerate() {
                let entry_path = entry.path();
                let name = entry.file_name();
                let zip_name = format!("Screenshot/{}", name.to_string_lossy());
                zip.start_file(&zip_name, options).map_err(|e| e.to_string())?;
                let bytes = std::fs::read(&entry_path).map_err(|e| e.to_string())?;
                zip.write_all(&bytes).map_err(|e| e.to_string())?;

                let _ = app.emit(
                    "export-progress",
                    ExportProgressPayload {
                        current: i + 1,
                        total,
                    },
                );
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_from_file(
    state: tauri::State<'_, DbState>,
    path: String,
    mode: String,
) -> Result<(), String> {
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut json_content: Option<String> = None;
    let dest_shot_dir = screenshot_dir()?;
    std::fs::create_dir_all(&dest_shot_dir).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();

        if name == "data.json" {
            let mut content = String::new();
            entry.read_to_string(&mut content).map_err(|e| e.to_string())?;
            json_content = Some(content);
        } else if name.starts_with("Screenshot/") {
            let file_name = name.strip_prefix("Screenshot/").unwrap_or(&name);
            if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
                continue;
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let dest = dest_shot_dir.join(file_name);
            std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
        }
    }

    let json_content = json_content.ok_or("zip missing data.json")?;
    let payload: db::ExportPayload =
        serde_json::from_str(&json_content).map_err(|e| e.to_string())?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::import_all_data(&conn, &payload, &mode).map_err(|e| e.to_string())?;
    Ok(())
}
