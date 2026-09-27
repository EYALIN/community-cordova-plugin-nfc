'use strict';
// PLU-217 / PLU-219 / PLU-223: native errors are {code, message}; apps keep getting the legacy
// string unless they opt in with nfc.useErrorObjects(true).
const test = require('node:test');
const assert = require('node:assert');
const { loadPlugin } = require('./load-plugin');

test('legacy mode: a native {code, message} error reaches the failure callback as the old message string', () => {
    const p = loadPlugin();
    p.native.on('makeReadOnly', (args, win, fail) => fail({ code: 'TAG_STALE', message: 'Tag connection expired. Please tap the tag again.' }));
    let got;
    p.nfc.makeReadOnly(() => {}, e => { got = e; });
    assert.strictEqual(got, 'Tag connection expired. Please tap the tag again.');
});

test('legacy mode: string errors (iOS, cordova) pass through untouched', () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('scanNdef', (args, win, fail) => fail('Session invalidated by user'));
    return p.nfc.scanNdef().then(() => assert.fail('resolved'), e => assert.strictEqual(e, 'Session invalidated by user'));
});

test('legacy mode: NFC status errors keep their bare status string (NFC_DISABLED)', () => {
    const p = loadPlugin();
    p.native.on('registerNdef', (args, win, fail) => fail({ code: 'NFC_DISABLED', message: 'NFC_DISABLED' }));
    let got;
    p.nfc.addNdefListener(() => {}, () => {}, e => { got = e; });
    assert.strictEqual(got, 'NFC_DISABLED');
});

test('object mode: promise rejections carry NfcError {code, message}', async () => {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    p.native.on('transceive', (args, win, fail) => fail({ code: 'TAG_LOST', message: 'Tag was lost.' }));
    await assert.rejects(p.nfc.transceive('60'), e => {
        assert.ok(e instanceof p.nfc.NfcError, 'not an NfcError');
        assert.ok(e instanceof Error, 'NfcError is not an Error');
        assert.strictEqual(e.code, 'TAG_LOST');
        assert.strictEqual(e.message, 'Tag was lost.');
        assert.strictEqual(String(e), 'Tag was lost.');
        return true;
    });
});

test('object mode: extra native fields (iOS domain) are kept, string errors become code UNKNOWN', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.nfc.useErrorObjects(true);
    p.native.on('scanNdef', (args, win, fail) => fail({ code: 200, message: 'Session invalidated by user', domain: 'NFCError' }));
    await assert.rejects(p.nfc.scanNdef(), e => e.code === 200 && e.domain === 'NFCError');
    p.native.on('cancelScan', (args, win, fail) => fail('boom'));
    await assert.rejects(p.nfc.cancelScan(), e => e.code === 'UNKNOWN' && e.message === 'boom');
});

test('useErrorObjects(false) switches back to legacy strings', () => {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    p.nfc.useErrorObjects(false);
    p.native.on('eraseTag', (args, win, fail) => fail({ code: 'READ_ONLY', message: 'Tag is read only' }));
    let got;
    p.nfc.erase(() => {}, e => { got = e; });
    assert.strictEqual(got, 'Tag is read only');
});

// ---- PLU-223: iOS errors carry the NFCReaderError code
test('[PLU-223] iOS: cancelling the sheet rejects with code 200 in object mode', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.nfc.useErrorObjects(true);
    p.native.on('scanNdef', (args, win, fail) => fail({ code: 200, message: 'Session invalidated by user', domain: 'NFCError' }));
    await assert.rejects(p.nfc.scanNdef(), e => e.code === p.nfc.IOS_ERROR.USER_CANCELED && e.code === 200 && e.domain === 'NFCError');
});

test('[PLU-223] iOS legacy mode: NfcReader\'s `ex === \'Session invalidated by user\'` check keeps working', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.native.on('scanNdef', (args, win, fail) => fail({ code: 200, message: 'Session invalidated by user', domain: 'NFCError' }));
    await assert.rejects(p.nfc.scanNdef(), e => e === 'Session invalidated by user');
    p.native.on('writeTag', (args, win, fail) => fail({ code: 200, message: 'Session invalidated by user', domain: 'NFCError' }));
    let got;
    p.nfc.write([], () => {}, e => { got = e; }, {});
    assert.strictEqual(got, 'Session invalidated by user');
});

test('[PLU-223] iOS timeout is distinguishable from cancel (201 vs 200) and plugin errors use string codes', async () => {
    const p = loadPlugin({ platform: 'ios' });
    p.nfc.useErrorObjects(true);
    p.native.on('scanTag', (args, win, fail) => fail({ code: 201, message: 'Session timeout', domain: 'NFCError' }));
    await assert.rejects(p.nfc.scanTag(), e => e.code === p.nfc.IOS_ERROR.SESSION_TIMEOUT);
    p.native.on('transceive', (args, win, fail) => fail({ code: 'NOT_CONNECTED', message: 'No active NFC session. Call nfc.scanTag({keepSessionOpen:true}) first.' }));
    await assert.rejects(p.nfc.transceive('00A4040000'), e => e.code === 'NOT_CONNECTED');
});

// ---- PLU-226 (JS side): records built by the helpers carry `id`, which iOS writeTag now reads
test('[PLU-226] ndef.record / textRecord put the record id under `id` (the key iOS writeTag reads)', () => {
    const p = loadPlugin({ platform: 'ios' });
    const r = p.nfc.NdefPlugin.textRecord('x', 'en', [0x41, 0x42]);
    assert.deepStrictEqual(Array.from(r.id), [0x41, 0x42]);
    assert.ok(!('identifiers' in r));
    let sent;
    p.native.on('writeTag', (args, win) => { sent = args[0]; win(); });
    p.nfc.write([r], () => {}, () => {}, {});
    assert.deepStrictEqual(Array.from(sent[0].id), [0x41, 0x42]);
});
