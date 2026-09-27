'use strict';
// PLU-225: NTAG helpers against a byte-accurate fake tag.
const test = require('node:test');
const assert = require('node:assert');
const { loadPlugin } = require('./load-plugin');
const { createTag, attach } = require('./fake-ntag');

function setup (type, opts) {
    const p = loadPlugin();
    const tag = attach(p, createTag(type, opts));
    return { p, nfc: p.nfc, tag };
}

for (const [type, pages] of [['NTAG213', 45], ['NTAG215', 135], ['NTAG216', 231], ['NTAG210', 20], ['NTAG212', 41]]) {
    test(`fullMemoryDump on ${type} returns exactly ${pages} pages, no rolled-over pages`, async () => {
        const { nfc, tag } = setup(type);
        await nfc.connect('android.nfc.tech.NfcA');
        const dump = await nfc.fullMemoryDump();
        assert.strictEqual(dump.success, true);
        assert.strictEqual(dump.tagType, type);
        assert.strictEqual(dump.totalPages, pages);
        assert.strictEqual(dump.memoryDump.byteLength, pages * 4, 'byteLength');
        const bytes = new Uint8Array(dump.memoryDump);
        // the last page is really the last page (config / PACK), not page 0-2 rolled over
        assert.deepStrictEqual(Array.from(bytes.slice((pages - 1) * 4)), [0, 0, 0, 0]);
        assert.deepStrictEqual(Array.from(bytes.slice(0, 3)), tag.uid.slice(0, 3));
        assert.strictEqual(dump.hexDump.length, pages * 8);
    });
}

test('readMemoryPages returns exactly numPages*4 bytes from any start page', async () => {
    const { nfc, tag } = setup('NTAG213');
    await nfc.connect('android.nfc.tech.NfcA');
    const all = new Uint8Array(await nfc.readMemoryPages(0, 45));
    assert.strictEqual(all.length, 180);
    const tail = new Uint8Array(await nfc.readMemoryPages(40, 5));
    assert.strictEqual(tail.length, 20);
    assert.deepStrictEqual(Array.from(tail.slice(0, 4)), tag.page(40));
    const one = new Uint8Array(await nfc.readMemoryPages(6, 1));
    assert.deepStrictEqual(Array.from(one), tag.page(6));
});

test('getPasswordProtectionStatus() reads the right config page per IC (NTAG215 CFG0 = 0x83)', async () => {
    const { nfc, tag } = setup('NTAG215');
    tag.setAuth0(0x10);                       // write-protected from page 0x10, reads open
    await nfc.connect('android.nfc.tech.NfcA');
    const s = await nfc.getPasswordProtectionStatus();
    assert.strictEqual(s.protectionStartPage, 0x10);
    assert.strictEqual(s.isProtected, true);
    assert.strictEqual(s.writeProtected, true);
    assert.strictEqual(s.readProtected, false);
    assert.strictEqual(s.configPage, 0x83);
    const reads = tag.received.filter(c => c[0] === 0x30).map(c => c[1]);
    assert.deepStrictEqual(reads, [0x83], 'read pages ' + reads);
});

test('getPasswordProtectionStatus(): read-protected config pages (PROT=1) report read+write protection and re-select the tag', async () => {
    const { nfc, tag } = setup('NTAG215');
    tag.setAuth0(0x10);
    tag.setProt(true);
    await nfc.connect('android.nfc.tech.NfcA');
    const s = await nfc.getPasswordProtectionStatus();
    assert.strictEqual(s.isProtected, true);
    assert.strictEqual(s.readProtected, true);
    assert.strictEqual(s.writeProtected, true);
    assert.strictEqual(s.configReadable, false);
    assert.ok(tag.connects >= 2, 'tag not re-selected after the NAK');
    // and the tag answers again afterwards
    const v = await nfc.getNtagVersion();
    assert.strictEqual(v.icType, 'NTAG215');
});

test('getPasswordProtectionStatus(): an unprotected NTAG216 reports write/read unprotected', async () => {
    const { nfc } = setup('NTAG216');
    await nfc.connect('android.nfc.tech.NfcA');
    const s = await nfc.getPasswordProtectionStatus();
    assert.strictEqual(s.protectionStartPage, 0xFF);
    assert.strictEqual(s.isProtected, false);
    assert.strictEqual(s.writeProtected, false);
    assert.strictEqual(s.readProtected, false);
});

test('getPasswordProtectionStatus(): write-only protection (PROT=0) is not reported as read-protected', async () => {
    const { nfc, tag } = setup('NTAG213');
    tag.setAuth0(0x04);
    await nfc.connect('android.nfc.tech.NfcA');
    const s = await nfc.getPasswordProtectionStatus();
    assert.strictEqual(s.isProtected, true);
    assert.strictEqual(s.writeProtected, true);
    assert.strictEqual(s.readProtected, false);
});

test('fullMemoryDump: a read failure after GET_VERSION rejects with the error, it is not relabelled "MIFARE Ultralight"', async () => {
    const { nfc } = setup('NTAG215', { lostAtRead: 8 });
    await nfc.connect('android.nfc.tech.NfcA');
    await assert.rejects(nfc.fullMemoryDump(), r => {
        assert.notStrictEqual(r.tagType, 'MIFARE Ultralight (Classic)');
        assert.strictEqual(r.success, false);
        assert.ok(r.error, 'no error on the rejection');
        return true;
    });
});

test('fullMemoryDump: an original MIFARE Ultralight (GET_VERSION refused) re-selects the tag and dumps 16 pages', async () => {
    const { nfc, tag } = setup('ULTRALIGHT');
    await nfc.connect('android.nfc.tech.NfcA');
    const dump = await nfc.fullMemoryDump();
    assert.strictEqual(dump.success, true);
    assert.match(dump.tagType, /MIFARE Ultralight/);
    assert.strictEqual(dump.totalPages, 16);
    assert.strictEqual(dump.memoryDump.byteLength, 64);
    assert.ok(tag.connects >= 2, 'the halted tag was not re-selected after the NAK');
});

test('NTAG I2C (storage size 0x13) is not mistaken for an NTAG216', async () => {
    const { nfc } = setup('NTAG_I2C_1K');
    await nfc.connect('android.nfc.tech.NfcA');
    const v = await nfc.getNtagVersion();
    assert.notStrictEqual(v.icType, 'NTAG216');
});

test('transceive(Uint8Array view) sends only the view\'s bytes', async () => {
    const { nfc, tag } = setup('NTAG213');
    await nfc.connect('android.nfc.tech.NfcA');
    const backing = new Uint8Array([0xEE, 0xEE, 0x30, 0x04, 0xEE]);
    await nfc.transceive(backing.subarray(2, 4));
    assert.deepStrictEqual(tag.received[tag.received.length - 1], [0x30, 0x04]);
});

test('transceive(invalid) rejects and never reaches native', async () => {
    const p = loadPlugin();
    await assert.rejects(p.nfc.transceive(12345));
    assert.strictEqual(p.calls.filter(c => c.action === 'transceive').length, 0);
});
