# Compact & Modern Task Detail View Plan

Redesign the Task Detail inside view into a high-density, modern, and ergonomic layout that displays all task context, actions, and milestones in minimal vertical space without clutter.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your direct feedback:
> 1. **Single-Line Action Buttons**: The three primary actions (*Focus Timer*, *Ask AI*, and *Calendar Schedule*) will sit side-by-side in **one single compact row** on all screen widths rather than stacking as giant full-width buttons.
> 2. **Ultra-Compact Task Card**: The oversized "dashboard" card will be condensed into a sleek, space-efficient summary header with quiet metadata, inline status, and a slim progress meter.
> 3. **Dense Action Plan & Subtask Milestones**: Subtasks will be displayed with minimal vertical padding, inline add controls, and clean monospace estimates, minimizing scroll height.

- **Confirmed Decision 1**: Single-row compact action bar (`flex items-center gap-2`) with equal or icon-labeled buttons.
- **Confirmed Decision 2**: Reduced vertical footprint so task overview and primary actions fit cleanly in the top fold.

---

## 1. Overview & Core Concept

- **What It Delivers**: A condensed, distraction-free task interior screen. Students can view the task title, due date, course tag, priority, and progress at a glance, execute quick actions in one tap, and manage subtasks without getting lost in giant cards or endless scrolling.
- **Target Persona**: Fast-moving university students switching between classes and assignments who need fast execution and concise information density.
- **Key Value**: Maximum information and action reach in minimum vertical height.

---

## 2. User Experience & Visual Design

### 2.1 Viewport Composition & Density Math
- **Top Navigation Bar**:
  - Breadcrumb `← Tasks` with compact touch target.
  - Right-aligned quick status toggle: compact `Mark done` button with `CheckCircle2` icon + discreet trash icon.
- **Compact Task Header (Zero Bloat)**:
  - Line 1 (Context): Monospace course code tag (`CS101`), priority indicator (`High`), and deadline (`Due Oct 6`) separated by `·` glyphs.
  - Line 2 (Core Title): Bold, clean title (`text-base sm:text-lg`) with strikethrough state when completed.
  - Line 3 (Description): Brief description text in compact typography (`text-xs text-slate-500 leading-snug`).
  - Line 4 (Progress & Schedule): Slim hairline progress bar alongside a quiet schedule tag if already planned.
- **Single-Line Action Toolbar**:
  - Three compact buttons in **one continuous row**:
    1. **Focus**: `[▶ 25m Focus]` (Primary filled indigo button, icon + short text).
    2. **Study AI**: `[✨ Ask AI]` (Subtle surface button, icon + short text).
    3. **Schedule**: `[📅 Schedule]` (Subtle surface button, icon + short text).
- **Inline Compact Scheduler (When Expanded)**:
  - Collapsible single-row time selector with date, start time, end time, and confirm checkmark.
- **Dense Action Plan (Checklist)**:
  - Compact list items with tight padding (`py-2 px-3`).
  - Checkbox toggle + step number + title + tabular minute tag (`15m`).
  - Single-line "Add step" input with enter-to-submit.
  - Quiet editorial AI rationale note without purple gradient container.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Single-Row Action Bar vs. Stacked Cards**
  - *Chosen Approach*: `flex items-center gap-2` with flexible auto-width buttons so all 3 actions stay on one line on mobile and desktop alike.
  - *Why*: Eliminates ~160px of unnecessary vertical height and keeps the primary controls immediately reachable.
- **Decision 2: Integrated Compact Header vs. Multi-Card Dashboard**
  - *Chosen Approach*: Unify course tag, priority, due date, title, and progress into one tight container (padding `p-3.5 sm:p-4`).
  - *Why*: Avoids "cards within cards" and keeps subtasks visible without scrolling on standard screens.

---

## 4. Technical Architecture & Component Hierarchy

```
┌────────────────────────────────────────────────────────┐
│                   TaskDetailScreen                     │
├────────────────────────────────────────────────────────┤
│ [← Tasks]                         [Mark done] [Trash]  │
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ CS101 · High · Due Oct 6 · ~45m                    │ │
│ │ Algorithm Analysis Homework                        │ │
│ │ Write complexity proofs for Divide & Conquer.      │ │
│ │ ─────── 60% ───────                                │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│ [▶ 25m Focus]      [✨ Ask AI]      [📅 Schedule]     │
├────────────────────────────────────────────────────────┤
│ (Optional Collapsible Inline Schedule Bar)             │
├────────────────────────────────────────────────────────┤
│ Action Plan (2/3 done)            [↺ Regenerate Plan] │
│ ┌────────────────────────────────────────────────────┐ │
│ │ [✓] 1. Read Chapter 4 Foundations              15m │ │
│ │ [✓] 2. Draft Proof Lemma A                     20m │ │
│ │ [○] 3. Verify Master Theorem Bounds            10m │ │
│ │ [+ Add next step...                  ] [Add]       │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```
