# testflight-mcp (Locins fork)

Read-only fork of [OrellBuehler/testflight-mcp](https://github.com/OrellBuehler/testflight-mcp), cut
down to what we need: **TestFlight beta feedback** (screenshot feedback, crash feedback, crash logs)
and the build context to make sense of it.

Differences from upstream:

- **No writes at all.** The App Store listing tools (`update_*`, `upload_app_screenshots`) and
  `create_analytics_report_request` are gone, and the client has no `post`/`patch`/`delete`.
- **Smaller surface.** Analytics & reports, provisioning, App Store metadata, App Review, diagnostics,
  Xcode Cloud and beta tester/group listings are removed.
- **Token pinned to Apple.** The client refuses to send the bearer token to any origin other than
  `https://api.appstoreconnect.apple.com`.
- **Not published.** `package.json` is `private`; the npm publish workflow is removed. Run it from a
  local build.

It talks **only to the official, documented API** using a standard App Store Connect API key (ES256
JWT). It does **not** scrape App Store Connect with an Apple ID / password and does **not** email
testers.

## Install

```bash
git clone https://github.com/Locins-Developer-Platform/testflight-mcp.git
cd testflight-mcp && git checkout locins/read-only-feedback
npm ci && npm run build

claude mcp add testflight \
  --env ASC_KEY_ID=ABCD123456 \
  --env ASC_ISSUER_ID=12a3b456-7890-1234-5678-9abcdef01234 \
  --env ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_ABCD123456.p8 \
  -- node /path/to/testflight-mcp/dist/index.js
```

Requires Node.js 20+.

## Getting an API key

The server authenticates with an **App Store Connect API key** (a `.p8` file plus a key ID and issuer
ID), the same credentials `fastlane`/`altool` use:

1. In [App Store Connect](https://appstoreconnect.apple.com), go to **Users and Access →
   Integrations → App Store Connect API** (Team Keys).
2. **Generate** a key. A role of **App Manager** (or **Admin**) covers TestFlight feedback. The
   role is broader than this server needs; the server itself cannot write.
3. Download the `AuthKey_XXXXXXXXXX.p8` (you can only download it once — keep it safe), and note the
   **Key ID** and the team **Issuer ID** shown above the keys table.

Provide the key either as a file path (`ASC_PRIVATE_KEY_PATH`) or inline (`ASC_PRIVATE_KEY`, newlines
may be escaped as `\n`). The key is read locally and used only to sign short-lived request tokens.

## Configuration

| Variable               | Required | Description                                                                      |
| ---------------------- | -------- | -------------------------------------------------------------------------------- |
| `ASC_KEY_ID`           | yes      | App Store Connect API **Key ID**.                                                |
| `ASC_ISSUER_ID`        | yes      | App Store Connect API **Issuer ID** (per team).                                  |
| `ASC_PRIVATE_KEY_PATH` | yes\*    | Path to the downloaded `.p8` private key file.                                   |
| `ASC_PRIVATE_KEY`      | yes\*    | The `.p8` contents inline (alternative to the path; `\n` escapes are unescaped). |

\* Provide **either** `ASC_PRIVATE_KEY_PATH` **or** `ASC_PRIVATE_KEY`.

## Example prompts

Once connected, ask the agent things like:

- "List the latest TestFlight screenshot feedback for my app and summarize the recurring complaints."
- "Show crash feedback for build 1.4.0 and download the crash log for the most recent one."
- "Which devices/OS versions did this week's feedback come from?"
- "Why can't my external testers see build 1.4.0 yet?"
- "How many installs and crashes does the latest build have, and what's the crash rate?"

## Tools

Start from `list_apps` to get an `app_id`, then drill into feedback. All tools are read-only.

**TestFlight feedback**

| Tool                       | Description                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_screenshot_feedback` | Screenshot feedback for an app: tester comment, screenshot URLs, device/OS, resolved tester and build (build number `build.version` + TestFlight version `build.preReleaseVersion.version`). Defaults to the latest version only (`app_version`: a version like `1.2.0`, or `all`). Filter by build/platform/device/OS/tester. |
| `list_crash_feedback`      | Crash feedback for an app: comment, device/OS, resolved tester and build (build number + TestFlight version `build.preReleaseVersion.version`), crash-log reference. Defaults to the latest version only (`app_version`: a version like `1.2.0`, or `all`).                                                                    |
| `get_screenshot_feedback`  | One screenshot submission; optionally returns the first screenshot inline as an image.                                                                                                                                                                                                                                         |
| `get_crash_feedback`       | One crash submission with full metadata and crash-log reference.                                                                                                                                                                                                                                                               |
| `get_crash_log`            | Download the crash log text for a crash submission.                                                                                                                                                                                                                                                                            |

**Apps & builds**

| Tool                    | Description                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `list_apps`             | Apps in the account (id, name, bundleId, sku). Filter by bundle ID.                                     |
| `get_app`               | One app by ID.                                                                                          |
| `list_builds`           | TestFlight builds for an app (version, processing state, expiry) with their TestFlight beta state.      |
| `get_build`             | One build with its pre-release version and beta state.                                                  |
| `list_customer_reviews` | Public App Store reviews for a released app, with your published response. Distinct from beta feedback. |

**TestFlight build status & metrics**

| Tool                          | Description                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `get_build_status`            | Why a build is (not) available to testers: internal/external build state, beta review state, and "What to Test" per locale. |
| `get_build_usage_metrics`     | Installs, sessions, crashes, invites and feedback counts for a build.                                                       |
| `get_beta_tester_metrics`     | Tester engagement (sessions, crashes, feedback) per tester, for an app or a beta group.                                     |
| `list_beta_app_localizations` | Tester-facing TestFlight metadata (beta description, feedback email, privacy URL).                                          |
| `get_beta_app_review_detail`  | Beta App Review contact, demo-account requirement and review notes.                                                         |

## Notes & caveats

- **Read-only.** The client only issues `GET` requests to the App Store Connect API, plus unauthenticated
  downloads of the presigned screenshot URLs Apple returns.
- **TestFlight feedback** requires builds uploaded with feedback enabled and is retained by Apple for
  a limited window (~90 days). The tester's typed comment is the `comment` field on a screenshot
  submission.
- **Crash logs** come from Apple's `betaCrashLogs` resource linked to each crash submission
  (`GET /betaFeedbackCrashSubmissions/{id}/crashLog`), whose `logText` is the full symbolicated
  `.crash` report. `get_crash_log` returns that text; if a submission has no log attached it says so.
- **Demo account passwords** are never requested: `get_beta_app_review_detail` deliberately omits the
  `demoAccountPassword` field.
- **Your data goes to the agent/LLM.** Feedback includes tester names, emails and device details. Tester
  comments are untrusted text written by anyone in your external test groups.

## Development

```bash
npm install
npm run build         # tsc -> dist/
npm test              # vitest run
npm run typecheck     # tsc --noEmit
npm run lint          # eslint src
npm run format:check  # prettier --check .
```

Run a single test file:

```bash
npx vitest run src/__tests__/feedback.test.ts
```

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests: `format:check`, `lint`,
`typecheck` (once) and `test` + `build` on Node 20 and 22.

## Syncing with upstream

```bash
git fetch upstream
git merge upstream/main   # then re-check that no write tools or removed modules came back
```

## License

[MIT](./LICENSE) © Orell Bühler
