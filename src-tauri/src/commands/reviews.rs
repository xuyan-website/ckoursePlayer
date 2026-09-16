use crate::db::{self, DbState};
use base64::Engine;
use serde::Deserialize;
use std::collections::HashSet;
use std::fs::File;
use std::io::Write;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

#[tauri::command]
pub fn get_all_reviews(state: tauri::State<'_, DbState>) -> Result<Vec<db::ReviewWithCourse>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_all_reviews(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_course_reviews(
    state: tauri::State<'_, DbState>,
    course_id: i64,
) -> Result<Vec<db::Review>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_course_reviews(&conn, course_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_lesson_reviews(
    state: tauri::State<'_, DbState>,
    lesson_id: i64,
) -> Result<Vec<db::Review>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_lesson_reviews(&conn, lesson_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_review(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    lesson_id: i64,
    section_title: String,
    lesson_title: String,
    title: String,
    content: String,
) -> Result<db::Review, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_review(
        &conn,
        course_id,
        lesson_id,
        &section_title,
        &lesson_title,
        &title,
        &content,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_review(
    state: tauri::State<'_, DbState>,
    review_id: i64,
    title: String,
    content: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_review(&conn, review_id, &title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_review(
    state: tauri::State<'_, DbState>,
    review_id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_review(&conn, review_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_review_image(
    state: tauri::State<'_, DbState>,
    src_path: String,
    lesson_id: i64,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let video_path = db::get_lesson_video_path(&conn, lesson_id).map_err(|e| e.to_string())?;
    drop(conn);

    let video_dir = std::path::Path::new(&video_path)
        .parent()
        .ok_or("cannot resolve video dir")?;
    let img_dir = video_dir.join("ReviewMDimg");
    std::fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;

    let ts_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let ext = std::path::Path::new(&src_path)
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "png".to_string());
    let filename = format!("{}.{}", ts_millis, ext);
    let dest = img_dir.join(&filename);
    std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;

    Ok(format!("ReviewMDimg/{}", filename))
}

#[tauri::command]
pub fn save_review_image_data(
    state: tauri::State<'_, DbState>,
    data_url: String,
    lesson_id: i64,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let video_path = db::get_lesson_video_path(&conn, lesson_id).map_err(|e| e.to_string())?;
    drop(conn);

    let video_dir = std::path::Path::new(&video_path)
        .parent()
        .ok_or("cannot resolve video dir")?;
    let img_dir = video_dir.join("ReviewMDimg");
    std::fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;

    let b64 = data_url
        .split(',')
        .nth(1)
        .ok_or("invalid data url: missing base64 payload")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;

    let ts_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let filename = format!("{}.png", ts_millis);
    let dest = img_dir.join(&filename);
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

    Ok(format!("ReviewMDimg/{}", filename))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReviewItem {
    pub section_title: String,
    pub lesson_title: String,
    pub title: String,
    pub content: String,
    pub video_path: String,
}

fn remove_br_tags(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut in_code_block = false;

    for line in content.split_inclusive('\n') {
        let trimmed = line.trim_start();

        if in_code_block {
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                in_code_block = false;
            }
            result.push_str(line);
            continue;
        }

        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code_block = true;
            result.push_str(line);
            continue;
        }

        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        let mut in_inline_code = false;
        while i < chars.len() {
            if chars[i] == '\\' && i + 1 < chars.len() {
                result.push(chars[i]);
                result.push(chars[i + 1]);
                i += 2;
                continue;
            }
            if chars[i] == '`' {
                in_inline_code = !in_inline_code;
                result.push(chars[i]);
                i += 1;
                continue;
            }
            if !in_inline_code
                && chars[i] == '<'
                && i + 3 <= chars.len()
                && chars[i + 1].to_ascii_lowercase() == 'b'
                && chars[i + 2].to_ascii_lowercase() == 'r'
                && (i + 3 == chars.len()
                    || chars[i + 3] == ' '
                    || chars[i + 3] == '/'
                    || chars[i + 3] == '>')
            {
                let mut j = i + 3;
                while j < chars.len() && chars[j] != '>' {
                    j += 1;
                }
                if j < chars.len() {
                    i = j + 1;
                    continue;
                }
            }
            result.push(chars[i]);
            i += 1;
        }
    }

    result
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

fn extract_title(content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix('#') {
            let t = rest.trim_start_matches('#').trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    let plain: String = content.chars().filter(|c| !c.is_whitespace()).take(10).collect();
    plain
}

fn extract_image_paths(content: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let marker = "ReviewMDimg/";
    let mut search_from = 0;
    while let Some(idx) = content[search_from..].find(marker) {
        let path_start = search_from + idx;
        let rest = &content[path_start..];
        let end = rest
            .find(|c: char| c == ')' || c.is_whitespace())
            .unwrap_or(rest.len());
        paths.push(rest[..end].to_string());
        search_from = path_start + end;
    }
    paths
}

#[tauri::command]
pub fn export_reviews_zip(
    items: Vec<ExportReviewItem>,
    output_path: String,
) -> Result<(), String> {
    let file = File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    let mut used_img_names: HashSet<String> = HashSet::new();
    let mut used_md_names: HashSet<String> = HashSet::new();

    for item in &items {
        let title = if item.title.is_empty() {
            extract_title(&item.content)
        } else {
            item.title.clone()
        };
        let md_name_base = sanitize_filename(&format!(
            "{}-{}-{}",
            title, item.section_title, item.lesson_title
        ));
        let mut md_filename = format!("{}.md", md_name_base);
        let mut counter = 1;
        while used_md_names.contains(&md_filename) {
            md_filename = format!("{} ({}).md", md_name_base, counter);
            counter += 1;
        }
        used_md_names.insert(md_filename.clone());

        zip.start_file(&md_filename, options)
            .map_err(|e| e.to_string())?;
        zip.write_all(remove_br_tags(&item.content).as_bytes())
            .map_err(|e| e.to_string())?;

        let video_dir = std::path::Path::new(&item.video_path).parent();
        for img_rel in extract_image_paths(&item.content) {
            let img_name = std::path::Path::new(&img_rel)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("image.png")
                .to_string();
            if used_img_names.contains(&img_name) {
                continue;
            }

            let actual_path = match video_dir {
                Some(dir) => dir.join(&img_rel),
                None => continue,
            };
            if !actual_path.exists() || !actual_path.is_file() {
                continue;
            }

            let img_data = std::fs::read(&actual_path).map_err(|e| e.to_string())?;
            let zip_img_name = format!("ReviewMDimg/{}", img_name);
            zip.start_file(&zip_img_name, options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&img_data).map_err(|e| e.to_string())?;
            used_img_names.insert(img_name);
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
