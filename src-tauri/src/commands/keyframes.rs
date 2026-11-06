use crate::db::{self, DbState};

#[tauri::command]
pub fn get_lesson_keyframes(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
) -> Result<Vec<db::Keyframe>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_lesson_keyframes(&conn, lesson_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_keyframe(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
    position: f64,
    text: String,
    note_id: Option<i64>,
) -> Result<db::Keyframe, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_keyframe(&conn, lesson_id, position, &text, note_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_keyframe(
    state: tauri::State<'_, DbState>,
    keyframe_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_keyframe(&conn, keyframe_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_note_keyframes(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
    note_id: i64,
    items: Vec<(f64, String)>,
) -> Result<Vec<db::Keyframe>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::sync_note_keyframes(&conn, lesson_id, note_id, &items).map_err(|e| e.to_string())
}
