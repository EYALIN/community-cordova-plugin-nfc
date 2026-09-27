'use strict';
// PLU-224: every runtime export of www/phonegap-nfc.js has a declaration in types/index.d.ts
// and every declared member exists at runtime. Uses the TypeScript compiler API to read the
// interfaces (members of NfcManager incl. inherited ones, INdefUtil, IUtil).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const ts = require('typescript');
const { loadPlugin } = require('./load-plugin');

const DTS = process.env.NFC_DTS_SOURCE || path.join(__dirname, '..', '..', 'types', 'index.d.ts');

function declaredMembers (interfaceName) {
    const program = ts.createProgram([DTS], { noEmit: true, types: [] });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(DTS);
    let found = null;
    ts.forEachChild(source, function visit (node) {
        if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) { found = node; }
    });
    assert.ok(found, 'interface ' + interfaceName + ' not declared');
    const type = checker.getTypeAtLocation(found);
    return checker.getPropertiesOfType(type).map(p => p.getName()).sort();
}

function compare (label, runtimeKeys, typedKeys) {
    const runtime = new Set(runtimeKeys);
    const typed = new Set(typedKeys);
    const untyped = [...runtime].filter(k => !typed.has(k)).sort();
    const phantom = [...typed].filter(k => !runtime.has(k)).sort();
    assert.deepStrictEqual({ untyped, phantom }, { untyped: [], phantom: [] },
        label + ': untyped = runtime exports missing from index.d.ts, phantom = declared but not in the runtime');
}

test('NfcManager (the NfcPlugin export) matches the runtime nfc object', () => {
    const { nfc } = loadPlugin();
    compare('NfcManager', Object.keys(nfc), declaredMembers('NfcManager'));
});

test('INdefUtil (NfcPlugin.NdefPlugin) matches the runtime ndef object', () => {
    const { nfc } = loadPlugin();
    compare('INdefUtil', Object.keys(nfc.NdefPlugin), declaredMembers('INdefUtil'));
});

test('IUtil (NfcPlugin.NfcUtil) matches the runtime util object', () => {
    const { nfc } = loadPlugin();
    compare('IUtil', Object.keys(nfc.NfcUtil), declaredMembers('IUtil'));
});

test('declared function members are functions at runtime and arity-compatible', () => {
    const { nfc } = loadPlugin();
    // remove*Listener take the callback first (1.7.x typings said (onSuccess, onError))
    assert.strictEqual(nfc.removeNdefListener.length, 3);
    assert.strictEqual(nfc.removeTagDiscoveredListener.length, 3);
    assert.strictEqual(nfc.NfcUtil.isType.length, 3);
    assert.strictEqual(typeof nfc.NdefPlugin.decodeTextRecord, 'function');
    assert.strictEqual(typeof nfc.NdefPlugin.decodeUriRecord, 'function');
});

test('decodeTextRecord / decodeUriRecord round-trip the record helpers', () => {
    const { nfc } = loadPlugin();
    const ndef = nfc.NdefPlugin;
    assert.strictEqual(ndef.decodeTextRecord(ndef.textRecord('hello NFC', 'en')), 'hello NFC');
    assert.strictEqual(ndef.decodeUriRecord(ndef.uriRecord('https://www.example.com/a')), 'https://www.example.com/a');
});

test('callback APIs return a Promise when called without callbacks, and settle with the native result', async () => {
    const p = loadPlugin();
    let done = false;
    p.native.on('writeTag', (args, win) => setTimeout(() => { done = true; win(); }, 5));
    const r = p.nfc.write([]);
    assert.ok(r && typeof r.then === 'function', 'write() without callbacks did not return a promise');
    await r;
    assert.ok(done, 'the promise resolved before native answered');
    p.native.on('enabled', (args, win, fail) => fail({ code: 'NFC_DISABLED', message: 'NFC_DISABLED' }));
    await assert.rejects(p.nfc.enabled(), e => e === 'NFC_DISABLED');
    // with callbacks: no promise (1.7.x behaviour)
    assert.strictEqual(p.nfc.erase(() => {}, () => {}), undefined);
});

test('a fire-and-forget promise call (nfc.showSettings()) that fails does not raise an unhandled rejection', async () => {
    const p = loadPlugin();
    p.native.on('showSettings', (args, win, fail) => fail({ code: 'UNKNOWN', message: 'no settings' }));
    let unhandled = null;
    const onUnhandled = (reason) => { unhandled = reason; };
    process.on('unhandledRejection', onUnhandled);
    p.nfc.showSettings();
    await new Promise(resolve => setTimeout(resolve, 20));
    process.removeListener('unhandledRejection', onUnhandled);
    assert.strictEqual(unhandled, null, 'unhandled rejection: ' + unhandled);
    await assert.rejects(p.nfc.showSettings(), e => e === 'no settings');
});
