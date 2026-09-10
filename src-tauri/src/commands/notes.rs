use crate::db::{self, DbState};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportNote {
    markdown: String,
    image_paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportLesson {
    section_title: String,
    lesson_title: String,
    video_path: String,
    notes: Vec<ExportNote>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSection {
    section_title: String,
    lessons: Vec<ExportLesson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDoc {
    doc_title: String,
    sections: Vec<ExportSection>,
}

fn chinese_number(n: usize) -> String {
    const DIGITS: [&str; 11] = [
        "零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
    ];
    if n <= 10 {
        DIGITS[n].to_string()
    } else if n < 20 {
        format!("十{}", DIGITS[n % 10])
    } else {
        n.to_string()
    }
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// Export notes to a ZIP archive. Each doc becomes a Markdown file.
/// Format: "singleLesson" | "fullCourse" | "searchResult".
#[tauri::command]
pub async fn export_notes_to_zip(
    docs: Vec<ExportDoc>,
    output_path: String,
    format: String,
) -> Result<(), String> {
    use std::collections::HashSet;
    use std::fs::File;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::CompressionMethod;
    use zip::ZipWriter;

    let file = File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored);

    let mut used_image_names: HashSet<String> = HashSet::new();
    let mut used_md_names: HashSet<String> = HashSet::new();

    for doc in &docs {
        let mut md = String::new();

        for section in &doc.sections {
            if format == "fullCourse" && !section.section_title.is_empty() {
                md.push_str(&format!("# {}\n\n", section.section_title));
            }

            for lesson in &section.lessons {
                if format == "fullCourse" {
                    md.push_str(&format!("## {}\n\n", lesson.lesson_title));
                } else if format == "searchResult" {
                    md.push_str(&format!("# {}-{}\n\n", lesson.section_title, lesson.lesson_title));
                } else {
                    md.push_str(&format!("# {}\n\n", lesson.lesson_title));
                }

                for (note_idx, note) in lesson.notes.iter().enumerate() {
                    let label = chinese_number(note_idx + 1);
                    if format == "fullCourse" {
                        md.push_str(&format!("### 笔记{}\n\n", label));
                    } else {
                        md.push_str(&format!("## 笔记{}\n\n", label));
                    }
                    md.push_str(&note.markdown);
                    md.push('\n');

                    for img_path in &note.image_paths {
                        let p = std::path::Path::new(img_path);
                        if !p.exists() || !p.is_file() {
                            continue;
                        }
                        let orig_name = p
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("image.png")
                            .to_string();

                        let zip_name = unique_name(&orig_name, &mut used_image_names);
                        let zip_inner_path = format!("MDImg/{}", zip_name);

                        let img_data = std::fs::read(p).map_err(|e| e.to_string())?;
                        zip.start_file(&zip_inner_path, options)
                            .map_err(|e| e.to_string())?;
                        zip.write_all(&img_data).map_err(|e| e.to_string())?;

                        md.push_str(&format!("![{}]({})\n\n", zip_name, zip_inner_path));
                    }
                    md.push('\n');
                }

                if !lesson.video_path.is_empty() {
                    md.push_str(&format!(" [点击打开课程视频]({})\n\n", lesson.video_path));
                }

                if format != "singleLesson" {
                    md.push_str("------\n\n");
                }
            }
        }

        let base = sanitize_filename(&doc.doc_title);
        let mut md_filename = format!("{}.md", base);
        let mut counter = 1;
        while used_md_names.contains(&md_filename) {
            md_filename = format!("{} ({}).md", base, counter);
            counter += 1;
        }
        used_md_names.insert(md_filename.clone());

        zip.start_file(&md_filename, options).map_err(|e| e.to_string())?;
        zip.write_all(md.as_bytes()).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn unique_name(orig: &str, used: &mut std::collections::HashSet<String>) -> String {
    if !used.contains(orig) {
        used.insert(orig.to_string());
        return orig.to_string();
    }
    let stem = std::path::Path::new(orig)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(orig);
    let ext = std::path::Path::new(orig)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let mut counter = 1;
    loop {
        let candidate = if ext.is_empty() {
            format!("{} ({})", stem, counter)
        } else {
            format!("{} ({}).{}", stem, counter, ext)
        };
        if !used.contains(&candidate) {
            used.insert(candidate.clone());
            return candidate;
        }
        counter += 1;
    }
}

#[tauri::command]
pub fn get_all_notes(state: tauri::State<'_, DbState>) -> Result<Vec<db::NoteWithCourse>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_all_notes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_course_notes(
    state: tauri::State<'_, DbState>,
    course_id: i64,
) -> Result<Vec<db::Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_course_notes(&conn, course_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_note(
    state: tauri::State<'_, DbState>,
    course_id: i64,
    lesson_id: i64,
    lesson_title: String,
    content: String,
    video_time: f64,
    image_paths: Vec<String>,
) -> Result<db::Note, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_note(&conn, course_id, lesson_id, &lesson_title, &content, video_time, &image_paths).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_note(
    state: tauri::State<'_, DbState>,
    note_id: i64,
    content: String,
    image_paths: Vec<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_note(&conn, note_id, &content, &image_paths).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(state: tauri::State<'_, DbState>, note_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_note(&conn, note_id).map_err(|e| e.to_string())
}
