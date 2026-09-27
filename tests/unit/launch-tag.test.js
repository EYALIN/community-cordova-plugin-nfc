'use strict';
// PLU-231: the tag that launched the app (background reading) reaches the app's listener even
// though the listener is registered after the native event arrived.
const test = require('node:test');
const assert = require('node:assert');
const { loadPlugin } = require('./load-plugin');

function setup () {
    const p = loadPlugin();
    for (const a of ['registerNdef', 'registerTag', 'registerMimeType', 'registerNdefFormatable', 'removeNdef', 'removeTag']) {
        p.native.on(a, (args, win) => win());
    }
    return p;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const TAG = { id: [4, 1, 2, 3], techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.Ndef'], ndefMessage: [] };

test('[PLU-231] a launch NDEF tag that arrives before any listener is delivered to the first addNdefListener', async () => {
    const p = setup();
    p.fireChannel({ type: 'ndef', tag: TAG, launch: true });
    const got = [];
    p.nfc.addNdefListener(e => got.push(e), () => {}, () => {});
    await tick();
    assert.strictEqual(got.length, 1);
    assert.deepStrictEqual(got[0].tag, TAG);
    assert.strictEqual(got[0].launch, true);
});

test('[PLU-231] a launch tag matched by an NDEF_DISCOVERED filter (ndef-mime) also reaches an NDEF listener', async () => {
    const p = setup();
    p.fireChannel({ type: 'ndef-mime', tag: TAG, launch: true });
    const got = [];
    p.nfc.addNdefListener(e => got.push(e));
    await tick();
    assert.strictEqual(got.length, 1);
});

test('[PLU-231] a launch non-NDEF tag reaches addTagDiscoveredListener, not the NDEF listener', async () => {
    const p = setup();
    p.fireChannel({ type: 'tag', tag: { id: [1], techTypes: ['android.nfc.tech.NfcV'] }, launch: true });
    const ndef = []; const tags = [];
    p.nfc.addNdefListener(e => ndef.push(e));
    p.nfc.addTagDiscoveredListener(e => tags.push(e));
    await tick();
    assert.strictEqual(ndef.length, 0);
    assert.strictEqual(tags.length, 1);
});

test('[PLU-231] the launch tag is delivered once, and not replayed when a listener was already registered', async () => {
    const p = setup();
    const first = []; const second = [];
    p.nfc.addNdefListener(e => first.push(e));
    p.fireChannel({ type: 'ndef', tag: TAG, launch: true });
    p.nfc.addNdefListener(e => second.push(e));
    await tick();
    assert.strictEqual(first.length, 1, 'registered listener got it through the normal event');
    assert.strictEqual(second.length, 0, 'replayed to a second listener');
});

test('[PLU-231] a launch tag older than 30 s is dropped', async () => {
    const clock = { now: 1000000 };
    const p = loadPlugin({ clock });
    p.native.on('registerNdef', (args, win) => win());
    p.fireChannel({ type: 'ndef', tag: TAG, launch: true });
    clock.now += 31000;
    const got = [];
    p.nfc.addNdefListener(e => got.push(e));
    await tick();
    assert.strictEqual(got.length, 0);
});

test('[PLU-231] ordinary (non-launch) tags are never replayed to later listeners', async () => {
    const p = setup();
    p.fireChannel({ type: 'ndef', tag: TAG });
    const got = [];
    p.nfc.addNdefListener(e => got.push(e));
    await tick();
    assert.strictEqual(got.length, 0);
});

test('[PLU-231] NDEF listener registered in deviceready BEFORE the launch tag (the designed boot order) receives an ndef-mime launch tag', async () => {
    const p = setup();
    const got = [];
    p.nfc.addNdefListener(e => got.push(e));         // app's deviceready handler runs first
    p.fireChannel({ type: 'ndef-mime', tag: TAG, launch: true });   // then init() -> launch intent
    await tick();
    assert.strictEqual(got.length, 1, 'launch tag lost');
    assert.strictEqual(got[0].launch, true);
});

test('[PLU-231] a mime listener and an NDEF listener both registered: the ndef-mime launch tag reaches the mime listener only once, not twice', async () => {
    const p = setup();
    const mime = []; const ndef = [];
    p.nfc.addMimeTypeListener('text/plain', e => mime.push(e));
    p.nfc.addNdefListener(e => ndef.push(e));
    p.fireChannel({ type: 'ndef-mime', tag: TAG, launch: true });
    await tick();
    assert.strictEqual(mime.length, 1);
    assert.strictEqual(ndef.length, 0);
});
