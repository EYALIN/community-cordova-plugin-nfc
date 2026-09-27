# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.8.0](https://github.com/EYALIN/community-cordova-plugin-nfc/compare/v1.7.1...v1.8.0) (unreleased)

### Fixes

* **Android: no more crashes from a stale or pulled tag.** Every background path (`makeReadOnly`, `connect`, `close`, `transceive`, the listener dispatch and the reader-mode callback) now reports an error instead of letting `SecurityException: Tag … is out of date`, `IllegalStateException` or an NPE kill the app.
* **Android: connections are always closed**, so a write after a failed write or after `makeReadOnly` no longer fails with "Close other technology first!", and `connect()` never silently reuses the previous tag's technology.
* **Android: errors have a code and a real message.** `transceive` / `connect` failures used to reach JS as `null`; they now say `TAG_LOST`, `IO_ERROR`, `NOT_CONNECTED`, … (see *Errors* in the README).
* **Android reader mode can write**: `write`, `erase` and `makeReadOnly` work on tags delivered by `readerMode`, and the newest tag always wins.
* **Android no longer captures every tag while no listener is registered** (behaviour introduced in 1.5.4 without a changelog entry: `enableForegroundDispatch(null, null)`), so a URL tag opens the browser again; deep-link / MAIN launch intents are no longer cleared.
* **NTAG helpers**: memory maps per IC from `GET_VERSION` (NTAG210/212/213/215/216, Ultralight EV1; NTAG I2C is no longer reported as NTAG216); `readMemoryPages` returns exactly the requested pages (in 1.5.x-1.7.1 every Android dump failed with a `RangeError`); `getPasswordProtectionStatus()` reads the right configuration page and computes write/read protection; `fullMemoryDump` reports read errors instead of relabelling the tag as "MIFARE Ultralight"; `transceive(Uint8Array)` sends only the view's bytes.
* **iOS: `keepSessionOpen: false` is honoured** (it was read as `true`), callbacks from a cancelled or replaced session can no longer reject the next scan, and a scan started right after `cancelScan` waits for the previous session to end.
* **iOS errors carry a code** (`200` user cancelled, `201` timeout, … see `nfc.IOS_ERROR`) next to the message.
* **iOS returns more tag data**: `maxSize` (NDEF capacity), MIFARE family, optional FeliCa polling (`scanTag({pollFeliCa: true})`), and record ids survive writes.
* **iOS: `NFCReaderUsageDescription` is written on cordova-ios 7 and older again** (1.5.3-1.7.1 only targeted cordova-ios 8's `App/App-Info.plist`).
* **iOS scan-sheet texts can be localized**: the keys are documented in the README.
* **Typings match the runtime**: `remove*Listener(callback, …)`, `readerMode`, `FLAG_*`, `isType(record, tnf, type)`, `connect()` result; `ndef.decodeTextRecord` / `decodeUriRecord` now exist.

### Features

* `nfc.useErrorObjects(true)`: failure callbacks and rejections receive `NfcError {code, message}` objects. Off by default - the message strings are unchanged.
* Callback APIs (`write`, `erase`, `makeReadOnly`, `enabled`, `showSettings`, the `add*/remove*Listener`s, …) also return a Promise when called without callbacks.
* NTAG password: `ntagAuthenticate`, `ntagSetPassword`, `ntagRemovePassword` (Android).
* NXP originality signature: `verifyNtagSignature`, `checkNtagOriginality`.
* ISO 15693: `nfcvGetSystemInfo`, `nfcvReadBlocks` (Android).
* MIFARE Classic: `mifareClassicAuthenticate`, `mifareClassicReadBlock`, `mifareClassicInfo` (Android).
* NFC on/off events: `addStateChangeListener` / `removeStateChangeListener` (Android).
* `readerMode(flags, onTag, onError, { presenceCheckDelay })` (Android).
* `showSettings()` opens the NFC settings panel on Android 10+.
* Background tag reading on Android: plugin variable `NFC_INTENT_FILTERS` (`ndef`, `tech`, `tag`) + `NFC_NDEF_MIME_TYPES`; the tag that launched the app reaches the first matching listener. README section on iOS background reading via Universal Links.

### Behaviour changes

* Android Beam (`share`, `unshare`, `handover`, `stopHandover`) now fails with `NOT_SUPPORTED`; since 1.4.0 it silently reported success without doing anything (Beam was removed in Android 10).
* `write`, `erase` and `makeReadOnly` close an open `connect()` session on the same tag first (Android allows one connected technology per tag).
* Removed the dead `multiCallbackTest` function and the Windows Phone 8, Windows and BlackBerry 10 platforms (and their sources).

### Tooling

* `npm test`: eslint 9, `tsc` type-test of the typings, Node unit tests (runtime/typings parity, NTAG helpers against a byte-accurate tag model, launch-tag replay, intent-filter hook), a JVM harness for `NfcPlugin.java` (`tests/android/run.sh`) and an iPhoneOS SDK compile of `NfcPlugin.m` (`npm run test:ios`, macOS). GitHub Actions workflow in `.github/workflows/ci.yml`.

---

## [1.7.1](https://github.com/EYALIN/community-cordova-plugin-nfc/compare/v1.7.0...v1.7.1) (2026-08-13)

### Fixes

* Android: catch-all error handling in `writeNdefMessage` and `startNfc`, so a stale-tag `SecurityException` or a null `IntentFilter` no longer crashes the app.

## [1.7.0](https://github.com/EYALIN/community-cordova-plugin-nfc/compare/v1.6.2...v1.7.0) (2026-05-31)

### Features

* iOS `nfc.transceive` for ISO 7816 tags (after `scanTag({keepSessionOpen: true})`), resolving with the response data plus SW1/SW2 like Android's IsoDep ([#6](https://github.com/EYALIN/community-cordova-plugin-nfc/issues/6)).

## [1.6.2](https://github.com/EYALIN/community-cordova-plugin-nfc/compare/v1.6.1...v1.6.2) (2026-05-25)

### Fixes

* Removed an invalid `cordova >100` engine constraint from `package.json` ([#11](https://github.com/EYALIN/community-cordova-plugin-nfc/issues/11)).

## 1.6.1 (2026-05-23)

### Fixes

* Restored the `window.nfc`, `window.ndef` and `window.util` legacy globals next to the `NfcPlugin` export ([#11](https://github.com/EYALIN/community-cordova-plugin-nfc/issues/11)).

## 1.6.0 (2026-01-23)

### Changes

* The JS module is exported as `NfcPlugin` (`<clobbers target="NfcPlugin" />`), with `NfcPlugin.NdefPlugin` (ndef helpers) and `NfcPlugin.NfcUtil` (util); typings updated.

## 1.5.5 (2026-01-20)

### Fixes

* iOS: removed the deprecated `NDEF` reader-session format from the entitlements (only `TAG`), fixing App Store validation with the iOS 26.1 SDK.

## 1.5.4 (2026-01-20)

### Fixes

* Android: handle `SecurityException` for stale tag references when writing and in `Util.ndefToJSON`; validate intent filters before `enableForegroundDispatch`.

### Behaviour change (not announced at the time)

* With no listener registered, foreground dispatch was enabled with `null` filters, so the app captured every tag while in the foreground. Reverted in 1.8.0.

## 1.5.3 (2026-01-19)

### Changes

* iOS: `NFCReaderUsageDescription` was targeted at `App/App-Info.plist` (cordova-ios 8 layout only). Reverted in 1.8.0.

## 1.5.2 (2026-01-17)

* First npm release of the 1.5 line (the advanced tag analysis methods and typings listed under 1.5.0 below; 1.5.0 and 1.5.1 were not published).

## [1.5.0](https://github.com/EYALIN/community-cordova-plugin-nfc/compare/v1.4.0...v1.5.0) (2026-01-17)

### Features

* **Advanced Tag Analysis**: Add premium methods for deep NFC tag analysis
  - `readMemoryPages(startPage, numPages)` - Read raw memory pages from NTAG/MIFARE Ultralight using READ command (0x30)
  - `getNtagVersion()` - Get NTAG version info including IC type and memory size using GET_VERSION command (0x60)
  - `readNtagCounter()` - Read NTAG 24-bit tap counter using READ_CNT command (0x39)
  - `readNtagSignature()` - Read NTAG 32-byte ECC originality signature using READ_SIG command (0x3C)
  - `getPasswordProtectionStatus(configPage)` - Check password protection configuration from config pages
  - `fullMemoryDump()` - Perform complete memory dump with automatic tag type detection

* **TypeScript Support**: Add full TypeScript definitions
  - Added `types/index.d.ts` with complete type definitions
  - Interfaces for NDEF records, tags, and advanced analysis results
  - Global declarations for `nfc`, `ndef`, and `util` objects

* **Package Improvements**:
  - Updated `package.json` to match community plugin conventions
  - Added `main` and `types` fields for TypeScript support
  - Cleaned up platform list to focus on Android and iOS

### Breaking Changes

* Legacy platforms (Windows, BlackBerry) are no longer actively maintained

---

## [1.4.0](https://github.com/EYALIN/community-cordova-plugin-nfc/releases/tag/v1.4.0) (2024-07-19)

### Features

* Change Android code to support SDK 34
* Deprecate `share`, `unshare`, `handover`, `stopHandover` functions
* Organize and clean up codebase

---

## 1.3.0 (2023-05-29)

* First release as `community-cordova-plugin-nfc` (forked from `phonegap-nfc` 1.2.x): package / plugin id, repository and funding links; iOS header import fix.

## Previous Versions

See the [original phonegap-nfc changelog](https://github.com/chariotsolutions/phonegap-nfc) for earlier version history.
