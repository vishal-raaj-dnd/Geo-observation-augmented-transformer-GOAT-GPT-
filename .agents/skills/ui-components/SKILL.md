---
name: ui-components
description: Mandates listing components first, using shadcn/ui patterns from github.com/shadcn-ui/ui.git, matching charcoal theme, and applying light subtle transitions with strict anti-AI-slop rules.
---

# UI Components & Design System Skill

## Objective
Establish an industry-grade component building process. Ensure all UI elements are listed beforehand, adapted from `shadcn/ui`, perfectly styled to match the dark charcoal theme, and enhanced with subtle, light micro-animations.

## Standard Workflow

### Step 1: Component & Section Breakdown
Before writing any UI code, ALWAYS list out all necessary components, sections, buttons, inputs, and cards:
- Identify top-level layout containers (e.g. Map Canvas, Side Panel, Minimap Widget).
- Identify interactive inputs (e.g. State Selector, City Selector, Date Picker, Query Prompt Input).
- Identify dynamic display sections (e.g. Metric Cards, Line Chart Card, Donut Chart Card, Satellite Image Gallery, Annotated Image Section).
- Identify action controls (e.g. Send Button, Open Full Thread Button, PDF Export Button, GeoJSON Export Button).

### Step 2: Shadcn UI Primitive Selection
Select component patterns directly modeled after [shadcn/ui](https://github.com/shadcn-ui/ui.git):
- **Buttons**: `Button` (Primary off-white, Secondary dark border, Ghost, Icon).
- **Cards**: `Card`, `CardHeader`, `CardTitle`, `CardContent`.
- **Inputs & Selects**: `Input`, `Select`, `DropdownMenu`.
- **Dialogs & Drawers**: `Dialog`, `Sheet` for thread panels.
- **Progress & Spinners**: `Progress`, `Skeleton` loading spinners for tool-calling steps.

### Step 3: Theme & Palette Alignment
Adapt shadcn components to match the project's exact dark charcoal theme:
- **Base Background**: `#09090b` / `#121212` (deep dark charcoal).
- **Card/Container Fill**: `#18181b` (dark slate) with `#27272a` subtle 1px border.
- **Primary Buttons**: `#f4f4f5` (solid off-white fill) with `#09090b` dark text.
- **Secondary Buttons**: Dark background with `#27272a` border and `#fafafa` light text.
- **STRICT COLOR RULE**: **NO cyan, NO neon accents**.

### Step 4: Light & Subtle Micro-Animations
Apply professional, extremely light transitions:
- Transition duration: `150ms` - `200ms` `ease-out`.
- Subtle hover effects: `opacity: 0.9` or `background-color` shift (`#e4e4e7` on primary hover).
- Soft fade-ins for loading cards (`fade-in` 200ms).
- Avoid heavy, flashy, or distracting keyframe animations.

### Step 5: Anti-AI-Slop Rules
- **NO EMOJIS anywhere**.
- **NO CURVED / PILL BADGES**.
- **NO VERSION TAGS / WATERMARKS**.
- **NO UNNECESSARY DECORATIVE FLUFF**: Handcrafted, clean, human-designed layout.
