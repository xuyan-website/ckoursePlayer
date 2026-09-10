use serde::Serialize;

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "webm", "avi", "mov", "flv", "wmv", "m4v", "ts", "mpeg", "mpg", "vob",
];

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
}

/// List non-video files in a directory.
///
/// Returns files (not subdirectories) in the given directory, excluding
/// hidden files and video files. Sorted by name (case-insensitive).
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    if path.starts_with("gdrive:") {
        return Err("Cannot list Google Drive directories locally".into());
    }

    let p = std::path::Path::new(&path);
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let entries = std::fs::read_dir(p).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        if entry_path.is_file() || entry_path.is_symlink() {
            let extension = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if VIDEO_EXTENSIONS.contains(&extension.as_str()) {
                continue;
            }

            files.push(DirEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
            });
        }
    }

    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(files)
}

/// Reveal a file in the OS file manager, selecting it when supported.
///
/// - Windows: `explorer.exe /select,<path>`
/// - macOS:   `open -R <path>`
/// - Linux:   `xdg-open <parent_dir>` (selection not supported)
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    if path.starts_with("gdrive:") {
        return Err("Cannot reveal Google Drive files in the local file manager".into());
    }

    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }

    // Normalize path to resolve double backslashes and other irregularities
    let normalized = p
        .canonicalize()
        .map(|c| c.to_string_lossy().to_string())
        .unwrap_or(path);

    #[cfg(target_os = "windows")]
    {
        // Remove \\?\ prefix from canonicalize() on Windows
        let clean_path = normalized.strip_prefix(r"\\?\").unwrap_or(&normalized);
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe")
            .raw_arg(format!("/select,{}", clean_path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &normalized])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&normalized)
            .parent()
            .unwrap_or(std::path::Path::new(&normalized));
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Delete a file from disk.
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    if !p.is_file() {
        return Err(format!("Not a file: {}", path));
    }
    std::fs::remove_file(p).map_err(|e| e.to_string())
}

/// Open a file with the system default application.
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }

    let normalized = p
        .canonicalize()
        .map(|c| c.to_string_lossy().to_string())
        .unwrap_or(path);

    #[cfg(target_os = "windows")]
    {
        let clean_path = normalized.strip_prefix(r"\\?\").unwrap_or(&normalized);
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .raw_arg(format!("/c start \"\" \"{}\"", clean_path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&normalized)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&normalized)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
