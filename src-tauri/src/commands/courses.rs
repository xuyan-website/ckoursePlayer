use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::Emitter;

use crate::db::{self, DbState, SaveCourseInput};
use crate::parser;

#[derive(Clone, Serialize)]
struct ParseProgressPayload {
    current: usize,
    total: usize,
}

#[tauri::command]
pub async fn parse_course_folder(
    app: tauri::AppHandle,
    folder_path: String,
) -> Result<parser::ParsedCourse, String> {
    let path = Path::new(&folder_path);
    let callback = Arc::new(move |current: usize, total: usize| {
        let _ = app.emit("parse-progress", ParseProgressPayload { current, total });
    });
    parser::parse_folder_with_progress(path, callback)
}

#[tauri::command]
pub async fn import_course(
    state: tauri::State<'_, DbState>,
    parsed: parser::ParsedCourse,
    config: SaveCourseInput,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::save_parsed_course(&conn, &parsed, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_courses(state: tauri::State<'_, DbState>) -> Result<Vec<db::Course>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_all_courses(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_course(state: tauri::State<'_, DbState>, course_id: i64) -> Result<Option<db::Course>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_course_by_id(&conn, course_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_course_detail(
    state: tauri::State<'_, DbState>,
    course_id: i64,
) -> Result<Option<db::CourseDetail>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_course_detail(&conn, course_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_course(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    title: String,
    author: String,
    accent_color: String,
    category: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_course(&conn, course_id, &title, &author, &accent_color, &category)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reset_course_progress(state: tauri::State<'_, DbState>, course_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::reset_course_progress(&conn, course_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_course(state: tauri::State<'_, DbState>, course_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let notes = db::get_course_notes(&conn, course_id).map_err(|e| e.to_string())?;
    for note in &notes {
        for path in &note.image_paths {
            let _ = std::fs::remove_file(path);
        }
    }

    let reviews = db::get_course_reviews(&conn, course_id).map_err(|e| e.to_string())?;
    for review in &reviews {
        for img_rel in super::reviews::extract_image_paths(&review.content) {
            super::reviews::delete_image_file(&img_rel);
        }
    }

    db::delete_course(&conn, course_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_bookmarked_courses(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<db::Course>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_bookmarked_courses(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_bookmark(
    state: tauri::State<'_, DbState>,
    course_id: i64,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::toggle_bookmark(&conn, course_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_dashboard_stats(
    state: tauri::State<'_, DbState>,
) -> Result<db::DashboardStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_dashboard_stats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_progress_data(
    state: tauri::State<'_, DbState>,
) -> Result<db::ProgressData, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_progress_data(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_all_data(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_all_data(&conn).map_err(|e| e.to_string())?;

    // Clear Screenshot and ReviewMDimg folders on disk
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("cannot resolve exe parent dir")?;
    for folder in ["Screenshot", "ReviewMDimg"] {
        let dir = exe_dir.join(folder);
        if dir.exists() {
            std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_custom_categories(state: tauri::State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_custom_categories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_custom_category(state: tauri::State<'_, DbState>, name: String) -> Result<(), String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Category name cannot be empty".to_string());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_custom_category(&conn, &trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_custom_category(state: tauri::State<'_, DbState>, name: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_custom_category(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_content(
    state: tauri::State<'_, DbState>,
    query: String,
) -> Result<Vec<db::SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::search_content(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_sections(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    section_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::reorder_sections(&conn, course_id, &section_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_section_title(
    state: tauri::State<'_, DbState>,
    section_id: i64,
    title: String,
) -> Result<(), String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Section title cannot be empty".to_string());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_section_title(&conn, section_id, &trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_section(
    state: tauri::State<'_, DbState>,
    section_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_section(&conn, section_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_replace_section_videos(
    state: tauri::State<'_, DbState>,
    section_id: i64,
    video_paths: Vec<String>,
) -> Result<Vec<db::Lesson>, String> {
    if video_paths.is_empty() {
        return Err("No video paths provided".to_string());
    }

    let mut paths: Vec<PathBuf> = video_paths.iter().map(PathBuf::from).collect();
    parser::sort_video_paths(&mut paths);

    let mut new_lessons: Vec<(String, String, u64)> = Vec::with_capacity(paths.len());
    for path in &paths {
        let path_str = path.to_string_lossy().to_string();
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|stem| parser::clean_lesson_title(stem))
            .unwrap_or_else(|| "Untitled".to_string());
        let duration_secs = parser::probe_video_duration(path);
        new_lessons.push((title, path_str, duration_secs));
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::replace_section_lessons(&conn, section_id, &new_lessons).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_lessons(
    state: tauri::State<'_, DbState>,
    section_id: i64,
    lesson_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::reorder_lessons(&conn, section_id, &lesson_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_section(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    title: String,
) -> Result<i64, String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Section title cannot be empty".to_string());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_section(&conn, course_id, &trimmed).map_err(|e| e.to_string())
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let path = entry.path();
        let dest = to.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &dest)?;
        } else {
            std::fs::copy(&path, &dest)?;
        }
    }
    Ok(())
}

fn move_dir(from: &Path, to: &Path) -> Result<(), String> {
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_dir(from, to).map_err(|e| format!("copy failed: {e}"))?;
    std::fs::remove_dir_all(from).map_err(|e| format!("remove old dir failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_course_folder_path(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    new_folder_path: String,
) -> Result<(), String> {
    let trimmed = new_folder_path.trim().to_string();
    if trimmed.is_empty() {
        return Err("Folder path cannot be empty".to_string());
    }

    let old_folder_path = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        db::get_course_folder_path(&conn, course_id).map_err(|e| e.to_string())?
    };

    let old_path = Path::new(&old_folder_path);
    let new_path = Path::new(&trimmed);

    if old_path != new_path {
        if !old_path.exists() {
            return Err(format!("Source folder does not exist: {}", old_folder_path));
        }
        if new_path.exists() {
            return Err(format!("Target path already exists: {}", trimmed));
        }
        if let Some(parent) = new_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        move_dir(old_path, new_path)?;
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_course_folder_path(&conn, course_id, &trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_section_from_folder(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    source_folder_path: String,
) -> Result<db::Section, String> {
    let src = Path::new(&source_folder_path);
    if !src.is_dir() {
        return Err("Source path is not a directory".to_string());
    }

    let course_folder = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        db::get_course_folder_path(&conn, course_id).map_err(|e| e.to_string())?
    };

    let folder_name = src
        .file_name()
        .ok_or("Cannot resolve source folder name")?;
    let dest = Path::new(&course_folder).join(folder_name);

    if dest.exists() {
        return Err(format!("Target folder already exists: {}", dest.display()));
    }

    let (section_title, src_videos) = parser::scan_section_folder(src);
    if src_videos.is_empty() {
        return Err("No video files found in the selected folder".to_string());
    }

    copy_dir(src, &dest).map_err(|e| e.to_string())?;

    let mut new_lessons: Vec<(String, String, u64)> = Vec::with_capacity(src_videos.len());
    for vp in &src_videos {
        let dest_vp = vp
            .strip_prefix(src)
            .map(|rel| dest.join(rel))
            .unwrap_or_else(|_| vp.clone());
        let path_str = dest_vp.to_string_lossy().to_string();
        let title = dest_vp
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|stem| parser::clean_lesson_title(stem))
            .unwrap_or_else(|| "Untitled".to_string());
        let duration_secs = parser::probe_video_duration(&dest_vp);
        new_lessons.push((title, path_str, duration_secs));
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_section_with_lessons(&conn, course_id, &section_title, &new_lessons)
        .map_err(|e| e.to_string())
}
