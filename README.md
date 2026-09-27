[![NPM version](https://img.shields.io/npm/v/community-cordova-plugin-nfc)](https://www.npmjs.com/package/community-cordova-plugin-nfc)

# Community Cordova NFC Plugin

A comprehensive Cordova plugin for NFC (Near Field Communication) on Android and iOS.

I dedicate a considerable amount of my free time to developing and maintaining many cordova plugins for the community ([See the list with all my maintained plugins][community_plugins]).
To help ensure this plugin is kept updated,
new features are added and bugfixes are implemented quickly,
please donate a couple of dollars (or a little more if you can stretch) as this will help me to afford to dedicate time to its maintenance.
Please consider donating if you're using this plugin in an app that makes you money,
or if you're asking for new features or priority bug fixes. Thank you!

[![](https://img.shields.io/static/v1?label=Sponsor%20Me&style=for-the-badge&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/eyalin)

## Features

- **Read/Write NDEF** - Read and write NDEF formatted NFC tags
- **Raw Commands** - Send raw commands via transceive (ISO 14443-3A, ISO 14443-4, ISO 15693)
- **Advanced Tag Analysis** (v1.5.0+) - Read raw memory, get NTAG version, counter, signature
- **TypeScript Support** - Full TypeScript definitions included

## What's New in 1.8.0

Crash and connection fixes on Android, coded errors on both platforms, correct NTAG helpers, iOS
session and localization fixes, and new capabilities: NTAG password protection, NXP originality
signature verification, ISO 15693 and MIFARE Classic helpers, NFC on/off events and background tag
reading on Android. See the [CHANGELOG](CHANGELOG.md) for the full list and the behaviour changes.

## What's New in v1.5.0 (advanced tag analysis)

### Advanced Tag Analysis Methods

New methods for premium NFC tag analysis:

| Method | Description |
|--------|-------------|
| `readMemoryPages(startPage, numPages)` | Read raw memory pages from NTAG/MIFARE Ultralight |
| `getNtagVersion()` | Get NTAG version info (IC type, memory size) |
| `readNtagCounter()` | Read 24-bit NFC tap counter |
| `readNtagSignature()` | Read 32-byte ECC originality signature |
| `getPasswordProtectionStatus()` | Check password protection configuration |
| `fullMemoryDump()` | Complete memory dump with automatic tag detection |

## Supported Platforms

- ✅ Android (API 16+)
- ✅ iOS 11+ (CoreNFC)

> Windows Phone 8, Windows and BlackBerry 10 were removed in 1.8.0. Android Beam (`share`, `handover`) no
> longer exists on Android 10+ and fails with `NOT_SUPPORTED`.

## Contents

* [Installing](#installing)
* [TypeScript Usage](#typescript-usage)
* [Advanced Tag Analysis](#advanced-tag-analysis-v150)
* [NFC](#nfc)
* [NDEF](#ndef)
  - [NdefMessage](#ndefmessage)
  - [NdefRecord](#ndefrecord)
* [Events](#events)
* [Platform Differences](#platform-differences)
* [Launching Application when Scanning a Tag](#launching-your-android-application-when-scanning-a-tag)
* [Testing](#testing)
* [Sample Projects](#sample-projects)
* [Host Card Emulation (HCE)](#hce)
* [License](#license)

# Installing

### Cordova

    $ cordova plugin add community-cordova-plugin-nfc

### PhoneGap

    $ phonegap plugin add community-cordova-plugin-nfc

### PhoneGap Build

Edit config.xml to install the plugin for [PhoneGap Build](http://build.phonegap.com).

    <preference name="phonegap-version" value="cli-9.0.0" />
    <plugin name="phonegap-nfc" source="npm" />


Or from local path:

```bash
cordova plugin add /path/to/community-cordova-plugin-nfc
```

# TypeScript Usage

```typescript
import { INdefTag, INtagVersionInfo, IFullMemoryDump } from 'community-cordova-plugin-nfc';

declare var nfc: any;

// Read NDEF tag (iOS)
const tag: INdefTag = await nfc.scanNdef();
console.log('Tag:', JSON.stringify(tag));

// Get NTAG version info (Android - requires connect first)
await nfc.connect('android.nfc.tech.NfcA');
const version: INtagVersionInfo = await nfc.getNtagVersion();
console.log('IC Type:', version.icType);

// Full memory dump
const dump: IFullMemoryDump = await nfc.fullMemoryDump();
console.log('Memory:', dump.hexDump);
await nfc.close();
```

# Advanced Tag Analysis (v1.5.0+)

These methods require connecting to the tag first using `nfc.connect()`.

## nfc.readMemoryPages

Read raw memory pages from NTAG/MIFARE Ultralight tags.

```javascript
await nfc.connect('android.nfc.tech.NfcA');
const memory = await nfc.readMemoryPages(0, 16);
console.log('Memory:', util.arrayBufferToHexString(memory));
await nfc.close();
```

### Parameters

- __startPage__: Starting page number (0-based)
- __numPages__: Number of pages to read

### Returns

- Promise with ArrayBuffer containing raw memory data

## nfc.getNtagVersion

Get NTAG version information using GET_VERSION command (0x60).

```javascript
await nfc.connect('android.nfc.tech.NfcA');
const version = await nfc.getNtagVersion();
console.log('IC Type:', version.icType);
console.log('Storage Size:', version.storageSize);
await nfc.close();
```

### Returns

- Promise with version info object:
  - `vendorId`: Vendor ID (0x04 = NXP)
  - `productType`: Product type (0x04 = NTAG, 0x03 = MIFARE Ultralight)
  - `storageSize`: Storage size indicator
  - `icType`: Human-readable IC type string (e.g., "NTAG215")

## nfc.readNtagCounter

Read the NTAG 24-bit NFC tap counter.

```javascript
await nfc.connect('android.nfc.tech.NfcA');
const counter = await nfc.readNtagCounter();
console.log('Tag has been tapped', counter, 'times');
await nfc.close();
```

### Returns

- Promise with counter value (0 to 16,777,215)

## nfc.readNtagSignature

Read the NTAG 32-byte ECC originality signature.

```javascript
await nfc.connect('android.nfc.tech.NfcA');
const signature = await nfc.readNtagSignature();
console.log('Signature:', util.arrayBufferToHexString(signature));
await nfc.close();
```

### Returns

- Promise with 32-byte signature as ArrayBuffer

## nfc.getPasswordProtectionStatus

Check password protection configuration.

```javascript
await nfc.connect('android.nfc.tech.NfcA');
const status = await nfc.getPasswordProtectionStatus();
console.log('Protected:', status.isProtected);
console.log('Protection starts at page:', status.protectionStartPage);
await nfc.close();
```

### Parameters

- __configPage__: (Optional) Config page number, defaults to NTAG216 config page

### Returns

- Promise with protection status object:
  - `protectionStartPage`: Page where protection starts
  - `isProtected`: Whether protection is enabled
  - `readProtected`: Whether read is protected
  - `writeProtected`: Whether write is protected
  - `authLimitEnabled`: Whether auth limit is enabled
  - `authLimitCounter`: Auth attempt counter (0-7)

## nfc.fullMemoryDump

Perform complete memory dump with automatic tag type detection.

```javascript
await nfc.connect('android.nfc.tech.NfcA');
const dump = await nfc.fullMemoryDump();
if (dump.success) {
    console.log('Tag Type:', dump.tagType);
    console.log('Total Pages:', dump.totalPages);
    console.log('Hex Dump:', dump.hexDump);
}
await nfc.close();
```

### Returns

- Promise with dump result object:
  - `success`: Whether dump succeeded
  - `tagType`: Detected tag type string
  - `version`: NTAG version info (if available)
  - `totalPages`: Total pages in tag
  - `memoryDump`: Raw memory as ArrayBuffer
  - `hexDump`: Memory as hex string
  - `error`: Error message (if failed)

### Supported Platforms

- Android (requires `nfc.connect()` first)

---

## Password protection, originality, ISO 15693, MIFARE Classic (1.8.0)

All Android-only (iOS can only transceive ISO 7816 APDUs), after `nfc.connect(tech)` on a scanned tag.
Bytes can be given as a hex string, a byte array or a `Uint8Array`.

```js
await nfc.connect('android.nfc.tech.NfcA');

// NTAG21x / Ultralight EV1 password (PWD_AUTH 0x1B). AUTH0 is written last, so protection starts only
// once the password is in place; the other configuration bits are preserved.
await nfc.ntagSetPassword('12345678', { pack: 'ABCD', startPage: 4, protectReads: false, authLimit: 0 });
const { pack, packMatches } = await nfc.ntagAuthenticate('12345678', 'ABCD');   // AUTH_FAILED on a wrong password
await nfc.ntagRemovePassword('12345678');
const status = await nfc.getPasswordProtectionStatus();                        // AUTH0 / PROT for this IC

// NXP originality signature: ECDSA on secp128r1 over the raw UID (NXP AN11350 / AN11341),
// verified against NXP's NTAG21x and MIFARE Ultralight EV1 public keys. Needs BigInt.
const { valid, keyName, uid } = await nfc.checkNtagOriginality();
nfc.verifyNtagSignature(uid, signatureBytes);                                   // synchronous

// ISO 15693 (NfcV)
await nfc.connect('android.nfc.tech.NfcV');
const info = await nfc.nfcvGetSystemInfo();              // uid, dsfid, afi, blockCount, blockSize, icReference
const blocks = await nfc.nfcvReadBlocks(0, info.blockCount, info.uid);

// MIFARE Classic (phones with an NXP NFC controller)
await nfc.connect('android.nfc.tech.MifareClassic');
await nfc.mifareClassicAuthenticate(1, 'FFFFFFFFFFFF', 'A');
const block4 = await nfc.mifareClassicReadBlock(4);      // ArrayBuffer, 16 bytes

// reader mode: time between presence checks
nfc.readerMode(nfc.FLAG_READER_NFC_A, onTag, onError, { presenceCheckDelay: 250 });

// NFC switched on/off (also while it is off), current state first
nfc.addStateChangeListener(({ state, enabled }) => console.log(state, enabled));
nfc.removeStateChangeListener();

// Android 10+: opens the NFC settings panel over the app (falls back to the settings screen)
nfc.showSettings();
```

A password is sent in plain text over the air and the originality signature can be copied to a clone,
so treat both as deterrents, not strong security (see NXP AN13089).

## Errors (1.8.0)

Native errors carry a code. By default failure callbacks and rejections still receive the message string
(as in 1.7.x); call `nfc.useErrorObjects(true)` once to receive `NfcError` objects instead:

```js
nfc.useErrorObjects(true);
try {
    await nfc.transceive('3000');
} catch (e) {
    if (e.code === 'TAG_LOST') { /* ask the user to hold the tag still */ }
    if (e.code === nfc.IOS_ERROR.USER_CANCELED) { /* iOS sheet cancelled */ }
}
```

Android codes: `TAG_LOST`, `TAG_STALE`, `IO_ERROR`, `FORMAT_ERROR`, `ILLEGAL_STATE`, `NO_TAG`, `NOT_CONNECTED`,
`UNSUPPORTED_TECH`, `READ_ONLY`, `CAPACITY_EXCEEDED`, `NOT_NDEF`, `INVALID_ARGUMENT`, `NOT_SUPPORTED`,
`AUTH_FAILED`, `NO_NFC`, `NFC_DISABLED`, `UNKNOWN`. iOS reader-session errors carry the numeric
`NFCReaderError` code (`nfc.IOS_ERROR`), plugin-level iOS errors the same string codes as Android.

---

## iOS Notes

Reading NFC NDEF tags is supported on iPhone 7 (and newer) since iOS 11. iOS 13 added support for writing NDEF messages to NFC tags. iOS 13 also adds the ability to get the UID from some NFC tags. On iOS, the user must start a NFC session to scan for a tag. This is different from Android which can constantly scan for NFC tags. The [nfc.scanNdef](#nfcscanndef) and [nfc.scanTag](#nfcscantag) functions start a NFC scanning session. The NFC tag is returned to the caller via a Promise. If your existing code uses the deprecated [nfc.beginSession](#nfcbeginsession), update it to use `nfc.scanNdef`.

The `scanNdef` function uses [NFCNDEFReaderSession](https://developer.apple.com/documentation/corenfc/nfcndefreadersession) to detect NFC Data Exchange Format (NDEF) tags. `scanTag` uses the newer [NFCTagReaderSession](https://developer.apple.com/documentation/corenfc/nfctagreadersession) available in iOS 13 to detect ISO15693, FeliCa, and MIFARE tags. The `scanTag` function will include the tag UID and tag type for *some* NFC tags along with the NDEF messages. `scanTag` can also read some RFID tags without NDEF messsages. `scanTag` will not scan some NDEF tags including Topaz and Mifare Classic. 

You must call [nfc.scanNdef](#nfcscanndef) and [nfc.scanTag](#nfcscantag) before every scan. 

Writing NFC tags on iOS uses the same [nfc.write](#nfcwrite) function as other platforms. Although it's the same function, the behavior is different on iOS. Calling `nfc.write` on an iOS device will start a new scanning session and write data to the scanned tag.

### Localizing the iOS NFC sheet

The texts the plugin shows on the iOS scan sheet (and the `message` of the matching errors) are looked
up in the app's `Localizable.strings` first and fall back to English. To translate them, add these keys
to `<language>.lproj/Localizable.strings` in the iOS app (for example with a Cordova `resource-file`
or a hook):

| Key | English default | Shown when |
|-----|-----------------|------------|
| `NFCHoldNearTag` | Hold near NFC tag to scan. | `scanNdef` / `scanTag` starts |
| `NFCHoldNearWritableTag` | Hold near writable NFC tag to update. | `write` starts a session |
| `NFCTagRead` | Tag successfully read. | a tag was read |
| `NFCDataWrote` | Wrote data to NFC tag. | a write succeeded |
| `NFCMoreThanOneTag` | More than 1 tag detected. Please remove all tags and try again. | several tags in the field |
| `NFCErrorTagConnection` | Error connecting to tag. | connecting to the tag failed |
| `NFCErrorTagStatus` | Error getting tag status. | reading the NDEF status failed |
| `NFCDataReadFailed` | Read Failed. | reading the NDEF message failed |
| `NFCNotNdefCompliant` | Tag is not NDEF compliant. | writing to a non-NDEF tag |
| `NFCReadOnlyTag` | Tag is read only. | writing to a locked tag |
| `NFCDataWriteFailed` | Write failed. | the write failed |
| `NFCUnknownNdefTag` | Unknown NDEF tag status. | unexpected NDEF status |

Example `he.lproj/Localizable.strings`:

```
"NFCHoldNearTag" = "קרבו את המכשיר לתג NFC כדי לסרוק.";
"NFCTagRead" = "התג נקרא בהצלחה.";
```

Once the error texts are translated, match errors on their `code` (see `nfc.useErrorObjects`), not on the
English message.

# NFC

> The nfc object provides access to the device's NFC sensor.

## Methods

- [nfc.addNdefListener](#nfcaddndeflistener)
- [nfc.addTagDiscoveredListener](#nfcaddtagdiscoveredlistener)
- [nfc.addMimeTypeListener](#nfcaddmimetypelistener)
- [nfc.addNdefFormatableListener](#nfcaddndefformatablelistener)
- [nfc.write](#nfcwrite)
- [nfc.makeReadOnly](#nfcmakereadonly)
- [~~nfc.share~~](#nfcshare)
- [~~nfc.unshare~~](#nfcunshare)
- [nfc.erase](#nfcerase)
- [~~nfc.handover~~](#nfchandover)
- [~~nfc.stopHandover~~](#nfcstophandover)
- [nfc.enabled](#nfcenabled)
- [nfc.showSettings](#nfcshowsettings)
- [~~nfc.beginSession~~](#nfcbeginsession)
- [~~nfc.invalidateSession~~](#nfcinvalidatesession)
- [nfc.scanNdef](#nfcscanndef)
- [nfc.scanTag](#nfcscanTag)
- [nfc.cancelScan](#nfccancelscan)

## ReaderMode

- [nfc.readerMode](#nfcreadermode)
- [nfc.disableReaderMode](#nfcdisablereadermode)

## Tag Technology Functions

- [nfc.connect](#nfcconnect)
- [nfc.transceive](#nfctransceive)
- [nfc.close](#nfcclose)
- [ISO-DEP example](#tag-technology-functions-1)

## nfc.addNdefListener

Registers an event listener for any NDEF tag.

    nfc.addNdefListener(callback, [onSuccess], [onFailure]);

### Parameters

- __callback__: The callback that is called when an NDEF tag is read.
- __onSuccess__: (Optional) The callback that is called when the listener is added.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.addNdefListener` registers the callback for ndef events.

A ndef event is fired when a NDEF tag is read.


On Android registered [mimeTypeListeners](#nfcaddmimetypelistener) takes precedence over this more generic NDEF listener.

On iOS you must call [beingSession](#nfcbeginsession) before scanning a tag.

### Supported Platforms

- Android
- iOS
## nfc.removeNdefListener

Removes the previously registered event listener for NDEF tags added via `nfc.addNdefListener`.

    nfc.removeNdefListener(callback, [onSuccess], [onFailure]);

Removing listeners is not recommended. Instead, consider that your callback can ignore messages you no longer need.

### Parameters

- __callback__: The previously registered callback.
- __onSuccess__: (Optional) The callback that is called when the listener is successfully removed.
- __onFailure__: (Optional) The callback that is called if there was an error during removal.

### Supported Platforms

- Android
- iOS
## nfc.addTagDiscoveredListener

Registers an event listener for tags matching any tag type.

    nfc.addTagDiscoveredListener(callback, [onSuccess], [onFailure]);

### Parameters

- __callback__: The callback that is called when a tag is detected.
- __onSuccess__: (Optional) The callback that is called when the listener is added.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.addTagDiscoveredListener` registers the callback for tag events.

This event occurs when any tag is detected by the phone.

### Supported Platforms

- Android

## nfc.removeTagDiscoveredListener

Removes the previously registered event listener added via `nfc.addTagDiscoveredListener`.

    nfc.removeTagDiscoveredListener(callback, [onSuccess], [onFailure]);

Removing listeners is not recommended. Instead, consider that your callback can ignore messages you no longer need.

### Parameters

- __callback__: The previously registered callback.
- __onSuccess__: (Optional) The callback that is called when the listener is successfully removed.
- __onFailure__: (Optional) The callback that is called if there was an error during removal.

### Supported Platforms

- Android
## nfc.addMimeTypeListener

Registers an event listener for NDEF tags matching a specified MIME type.

    nfc.addMimeTypeListener(mimeType, callback, [onSuccess], [onFailure]);

### Parameters

- __mimeType__: The MIME type to filter for messages.
- __callback__: The callback that is called when an NDEF tag matching the MIME type is read.
- __onSuccess__: (Optional) The callback that is called when the listener is added.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.addMimeTypeListener` registers the callback for ndef-mime events.

A ndef-mime event occurs when a `Ndef.TNF_MIME_MEDIA` tag is read and matches the specified MIME type.

This function can be called multiple times to register different MIME types. You should use the *same* handler for all MIME messages.

    nfc.addMimeTypeListener("text/json", *onNfc*, success, failure);
    nfc.addMimeTypeListener("text/demo", *onNfc*, success, failure);

On Android, MIME types for filtering should always be lower case. (See [IntentFilter.addDataType()](http://developer.android.com/reference/android/content/IntentFilter.html#addDataType\(java.lang.String\)))

### Supported Platforms

- Android
## nfc.removeMimeTypeListener

Removes the previously registered event listener added via `nfc.addMimeTypeListener`.

    nfc.removeMimeTypeListener(mimeType, callback, [onSuccess], [onFailure]);

Removing listeners is not recommended. Instead, consider that your callback can ignore messages you no longer need.

### Parameters

- __mimeType__: The MIME type to filter for messages.
- __callback__: The previously registered callback.
- __onSuccess__: (Optional) The callback that is called when the listener is successfully removed.
- __onFailure__: (Optional) The callback that is called if there was an error during removal.

### Supported Platforms

- Android
## nfc.addNdefFormatableListener

Registers an event listener for formatable NDEF tags.

    nfc.addNdefFormatableListener(callback, [onSuccess], [onFailure]);

### Parameters

- __callback__: The callback that is called when NDEF formatable tag is read.
- __onSuccess__: (Optional) The callback that is called when the listener is added.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.addNdefFormatableListener` registers the callback for ndef-formatable events.

A ndef-formatable event occurs when a tag is read that can be NDEF formatted.  This is not fired for tags that are already formatted as NDEF.  The ndef-formatable event will not contain an NdefMessage.

### Supported Platforms

- Android

## nfc.write

Writes an NDEF Message to a NFC tag.

A NDEF Message is an array of one or more NDEF Records

    var message = [
        ndef.textRecord("hello, world"),
        ndef.uriRecord("http://github.com/chariotsolutions/phonegap-nfc")
    ];

    nfc.write(message, [onSuccess], [onFailure]);

### Parameters

- __ndefMessage__: An array of NDEF Records.
- __onSuccess__: (Optional) The callback that is called when the tag is written.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.write` writes an NdefMessage to a NFC tag.

On **Android** this method *must* be called from within an NDEF Event Handler.

On **iOS** this method can be called outside the NDEF Event Handler, it will start a new scanning session. Optionally you can reuse the read session to write data. See example below.



### Examples

#### Android

On Android, write must be called inside an event handler

    function onNfc(nfcEvent) {
    
        console.log(nfcEvent.tag);
        
        var message = [
            ndef.textRecord(new String(new Date()))
        ];
        
        nfc.write(
            message,
            success => console.log('wrote data to tag'),
            error => console.log(error)
        );

    nfc.addNdefListener(onNfc);


#### iOS - Simple

Calling `nfc.write` on iOS will create a new session and write data when the user taps a NFC tag

        var message = [
            ndef.textRecord("Hello, world")
        ];

        nfc.write(
            message,
            success => console.log('wrote data to tag'),
            error => console.log(error)
        );

#### iOS - Read and Write

On iOS you can optionally write to NFC tag using the read session

        try {
            let tag = await nfc.scanNdef({ keepSessionOpen: true});

            // you can read tag data here
            console.log(tag);
            
            // this example writes a new message with a timestamp
            var message = [
                ndef.textRecord(new String(new Date()))
            ];

            nfc.write(
                message,
                success => console.log('wrote data to tag'),
                error => console.log(error)
            );

        } catch (err) {
            console.log(err);
        }

### Supported Platforms

- Android
- iOS
## nfc.makeReadOnly

Makes a NFC tag read only.  **Warning this is permanent.**

    nfc.makeReadOnly([onSuccess], [onFailure]);

### Parameters

- __onSuccess__: (Optional) The callback that is called when the tag is locked.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.makeReadOnly` make a NFC tag read only. **Warning this is permanent** and can not be undone.

On **Android** this method *must* be called from within an NDEF Event Handler.

Example usage

    onNfc: function(nfcEvent) {

        var record = [
            ndef.textRecord("hello, world")
        ];

        var failure = function(reason) {
            alert("ERROR: " + reason);
        };

        var lockSuccess = function() {
            alert("Tag is now read only.");
        };

        var lock = function() {
            nfc.makeReadOnly(lockSuccess, failure);
        };

        nfc.write(record, lock, failure);

    },

### Supported Platforms

- Android

## nfc.share

Shares an NDEF Message via peer-to-peer.

A NDEF Message is an array of one or more NDEF Records

    var message = [
        ndef.textRecord("hello, world")
    ];

    nfc.share(message, [onSuccess], [onFailure]);

### Parameters

- __ndefMessage__: An array of NDEF Records.
- __onSuccess__: (Optional) The callback that is called when the message is pushed.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.share` writes an NdefMessage via peer-to-peer.  This should appear as an NFC tag to another device.

### Supported Platforms

- Android
### Platform differences

    Android Beam was removed in Android 10; since 1.8.0 this fails with NOT_SUPPORTED.

## nfc.unshare

Stop sharing NDEF data via peer-to-peer.

    nfc.unshare([onSuccess], [onFailure]);

### Parameters

- __onSuccess__: (Optional) The callback that is called when sharing stops.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.unshare` stops sharing data via peer-to-peer.

### Supported Platforms

- Android
## nfc.erase

Erase a NDEF tag

    nfc.erase([onSuccess], [onFailure]);

### Parameters

- __onSuccess__: (Optional) The callback that is called when sharing stops.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.erase` erases a tag by writing an empty message.  Will format unformatted tags before writing.

This method *must* be called from within an NDEF Event Handler.

### Supported Platforms

- Android
## nfc.handover

Send a file to another device via NFC handover.

    var uri = "content://media/external/audio/media/175";
    nfc.handover(uri, [onSuccess], [onFailure]);


    var uris = [
        "content://media/external/audio/media/175",
        "content://media/external/audio/media/176",
        "content://media/external/audio/media/348"
    ];
    nfc.handover(uris, [onSuccess], [onFailure]);


### Parameters

- __uri__: A URI as a String, or an *array* of URIs.
- __onSuccess__: (Optional) The callback that is called when the message is pushed.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.handover` shares files to a NFC peer using handover. Files are sent by specifying a file:// or context:// URI or a list of URIs. The file transfer is initiated with NFC but the transfer is completed with over Bluetooth or WiFi which is handled by a NFC handover request. The Android code is responsible for building the handover NFC Message.

This is Android only, but it should be possible to add implementations for other platforms.

### Supported Platforms

- Android

## nfc.stopHandover

Stop sharing NDEF data via NFC handover.

    nfc.stopHandover([onSuccess], [onFailure]);

### Parameters

- __onSuccess__: (Optional) The callback that is called when sharing stops.
- __onFailure__: (Optional) The callback that is called if there was an error.

### Description

Function `nfc.stopHandover` stops sharing data via peer-to-peer.

### Supported Platforms

- Android

## nfc.showSettings

Show the NFC settings on the device.

    nfc.showSettings(success, failure);

### Description

Function `showSettings` opens the NFC settings for the operating system.

### Parameters

- __success__: Success callback function [optional]
- __failure__: Error callback function, invoked when error occurs. [optional]

### Quick Example

    nfc.showSettings();

### Supported Platforms

- Android
## nfc.enabled

Check if NFC is available and enabled on this device.

nfc.enabled(onSuccess, onFailure);

### Parameters

- __onSuccess__: The callback that is called when NFC is enabled.
- __onFailure__: The callback that is called when NFC is disabled or missing.

### Description

Function `nfc.enabled` explicitly checks to see if the phone has NFC and if NFC is enabled. If
everything is OK, the success callback is called. If there is a problem, the failure callback
will be called with a reason code.

The reason will be **NO_NFC** if the device doesn't support NFC and **NFC_DISABLED** if the user has disabled NFC.

Note: that on Android the NFC status is checked before every API call **NO_NFC** or **NFC_DISABLED** can be returned in **any** failure function.


### Supported Platforms

- Android
- iOS
## nfc.beginSession

**`beginSession` is deprecated. Use `scanNdef` or `scanTag`**

iOS requires you to begin a session before scanning a NFC tag.

    nfc.beginSession(success, failure);

### Description

**`beginSession` is deprecated. Use `scanNdef` or `scanTag`**

Function `beginSession` starts the [NFCNDEFReaderSession](https://developer.apple.com/documentation/corenfc/nfcndefreadersession) allowing iOS to scan NFC tags. Use [nfc.addNdefListener](#nfcaddndeflistener) to receive the results of the scan.

### Parameters

- __success__: Success callback function called when the session begins [optional]
- __failure__: Error callback function, invoked when error occurs. [optional]

### Quick Example

    nfc.beginSession();

### Supported Platforms

- iOS

## nfc.invalidateSession

**`invalidateSession` is deprecated. Use `cancelScan``.**

Invalidate the NFC session.

    nfc.invalidateSession(success, failure);

### Description

Function `invalidateSession` stops the [NFCNDEFReaderSession](https://developer.apple.com/documentation/corenfc/nfcndefreadersession) returning control to your app.

### Parameters

- __success__: Success callback function called when the session in invalidated [optional]
- __failure__: Error callback function, invoked when error occurs. [optional]

### Quick Example

    nfc.invalidateSession();

### Supported Platforms

- iOS

## nfc.scanNdef

Calling `scanNdef` will being an iOS NFC scanning session. The NFC tag will be returned in a Promise.

    nfc.scanNdef();

### Description

Function `scanNdef` starts the [NFCNDEFReaderSession](https://developer.apple.com/documentation/corenfc/nfcndefreadersession)  allowing iOS to scan NFC tags.

### Returns

 - Promise

### Quick Example

    // Promise
    nfc.scanNdef().then(
        tag => console.log(JSON.stringify(tag)),
        err => console.log(err)
    );

    // Async Await
    try {
        let tag = await nfc.scanNdef();
        console.log(JSON.stringify(tag));
    } catch (err) {
        console.log(err);
    }
    

### Supported Platforms

- iOS

## nfc.scanTag

Calling `scanTag` will being an iOS NFC scanning session. The NFC tag will be returned in a Promise.

    nfc.scanTag();

### Description

Function `scanTag` starts the [NFCTagReaderSession](https://developer.apple.com/documentation/corenfc/nfctagreadersession) allowing iOS to scan NFC tags.

The Tag reader will attempt to get the UID from the NFC Tag. If can also read the UID from some non-NDEF tags. 

Use [scanNdef](#nfcscanndef) for reading NFC tags on iOS unless you need to get the tag UID.

### Returns

 - Promise

### Quick Example

    // Promise
    nfc.scanTag().then(
        tag => {
            console.log(JSON.stringify(tag))
            if (tag.id) {
                console.log(nfc.bytesToHexString(tag.id));
            }            
        },
        err => console.log(err)
    );

    // Async Await
    try {
        let tag = await nfc.scanTag();
        console.log(JSON.stringify(tag));
        if (tag.id) {
            console.log(nfc.bytesToHexString(tag.id));
        }
    } catch (err) {
        console.log(err);
    }
    

### Supported Platforms

- iOS


## nfc.cancelScan

Invalidate the NFC session started by `scanNdef` or `scanTag`.

    nfc.cancelScan();
    
### Description

Function `cancelScan` stops the [NFCReaderSession](https://developer.apple.com/documentation/corenfc/nfcreadersession) returning control to your app.

### Returns

 - Promise

### Quick Example

    nfc.cancelScan().then(
        success => { console.log('Cancelled NFC session')}, 
        err => { console.log(`Error cancelling session ${err}`)}
    );

### Supported Platforms

- iOS


# Reader Mode Functions

## nfc.readerMode

Read NFC tags sending the tag data to the success callback.

    nfc.readerMode(flags, readCallback, errorCallback);

### Description

In reader mode, when a NFC tags is read, the results are returned to read callback as a tag object. Note that the normal event listeners are *not* used in reader mode. The callback receives the tag object *without* the event wrapper.

    {
        "isWritable": true,
        "id": [4, 96, 117, 74, -17, 34, -128],
        "techTypes": ["android.nfc.tech.IsoDep", "android.nfc.tech.NfcA", "android.nfc.tech.Ndef"],
        "type": "NFC Forum Type 4",
        "canMakeReadOnly": false,
        "maxSize": 2046,
        "ndefMessage": [{
            "id": [],
            "type": [116, 101, 120, 116, 47, 112, 103],
            "payload": [72, 101, 108, 108, 111, 32, 80, 104, 111, 110, 101, 71, 97, 112],
            "tnf": 2
        }]
    }

Foreground dispatching and peer-to-peer functions are disabled when reader mode is enabled.

The flags control which tags are scanned. One benefit to reader mode, is the system sounds can be disabled when a NFC tag is scanned by adding the nfc.FLAG_READER_NO_PLATFORM_SOUNDS flag. See Android's [NfcAdapter.enableReaderMode()](https://developer.android.com/reference/android/nfc/NfcAdapter#enableReaderMode(android.app.Activity,%20android.nfc.NfcAdapter.ReaderCallback,%20int,%20android.os.Bundle)) documentation for more info on the flags.


### Parameters

- __flags__:  Flags indicating poll technologies and other optional parameters
- __readCallback__: The callback that is called when a NFC tag is scanned.
- __errorCallback__: The callback that is called when NFC is disabled or missing.

### Quick Example

    nfc.readerMode(
        nfc.FLAG_READER_NFC_A | nfc.FLAG_READER_NO_PLATFORM_SOUNDS, 
        nfcTag => console.log(JSON.stringify(nfcTag)),
        error => console.log('NFC reader mode failed', error)
    );

### Supported Platforms

- Android

## nfc.disableReaderMode

Disable NFC reader mode.

    nfc.disableNfcReaderMode(successCallback, errorCallback);

### Description

Disable NFC reader mode.

### Parameters

- __successCallback__: The callback that is called when a NFC reader mode is disabled.
- __errorCallback__: The callback that is called when NFC reader mode can not be disabled.

### Quick Example

    nfc.disableReaderMode(
        () => console.log('NFC reader mode disabled'),
        error => console.log('Error disabling NFC reader mode', error)
    )

### Supported Platforms

- Android


# Tag Technology Functions

The tag technology functions provide access to I/O operations on a tag. Connect to a tag, send commands with transceive, close the tag. See the [Android TagTechnology](https://developer.android.com/reference/android/nfc/tech/TagTechnology) and implementations like [IsoDep](https://developer.android.com/reference/android/nfc/tech/IsoDep) and [NfcV](https://developer.android.com/reference/android/nfc/tech/NfcV) for more details. These new APIs are promise based rather than using callbacks.

#### ISO-DEP (ISO 14443-4) Example

    const DESFIRE_SELECT_PICC = '00 A4 04 00 07 D2 76 00 00 85 01 00';
    const DESFIRE_SELECT_AID = '90 5A 00 00 03 AA AA AA 00'

    async function handleDesfire(nfcEvent) {
        
        const tagId = nfc.bytesToHexString(nfcEvent.tag.id);
        console.log('Processing', tagId);

        try {
            await nfc.connect('android.nfc.tech.IsoDep', 500);
            console.log('connected to', tagId);
            
            let response = await nfc.transceive(DESFIRE_SELECT_PICC);
            ensureResponseIs('9000', response);
            
            response = await nfc.transceive(DESFIRE_SELECT_AID);
            ensureResponseIs('9100', response);
            // 91a0 means the requested application not found

            alert('Selected application AA AA AA');

            // more transcieve commands go here
            
        } catch (error) {
            alert(error);
        } finally {
            await nfc.close();
            console.log('closed');
        }

    }

    function ensureResponseIs(expectedResponse, buffer) {
        const responseString = util.arrayBufferToHexString(buffer);
        if (expectedResponse !== responseString) {
            const error = 'Expecting ' + expectedResponse + ' but received ' + responseString;
            throw error;
        }
    }

    function onDeviceReady() {
        nfc.addTagDiscoveredListener(handleDesfire);
    }

    document.addEventListener('deviceready', onDeviceReady, false);

## nfc.connect

Connect to the tag and enable I/O operations to the tag from this TagTechnology object.

    nfc.connect(tech);

    nfc.connect(tech, timeout);

### Description

Function `connect` enables I/O operations to the tag from this TagTechnology object. `nfc.connect` should be called after receiving a nfcEvent from the `addTagDiscoveredListener` or the `readerMode` callback. Only one TagTechnology object can be connected to a Tag at a time.

See Android's [TagTechnology.connect()](https://developer.android.com/reference/android/nfc/tech/TagTechnology.html#connect()) for more info.

### Parameters

- __tech__: The tag technology e.g. android.nfc.tech.IsoDep
- __timeout__: The transceive(byte[]) timeout in milliseconds [optional]

### Returns

 - Promise when the connection is successful, optionally with a maxTransceiveLength attribute in case the tag technology supports it

### Quick Example

    nfc.addTagDiscoveredListener(function(nfcEvent) {
        nfc.connect('android.nfc.tech.IsoDep', 500).then(
            () => console.log('connected to', nfc.bytesToHexString(nfcEvent.tag.id)),
            (error) => console.log('connection failed', error)
        );
    })

### Supported Platforms

- Android

## nfc.transceive

Send raw command to the tag and receive the response.

    nfc.transceive(data);

### Description

Function `transceive` sends raw commands to the tag and receives the response. `nfc.connect` must be called before calling `transceive`. Data passed to transceive can be a hex string representation of bytes or an ArrayBuffer. The response is returned as an ArrayBuffer in the promise. 

See Android's documentation [IsoDep.transceive()](https://developer.android.com/reference/android/nfc/tech/IsoDep.html#transceive(byte[])), [NfcV.transceive()](https://developer.android.com/reference/android/nfc/tech/NfcV.html#transceive(byte[])), [MifareUltralight.transceive()](https://developer.android.com/reference/android/nfc/tech/MifareUltralight.html#transceive(byte[])) for more info.

### Parameters

- __data__: a string of hex data or an ArrayBuffer

### Returns

 - Promise with the response data as an ArrayBuffer

### Quick Example

    // Promise style
    nfc.transceive('90 5A 00 00 03 AA AA AA 00').then(
        response => console.log(util.arrayBufferToHexString(response)),
        error => console.log('Error selecting DESFire application')
    )

    // async await
    const response = await nfc.transceive('90 5A 00 00 03 AA AA AA 00');
    console.log('response =',util.arrayBufferToHexString(response));

### Supported Platforms

- Android

## nfc.close

Close TagTechnology connection.

    nfc.close();

### Description

Function `close` disabled I/O operations to the tag from this TagTechnology object, and releases resources.

See Android's [TagTechnology.close()](https://developer.android.com/reference/android/nfc/tech/TagTechnology.html#close()) for more info.

### Parameters

 - none

### Returns

 - Promise when the connection is successfully closed

### Quick Example

    nfc.transceive().then(
        () => console.log('connection closed'),
        (error) => console.log('error closing connection', error);
    )

### Supported Platforms

- Android

# NDEF

> The `ndef` object provides NDEF constants, functions for creating NdefRecords, and functions for converting data.
> See [android.nfc.NdefRecord](http://developer.android.com/reference/android/nfc/NdefRecord.html) for documentation about constants

## NdefMessage

Represents an NDEF (NFC Data Exchange Format) data message that contains one or more NdefRecords.
This plugin uses an array of NdefRecords to represent an NdefMessage.

## NdefRecord

Represents a logical (unchunked) NDEF (NFC Data Exchange Format) record.

### Properties

- __tnf__: 3-bit TNF (Type Name Format) - use one of the TNF_* constants
- __type__: byte array, containing zero to 255 bytes, must not be null
- __id__: byte array, containing zero to 255 bytes, must not be null
- __payload__: byte array, containing zero to (2 ** 32 - 1) bytes, must not be null

The `ndef` object has a function for creating NdefRecords

    var type = "text/pg",
        id = [],
        payload = nfc.stringToBytes("Hello World"),
        record = ndef.record(ndef.TNF_MIME_MEDIA, type, id, payload);

There are also helper functions for some types of records

Create a URI record

    var record = ndef.uriRecord("http://chariotsolutions.com");

Create a plain text record

    var record = ndef.textRecord("Plain text message");

Create a mime type record

    var mimeType = "text/pg",
        payload = "Hello Phongap",
        record = ndef.mimeMediaRecord(mimeType, nfc.stringToBytes(payload));

Create an Empty record

    var record = ndef.emptyRecord();

Create an Android Application Record (AAR)

    var record = ndef.androidApplicationRecord('com.example');

See `ndef.record`, `ndef.textRecord`, `ndef.mimeMediaRecord`, and `ndef.uriRecord`.

The Ndef object has functions to convert some data types to and from byte arrays.

See the [phonegap-nfc.js](https://github.com/chariotsolutions/phonegap-nfc/blob/master/www/phonegap-nfc.js) source for more documentation.

# Events

Events are fired when NFC tags are read.  Listeners are added by registering callback functions with the `nfc` object.  For example ` nfc.addNdefListener(myNfcListener, win, fail);`

## NfcEvent

### Properties

- __type__: event type
- __tag__: Ndef tag

### Types

- tag
- ndef-mime
- ndef
- ndef-formatable

The tag contents are platform dependent.

`id` and `techTypes` are included when scanning a tag on Android; iOS includes `id` for tags scanned with `nfc.scanTag`. `id` is typically displayed as a hex string `nfc.bytesToHexString(tag.id)`.

Assuming the following NDEF message is written to a tag, it will produce the following events when read.

    var ndefMessage = [
        ndef.createMimeRecord('text/pg', 'Hello PhoneGap')
    ];

#### Sample Event on Android

    {
        type: 'ndef',
        tag: {
            "isWritable": true,
            "id": [4, 96, 117, 74, -17, 34, -128],
            "techTypes": ["android.nfc.tech.IsoDep", "android.nfc.tech.NfcA", "android.nfc.tech.Ndef"],
            "type": "NFC Forum Type 4",
            "canMakeReadOnly": false,
            "maxSize": 2046,
            "ndefMessage": [{
                "id": [],
                "type": [116, 101, 120, 116, 47, 112, 103],
                "payload": [72, 101, 108, 108, 111, 32, 80, 104, 111, 110, 101, 71, 97, 112],
                "tnf": 2
            }]
        }
    }

## Getting Details about Events

The raw contents of the scanned tags are written to the log before the event is fired.  Use `adb logcat` on Android and the Xcode console on iOS.

You can also log the tag contents in your event handlers.  `console.log(JSON.stringify(nfcEvent.tag))`  Note that you want to stringify the tag not the event to avoid a circular reference.

# Platform Differences

The plugin supports Android and iOS (Windows Phone 8, Windows and BlackBerry 10 were removed in 1.8.0).

## Non-NDEF Tags

Android reads data from non-NDEF tags (`addTagDiscoveredListener`, `connect` / `transceive`). On iOS,
`nfc.scanTag` detects ISO 15693, FeliCa (with `pollFeliCa`) and MIFARE tags and returns their type and
UID; raw commands are limited to ISO 7816 APDUs.

## Mifare Classic Tags

Only Android phones with an NXP NFC controller read MIFARE Classic tags (see `nfc.mifareClassicAuthenticate`).
iOS has no MIFARE Classic API. MIFARE Ultralight tags work everywhere since they are NFC Forum Type 2 tags.

## Tag Id and Meta Data

Android returns the tag id, technologies, capacity and read-only status. iOS returns the id and type for
tags scanned with `nfc.scanTag`, and the NDEF capacity (`maxSize`) and writability for NDEF tags.

## Multiple Listeners

Multiple listeners can be registered in JavaScript. e.g. addNdefListener, addTagDiscoveredListener, addMimeTypeListener.

On Android, only the most specific event will fire.  If a Mime Media Tag is scanned, only the addMimeTypeListener callback is called and not the callback defined in addNdefListener. You can use the same event handler for multiple listeners.

## addTagDiscoveredListener

On Android, addTagDiscoveredListener scans non-NDEF tags and NDEF tags. The tag event does NOT contain an ndefMessage even if there are NDEF messages on the tag.  Use addNdefListener or addMimeTypeListener to get the NDEF information.

### Non-NDEF tag scanned with addTagDiscoveredListener on *Android*

    {
        type: 'tag',
        tag: {
            "id": [-81, 105, -4, 64],
            "techTypes": ["android.nfc.tech.MifareClassic", "android.nfc.tech.NfcA", "android.nfc.tech.NdefFormatable"]
        }
    }


### NDEF tag scanned with addTagDiscoveredListener on *Android*

    {
        type: 'tag',
        tag: {
            "id": [4, 96, 117, 74, -17, 34, -128],
            "techTypes": ["android.nfc.tech.IsoDep", "android.nfc.tech.NfcA", "android.nfc.tech.Ndef"]
        }
    }

# Launching your Android Application when Scanning a Tag

## Android: `NFC_INTENT_FILTERS` (1.8.0)

Android can start (or bring forward) your app when a tag is tapped while the app is closed or in the
background. Turn it on with a plugin variable; the plugin's `after_prepare` hook writes the intent
filters onto the launcher activity and `res/xml/cdv_nfc_plugin_tech_filter.xml` for you (marked with the plugin's own label, so filters you wrote yourself are never touched):

    cordova plugin add community-cordova-plugin-nfc --variable NFC_INTENT_FILTERS=ndef,tech

| Value | What is added |
|-------|---------------|
| `none` (default) | nothing - behaviour of 1.7.x |
| `ndef` | `NDEF_DISCOVERED` for each MIME type in `NFC_NDEF_MIME_TYPES` (default `*/*`; NFC Forum Text records count as `text/plain`) |
| `tech` | `TECH_DISCOVERED` with a tech list matching any NFC technology (NfcA/B/F/V, IsoDep, Ndef, NdefFormatable, MifareClassic, MifareUltralight) |
| `tag` | `TAG_DISCOVERED` (last-resort dispatch) |

Combine them with commas. Changing the variable back to `none` and running `cordova prepare` removes
everything the hook added. A URL tag keeps opening the browser: Android matches the browser's
`NDEF_DISCOVERED` filter first, and `TECH_DISCOVERED` only applies when no app claimed the NDEF intent.

The tag that launched the app is delivered through the normal listeners. It arrives right after
`deviceready`, usually before your code has registered its listener, so the plugin keeps it for 30
seconds and hands it to the first matching `nfc.addNdefListener` (NDEF tags, including ones matched by
`ndef`), `nfc.addTagDiscoveredListener` (non-NDEF tags), `nfc.addMimeTypeListener` or
`nfc.addNdefFormatableListener`. The event has `launch: true`.

To write the filters by hand instead, add them to the activity in `config.xml` with
`<edit-config>` / `<config-file>`, for example:

    <intent-filter>
      <action android:name="android.nfc.action.NDEF_DISCOVERED" />
      <data android:mimeType="text/pg" />
      <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>

See the Android documentation on [filtering for NFC intents](https://developer.android.com/develop/connectivity/nfc/nfc#ndef-disc).

## iOS: background tag reading

iOS reads NDEF tags in the background by itself on iPhone XS and newer: a tag carrying a URL record
for a domain your app handles as a **Universal Link** opens the app (or shows a notification) without
any plugin involvement. To use it:

1. Set up Universal Links for the domain (Associated Domains entitlement `applinks:example.com` and an
   `apple-app-site-association` file) - for example with a deep-link plugin.
2. Write the tag with `ndef.uriRecord("https://example.com/...")`.
3. Handle the link in the app like any other Universal Link. The URL is the tag content; the raw NDEF
   message is available natively as `NSUserActivity.ndefMessagePayload`, which this plugin does not read.

Background reading is not possible while an NFC session is active, while Apple Pay / Wallet is in use,
or before the first unlock after a restart. Non-URL records and non-NDEF tags can only be read in the
foreground with `nfc.scanNdef` / `nfc.scanTag`.

Testing
=======

    npm install
    npm test            # eslint, typings type-test, Node unit tests, Android JVM harness (needs a JDK)
    npm run test:ios    # macOS + Xcode: compiles NfcPlugin.m against the iPhoneOS SDK

`tests/android` runs `NfcPlugin.java` on a plain JVM against fakes of the Android NFC classes that
reproduce the framework rules the plugin depends on (one connected technology per tag, stale-tag
`SecurityException`, `TagLostException`). `tests/unit` loads `www/phonegap-nfc.js` in Node with a fake
Cordova bridge and a byte-accurate NTAG / Ultralight model. None of this replaces a test on a phone with
real tags. The old `tests/` Cordova test-framework suite is kept for manual on-device runs.

Sample Projects
================

- [Ionic NFC Reader](https://github.com/don/ionic-nfc-reader)
- [NFC Reader](https://github.com/don/phonegap-nfc-reader)
- [NFC Writer](https://github.com/don/phonegap-nfc-writer)
- [NFC Peer to Peer](https://github.com/don/phonegap-p2p)
- [ApacheCon 2014 Demos](https://github.com/don/apachecon-nfc-demos)
- [Rock Paper Scissors](https://github.com/don/rockpaperscissors) *Android 2.x only*

HCE
=======

For Host Card Emulation (HCE), try the [Cordova HCE Plugin](https://github.com/don/cordova-plugin-hce).

Book
=======
Need more info? Check out my book <a href="http://www.tkqlhce.com/click-7835726-11260198-1430755877000?url=http%3A%2F%2Fshop.oreilly.com%2Fproduct%2F0636920021193.do%3Fcmp%3Daf-prog-books-videos-product_cj_9781449372064_%2525zp&cjsku=0636920021193" target="_top">
Beginning NFC: Near Field Communication with Arduino, Android, and PhoneGap</a><img src="http://www.lduhtrp.net/image-7835726-11260198-1430755877000" width="1" height="1" border="0"/>

<a href="http://www.kqzyfj.com/click-7835726-11260198-1430755877000?url=http%3A%2F%2Fshop.oreilly.com%2Fproduct%2F0636920021193.do%3Fcmp%3Daf-prog-books-videos-product_cj_9781449372064_%2525zp&cjsku=0636920021193" target="_top"><img src="http://akamaicovers.oreilly.com/images/0636920021193/cat.gif" border="0" alt="Beginning NFC"/></a><img src="http://www.ftjcfx.com/image-7835726-11260198-1430755877000" width="1" height="1" border="0"/>

License
================

The MIT License

Copyright (c) 2011-2020 Chariot Solutions

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

[w3c_spec]: https://www.w3.org/TR/battery-status/
[status_object]: #status-object
[community_plugins]: https://github.com/EYALIN?tab=repositories&q=community&type=&language=&sort=
