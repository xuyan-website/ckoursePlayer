import { invoke } from "@tauri-apps/api/core";
import type {
  Course,
  CourseDetail,
  Lesson,
  Note,
  NoteWithCourse,
  FavoriteLesson,
  Subtitle,
  SaveCourseConfig,
  ParsedCourse,
  DashboardStats,
  ProgressData,
  LibraryStats,
  SearchResult,
  Resource,
} from "@/types";

export async function getCourses(): Promise<Course[]> {
  return invoke<Course[]>("get_courses");
}

export async function getCourse(courseId: number): Promise<Course | null> {
  return invoke<Course | null>("get_course", { courseId });
}

export async function getCourseDetail(
  courseId: number,
): Promise<CourseDetail | null> {
  return invoke<CourseDetail | null>("get_course_detail", { courseId });
}

export async function importCourse(
  parsed: ParsedCourse,
  config: SaveCourseConfig,
): Promise<number> {
  return invoke<number>("import_course", { parsed, config });
}

export async function updateCourse(
  courseId: number,
  title: string,
  author: string,
  accentColor: string,
  category: string,
): Promise<void> {
  return invoke("update_course", { courseId, title, author, accentColor, category });
}

export async function resetCourseProgress(courseId: number): Promise<void> {
  return invoke("reset_course_progress", { courseId });
}

export async function deleteCourse(courseId: number): Promise<void> {
  return invoke("delete_course", { courseId });
}

export async function reorderSections(
  courseId: number,
  sectionIds: number[],
): Promise<void> {
  return invoke("reorder_sections", { courseId, sectionIds });
}

export async function reorderLessons(
  sectionId: number,
  lessonIds: number[],
): Promise<void> {
  return invoke("reorder_lessons", { sectionId, lessonIds });
}

export async function updateSectionTitle(
  sectionId: number,
  title: string,
): Promise<void> {
  return invoke("update_section_title", { sectionId, title });
}

export async function updateLessonTitle(
  lessonId: number,
  title: string,
): Promise<void> {
  return invoke("update_lesson_title", { lessonId, title });
}

export async function updateLessonVideoPath(
  lessonId: number,
  videoPath: string,
): Promise<void> {
  return invoke("update_lesson_video_path", { lessonId, videoPath });
}

export async function batchReplaceSectionVideos(
  sectionId: number,
  videoPaths: string[],
): Promise<Lesson[]> {
  return invoke<Lesson[]>("batch_replace_section_videos", { sectionId, videoPaths });
}

export async function deleteLesson(lessonId: number): Promise<void> {
  return invoke("delete_lesson", { lessonId });
}

export async function deleteSection(sectionId: number): Promise<void> {
  return invoke("delete_section", { sectionId });
}

export async function toggleLessonCompleted(
  lessonId: number,
): Promise<boolean> {
  return invoke<boolean>("toggle_lesson_completed", { lessonId });
}

export async function updateLessonDuration(
  lessonId: number,
  duration: number,
): Promise<void> {
  return invoke("update_lesson_duration", { lessonId, duration });
}

export async function saveLessonPosition(
  lessonId: number,
  position: number,
): Promise<void> {
  return invoke("save_lesson_position", { lessonId, position });
}

export async function setLastWatched(
  courseId: number,
  lessonId: number,
): Promise<void> {
  return invoke("set_last_watched", { courseId, lessonId });
}

export async function getAllNotes(): Promise<NoteWithCourse[]> {
  return invoke<NoteWithCourse[]>("get_all_notes");
}

export async function getCourseNotes(courseId: number): Promise<Note[]> {
  return invoke<Note[]>("get_course_notes", { courseId });
}

export async function addNote(
  courseId: number,
  lessonId: number,
  lessonTitle: string,
  content: string,
  videoTime: number,
  imagePaths: string[] = [],
): Promise<Note> {
  return invoke<Note>("add_note", { courseId, lessonId, lessonTitle, content, videoTime, imagePaths });
}

export async function saveScreenshot(dataUrl: string): Promise<string> {
  return invoke<string>("save_screenshot", { dataUrl });
}

export async function captureVideoFrame(videoPath: string, timestamp: number): Promise<string> {
  return invoke<string>("capture_video_frame", { videoPath, timestamp });
}

export async function updateNote(
  noteId: number,
  content: string,
  imagePaths: string[] = [],
): Promise<void> {
  return invoke("update_note", { noteId, content, imagePaths });
}

export async function deleteNote(noteId: number): Promise<void> {
  return invoke("delete_note", { noteId });
}

export interface ExportNoteData {
  markdown: string;
  imagePaths: string[];
}

export interface ExportLessonData {
  sectionTitle: string;
  lessonTitle: string;
  videoPath: string;
  notes: ExportNoteData[];
}

export interface ExportSectionData {
  sectionTitle: string;
  lessons: ExportLessonData[];
}

export interface ExportDocData {
  docTitle: string;
  sections: ExportSectionData[];
}

export type ExportFormat = "singleLesson" | "fullCourse" | "searchResult";

export async function exportNotesToZip(
  docs: ExportDocData[],
  outputPath: string,
  format: ExportFormat,
): Promise<void> {
  return invoke("export_notes_to_zip", { docs, outputPath, format });
}

export async function copyImageToScreenshot(srcPath: string): Promise<string> {
  return invoke<string>("copy_image_to_screenshot", { srcPath });
}

export async function toggleBookmark(courseId: number): Promise<boolean> {
  return invoke<boolean>("toggle_bookmark", { courseId });
}

export async function toggleFavorite(lessonId: number): Promise<boolean> {
  return invoke<boolean>("toggle_favorite", { lessonId });
}

export async function getAllFavorites(): Promise<FavoriteLesson[]> {
  return invoke<FavoriteLesson[]>("get_all_favorites");
}

export async function getBookmarkedCourses(): Promise<Course[]> {
  return invoke<Course[]>("get_bookmarked_courses");
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke<DashboardStats>("get_dashboard_stats");
}

export async function getProgressData(): Promise<ProgressData> {
  return invoke<ProgressData>("get_progress_data");
}

export async function getLessonSubtitles(
  lessonId: number,
): Promise<Subtitle[]> {
  return invoke<Subtitle[]>("get_lesson_subtitles", { lessonId });
}

export async function getSubtitleVtt(path: string): Promise<string> {
  return invoke<string>("get_subtitle_vtt", { path });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const pairs = await invoke<[string, string][]>("get_all_settings");
  return Object.fromEntries(pairs);
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

export async function getLibraryStats(): Promise<LibraryStats> {
  return invoke<LibraryStats>("get_library_stats");
}

export async function deleteAllData(): Promise<void> {
  return invoke("delete_all_data");
}

export type ImportMode = "merge" | "replace";

export async function exportToFile(path: string): Promise<void> {
  return invoke("export_to_file", { path });
}

export async function importFromFile(path: string, mode: ImportMode): Promise<void> {
  return invoke("import_from_file", { path, mode });
}

export async function getCustomCategories(): Promise<string[]> {
  return invoke<string[]>("get_custom_categories");
}

export async function addCustomCategory(name: string): Promise<void> {
  return invoke("add_custom_category", { name });
}

export async function deleteCustomCategory(name: string): Promise<void> {
  return invoke("delete_custom_category", { name });
}

export async function searchContent(query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_content", { query });
}

export interface OptimizeResult {
  status: "already_optimized" | "optimized" | "skipped" | "failed";
  message: string;
}

export async function optimizeVideoFaststart(
  videoPath: string,
): Promise<OptimizeResult> {
  return invoke<OptimizeResult>("optimize_video_faststart", { videoPath });
}

export interface CheckResult {
  needsOptimize: boolean;
  status: "needs_optimize" | "already_optimized" | "skipped";
  message: string;
}

export async function checkVideoFaststart(
  videoPath: string,
): Promise<CheckResult> {
  return invoke<CheckResult>("check_video_faststart", { videoPath });
}

export async function revealInExplorer(path: string): Promise<void> {
  return invoke<void>("reveal_in_explorer", { path });
}

export async function openFile(path: string): Promise<void> {
  return invoke<void>("open_file", { path });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke<void>("delete_file", { path });
}

export interface DirEntry {
  name: string;
  path: string;
}

export async function listDirectory(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_directory", { path });
}

export async function getLessonResources(lessonId: number): Promise<Resource[]> {
  return invoke<Resource[]>("get_lesson_resources", { lessonId });
}

export async function addLessonResource(
  courseId: number,
  lessonId: number,
  path: string,
): Promise<number> {
  return invoke<number>("add_lesson_resource", { courseId, lessonId, path });
}

export async function deleteResource(resourceId: number): Promise<void> {
  return invoke("delete_resource", { resourceId });
}

export async function updateResourcePath(
  resourceId: number,
  path: string,
): Promise<void> {
  return invoke("update_resource_path", { resourceId, path });
}
