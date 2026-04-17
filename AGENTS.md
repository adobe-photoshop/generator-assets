# AGENTS.md

## Cursor Cloud specific instructions

This is `generator-assets`, an Image Asset Generation plug-in for Adobe Photoshop CC's Generator framework. It is a **plug-in only** (not a standalone app) — it cannot be run as a server or started independently. Development work focuses on lint, build, and test.

### Key commands

| Task | Command |
|---|---|
| Install dependencies | `npm install` |
| Full CI pipeline (build + lint + test) | `grunt build test` |
| Build only (PEG parser) | `grunt build` |
| Lint only (JSHint + JSCS) | `grunt test` (runs lint + unit tests) |
| Unit tests only | `npm test` |

### Non-obvious caveats

- The original `package-lock.json` contains references to Adobe's internal artifactory (`artifactory.corp.adobe.com`), which is inaccessible externally. If `npm install` fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, delete `package-lock.json` and run `npm install` again to regenerate it from the public npm registry.
- `grunt-cli` must be installed globally (`npm install -g grunt-cli`) before any `grunt` commands will work. The update script handles this.
- `grunt build` generates `lib/parser.js` from the PEG.js grammar at `etc/layernames.pegjs`. A pre-built version is checked into the repo, so tests may pass without a fresh build, but you should always run `grunt build` after modifying the grammar.
- JSCS emits a `DEP0060` deprecation warning on modern Node.js — this is harmless and can be ignored.
- The `svgobjectmodelgenerator` dependency is sourced from GitHub (`adobe-photoshop/svgObjectModelGenerator#v0.6.5`), so `npm install` requires network/GitHub access.
