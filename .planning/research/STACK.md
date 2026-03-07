# Stack Research: Karaoke Text Reader npm Package

## Core Technologies

| Technology | Version | Role | Why |
|---|---|---|---|
| **TypeScript** | 5.8.3 | Language | Latest stable. Strict mode, `isolatedDeclarations` support for faster DTS generation. Already using 5.7.3 in MeinUngeheuer; 5.8 is drop-in upgrade. |
| **React** | 18.x / 19.x (peer) | UI framework | Declare `"react": "^18.0.0 \|\| ^19.0.0"` as peer dependency. Package uses hooks + refs only (no server components, no RSC features). React 19.2.4 is latest stable but many consumers still on 18. Support both. |
| **tsup** | 8.5.1 | Bundler | Battle-tested for React component libraries. Zero-config ESM+CJS dual output, `.d.ts` generation via rollup-plugin-dts. tsdown (0.20.3) is the emerging successor (Rolldown-based, faster) but still 0.x and API is shifting. tsup is the safer choice today; migrate to tsdown in a future minor. |
| **Vitest** | 3.0.x | Test runner | Match MeinUngeheuer's existing version. Vitest 4.0 exists but is a major bump with breaking changes; not worth the risk for extraction. Upgrade later once stable usage patterns emerge. |
| **CSS Custom Properties** | (native) | Styling | Ship plain CSS with custom properties for theming. No build-time CSS framework dependency. Consumers override via `--karaoke-*` variables. See CSS Strategy section. |
| **pnpm** | 9.x | Package manager | Already in use. Workspace protocol for local dev, `pnpm publish` for release. |

## Supporting Libraries

| Library | Version | Role | Why |
|---|---|---|---|
| **@testing-library/react** | 16.3.2 | Component testing | Latest version supports React 18 + 19. Provides `render`, `screen`, `fireEvent` for testing the component's DOM output without coupling to implementation. |
| **@testing-library/jest-dom** | 6.6.x | DOM assertions | `toBeInTheDocument()`, `toHaveClass()`, etc. Complements RTL for readable assertions. |
| **happy-dom** | 17.x | DOM environment | 3-10x faster than jsdom for Vitest. Our component does DOM class toggling and scrolling -- happy-dom covers these APIs adequately. Falls back to jsdom only if we hit missing API gaps (unlikely for our use case). |
| **publint** | 0.3.x | Package validation | Validates package.json exports, main, types fields match actual dist output. Run in CI before publish. Catches the subtle mistakes that break consumers. |
| **@arethetypeswrong/cli** | 0.17.x | Type validation | Checks TypeScript types resolve correctly under all module resolution modes (node10, node16, bundler). Run alongside publint. |
| **@changesets/cli** | 2.27.x | Versioning + changelog | Standard for npm library versioning. Generates changelogs from changeset files, handles semver bumps, integrates with CI publish workflows. |

## Development Tools

| Tool | Version | Role | Why |
|---|---|---|---|
| **Biome** | 2.x | Lint + format | Replaces ESLint + Prettier with a single Rust binary. 10-25x faster. Already stable in 2.x with React hooks rules and TypeScript support. For a greenfield package, Biome is the cleaner starting point. MeinUngeheuer currently has no linter configured -- no migration cost. |
| **Storybook** | NOT YET | Dev + docs | Storybook 10 (latest) is powerful but heavy. This is a single-component package, not a design system. Defer Storybook until there are multiple components or a documentation site is needed. Use a simple Vite dev app (`examples/` dir) for visual development instead. |
| **size-limit** | 11.x | Bundle size tracking | Enforces a budget (target: <5KB gzipped for core, <8KB with ElevenLabs adapter). Runs in CI. Keeps the package lean. |
| **np** or **pnpm publish** | - | Publishing | `np` adds interactive safety checks for npm publish. Alternative: raw `pnpm publish` with `prepublishOnly` script running `pnpm build && publint && attw --pack`. |

## CSS Strategy

### Decision: Plain CSS file with CSS Custom Properties

Ship a single `karaoke-reader.css` file that consumers import. All visual aspects are overridable via CSS custom properties. No framework dependency.

**Why not other options:**

| Option | Verdict | Reasoning |
|---|---|---|
| **CSS Custom Properties (chosen)** | YES | Zero runtime, zero build dependency, works everywhere. Consumers import one CSS file and override variables. Maximum compatibility. |
| **vanilla-extract** | No | Requires build-time integration (Vite/webpack/esbuild plugin). Forces consumers to add a build plugin. Maintainership concerns (slow issue response). Overkill for a single component. |
| **CSS Modules** | No | tsup's CSS Module support is experimental. Adds complexity to the build. Also requires consumer build tooling to handle `.module.css` imports. |
| **Tailwind** | No | Cannot ship Tailwind classes in a library -- they require the consumer's Tailwind config to include the package in `content`. Breaks the "zero-config install" promise. |
| **CSS-in-JS (styled-components, emotion)** | No | Runtime overhead. Forces a dependency. Industry is moving away from runtime CSS-in-JS. |
| **Inline styles only** | No | Cannot style pseudo-elements, media queries, or transitions. The component needs `@keyframes` and `::-webkit-scrollbar`. |

**Implementation approach:**

```css
/* karaoke-reader.css */
.karaoke-reader {
  --karaoke-bg: #000000;
  --karaoke-text: #ffffff;
  --karaoke-highlight: #fbbf24;        /* amber-300 equivalent */
  --karaoke-spoken-opacity: 0.4;
  --karaoke-upcoming-opacity: 0.9;
  --karaoke-font-family: Georgia, 'Times New Roman', serif;
  --karaoke-font-size: clamp(1.2rem, 3vw, 1.8rem);
  --karaoke-line-height: 1.8;
  --karaoke-transition-color: 0.2s ease;
  --karaoke-transition-opacity: 0.4s ease;
  --karaoke-scroll-comfort-top: 0.2;
  --karaoke-scroll-comfort-bottom: 0.65;
}
```

Consumers override: `--karaoke-highlight: #ff0000;` -- done.

The component reads these variables at runtime from the DOM, or applies them via inline styles referencing `var(--karaoke-*)`. The CSS file is imported separately: `import 'karaoke-reader/style.css'` (standard pattern for component libraries).

## Package Structure

```
karaoke-reader/
  src/
    index.ts                    # Main exports
    KaraokeReader.tsx           # Component
    useKaraokeSync.ts           # Core hook (generic timestamps + audio)
    types.ts                    # WordTimestamp, KaraokeStatus, etc.
    utils/
      buildWordTimestamps.ts    # Character-to-word timestamp conversion
      splitTextIntoChunks.ts    # Sentence-boundary chunking
      markdownParser.ts         # Markdown-to-words parsing
    style.css                   # Default styles with CSS custom properties
    adapters/
      elevenlabs.ts             # Optional ElevenLabs TTS adapter
    cache/
      types.ts                  # CacheAdapter interface
      memory.ts                 # In-memory cache (default)
  examples/
    basic/                      # Vite app: generic timestamps + pre-recorded audio
    elevenlabs/                 # Vite app: ElevenLabs TTS integration
  tsup.config.ts
  package.json
  tsconfig.json
  vitest.config.ts
  biome.json
```

## Package.json Exports

```jsonc
{
  "name": "karaoke-reader",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./style.css": "./dist/style.css",
    "./adapters/elevenlabs": {
      "import": {
        "types": "./dist/adapters/elevenlabs.d.ts",
        "default": "./dist/adapters/elevenlabs.js"
      },
      "require": {
        "types": "./dist/adapters/elevenlabs.d.cts",
        "default": "./dist/adapters/elevenlabs.cjs"
      }
    }
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "sideEffects": ["*.css"],
  "files": ["dist", "README.md", "LICENSE"]
}
```

**Key decisions:**
- Dual ESM + CJS output for maximum compatibility.
- `types` condition comes first in exports (TypeScript resolution).
- ElevenLabs adapter is a separate entry point -- not bundled into core. Consumers who don't use ElevenLabs never download that code.
- `sideEffects: ["*.css"]` tells bundlers the CSS import has side effects (don't tree-shake it).
- `files` whitelist keeps published package lean.

## Peer Dependencies

| Dependency | Range | Rationale |
|---|---|---|
| `react` | `^18.0.0 \|\| ^19.0.0` | Uses hooks (`useState`, `useRef`, `useCallback`, `useEffect`, `useMemo`) and refs. No APIs exclusive to 19. Supporting both maximizes adoption. |
| `react-dom` | `^18.0.0 \|\| ^19.0.0` | Needed for DOM rendering in tests and consumer apps. Always paired with `react`. |

**NOT peer dependencies (bundled):**
- No other runtime dependencies. The core package is zero-dependency beyond React.
- The ElevenLabs adapter has no peer dependency on `@elevenlabs/client` -- it calls the REST API directly via `fetch` (browser-native). This avoids forcing consumers to install the ElevenLabs SDK.

## Testing Strategy

### Unit Tests (pure functions)

| What | How | Environment |
|---|---|---|
| `buildWordTimestamps()` | Feed alignment data, assert word boundaries + timing | Node (no DOM needed) |
| `splitTextIntoChunks()` | Various text lengths, sentence boundaries, edge cases | Node |
| `markdownParser()` | Markdown variants, strikethrough, headers, global indices | Node |
| `computeCacheKey()` | Deterministic hash output | Node (needs `crypto.subtle` -- use `globalThis.crypto` polyfill or Vitest's built-in Web Crypto) |

### Hook Tests

| What | How | Environment |
|---|---|---|
| `useKaraokeSync()` | `renderHook` from `@testing-library/react`. Mock `Audio` constructor. Verify status transitions: idle -> loading -> ready -> playing -> paused -> done. Verify `activeWordIndex` updates via mocked `currentTime`. | happy-dom |

**Audio mocking strategy:** Create a minimal `Audio` mock class that exposes `play()`, `pause()`, `currentTime`, `duration`, `volume`, and fires `ended`/`canplaythrough`/`error` events. Use `vi.useFakeTimers()` to control `requestAnimationFrame` ticks.

### Component Tests

| What | How | Environment |
|---|---|---|
| `KaraokeReader` render | `render(<KaraokeReader ... />)`. Assert word spans are created with correct `data-index` attributes. | happy-dom |
| DOM class toggling | Set up component, simulate audio time advancement, verify `.karaoke-active` / `.karaoke-spoken` classes on word spans via `classList.contains()`. | happy-dom |
| Tap to pause/resume | `fireEvent.click()` on text container, assert status changes. | happy-dom |
| Keyboard controls | `fireEvent.keyDown()` with Space/Enter, assert pause/play. | happy-dom |

### Integration Tests (manual / example apps)

Visual correctness, scroll behavior, and actual audio playback are validated manually using the example apps. These are not automated -- audio sync timing is perceptual and DOM scrolling behavior differs across browsers.

### What NOT to test

- Actual ElevenLabs API calls (mock at fetch level).
- CSS rendering / visual appearance (no visual regression for v1).
- Real audio playback timing (mock `requestAnimationFrame`).

## tsup Configuration

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'adapters/elevenlabs': 'src/adapters/elevenlabs.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom'],
    splitting: true,
    treeshake: true,
  },
]);
```

CSS is handled separately: copy `src/style.css` to `dist/style.css` via a `postbuild` script or tsup's `onSuccess` hook, running PostCSS/Lightning CSS for minification.

## Monorepo Extraction Pattern

### Phase 1: Extract in-place (current monorepo)

1. Create `packages/karaoke-reader/` inside MeinUngeheuer monorepo.
2. Move + refactor the 4 source files into the new package structure.
3. Update `apps/tablet/` to import from `@meinungeheuer/karaoke-reader` (workspace protocol).
4. Validate: tablet app works identically. All existing tests pass.

### Phase 2: Standalone repository

1. Copy `packages/karaoke-reader/` to a new standalone repo.
2. Rename package to `karaoke-reader` (public npm name).
3. Add CI (GitHub Actions): typecheck, test, publint, attw, size-limit.
4. First publish to npm.
5. Update MeinUngeheuer to depend on the npm package instead of workspace.

This two-phase approach lets us refactor safely with the existing test harness before cutting the cord.

## Alternatives Considered

| Alternative | Why Not |
|---|---|
| **tsdown** (0.20.3) | Emerging Rolldown-based successor to tsup. Faster builds, better DTS via Oxc. But still 0.x, API not fully stable, CSS pipeline recently rewritten. Revisit when it hits 1.0. Easy migration path from tsup via `tsdown migrate`. |
| **unbuild** | Higher-level Rollup wrapper. Less community adoption for React libraries specifically. tsup has more React-specific examples and plugins. |
| **Rollup (raw)** | Too much configuration. tsup wraps it with sane defaults. No reason to go raw. |
| **Vite library mode** | Good for apps, awkward for libraries. DTS generation requires `vite-plugin-dts` which is slower than tsup's built-in rollup-plugin-dts. Better suited when building a full app that also exports a library. |
| **ESLint + Prettier** | Would work. But Biome is 10-25x faster, single tool, and we have no existing ESLint config to migrate. Greenfield = choose the modern tool. |
| **Jest** | Vitest is faster, native ESM, compatible with Vite ecosystem. Project already uses Vitest. No reason to switch. |
| **jsdom** | Slower than happy-dom. Our DOM manipulation (classList toggling, scrolling) is well within happy-dom's API coverage. |
| **Storybook** | Heavy for a single-component package. A minimal Vite example app is faster to set up and run. Add Storybook later if the package grows into a multi-component library. |
| **CSS Modules via tsup** | tsup's CSS Module support is experimental and requires workarounds. plain CSS + custom properties is simpler and more portable. |
| **vanilla-extract** | Zero-runtime is great, but requires consumers to install a build plugin. Maintainership has slowed. Overkill for styling a single component. |

## What NOT to Use

| Technology | Why Not |
|---|---|
| **Tailwind CSS** | Cannot ship utility classes in an npm package. Requires consumer's build to include package in Tailwind's `content` config. Breaks zero-config install. |
| **styled-components / emotion** | Runtime CSS-in-JS. Adds bundle weight, forces a dependency, industry moving away. |
| **Webpack** | No advantage over tsup/esbuild for library bundling. Slower, more config. |
| **Parcel** | Not designed for library output. |
| **SWC** | Good compiler, but no cohesive library bundling story. tsup uses esbuild which is comparable speed. |
| **npm (package manager)** | Use pnpm. Faster, stricter, workspace support, already in use. |
| **Lerna / Nx / Turborepo** | Overkill for a single-package repo. pnpm workspaces are sufficient for the extraction phase inside MeinUngeheuer. Standalone repo needs no monorepo tooling. |
| **React Server Components** | This is a client-side audio + animation component. `"use client"` directive is appropriate but RSC integration is not a concern. |

## Sources

- [tsup documentation](https://tsup.egoist.dev/)
- [tsup GitHub - latest release 8.5.1](https://github.com/egoist/tsup/releases)
- [tsdown - The Elegant Bundler for Libraries (Rolldown)](https://tsdown.dev/)
- [tsdown npm - v0.20.3](https://www.npmjs.com/package/tsdown)
- [Switching from tsup to tsdown](https://alan.norbauer.com/articles/tsdown-bundler/)
- [Vitest 4.0 announcement](https://vitest.dev/blog/vitest-4)
- [Vitest npm - v4.0.18](https://www.npmjs.com/package/vitest)
- [React versions page - latest 19.2.4](https://react.dev/versions)
- [TypeScript 5.8 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-5-8/)
- [@testing-library/react npm - v16.3.2](https://www.npmjs.com/package/@testing-library/react)
- [publint - package validation](https://publint.dev/rules)
- [arethetypeswrong - type validation](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
- [Changesets - monorepo versioning](https://github.com/changesets/changesets)
- [Biome v2 - linter + formatter](https://biomejs.dev/guides/migrate-eslint-prettier/)
- [happy-dom vs jsdom discussion](https://github.com/vitest-dev/vitest/discussions/1607)
- [Building npm package compatible with ESM and CJS](https://dev.to/snyk/building-an-npm-package-compatible-with-esm-and-cjs-in-2024-88m)
- [Package.json exports field guide](https://hirok.io/posts/package-json-exports)
- [TypeScript ESM publishing in 2025](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing)
- [Building React component library with tsup](https://medium.com/@asafshakarzy/setting-up-a-minimal-react-library-workspace-with-typescript-tsup-biome-and-storybook-e689f4703e26)
- [How I Build an npm Package in 2026](https://medium.com/@pyyupsk/how-i-build-an-npm-package-in-2026-4bb1a4b88e11)
- [The JavaScript Ecosystem: What to watch in 2026](https://madelinemiller.dev/blog/2025-javascript-ecosystem/)
- [Engineer's guide: Building a React component library from scratch in 2025](https://www.dronahq.com/engineers-guide-building-react-component-library/)
- [vanilla-extract documentation](https://vanilla-extract.style/)
- [size-limit - bundle size tracking](https://github.com/ai/size-limit)

---
*Researched: 2026-03-07*
