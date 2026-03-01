# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initialized Next.js project (App Router, empty base).
- Installed `framer-motion` for frontend animations.
- Installed `@supabase/supabase-js` for backend/realtime support.
- Configured initial UI structure, base vanilla CSS, and basic landing page.
- Implemented `ChatBubble` component with spring animations.
- Implemented `ChatActionBar` to toggle between Story and AI interactive modes.
- Integrated chat interface to `page.tsx` with auto-scroll and dynamic context switching.
- Moved `page.tsx` chat interface to dynamic route `/story/[id]`.
- Implemented `StoryCard` component to show thumbnail, story info, and metadata.
- Implemented Home Page grid layout listing trending and available novel stories.
- Updated Global Theme from Dark Mode to Minimal Light Theme.
- Refined UI components (`StoryCard`, `ChatBubble`, `ChatActionBar`, `Home Page`) to fit the new aesthetic with adjusted shadows and borders.
- Added "My Novels" section to Home Page with empty state and Create button.
- Created `/story/create` page with a form to define a new novel's title, synopsis, and main character for the AI Persona.
- Redesigned Home Page to match readAwrite style (Top Navbar, Create Button in Navbar, Hero Banner Carousel, and Horizontal Scrolling Story Lists).
- Simplified `StoryCard` to focus only on Cover Image (1:1 aspect ratio) and Title.
- Updated theme primary color to teal (`#1cc6ac`) to match the reference UI.
- Implemented `/dashboard` page for writers to view mock earnings, AI subscribers, and Story Analytics.
- Added Category Tabs (All, Novel, Fanfic, Cartoon) and Badges to Writer Dashboard.
- Added link to Dashboard on the Home Page navbar and removed duplicate Create Novel button.
- Restructured `/story/create` into a selection screen (Novel, Fanfic, Cartoon) which then directs to specific format creators (`/story/create/text` or `/story/create/comic`).
- Completed HTML5 Canvas Drawing tool for Comic creation mode, including Undo/Redo, brush types (Marker/Pen), and global color palette.
- Added `completion_status` to `stories` schema (`ongoing` | `completed`) with migration-safe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Added story-level status controls on `/story/manage/[id]` for both publication (`draft` | `published`) and completion (`ongoing` | `completed`) with immediate save to Supabase.
- Added completion status badges on writer dashboard story cards (`Completed` / `Ongoing`).
- Added reader-mode layout for non-chat stories (`narrative` and `thread`) with chapter tabs and previous/next chapter navigation.

### Changed
- Wired "แก้ไขตอน" and empty-state "เขียนตอนแรก" buttons to working chapter flows.
- Displayed clearer chapter publication labels (`เผยแพร่แล้ว` / `ยังไม่เผยแพร่`) and published chapter count in the section header.
- Updated chapter editor routing to preserve story writing style via query (`?style=`) from story manager actions.
- Updated chapter editor to show style context in UI and placeholder text based on selected style (`chat` / `thread` / `narrative`).
- Updated chapter editor navigation back to story manager using `router.replace(...)` to prevent browser back returning to editor unexpectedly.
- Updated home page to remove banner/mock sections and render published stories directly from Supabase only.
- Updated home page story click target from writer manage route to reader route (`/story/[id]`).
- Updated reader page (`/story/[id]`) to load real published story/chapter data from Supabase with fallback to legacy mock entries only when needed.

### Fixed
- Fixed reader flow so users landing from home no longer enter writer manage/edit pages.
- Fixed reader rendering mismatch where all stories appeared as chat by switching rendering according to each story’s `writing_style`.
- Fixed chapter creation guard to block adding new chapters when a story is marked `completed`.
