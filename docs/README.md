# LocalJam Documentation

Welcome to the LocalJam technical documentation directory. This directory contains architectural specifications, implementation roadmaps, audit and investigation reports, and task tracking records for LocalJam.

---

## Directory Layout

```text
docs/
├── README.md                          # Documentation index (this file)
├── CHECKLIST.md                       # Task execution log & completed feature registry
├── artifacts/                         # Visual artifacts, before/after captures & audits
│   └── visual/                        # Component-scoped UI capture artifacts
├── design/                            # Architectural & design specifications
│   └── 2026-09-15-minimalist-player-redesign.md # One-Screen Minimalist Player specification
├── plans/                             # Structured implementation plans
│   ├── 2026-09-19-update-prompt-and-feedback-system.md
│   └── PLAN.md
└── reports/                           # Architectural, UX, and security audit reports
    ├── PWA_UPDATE_INVESTIGATION_REPORT.md
    ├── RADIO_MOBILE_UX_REPORT.md
    ├── SECURITY_REPORT.md
    ├── UX_CRITIQUE_REPORT.md
    ├── UX_REVIEW_REPORT.md
    └── VISUALIZER_INVESTIGATION_REPORT.md
```

---

## Sections

### 1. Task Execution & History
- [CHECKLIST.md](./CHECKLIST.md): Complete chronological record of resolved issues, feature requests (FR 1 through FR 33), and their associated atomic commit hashes.

### 2. Design & Architecture Specifications
- [One-Screen Minimalist Player Redesign (v2)](./design/2026-09-15-minimalist-player-redesign.md): Comprehensive architectural specification defining the unified 6-row Stage viewport, Dual-Source Handle Bar, layered modal hierarchy (L1/L2), gesture/keyboard maps, and state hydration models.

### 3. Implementation Plans
- [Update Prompt & Feedback System Plan](./plans/2026-09-19-update-prompt-and-feedback-system.md): Implementation steps for the automated update detection and feedback modal.
- [Execution Plan](./plans/PLAN.md): Staged execution roadmap for feature and test enhancements.

### 4. Audit & Investigation Reports
- [PWA Update Notification & Cache Lifecycle Report](./reports/PWA_UPDATE_INVESTIGATION_REPORT.md): Root cause investigation and resolution of PWA update banner debouncing, `SKIP_WAITING` worker transitions, and cache freshness.
- [Radio Streaming & Mobile UX Report](./reports/RADIO_MOBILE_UX_REPORT.md): Evaluation of radio station cycling, stream state machines, and small-screen viewport ergonomics.
- [Security Audit Report](./reports/SECURITY_REPORT.md): Full security assessment covering path traversal, Content Security Policy, DOM XSS prevention, and HTTP response header sanitization.
- [UX Critique & Usability Report](./reports/UX_CRITIQUE_REPORT.md): Critical analysis of player details bar, station list clearance, and File System Access API error states.
- [UX Review Report](./reports/UX_REVIEW_REPORT.md): Product review of minimalist visual hierarchy, button weights, and glassmorphic surface elevations.
- [Audio Visualizer Investigation Report](./reports/VISUALIZER_INVESTIGATION_REPORT.md): Technical analysis of Web Audio analyser routing, AudioContext resume lifecycle, high-DPI canvas transforms, and zero-dimension canvas resilience.

### 5. Visual Artifacts & UI Verification
- [docs/artifacts/visual/](./artifacts/visual/): Directory housing deterministic before/after UI screenshots (`<scope>-<state>-<viewport>-before.png` / `-after.png`) capturing visual regressions and design implementations, mandatorily cited in visual commit descriptions.
