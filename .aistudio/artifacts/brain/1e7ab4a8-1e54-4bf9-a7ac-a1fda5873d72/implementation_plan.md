# Implementation Plan: Pure Native App UI (Removal of Virtual Device Shell)

Remove the simulated phone hardware bezel, fake Dynamic Island, and duplicate OS status bar so the application renders directly and seamlessly as a true, edge-to-edge Android/mobile application.

## 1. Problem Analysis & Objective
- **Current State**: The interface wrapped the app inside a simulated smartphone chassis (`border-[10px]`, `rounded-[48px]`, desktop bezel switcher, and `MobileStatusBar` showing fake "9:41", battery, and signal icons). When opened on an actual mobile device or Android runtime, this creates an unnatural "phone inside a phone" appearance.
- **Target State**: A pure, native Android-style application layout that occupies `100%` of the viewport with zero artificial hardware borders. The app features a native top App Bar, smooth scrolling content area, and sleek bottom navigation bar (or side navigation on tablet/foldables) that respects system safe areas.

## 2. Proposed Changes

### A. Remove Skeuomorphic Virtual Hardware Elements
- **Delete / Deprecate `MobileStatusBar.tsx`**: Remove the fake "9:41" carrier/battery simulation bar. The real Android or iOS OS already renders system status bars.
- **Remove Device Bezel & Wrapper in `App.tsx`**:
  - Eliminate `border-[10px]`, `rounded-[48px]`, outer device shadows, and fixed container constraints.
  - Remove the desktop "View: Phone Bezel / Full Mobile" floating toggle.
  - Set the root container to `w-full min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between`.

### B. Polish Native Mobile App Bar & Navigation
- Provide a clean, native Material 3 / Android style Top App Bar with:
  - App avatar / brand identity or title
  - Contextual quick actions (AI pulse, notifications, energy level)
  - Profile / drawer trigger
- Keep the ergonomic `MobileBottomNav` anchored at the bottom with safe-area padding for Android gesture navigation bars (`pb-safe` / `env(safe-area-inset-bottom)`).
- Ensure all screens (Home, Tasks, Task Detail, Calendar, AIChat, Research, Files, Progress, Goals, Settings) render full width with appropriate mobile touch targets (minimum 44x44px).

### C. Safe Area & Responsive Android PWA Support
- Configure viewport meta tag with `viewport-fit=cover` and dynamic viewport height (`100dvh` / `h-screen`).
- Provide fluid scrolling without double scrollbars or awkward letterboxing.

## 3. Verification Plan
- Verify that no fake phone bezels, borders, or simulated clock/battery status bars appear.
- Run `compile_applet` and `lint_applet` to confirm zero compilation or TypeScript errors.
- Test responsive viewports from small mobile screens (360px Android width) up to tablet and desktop screens.
