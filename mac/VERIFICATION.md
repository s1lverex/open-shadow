# Verification

This file records the evidence behind the Open Shadow rebrand, the provider work and the
opening animation. Numbers below are copied verbatim from the runs.

## Unit tests

```
node --test tests/
```

Result: **tests 20 / pass 20 / fail 0**.

## Mutation check (the registry is really asserted)

Changing `mimo.apiUrl` in `desktop/providers.js` makes the test
`registry: shipped providers point at their documented endpoints` fail with:

```
mimo: apiUrl should be "https://api.xiaomimimo.com/v1", got "https://api.example.com/v1"
```

## In-app mock test — real Electron, real IPC (13/13)

A mock MiMo-protocol server is reached through the app's own main process over real IPC.

- boot without page errors
- `shadow-orb` renders (7 circles, 1 path)
- window title `Open Shadow`
- `llm.providers()` →
  `deepseek,openai,chatgpt,anthropic,mimo,moonshot,qwen,groq,openrouter,xai,gemini,custom`
- `GET {apiUrl}/models` through the bridge
- streamed reply `The custom provider works.`
- `reasoning_content` surfaced
- fragmented tool call reassembled (`pick_color {"hue":"blue"}`)
- usage `{prompt_tokens:11,completion_tokens:7,total_tokens:18}`
- POST to `/v1/chat/completions` with `Authorization: Bearer …` and
  `{model, messages, stream:true, max_tokens:64, stream_options:{include_usage:true}}`

## Live Xiaomi MiMo — real key

- `GET https://api.xiaomimimo.com/v1/models` → 200, ids
  `mimo-v2.5, mimo-v2.5-asr, mimo-v2.5-pro, mimo-v2.5-tts, mimo-v2.5-tts-voiceclone, mimo-v2.5-tts-voicedesign, mimo-v2.6-flash, mimo-v2.6-pro, mimo-v2.6-pro-ultraspeed`
- streaming chat → `shadow-ok`,
  `usage {prompt_tokens:13, completion_tokens:16, total_tokens:29, reasoning_tokens:12}`
- `reasoning_content` present
- tool call emitted
- in-app MiMo turn over the app's own IPC returned `shadow-live-ok`

## Splash sequence

Observed at 250/900/1600/2600/3400/4000 ms after load: splash visible with orb → wordmark →
orb flight → `div.app` only, composer and orb settled.

## Built-in browser and the agent cursor

A live headless run (`tools/e2e/browser-cursor.mjs`) launched the real Electron app, opened a
local target page with the model, and watched the agent cursor while the model clicked.

| check | result |
| --- | --- |
| model opens the built-in browser (target server saw `GET /`) | PASS |
| browser panel opens and the stage is laid out (`is-browser-open`, stage 435×742) | PASS |
| model-driven click lands on the page (server saw `GET /clicked`) | PASS |
| agent cursor overlay becomes visible (`.browser-cursor.is-shown`, translate `88px 191.375px`) | PASS |
| cursor arrow image actually loads (`desktop/cursor.png`, `naturalWidth` 1024) | PASS |
| agent "driving" badge shows during the turn ("Open Shadow is using the browser") | PASS |

Notes:

- `browser_*` tools only work inside an agent turn; calling them outside one returns
  `This browser tab is gone`.
- The browser page is a native child view, so a DOM screenshot shows the panel chrome and the
  cursor overlay but not the page pixels.

Run command:

```
DEEPSEEK_API_KEY=... node tools/e2e/browser-cursor.mjs
```

## How to re-run

```
npm ci
npm test
npm i -D playwright-core
node node_modules/electron/install.js   # only if node_modules/electron/dist/electron is missing
node tools/e2e/smoke.mjs
MIMO_API_KEY=… node tools/e2e/live-mimo.mjs
```

`electron` is already a devDependency. The live script needs a real provider key.
The mock and live suites are **not** part of `npm test`.

### Electron binary prerequisite

`npm ci` installs the `electron` package but does not always download the prebuilt binary on a
clean box. If `node_modules/electron/dist/electron` is missing, the e2e launch fails with `ENOENT`.
Run the package's own installer to fetch it:

```
node node_modules/electron/install.js
```
