import {
  SquaresFourIcon as SquaresFour,
  ChartBarIcon as ChartBar,
  BookmarkSimpleIcon as BookmarkSimple,
  NotepadIcon as Notepad,
  GearSixIcon as GearSix,
} from "@phosphor-icons/react";
import { EASE } from "@/lib/constants";
import type { NavItem } from "@/types";

export { EASE };
export const DUR = "500ms";
export const spring = (extra = "") =>
  `${extra ? extra + " " : ""}${DUR} ${EASE}`.trim();

export const navigationItems: NavItem[] = [
  { icon: SquaresFour, label: "nav.dashboard", path: "/" },
  { icon: BookmarkSimple, label: "nav.bookmarks", path: "/bookmarks" },
  { icon: ChartBar, label: "nav.progress", path: "/progress" },
  { icon: Notepad, label: "nav.notes", path: "/notes" },
];

export const appItems: NavItem[] = [
  { icon: GearSix, label: "nav.settings", path: "/settings" },
];

export const routeTitles: Record<string, string> = {
  "/": "nav.dashboard",
  "/bookmarks": "nav.bookmarks",
  "/progress": "nav.progress",
  "/notes": "nav.notes",
  "/settings": "nav.settings",
  "/import": "nav.importCourse",
};
