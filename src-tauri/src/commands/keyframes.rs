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
) -> Result<db::Keyframe, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_keyframe(&conn, lesson_id, position, &text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_keyframe(
    state: tauri::State<'_, DbState>,
    keyframe_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_keyframe(&conn, keyframe_id).map_err(|e| e.to_string())
}
