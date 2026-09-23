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
- `<viewport>`: Form factor dimensions (`desktop-1280x800`, `mobile-390x844`).
- `<phase>`: Verification phase (`before`, `after`).

## Automated Visual Capture Runner

LocalJam includes a zero-dependency automated visual capture runner (`./scripts/capture-visual.js`) that drives headless Chrome with SwiftShader software WebGL/rasterization via the Chrome DevTools Protocol (CDP) over native WebSocket.

### Invocation

```bash
# Capture baseline ("before") artifacts across all viewport presets
npm run capture -- --feature=stage --phase=before

# Capture modified ("after") artifacts across all viewport presets
npm run capture -- --feature=stage --phase=after

# Direct invocation with customized options
node scripts/capture-visual.js --feature=browse-sheet --phase=before --scope=browse-sheet-radio --state=idle --viewport=desktop-1280x800 --route=#/browse?tab=radio
```

### CLI Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--feature` | string | `stage` | Subdirectory under `./docs/artifacts/visual/` |
| `--phase` | string | `before` | Verification phase: `before` or `after` |
| `--scope` | string | `stage` | Component identifier in kebab-case |
| `--state` | string | `idle` | Component interaction or playback condition |
| `--viewport` | string | `all` | Viewport preset: `desktop-1280x800`, `mobile-390x844`, or `all` |
| `--route` | string | `#/` | Initial hash route to load |
| `--delay` | number | `500` | Post-hydration settling delay in milliseconds |
| `--timeout` | number | `30000` | DevTools protocol command timeout in milliseconds |
| `--chrome-path` | string | `null` | Optional override path to Chrome/Chromium binary |
| `-h`, `--help` | boolean | `false` | Display runner help and option details |

### Standard Viewport Presets

| Preset | Resolution | DPR | Mode | Touch |
| :--- | :--- | :--- | :--- | :--- |
| `desktop-1280x800` | 1280 x 800 | 1.0x | Desktop | Disabled |
| `mobile-390x844` | 390 x 844 | 3.0x | Mobile | Enabled |

## Headless Environment Discipline

The automated visual capture runner operates seamlessly in headless environments using SwiftShader software rasterization and does not require an active display server or physical GPU.

Visual capture deferral (`[VISUAL CAPTURE: DEFERRED (HEADLESS ENVIRONMENT)]`) is strictly prohibited when headless Chrome is executable. Deferral is reserved solely for sandboxed execution environments that completely forbid child process spawning. When deferral is unavoidable due to child process restrictions:
- Record `[VISUAL CAPTURE: DEFERRED (HEADLESS ENVIRONMENT)]` in the task report and commit description, citing the specific child process restriction.
- Never commit empty, corrupted, or synthetic dummy files.
- Substantiate visual and layout correctness through automated DOM structure, styling attribute, and layout test assertions.

## Mandatory Commit Description Citation

Any commit introducing or modifying visual UI elements must explicitly cite or link the before and after visual artifacts in the commit description using repository-relative paths:
- Baseline (Before): `./docs/artifacts/visual/<feature>/<scope>-<state>-<viewport>-before.png`
- Modified (After): `./docs/artifacts/visual/<feature>/<scope>-<state>-<viewport>-after.png`

If visual capture was deferred strictly due to a sandbox forbidding child process spawning:
- Explicitly record `[VISUAL CAPTURE: DEFERRED (HEADLESS ENVIRONMENT)]` in the commit description along with the specific technical rationale.
