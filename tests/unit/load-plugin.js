'use strict';
// Loads www/phonegap-nfc.js in a Node vm with just enough of Cordova and the DOM to exercise it.
// `native` is the fake bridge: register a handler per action to answer cordova.exec calls.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// NFC_JS_SOURCE lets the same tests run against an older copy of the file (to show a BEFORE).
const SOURCE = process.env.NFC_JS_SOURCE || path.join(__dirname, '..', '..', 'www', 'phonegap-nfc.js');

function loadPlugin (options) {
    const opts = options || {};
    const listeners = {};
    const calls = [];
    const handlers = {};
    let channelSuccess = null;

    const document = {
        addEventListener (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener (type, fn) {
            const list = listeners[type] || [];
            const i = list.indexOf(fn);
            if (i >= 0) { list.splice(i, 1); }
        },
        createEvent () { return { initEvent (type) { this.type = type; } }; },
        dispatchEvent (e) { (listeners[e.type] || []).slice().forEach(fn => fn(e)); }
    };

    const cordova = {
        platformId: opts.platform || 'android',
        exec (win, fail, service, action, args) {
            calls.push({ service, action, args });
            const h = handlers[action];
            if (!h) {
                if (fail) { fail('Class not found'); }
                return;
            }
            h(args || [], win || function () {}, fail || function () {});
        }
    };

    const sandbox = {
        console: opts.quiet === false ? console : { log () {}, warn () {}, error () {} },
        setTimeout,
        clearTimeout,
        Promise,
        Uint8Array,
        ArrayBuffer,
        DataView,
        BigInt,
        Error,
        document,
        cordova,
        module: { exports: {} },
        require (name) {
            if (name === 'cordova/channel') {
                return { onCordovaReady: { subscribe (fn) { fn(); } } };
            }
            if (name === 'cordova/exec') {
                return function (win, fail, service, action) {
                    if (action === 'channel') { channelSuccess = win; }
                };
            }
            throw new Error('unexpected require ' + name);
        }
    };
    sandbox.window = sandbox;
    if (opts.clock) {
        // a controllable Date.now() for time-dependent code (launch-tag expiry)
        sandbox.Date = { now: () => opts.clock.now };
    }
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), sandbox, { filename: 'phonegap-nfc.js' });

    return {
        nfc: sandbox.module.exports,
        window: sandbox,
        document,
        listeners,
        calls,
        /** native.on('transceive', (args, win, fail) => ...) */
        native: {
            on (action, fn) { handlers[action] = fn; return this; }
        },
        /** Simulate the native channel delivering an NFC event (as NfcPlugin.sendEvent does). */
        fireChannel (message) { channelSuccess(message); }
    };
}

module.exports = { loadPlugin };
