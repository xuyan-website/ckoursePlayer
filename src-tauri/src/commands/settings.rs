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

fn review_img_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("cannot resolve exe parent dir")?;
    Ok(exe_dir.join("ReviewMDimg"))
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

    // Bundle all screenshots and review images so they survive export/import.
    let mut image_files: Vec<(String, std::path::PathBuf)> = Vec::new();
    for (dir, prefix) in [(screenshot_dir()?, "Screenshot"), (review_img_dir()?, "ReviewMDimg")] {
        if !dir.exists() { continue; }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if entry.path().is_file() {
                    let zip_name = format!("{}/{}", prefix, entry.file_name().to_string_lossy());
                    image_files.push((zip_name, entry.path()));
                }
            }
        }
    }
    let total = image_files.len();
    for (i, (zip_name, path)) in image_files.iter().enumerate() {
        zip.start_file(zip_name, options).map_err(|e| e.to_string())?;
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;

        let _ = app.emit(
            "export-progress",
            ExportProgressPayload {
                current: i + 1,
                total,
            },
        );
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn remap_image_path(path: &str, new_dir: &std::path::Path, marker: &str) -> Option<String> {
    let idx = path.find(marker)?;
    let file_part = &path[idx + marker.len()..];
    let file_part = file_part.trim_start_matches(|c| c == '/' || c == '\\');
    if file_part.is_empty() {
        return None;
    }
    Some(new_dir.join(file_part).to_string_lossy().to_string())
}

fn remap_content_paths(content: &str, new_dir: &std::path::Path, marker: &str) -> String {
    let mut result = String::new();
    let mut remaining = content;
    while let Some(idx) = remaining.find("](") {
        result.push_str(&remaining[..idx + 2]);
        let after = &remaining[idx + 2..];
        let end = after.find(')').unwrap_or(after.len());
        let path = &after[..end];
        if path.contains(marker) {
            if let Some(new_path) = remap_image_path(path, new_dir, marker) {
                result.push_str(&new_path);
            } else {
                result.push_str(path);
            }
        } else {
            result.push_str(path);
        }
        remaining = &after[end..];
    }
    result.push_str(remaining);
    result
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
    let dest_review_dir = review_img_dir()?;
    std::fs::create_dir_all(&dest_review_dir).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();

        if name == "data.json" {
            let mut content = String::new();
            entry.read_to_string(&mut content).map_err(|e| e.to_string())?;
            json_content = Some(content);
        } else if let Some(file_name) = name.strip_prefix("Screenshot/") {
            if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
                continue;
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let dest = dest_shot_dir.join(file_name);
            std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
        } else if let Some(file_name) = name.strip_prefix("ReviewMDimg/") {
            if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
                continue;
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let dest = dest_review_dir.join(file_name);
            std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
        }
    }

    let json_content = json_content.ok_or("zip missing data.json")?;
    let mut payload: db::ExportPayload =
        serde_json::from_str(&json_content).map_err(|e| e.to_string())?;

    // Remap image paths to current exe directory
    for note in &mut payload.notes {
        if let Some(obj) = note.as_object_mut() {
            if let Some(serde_json::Value::String(image_paths_json)) = obj.get("image_paths").cloned() {
                if let Ok(mut paths) = serde_json::from_str::<Vec<String>>(&image_paths_json) {
                    for path in &mut paths {
                        if let Some(new_path) = remap_image_path(path, &dest_shot_dir, "Screenshot") {
                            *path = new_path;
                        }
                    }
                    obj.insert("image_paths".to_string(), serde_json::Value::String(serde_json::to_string(&paths).unwrap_or_default()));
                }
            }
        }
    }
    for review in &mut payload.reviews {
        if let Some(obj) = review.as_object_mut() {
            if let Some(serde_json::Value::String(content)) = obj.get("content").cloned() {
                let new_content = remap_content_paths(&content, &dest_review_dir, "ReviewMDimg");
                obj.insert("content".to_string(), serde_json::Value::String(new_content));
            }
        }
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::import_all_data(&conn, &payload, &mode).map_err(|e| e.to_string())?;
    Ok(())
}
