# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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

## Previous Versions

See the [original phonegap-nfc changelog](https://github.com/chariotsolutions/phonegap-nfc) for earlier version history.
