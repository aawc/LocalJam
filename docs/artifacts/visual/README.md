# Visual Artifacts & UI Verification Directory

This directory stores component-scoped before/after UI screenshots captured during visual feature work, styling refactors, and UI bugfixes.

## Structure & Placement Policy

All visual artifacts must be organized into component-scoped subdirectories:

```text
docs/artifacts/visual/
├── README.md
└── <feature>/
    ├── <scope>-<state>-<viewport>-before.png
    └── <scope>-<state>-<viewport>-after.png
```

## Deterministic Naming Conventions

Filenames must adhere strictly to:
- `<scope>-<state>-<viewport>-before.png`
- `<scope>-<state>-<viewport>-after.png`

Where:
- `<scope>`: Component or view in kebab-case (for example, `stage`, `browse-sheet-library`, `eq-modal`, `transport-cluster`).
- `<state>`: Interaction state or playback condition (for example, `idle`, `playing-local`, `buffering`, `error`, `starred`).
- `<viewport>`: Form factor dimensions (for example, `desktop-1280x800`, `mobile-390x844`).

## Headless Environment Discipline

In headless or non-interactive environments where display servers or raster capture tooling are unavailable:
- Record `[VISUAL CAPTURE: DEFERRED (HEADLESS ENVIRONMENT)]` in the task report and commit description with specific technical rationale.
- Never commit empty or synthetic dummy files.
- Substantiate visual and layout correctness through automated DOM structure, styling attribute, and layout test assertions.

## Mandatory Commit Description Citation

Any commit introducing or modifying visual UI elements must explicitly cite or link the before and after visual artifacts in the commit description using repository-relative paths:
- Baseline (Before): `./docs/artifacts/visual/<feature>/<scope>-<state>-<viewport>-before.png`
- Modified (After): `./docs/artifacts/visual/<feature>/<scope>-<state>-<viewport>-after.png`

If visual capture was deferred due to a headless or non-interactive environment:
- Explicitly record `[VISUAL CAPTURE: DEFERRED (HEADLESS ENVIRONMENT)]` in the commit description along with the specific technical rationale.
