'use strict';
// PLU-219: transceive/connect failures reach JS with a code and a real message, and the
// GET_VERSION / READ_SIG / memory helpers pass them through instead of failing silently.
const test = require('node:test');
const assert = require('node:assert');
const { loadPlugin } = require('./load-plugin');

const TAG_LOST = { code: 'TAG_LOST', message: 'Tag was lost.' };
const NAK = { code: 'IO_ERROR', message: 'Transceive failed' };

test('object mode: pulling the tag during transceive rejects with {code:"TAG_LOST"}', async () => {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    p.native.on('transceive', (a, win, fail) => fail(TAG_LOST));
    await assert.rejects(p.nfc.transceive('3000'), e => e.code === 'TAG_LOST' && e.message === 'Tag was lost.');
});

test('object mode: getNtagVersion / readNtagSignature / readMemoryPages surface the transceive error code', async () => {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    p.native.on('transceive', (a, win, fail) => fail(NAK));
    await assert.rejects(p.nfc.getNtagVersion(), e => e.code === 'IO_ERROR' && e.message === 'Transceive failed');
    await assert.rejects(p.nfc.readNtagSignature(), e => e.code === 'IO_ERROR');
    await assert.rejects(p.nfc.readMemoryPages(0, 4), e => e.code === 'IO_ERROR');
});

test('legacy mode: a NAK\'d command rejects with a non-null message string', async () => {
    const p = loadPlugin();
    p.native.on('transceive', (a, win, fail) => fail(NAK));
    await assert.rejects(p.nfc.getNtagVersion(), e => e === 'Transceive failed');
});

test('connect failure: the code distinguishes tag-lost from unsupported tech', async () => {
    const p = loadPlugin();
    p.nfc.useErrorObjects(true);
    p.native.on('connect', (a, win, fail) => fail(a[0] === 'android.nfc.tech.MifareClassic'
        ? { code: 'UNSUPPORTED_TECH', message: 'Tag does not support android.nfc.tech.MifareClassic' }
        : TAG_LOST));
    await assert.rejects(p.nfc.connect('android.nfc.tech.MifareClassic'), e => e.code === 'UNSUPPORTED_TECH');
    await assert.rejects(p.nfc.connect('android.nfc.tech.NfcA'), e => e.code === 'TAG_LOST');
});
