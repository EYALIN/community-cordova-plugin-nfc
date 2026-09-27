'use strict';
// iOS contracts that no unit test can reach without a device (CoreNFC has no simulator support).
// These assert on NfcPlugin.m's source, the way the change-evidence skill prescribes for code no
// test can instantiate; tests/ios/check-syntax.sh compiles it against the iPhoneOS SDK.
// NFC_IOS_SOURCE lets the same tests run against an older copy (to show a BEFORE).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SOURCE = process.env.NFC_IOS_SOURCE || path.join(__dirname, '..', '..', 'src', 'ios', 'NfcPlugin.m');
const src = fs.readFileSync(SOURCE, 'utf8');

// body of the Objective-C method whose signature starts with `signature`
function methodBody (signature) {
    const start = src.indexOf(signature);
    assert.ok(start >= 0, 'method not found: ' + signature);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') { depth++; }
        if (src[i] === '}') { depth--; if (depth === 0) { return src.slice(open + 1, i); } }
    }
    throw new Error('unbalanced method ' + signature);
}

// ---- PLU-222
test('[PLU-222] scanNdef/scanTag read keepSessionOpen as a BOOL value, not the NSNumber pointer', () => {
    assert.doesNotMatch(src, /keepSessionOpen\s*=\s*\[options valueForKey:@"keepSessionOpen"\]/,
        'assigning the NSNumber makes @NO (and every non-nil value) YES');
    for (const m of ['- (void)scanNdef:', '- (void)scanTag:']) {
        assert.match(methodBody(m), /keepSessionOpen\s*=\s*\[self boolOption:@"keepSessionOpen"/, m);
    }
});

test('[PLU-222] every session delegate ignores callbacks from a session that is not the current one', () => {
    const delegates = [
        '- (void) readerSession:(NFCNDEFReaderSession *)session didDetectNDEFs:',
        '- (void) readerSession:(NFCNDEFReaderSession *)session didDetectTags:',
        '- (void) readerSessionDidBecomeActive:',
        '- (void)tagReaderSessionDidBecomeActive:',
        '- (void)tagReaderSession:(NFCTagReaderSession *)session didDetectTags:'
    ];
    for (const d of delegates) {
        assert.match(methodBody(d), /if \(\[self isStaleSession:session\]\) \{ return; \}/, d);
    }
    assert.match(methodBody('- (BOOL)isStaleSession:'), /session != self\.nfcSession/);
});

test('[PLU-222] a late didInvalidate from a cancelled/replaced session answers ITS callback, never the new scan', () => {
    for (const d of ['- (void) readerSession:(NFCNDEFReaderSession *)session didInvalidateWithError:',
        '- (void)tagReaderSession:(NFCTagReaderSession *)session didInvalidateWithError:']) {
        const body = methodBody(d);
        assert.match(body, /\[self session:session didInvalidateWithError:error\]/, d);
        assert.doesNotMatch(body, /sendError/, d + ' still sends to the shared sessionCallbackId');
    }
    const common = methodBody('- (void)session:(NFCReaderSession *)session didInvalidateWithError:');
    assert.match(common, /if \(session == self\.nfcSession\)/);
    assert.match(common, /retiredSessionCallbacks objectForKey:session/);
});

test('[PLU-222] a new scan waits for the previous live session to invalidate before beginning', () => {
    const start = methodBody('- (void)startScanSession:');
    assert.match(start, /self\.nfcSession && self\.nfcSession\.isReady/);
    assert.match(start, /self\.pendingScanCommand = command/);
    assert.match(start, /\[self retireCurrentSession\]/);
    assert.match(methodBody('- (void)cancelScan:'), /\[self retireCurrentSession\]/);
    assert.match(methodBody('- (void)session:(NFCReaderSession *)session didInvalidateWithError:'), /beginPendingScanIfIdle/);
});

test('[PLU-222] a parked scan that is cancelled or superseded before it begins is answered, never left hanging', () => {
    // every place that parks a command first answers whatever was parked before it
    const start = methodBody('- (void)startScanSession:');
    const parks = start.split('self.pendingScanCommand = command;').length - 1;
    const rejects = start.split('[self rejectPendingScan];').length - 1;
    assert.ok(parks >= 1 && rejects === parks, 'parks=' + parks + ' rejects=' + rejects);
    assert.match(methodBody('- (void)cancelScan:'), /\[self rejectPendingScan\]/);
    assert.doesNotMatch(methodBody('- (void)cancelScan:'), /self\.pendingScanCommand = nil;/);
    const reject = methodBody('- (void)rejectPendingScan');
    assert.match(reject, /sendPluginResult:pluginResult callbackId:pending\.callbackId/);
    assert.match(reject, /NFCReaderSessionInvalidationErrorUserCanceled/);
});

// ---- PLU-223
test('[PLU-223] no iOS error is sent as a bare localized string any more', () => {
    assert.doesNotMatch(src, /CDVCommandStatus_ERROR messageAsString:/, 'an error still goes out as text only');
    assert.doesNotMatch(src, /sendError:error\.localizedDescription/);
});

test('[PLU-223] reader-session invalidations carry the NSError code (200 cancel, 201 timeout, ...) and domain', () => {
    const body = methodBody('- (NSDictionary *) errorFromNSError:');
    assert.match(body, /@"code": @\(error\.code\)/);
    assert.match(body, /@"message": error\.localizedDescription/);
    assert.match(body, /@"domain": error\.domain/);
    const common = methodBody('- (void)session:(NFCReaderSession *)session didInvalidateWithError:');
    assert.match(common, /\[self sendNSError:error\]/);
    assert.match(common, /errorFromNSError:error/);
});

test('[PLU-223] plugin-level session failures carry the same string codes as Android', () => {
    for (const code of ['READ_ONLY', 'NOT_NDEF', 'IO_ERROR', 'INVALID_ARGUMENT', 'NOT_CONNECTED', 'NO_NFC']) {
        assert.match(src, new RegExp('@"' + code + '"'), code);
    }
});

// ---- PLU-226
test('[PLU-226] iOS reports the NDEF capacity as maxSize (queryNDEFStatus capacity was discarded)', () => {
    const body = methodBody('- (void)processNDEFTag: (NFCReaderSession *)session tag:(__kindof id<NFCNDEFTag>)tag metaData:');
    assert.match(body, /metaData\[@"maxSize"\] = @\(capacity\)/);
});

test('[PLU-226] writeTag keeps record ids: reads `id` (what every record carries), falling back to `identifiers`', () => {
    const body = methodBody('- (void)writeTag:');
    assert.match(body, /objectForKey:@"id"\]/);
    assert.match(body, /identifier:identifier/);
    assert.doesNotMatch(body, /NSData \*identifier = \[self uint8ArrayToNSData:\[recordData objectForKey:@"identifiers"\]\]/);
});

test('[PLU-226] FeliCa can be polled (opt-in) and reports IDm + system code; MiFare tags expose their family', () => {
    assert.match(methodBody('- (void)beginScanSession:'), /if \(self\.pollFeliCa\) \{\s*polling \|= NFCPollingISO18092;/);
    assert.match(methodBody('- (void)scanTag:'), /pollFeliCa = \[self boolOption:@"pollFeliCa"/);
    const info = methodBody('- (NSMutableDictionary *) getTagInfo:');
    assert.match(info, /currentIDm/);
    assert.match(info, /forKey:@"systemCode"/);
    assert.match(info, /forKey:@"mifareFamily"/);
});

// ---- PLU-228
test('[PLU-228] localizeString compares the looked-up text with isEqualToString:, not the NSString pointer', () => {
    const body = methodBody('- (NSString*) localizeString:');
    assert.doesNotMatch(body, /NSLocalizedString\(key, comment: ""\) != key/);
    assert.match(body, /\[localized isEqualToString:key\]/);
    assert.match(body, /return defaultValue;/);
});

test('[PLU-228] every sheet string key the plugin uses is documented in the README with its English default', () => {
    const readme = fs.readFileSync(process.env.NFC_README_SOURCE || path.join(__dirname, '..', '..', 'README.md'), 'utf8');
    const used = [...src.matchAll(/localizeString:@"(\w+)" defaultValue:@"([^"]*)"/g)].map(m => [m[1], m[2]]);
    assert.ok(used.length >= 12, 'found ' + used.length + ' keys');
    for (const [key, english] of used) {
        assert.ok(readme.includes('`' + key + '` | ' + english + ' |'), 'README does not document ' + key + ' = ' + english);
    }
});
