# Changelog

All notable changes to the "Focus Mode" extension will be documented in this file.

## [1.0.0] - 2026-02-24

### Added
- Toggle focus mode with `Ctrl+K Ctrl+F` (or `Cmd+K Cmd+F` on Mac)
- Line spotlight effect — current line at full brightness, others dimmed
- Configurable opacity for non-focused lines (0.1–0.9)
- Full screen and centered layout on activation
- Hides all UI chrome: sidebar, panel, activity bar, status bar, tabs, breadcrumbs, minimap, menu bar, layout controls, and editor actions
- Separate zoom levels for focus mode and normal editing (persisted across sessions)
- Press `Escape` to exit (context-aware — won't interfere with autocomplete, find, rename, etc.)
- Crash recovery — restores all settings if VS Code closes unexpectedly during focus mode
- Configurable line numbers: off, on, relative, or inherit
- Editor title bar icon for quick toggling
