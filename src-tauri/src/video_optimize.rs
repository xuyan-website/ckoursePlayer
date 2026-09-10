use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeResult {
    pub status: String,
    pub message: String,
}

fn result(status: &str, message: impl Into<String>) -> OptimizeResult {
    OptimizeResult {
        status: status.to_string(),
        message: message.into(),
    }
}

// Scan the top-level ISO-BMFF boxes of an mp4/m4v/mov file and report whether
// the `moov` (metadata) atom appears before `mdat` (media data). When moov is
// at the front the file is "faststart"-optimized and players can begin playback
// without a second round-trip to the end of the file.
// Returns Some(true) if moov precedes mdat, Some(false) if mdat precedes moov,
// or None if the file is not a readable mp4 container.
fn moov_is_at_front(path: &Path) -> Option<bool> {
    let mut file = fs::File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    let mut pos: u64 = 0;

    while pos < file_len {
        file.seek(SeekFrom::Start(pos)).ok()?;
        let mut header = [0u8; 8];
        if file.read_exact(&mut header).is_err() {
            break;
        }

        let size = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as u64;
        let box_type = &header[4..8];

        let box_size = if size == 1 {
            let mut ext = [0u8; 8];
            file.read_exact(&mut ext).ok()?;
            u64::from_be_bytes(ext)
        } else if size == 0 {
            file_len - pos
        } else {
            size
        };

        if box_size < 8 {
            break;
        }

        if box_type == b"moov" {
            return Some(true);
        }
        if box_type == b"mdat" {
            return Some(false);
        }

        pos += box_size;
    }

    None
}

fn temp_path_for(path: &Path) -> Option<PathBuf> {
    let file_name = path.file_name()?.to_str()?;
    // Keep the original extension so ffmpeg can infer the output container
    // format from it (ffmpeg rejects unknown extensions like ".ckourse-tmp").
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("mp4");
    Some(path.with_file_name(format!("{file_name}.ckourse-tmp.{ext}")))
}

fn backup_path_for(path: &Path) -> Option<PathBuf> {
    let file_name = path.file_name()?.to_str()?;
    Some(path.with_file_name(format!("{file_name}.ckourse-bak")))
}

fn run_ffmpeg_faststart(input: &Path, output: &Path) -> Result<(), String> {
    let ffmpeg_bin = crate::parser::find_bundled_bin("ffmpeg")
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "ffmpeg".to_string());

    let mut cmd = std::process::Command::new(&ffmpeg_bin);
    cmd.args([
        "-y",
        "-i",
    ])
    .arg(input)
    .args(["-movflags", "+faststart", "-c", "copy"])
    .arg(output);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run ffmpeg: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    Ok(())
}

pub fn optimize_faststart(path: &Path) -> OptimizeResult {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());

    let ext = match ext {
        Some(e) => e,
        None => return result("skipped", "file has no extension"),
    };

    if !matches!(ext.as_str(), "mp4" | "m4v" | "mov") {
        return result("skipped", format!(".{ext} files are not optimizable"));
    }

    if !path.is_file() {
        return result("skipped", "file not found");
    }

    match moov_is_at_front(path) {
        Some(true) => return result("already_optimized", "moov atom already at front"),
        Some(false) => {}
        None => return result("skipped", "could not parse mp4 box structure"),
    }

    let temp_path = match temp_path_for(path) {
        Some(p) => p,
        None => return result("failed", "could not build temp path"),
    };
    let bak_path = match backup_path_for(path) {
        Some(p) => p,
        None => return result("failed", "could not build backup path"),
    };

    // Clean up any leftovers from a previous failed run.
    let _ = fs::remove_file(&temp_path);
    let _ = fs::remove_file(&bak_path);

    if let Err(e) = run_ffmpeg_faststart(path, &temp_path) {
        let _ = fs::remove_file(&temp_path);
        return result("failed", e);
    }

    // Verify the optimized file was produced and is non-empty.
    match fs::metadata(&temp_path) {
        Ok(m) if m.len() > 0 => {}
        _ => {
            let _ = fs::remove_file(&temp_path);
            return result("failed", "ffmpeg produced no output");
        }
    }

    // Atomically swap: original -> bak, temp -> original, then drop bak.
    if let Err(e) = fs::rename(path, &bak_path) {
        let _ = fs::remove_file(&temp_path);
        return result(
            "failed",
            format!("could not back up original (is the video playing?): {e}"),
        );
    }

    if let Err(e) = fs::rename(&temp_path, path) {
        // Restore the original from the backup before giving up.
        let _ = fs::rename(&bak_path, path);
        return result("failed", format!("failed to move optimized file into place: {e}"));
    }

    let _ = fs::remove_file(&bak_path);
    result("optimized", "moov atom moved to front")
}

#[tauri::command]
pub async fn optimize_video_faststart(video_path: String) -> Result<OptimizeResult, String> {
    let path = PathBuf::from(&video_path);
    tauri::async_runtime::spawn_blocking(move || Ok(optimize_faststart(&path)))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub needs_optimize: bool,
    pub status: String,
    pub message: String,
}

// Inspect a video file's moov atom position without modifying it. Used to show
// per-lesson status in the import preview before the user decides to optimize.
pub fn check_faststart(path: &Path) -> CheckResult {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());

    let ext = match ext {
        Some(e) => e,
        None => {
            return CheckResult {
                needs_optimize: false,
                status: "skipped".into(),
                message: "no extension".into(),
            }
        }
    };

    if !matches!(ext.as_str(), "mp4" | "m4v" | "mov") {
        return CheckResult {
            needs_optimize: false,
            status: "skipped".into(),
            message: format!(".{ext} not optimizable"),
        };
    }

    if !path.is_file() {
        return CheckResult {
            needs_optimize: false,
            status: "skipped".into(),
            message: "file not found".into(),
        };
    }

    match moov_is_at_front(path) {
        Some(true) => CheckResult {
            needs_optimize: false,
            status: "already_optimized".into(),
            message: "moov at front".into(),
        },
        Some(false) => CheckResult {
            needs_optimize: true,
            status: "needs_optimize".into(),
            message: "moov at end".into(),
        },
        None => CheckResult {
            needs_optimize: false,
            status: "skipped".into(),
            message: "could not parse mp4 structure".into(),
        },
    }
}

#[tauri::command]
pub async fn check_video_faststart(video_path: String) -> Result<CheckResult, String> {
    let path = PathBuf::from(&video_path);
    tauri::async_runtime::spawn_blocking(move || Ok(check_faststart(&path)))
        .await
        .map_err(|e| e.to_string())?
}
