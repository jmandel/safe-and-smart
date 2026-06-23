# Wrapper configuration

The wrapper renders the same sandboxed applet in several contexts — the full demo
shell, a real SMART launch, and the embedded playground preview — so its **chrome is
configurable**. This is the committed config surface; it is implemented in `App.tsx`
(`WrapperConfig`) and consumed by every entry point.

## `WrapperConfig`

```ts
interface WrapperConfig {
  header?: boolean;  // top bar: brand + patient pill + status.  default true
  picker?: boolean;  // applet picker dropdown (in the header).  default true
  audit?: boolean;   // trusted-shell capability audit panel.    default true
}
```

Every field defaults to the **full demo shell**. Omitting `config` entirely yields
the full shell, so existing entry points are unaffected.

```tsx
<App />                                   // full shell (default)
<App config={{ picker: false }} />        // hide the picker, keep header + audit
<App config={PREVIEW_CHROME} />           // embedded preview preset
```

## Presets

| Preset | header | picker | audit | use |
| --- | --- | --- | --- | --- |
| *(default)* | ✓ | ✓ | ✓ | `/run`, `/fhir` — the demo shell |
| `PREVIEW_CHROME` | ✗ | ✗ | ✓ | playground preview — just the applet surface + the audit log, so you can watch the brokered calls without the picker (which would navigate the page) or a redundant header |

`PREVIEW_CHROME` is exported from `App.tsx`. Add presets as bundles of the booleans;
don't introduce a parallel mechanism.

## Rules

- **`picker` requires a navigable context.** The picker changes the applet by
  navigating (`?applet=…`). In an embedded preview the applet is fixed
  (`appletSourceOverride`), so the picker is meaningless and must be off — selecting
  there would navigate the host page. The playground passes `PREVIEW_CHROME`.
- **Config is presentation only.** What the applet *is* and what data it sees (live
  vs. mock FHIR, SMART vs. open launch) is separate launch/data config
  (`smartInit`, build-time env). `WrapperConfig` never changes the security model or
  the capabilities — only which chrome is shown.
- **One source of truth.** All chrome toggles live in `WrapperConfig`. New chrome
  gets a new field with a documented default here; entry points opt out via `config`.

## Entry points

| Entry | config |
| --- | --- |
| `entry-run.tsx` (`/run`) | default (full) |
| `entry-fhir.tsx` (`/fhir`) | default (full) |
| `Authoring.tsx` preview (`/author`) | `PREVIEW_CHROME` |
