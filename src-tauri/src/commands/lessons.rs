use crate::db::{self, DbState};
use crate::subtitle;

#[tauri::command]
pub fn toggle_lesson_completed(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::toggle_lesson_completed(&conn, lesson_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_last_watched(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    lesson_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::set_last_watched(&conn, course_id, lesson_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_lesson_position(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
    position: f64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::save_lesson_position(&conn, lesson_id, position).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lesson_duration(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
    duration: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_lesson_duration(&conn, lesson_id, duration).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lesson_title(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
    title: String,
) -> Result<(), String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Lesson title cannot be empty".to_string());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_lesson_title(&conn, lesson_id, &trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_lesson_video_path(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
    video_path: String,
) -> Result<(), String> {
    if video_path.is_empty() {
        return Err("Video path cannot be empty".to_string());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_lesson_video_path(&conn, lesson_id, &video_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_lesson(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_lesson(&conn, lesson_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_lesson_subtitles(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
) -> Result<Vec<db::Subtitle>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_lesson_subtitles(&conn, lesson_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_subtitle_vtt(path: String) -> Result<String, String> {
    if let Some(file_id) = path.strip_prefix("gdrive:") {
        let bytes = crate::google::fetch_file_bytes(file_id.to_string()).await?;
        subtitle::convert_bytes_to_vtt(&bytes)
    } else {
        subtitle::read_as_vtt(&path)
    }
}

#[tauri::command]
pub fn get_all_favorites(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<db::FavoriteLesson>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_all_favorites(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_favorite(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::toggle_favorite(&conn, lesson_id).map_err(|e| e.to_string())
}

fn classify_resource_type(ext: &str) -> String {
    let ext = ext.to_lowercase();
    if ext == "pdf" {
        "pdf".to_string()
    } else if ["doc", "docx", "ppt", "pptx", "xls", "xlsx"].contains(&ext.as_str()) {
        "document".to_string()
    } else if ["txt", "md"].contains(&ext.as_str()) {
        "text".to_string()
    } else if ["zip", "rar"].contains(&ext.as_str()) {
        "archive".to_string()
    } else if ["jpg", "jpeg", "png", "gif", "bmp", "webp"].contains(&ext.as_str()) {
        "image".to_string()
    } else {
        "other".to_string()
    }
}

fn resource_title_from_path(path: &str) -> String {
    let p = std::path::Path::new(path);
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or(path.to_string());
    name.rsplit_once('.')
        .map(|(n, _)| n.to_string())
        .unwrap_or(name)
}

#[tauri::command]
pub fn get_lesson_resources(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
) -> Result<Vec<db::Resource>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_lesson_resources(&conn, lesson_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_lesson_resource(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    lesson_id: i64,
    path: String,
) -> Result<i64, String> {
    let p = std::path::Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
    let title = resource_title_from_path(&path);
    let resource_type = classify_resource_type(ext);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_lesson_resource(&conn, course_id, lesson_id, &title, &path, &resource_type)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_resource(
    state: tauri::State<'_, DbState>,
    resource_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_resource(&conn, resource_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_resource_path(
    state: tauri::State<'_, DbState>,
    resource_id: i64,
    path: String,
) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
    let title = resource_title_from_path(&path);
    let resource_type = classify_resource_type(ext);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_resource_path(&conn, resource_id, &title, &path, &resource_type)
        .map_err(|e| e.to_string())
}
