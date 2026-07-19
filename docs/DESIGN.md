---
name: Network+ for DevTools
description: A precise, high-density network forensics workbench for Microsoft Edge DevTools.
colors:
  signal-indigo: '#6366f1'
  signal-indigo-soft: '#6366f11f'
  canvas-light: '#fafbfc'
  surface-light: '#f0f2f5'
  content-light: '#ffffff'
  ink-light: '#1a1a2e'
  muted-light: '#606d7b'
  border-light: '#dde1e6'
  canvas-dark: '#0f172a'
  surface-dark: '#1e293b'
  content-dark: '#162032'
  ink-dark: '#e2e8f0'
  muted-dark: '#94a3b8'
  border-dark: '#334155'
  success: '#059669'
  caution: '#d97706'
  error: '#dc2626'
  evidence-yellow: '#fbbf24'
  evidence-red: '#ef4444'
  evidence-green: '#22c55e'
  evidence-blue: '#3b82f6'
  evidence-purple: '#a855f7'
  evidence-orange: '#f97316'
typography:
  title:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Roboto, sans-serif'
    fontSize: '14px'
    fontWeight: 800
    lineHeight: 1
    letterSpacing: '-0.3px'
  body:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: 400
  label:
    fontFamily: 'Segoe UI, system-ui, -apple-system, Roboto, sans-serif'
    fontSize: '11px'
    fontWeight: 700
    letterSpacing: '0.3px'
  mono:
    fontFamily: 'Cascadia Code, Consolas, Courier New, monospace'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.6
rounded:
  xs: '3px'
  sm: '4px'
  md: '6px'
  lg: '8px'
  xl: '10px'
spacing:
  xs: '2px'
  sm: '4px'
  md: '6px'
  lg: '8px'
  xl: '10px'
  xxl: '12px'
components:
  toolbar-button:
    backgroundColor: '{colors.canvas-light}'
    textColor: '{colors.ink-light}'
    typography: '{typography.body}'
    rounded: '{rounded.lg}'
    padding: '5px 12px'
    height: '32px'
  toolbar-button-active:
    backgroundColor: '{colors.signal-indigo-soft}'
    textColor: '{colors.signal-indigo}'
    typography: '{typography.body}'
    rounded: '{rounded.lg}'
    padding: '5px 12px'
    height: '32px'
  search-input:
    backgroundColor: '{colors.canvas-light}'
    textColor: '{colors.ink-light}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '4px 8px'
  tab-active:
    backgroundColor: '{colors.signal-indigo-soft}'
    textColor: '{colors.signal-indigo}'
    typography: '{typography.label}'
    rounded: '{rounded.xs}'
    padding: '5px 12px'
---

# Design System: Network+ for DevTools

## Overview

**Creative North Star: "The Network Forensics Workbench"**

Network+ is a precise instrument panel, not a destination page. It should feel like a trusted workbench where evidence is
captured, narrowed, inspected, and exported without visual ceremony. Dense information is welcome when hierarchy,
alignment, and state make the next action obvious.

The interface inherits familiar Edge DevTools patterns and strengthens them with clearer selection, filtering, and
inspection states. It rejects marketing-page composition, decorative novelty, and anything that slows a user who is
already diagnosing a live problem.

**Key Characteristics:**

- Restrained neutral surfaces with one signal accent
- Compact controls and stable, high-density geometry
- Explicit keyboard focus, selection, recording, and filtering states
- Monospaced evidence views inside a familiar system-sans workbench
- System, Dark, and Light behavior treated as one design contract

## Colors

The palette is operational: cool neutral layers separate work areas while Signal Indigo identifies the current action or
selection.

### Primary

- **Signal Indigo** (`#6366f1`): Primary actions, active tabs, focus rings, and current selection only.
- **Signal Indigo Soft** (`#6366f11f`): Low-emphasis active and hover surfaces that preserve text contrast.

### Secondary

- **Evidence Yellow** (`#fbbf24`): Keyword identity and timing evidence; never a standalone status.
- **Evidence Red** (`#ef4444`): Keyword identity and manual marking, distinct from semantic error text.
- **Evidence Green** (`#22c55e`): Keyword identity and timing evidence, distinct from semantic success text.
- **Evidence Blue** (`#3b82f6`): Keyword identity and DNS timing evidence.
- **Evidence Purple** (`#a855f7`): Keyword identity and TLS timing evidence.
- **Evidence Orange** (`#f97316`): Keyword identity and connection timing evidence.

### Neutral

- **Inspection Canvas** (`#fafbfc` light / `#0f172a` dark): The full-panel working background.
- **Workbench Surface** (`#f0f2f5` light / `#1e293b` dark): Toolbars, tabs, and secondary panels.
- **Evidence Surface** (`#ffffff` light / `#162032` dark): Request and response content.
- **Evidence Ink** (`#1a1a2e` light / `#e2e8f0` dark): Primary text and data.
- **Operational Muted** (`#606d7b` light / `#94a3b8` dark): Labels and supporting metadata.
- **Structural Border** (`#dde1e6` light / `#334155` dark): Dividers and control outlines.

### Tertiary

- **Success Green** (`#059669`): Successful status and duration evidence.
- **Caution Amber** (`#d97706`): Redirects, warnings, and medium-duration evidence.
- **Error Red** (`#dc2626`): Failed requests, destructive affordances, and recording emphasis.

**The Signal-Not-Decoration Rule.** Signal Indigo is reserved for action, focus, selection, or navigation state. It is
never ambient decoration.

**The Four-Theme Parity Rule.** Every new semantic color must be defined for light default, system dark, forced dark, and
forced light behavior before it ships.

## Typography

**Display Font:** Segoe UI with the system UI stack
**Body Font:** Segoe UI with the system UI stack
**Label/Mono Font:** Cascadia Code with Consolas and Courier New fallbacks

**Character:** One familiar sans-serif family keeps the tool native to Edge DevTools. Monospace is reserved for raw
headers, payloads, generated commands, and structured evidence.

### Hierarchy

- **Title** (800, 14px, 1): Product identity and compact panel titles.
- **Body** (400, 13px): Inspector content and explanatory text.
- **Label** (700, 11px, 0.3px tracking): Table headers, control labels, and status metadata.
- **Mono** (400, 12px, 1.6): Code, headers, raw traffic, and JSON structures.

**The Evidence Monospace Rule.** Use monospace only when character alignment or source fidelity helps diagnosis. Buttons,
navigation, and general labels remain system sans.

## Elevation

The workbench is flat by default. Borders and tonal surface changes define structure; shallow ambient shadows appear only
where a toolbar, popup, menu, or toast must sit above live data.

### Shadow Vocabulary

- **Docked Control** (`0 1px 3px rgba(0,0,0,0.06)` light): Separates the sticky toolbar without making it float.
- **Transient Surface** (`0 4px 12px rgba(0,0,0,0.1)` light): Menus, filter panels, and short-lived overlays.
- **Dark Transient Surface** (`0 4px 12px rgba(0,0,0,0.4)` dark): Keeps overlays distinct on dark surfaces.

**The Flat-Until-Transient Rule.** Persistent panels use borders and tone. Shadows are reserved for controls that
temporarily overlap another work area.

## Components

Components are compact, explicit, and consistent. Familiar affordances disappear into the debugging task while state
changes remain unmistakable.

### Buttons

- **Shape:** Compact rounded rectangle (`8px`) with a `32px` minimum height in the toolbar.
- **Primary:** Neutral canvas at rest; Signal Indigo is reserved for active or selected state.
- **Hover / Focus:** Border and text shift to Signal Indigo; keyboard focus uses a visible `2px` outline.
- **Destructive:** Neutral at rest, Error Red only on hover, focus, or confirmed destructive state.
- **Disabled:** Reduced opacity with the pointer affordance removed.

### Inputs / Fields

- **Style:** One-pixel Structural Border, canvas background, `6px` radius, compact `4px 8px` padding.
- **Focus:** Signal Indigo border plus a restrained soft ring.
- **Error / Disabled:** Error text must be explicit; disabled state cannot rely on color alone.

### Navigation

- **Toolbar:** Left side owns capture and data actions; right side owns configuration and theme.
- **Tabs:** Single-line scrollable labels with Signal Indigo text and underline for the active tab.
- **Keyboard:** Arrow keys move within tablists; Home and End jump to boundaries; focus follows selection.

### Request Grid

- **Header:** Sticky, opaque, uppercase label row with tabular alignment.
- **Rows:** Compact `5px 8px` cells, ellipsis for long values, semantic status and method text.
- **Selection:** Background, focus, and ARIA state work together; color is never the only cue.

### Transient Surfaces

- **Menus and filters:** Workbench Surface, `8px` to `10px` radius, Structural Border, transient shadow.
- **Positioning:** Popups must escape clipped scrolling containers and remain reachable at narrow panel sizes.

## Do's and Don'ts

### Do:

- **Do** preserve compact `11px` to `13px` typography and `32px` toolbar controls.
- **Do** use Signal Indigo only for action, focus, selection, or navigation state.
- **Do** keep sticky surfaces opaque and distinguish them with borders or inset shadows.
- **Do** verify every UI change in System, Dark, and Light themes at wide and approximately `600px` panel widths.
- **Do** pair semantic colors with labels, shape, icons, or ARIA state.
- **Do** pair every Evidence color with its visible `K1`-style keyword badge.
- **Do** honor `prefers-reduced-motion` for every transition that is not essential to understanding state.

### Don't:

- **Don't** use marketing-site heroes, low-density card grids, or excessive whitespace.
- **Don't** use decorative glassmorphism, gradient text, or motion without state meaning.
- **Don't** rely on color alone to communicate recording, selection, filtering, success, warning, or failure.
- **Don't** break Edge DevTools conventions merely to look distinctive or prioritize branding over data.
- **Don't** use colored side-stripe borders greater than `1px`; use an inset indicator, full outline, icon, or state label.
- **Don't** introduce display fonts, oversized type, or fluid heading scales into this product interface.
