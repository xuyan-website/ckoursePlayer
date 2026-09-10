use base64::Engine;

#[tauri::command]
pub fn save_screenshot(data_url: String) -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("cannot resolve exe parent dir")?;
    let screenshot_dir = exe_dir.join("Screenshot");
    std::fs::create_dir_all(&screenshot_dir).map_err(|e| e.to_string())?;

    let b64 = data_url
        .split(',')
        .nth(1)
        .ok_or("invalid data url: missing base64 payload")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let filename = format!("{}.png", timestamp);
    let filepath = screenshot_dir.join(&filename);
    std::fs::write(&filepath, &bytes).map_err(|e| e.to_string())?;

    Ok(filepath.to_string_lossy().to_string())
}

#[tauri::command]
pub fn capture_video_frame(video_path: String, timestamp: f64) -> Result<String, String> {
    if video_path.starts_with("gdrive:") {
        return Err("screenshot not supported for Google Drive videos".into());
    }

    let ffmpeg_bin = crate::parser::find_bundled_bin("ffmpeg")
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "ffmpeg".to_string());

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("cannot resolve exe parent dir")?;
    let screenshot_dir = exe_dir.join("Screenshot");
    std::fs::create_dir_all(&screenshot_dir).map_err(|e| e.to_string())?;

    let ts_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let output = screenshot_dir.join(format!("{}.png", ts_millis));

    let mut cmd = std::process::Command::new(&ffmpeg_bin);
    cmd.args(["-y", "-ss"])
        .arg(format!("{:.3}", timestamp))
        .arg("-i")
        .arg(&video_path)
        .args(["-frames:v", "1"])
        .arg(&output);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let out = cmd.output().map_err(|e| format!("failed to run ffmpeg: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("ffmpeg failed: {stderr}"));
    }
    if !output.exists() {
        return Err("ffmpeg produced no output file".into());
    }

    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
pub fn copy_image_to_screenshot(src_path: String) -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe.parent().ok_or("cannot resolve exe parent dir")?;
    let screenshot_dir = exe_dir.join("Screenshot");
    std::fs::create_dir_all(&screenshot_dir).map_err(|e| e.to_string())?;

    let ts_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let ext = std::path::Path::new(&src_path)
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "png".to_string());
    let filename = format!("{}.{}", ts_millis, ext);
    let dest = screenshot_dir.join(&filename);
    std::fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;

    Ok(dest.to_string_lossy().to_string())
}
