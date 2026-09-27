'use strict';
// PLU-230: NTAG password, NXP originality signature, ISO 15693, MIFARE Classic / state / reader-mode
// plumbing. Tags are the byte-accurate fake in fake-ntag.js; signatures are real NXP tag signatures
// published with Proxmark3's tools/recover_pk.py self-test.
const test = require('node:test');
const assert = require('node:assert');
const { loadPlugin } = require('./load-plugin');
const { createTag, attach } = require('./fake-ntag');

const REAL = [
    // [uid, READ_SIG, key]
    ['04E10CDA993C80', '8B76052EE42F5567BEB53238B3E3F9950707C0DCC956B5C5EFCFDB709B2D82B3', 'NXP NTAG21x'],
    ['04DB0BDA993C80', '6048EFD9417CD10F6B7F1818D471A7FE5B46868D2EABDC6307A1E0AAE139D8D0', 'NXP NTAG21x'],
    ['04C1285A373080', 'CEA2EB0B3C95D0844A95B824A7553703B3702378033BF0987899DB70151A19E7', 'NXP MIFARE Ultralight EV1'],
    ['04C2285A373080', 'A561506723D422D29ED9F93E60D20B9ED1E05CC1BF81DA19FE500CA0B81CC0ED', 'NXP MIFARE Ultralight EV1']
];
const hexBytes = h => h.match(/../g).map(x => parseInt(x, 16));

function setup (type, opts) {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    const tag = attach(p, createTag(type, opts));
    return { p, nfc: p.nfc, tag };
}

// ---- originality signature
test('[PLU-230] verifyNtagSignature accepts real NXP signatures (NTAG21x and Ultralight EV1 keys)', () => {
    const { nfc } = setup('NTAG213');
    for (const [uid, sig, key] of REAL) {
        assert.deepStrictEqual(JSON.parse(JSON.stringify(nfc.verifyNtagSignature(uid, sig))), { valid: true, keyName: key }, uid);
        assert.strictEqual(nfc.verifyNtagSignature(hexBytes(uid), new Uint8Array(hexBytes(sig))).valid, true, uid + ' as bytes');
    }
});

test('[PLU-230] verifyNtagSignature rejects a cloned UID, a modified signature and an all-zero signature', () => {
    const { nfc } = setup('NTAG213');
    const [uid, sig] = REAL[0];
    assert.strictEqual(nfc.verifyNtagSignature('04E10CDA993C81', sig).valid, false);
    assert.strictEqual(nfc.verifyNtagSignature(uid, sig.slice(0, 62) + '00').valid, false);
    assert.strictEqual(nfc.verifyNtagSignature(uid, '00'.repeat(32)).valid, false);
    assert.strictEqual(nfc.verifyNtagSignature(uid, sig, { publicKey: '0490933BDCD6E99B4E255E3DA55389A827564E11718E017292FAF23226A96614B8' }).valid, false, 'accepted with the wrong key');
    assert.throws(() => nfc.verifyNtagSignature(uid, 'AABB'), e => e.code === 'INVALID_ARGUMENT');
});

test('[PLU-230] checkNtagOriginality reads UID + READ_SIG from the tag and verifies them', async () => {
    const [uid, sig] = REAL[0];
    const genuine = setup('NTAG213', { uid: hexBytes(uid), signature: hexBytes(sig) });
    await genuine.nfc.connect('android.nfc.tech.NfcA');
    const r = await genuine.nfc.checkNtagOriginality();
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.keyName, 'NXP NTAG21x');
    assert.deepStrictEqual(Array.from(r.uid), hexBytes(uid));
    const clone = setup('NTAG213', { uid: hexBytes('04E10CDA993C81'), signature: hexBytes(sig) });
    await clone.nfc.connect('android.nfc.tech.NfcA');
    assert.strictEqual((await clone.nfc.checkNtagOriginality()).valid, false);
});

// ---- password
test('[PLU-230] set a password on an NTAG215, authenticate with it, then remove it', async () => {
    const { nfc, tag } = setup('NTAG215');
    await nfc.connect('android.nfc.tech.NfcA');
    const set = await nfc.ntagSetPassword('12345678', { pack: 'ABCD', startPage: 4 });
    assert.strictEqual(set.startPage, 4);
    assert.deepStrictEqual(tag.pwd, [0x12, 0x34, 0x56, 0x78]);
    assert.deepStrictEqual(tag.pack, [0xAB, 0xCD]);
    const status = await nfc.getPasswordProtectionStatus();
    assert.strictEqual(status.protectionStartPage, 4);
    assert.strictEqual(status.writeProtected, true);
    assert.strictEqual(status.readProtected, false);
    // writing user memory now needs the password
    await assert.rejects(nfc.transceive([0xA2, 5, 1, 2, 3, 4]), e => e.code === 'IO_ERROR');
    await nfc.connect('android.nfc.tech.NfcA');
    await assert.rejects(nfc.ntagAuthenticate('00000000'), e => e.code === 'AUTH_FAILED' && e.message === 'Wrong password');
    assert.ok(tag.connects >= 3, 'tag not re-selected after the wrong password');
    const auth = await nfc.ntagAuthenticate([0x12, 0x34, 0x56, 0x78], 'ABCD');
    assert.deepStrictEqual(Array.from(auth.pack), [0xAB, 0xCD]);
    assert.strictEqual(auth.packMatches, true);
    await nfc.transceive([0xA2, 5, 1, 2, 3, 4]);
    assert.deepStrictEqual(tag.page(5), [1, 2, 3, 4]);
    await nfc.ntagRemovePassword('12345678');
    await nfc.connect('android.nfc.tech.NfcA');
    const after = await nfc.getPasswordProtectionStatus();
    assert.strictEqual(after.isProtected, false);
    assert.deepStrictEqual(tag.pwd, [0xFF, 0xFF, 0xFF, 0xFF]);
    await nfc.transceive([0xA2, 6, 9, 9, 9, 9]);
});

test('[PLU-230] protectReads sets PROT and AUTHLIM without touching the other ACCESS / CFG0 bits', async () => {
    const { nfc, tag } = setup('NTAG213');
    tag.mem[tag.ic.cfg * 4] = 0x04;                  // MIRROR config byte
    tag.mem[(tag.ic.cfg + 1) * 4] = 0x10;            // NFC_CNT_EN already on
    await nfc.connect('android.nfc.tech.NfcA');
    await nfc.ntagSetPassword('CAFEBABE', { startPage: 0x10, protectReads: true, authLimit: 3 });
    assert.deepStrictEqual(tag.page(tag.ic.cfg), [0x04, 0x00, 0x00, 0x10]);
    assert.deepStrictEqual(tag.page(tag.ic.cfg + 1).slice(0, 1), [0x80 | 0x10 | 0x03]);
    await nfc.connect('android.nfc.tech.NfcA');
    const status = await nfc.getPasswordProtectionStatus();
    assert.strictEqual(status.readProtected, true);
    assert.strictEqual(status.configReadable, false);
});

test('[PLU-230] a PACK other than the expected one is reported (possible clone), a locked config is refused', async () => {
    const a = setup('NTAG213');
    a.tag.setPassword([1, 2, 3, 4], [0x11, 0x22]);
    await a.nfc.connect('android.nfc.tech.NfcA');
    await assert.rejects(a.nfc.ntagAuthenticate('01020304', '9999'), e => e.code === 'AUTH_FAILED' && /PACK/.test(e.message));
    const b = setup('NTAG216');
    b.tag.mem[(b.tag.ic.cfg + 1) * 4] = 0x40;       // CFGLCK
    await b.nfc.connect('android.nfc.tech.NfcA');
    await assert.rejects(b.nfc.ntagSetPassword('01020304'), e => e.code === 'NOT_SUPPORTED');
    await assert.rejects(b.nfc.ntagSetPassword('0102'), e => e.code === 'INVALID_ARGUMENT');
});

// ---- ISO 15693
test('[PLU-230] nfcvGetSystemInfo parses DSFID / AFI / memory size / IC reference; nfcvReadBlocks reads blocks', async () => {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    const uid = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x04, 0xE0];
    const frames = [];
    p.native.on('transceive', (args, win, fail) => {
        const cmd = Array.from(new Uint8Array(args[0]));
        frames.push(cmd);
        if (cmd[1] === 0x2B) { return win(new Uint8Array([0x00, 0x0F, ...uid, 0x00, 0x00, 0x3F, 0x03, 0x01]).buffer); }
        if (cmd[1] === 0x20) {
            const block = cmd[cmd.length - 1];
            if (block > 63) { return win(new Uint8Array([0x01, 0x10]).buffer); }
            return win(new Uint8Array([0x00, block, block, block, block]).buffer);
        }
        fail({ code: 'IO_ERROR', message: 'Transceive failed' });
    });
    const info = await p.nfc.nfcvGetSystemInfo();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(info)), { uid, dsfid: 0, afi: 0, blockCount: 64, blockSize: 4, icReference: 1 });
    assert.deepStrictEqual(frames[0], [0x02, 0x2B]);
    const data = new Uint8Array(await p.nfc.nfcvReadBlocks(2, 3, uid));
    assert.deepStrictEqual(Array.from(data), [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
    assert.deepStrictEqual(frames[1], [0x22, 0x20, ...uid, 2], 'addressed READ SINGLE BLOCK frame');
    await assert.rejects(p.nfc.nfcvReadBlocks(64, 1), e => e.code === 'IO_ERROR' && /0x10/.test(e.message));
    await assert.rejects(p.nfc.nfcvReadBlocks(250, 10), e => e.code === 'INVALID_ARGUMENT');
});

// ---- MIFARE Classic, NFC state, reader mode (JS side of the native actions)
test('[PLU-230] mifareClassicAuthenticate validates the 6-byte key and passes it to native as an ArrayBuffer', async () => {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    let sent;
    p.native.on('mifareClassicAuthenticate', (args, win) => { sent = args; win(); });
    await assert.rejects(p.nfc.mifareClassicAuthenticate(1, 'FFFFFFFFFF'), e => e.code === 'INVALID_ARGUMENT');
    assert.strictEqual(sent, undefined);
    await p.nfc.mifareClassicAuthenticate(1, 'FFFFFFFFFFFF', 'B');
    assert.strictEqual(sent[0], 1);
    assert.deepStrictEqual(Array.from(new Uint8Array(sent[1])), [255, 255, 255, 255, 255, 255]);
    assert.strictEqual(sent[2], 'B');
});

test('[PLU-230] addStateChangeListener keeps delivering state events (Android) and reports NOT_SUPPORTED on iOS', () => {
    const p = loadPlugin();
    const states = [];
    p.native.on('registerStateChange', (args, win) => { win({ state: 'on', enabled: true, initial: true }); win({ state: 'off', enabled: false, initial: false }); });
    p.nfc.addStateChangeListener(s => states.push(s.state));
    assert.deepStrictEqual(states, ['on', 'off']);
    const ios = loadPlugin({ platform: 'ios' });
    ios.nfc.useErrorObjects(true);
    let err;
    ios.nfc.addStateChangeListener(() => {}, e => { err = e; });
    assert.strictEqual(err.code, 'NOT_SUPPORTED');
});

test('[PLU-230] readerMode forwards options (presenceCheckDelay) to native', () => {
    const p = loadPlugin();
    let sent;
    p.native.on('readerMode', (args) => { sent = args; });
    p.nfc.readerMode(p.nfc.FLAG_READER_NFC_A, () => {}, () => {}, { presenceCheckDelay: 250 });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sent)), [1, { presenceCheckDelay: 250 }]);
    p.nfc.readerMode(p.nfc.FLAG_READER_NFC_A, () => {});
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sent)), [1], 'old two-argument call changed');
});
