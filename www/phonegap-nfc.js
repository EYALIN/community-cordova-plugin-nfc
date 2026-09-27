
function handleNfcFromIntentFilter() {

    // This was historically done in cordova.addConstructor but broke with PhoneGap-2.2.0.
    // We need to handle NFC from an Intent that launched the application, but *after*
    // the code in the application's deviceready has run.  After upgrading to 2.2.0,
    // addConstructor was finishing *before* deviceReady was complete and the
    // ndef listeners had not been registered.
    // It seems like there should be a better solution.
    if (cordova.platformId === "android" || cordova.platformId === "windows") {
        setTimeout(
            function () {
                cordova.exec(
                    function () {
                        console.log("Initialized the NfcPlugin");
                    },
                    function (reason) {
                        console.log("Failed to initialize the NfcPlugin " + (reason && reason.message ? reason.message : reason));
                    },
                    "NfcPlugin", "init", []
                );
            }, 10
        );
    }
}

document.addEventListener('deviceready', handleNfcFromIntentFilter, false);

// ------------------------------------------------------------------ launch tag (1.8.0)
// With NFC_INTENT_FILTERS set, Android can start the app from a tag. That tag arrives (marked
// launch:true) right after deviceready, usually before the app has registered its listener, so it
// is kept for 30 seconds and handed to the first matching add*Listener.
var LAUNCH_TAG_TTL_MS = 30000;
var LAUNCH_TAG_TYPES = {
    'ndef': ['ndef', 'ndef-mime'],        // an NDEF listener also gets a tag that matched an NDEF_DISCOVERED filter
    'ndef-mime': ['ndef-mime'],
    'ndef-formatable': ['ndef-formatable'],
    'tag': ['tag']
};
var registeredListeners = { 'ndef': [], 'ndef-mime': [], 'ndef-formatable': [], 'tag': [] };
var pendingLaunchEvent = null;

// Listeners registered through a DIFFERENT add*Listener that should still see a launch event of
// this type (an NDEF listener for a tag matched by an NDEF_DISCOVERED filter, event 'ndef-mime').
function compatibleListeners(eventType) {
    var found = [];
    for (var listenerType in LAUNCH_TAG_TYPES) {
        if (listenerType !== eventType && LAUNCH_TAG_TYPES[listenerType].indexOf(eventType) !== -1) {
            found = found.concat(registeredListeners[listenerType]);
        }
    }
    return found;
}

function launchEvent(type, tag) {
    var e = document.createEvent('Events');
    e.initEvent(type);
    e.tag = tag;
    e.launch = true;
    return e;
}

// A launch tag goes to the listeners registered for its exact type through the normal event; if
// there are none, to the compatible ones; if there are none either, it waits for the first one.
function deliverLaunchTag(message) {
    if (registeredListeners[message.type] && registeredListeners[message.type].length) {
        return;
    }
    var compatible = compatibleListeners(message.type);
    if (compatible.length) {
        compatible.forEach(function (callback) {
            setTimeout(function () { callback(launchEvent(message.type, message.tag)); }, 0);
        });
        return;
    }
    pendingLaunchEvent = { type: message.type, tag: message.tag, at: Date.now() };
}

function addListener(type, callback) {
    document.addEventListener(type, callback, false);
    if (typeof callback === 'function' && registeredListeners[type].indexOf(callback) === -1) {
        registeredListeners[type].push(callback);
    }
    var pending = pendingLaunchEvent;
    if (pending && typeof callback === 'function' && LAUNCH_TAG_TYPES[type].indexOf(pending.type) !== -1) {
        pendingLaunchEvent = null;
        if (Date.now() - pending.at <= LAUNCH_TAG_TTL_MS) {
            setTimeout(function () {
                callback(launchEvent(pending.type, pending.tag));
            }, 0);
        }
    }
}

function removeListener(type, callback) {
    document.removeEventListener(type, callback, false);
    var i = registeredListeners[type].indexOf(callback);
    if (i !== -1) {
        registeredListeners[type].splice(i, 1);
    }
}

// ------------------------------------------------------------------ errors (1.8.0)
// Native code rejects with {code, message}. By default the failure callback / promise rejection
// still receives the plain message string, exactly as in 1.7.x, so existing string checks keep
// working. Call nfc.useErrorObjects(true) to receive NfcError objects ({name, code, message}) instead.
var useErrorObjects = false;

function NfcError(code, message, details) {
    this.name = 'NfcError';
    this.code = code;
    this.message = message;
    if (details && typeof details === 'object') {
        for (var key in details) {
            if (Object.prototype.hasOwnProperty.call(details, key) && key !== 'code' && key !== 'message') {
                this[key] = details[key];
            }
        }
    }
    if (typeof Error.captureStackTrace === 'function') {
        Error.captureStackTrace(this, NfcError);
    }
}
NfcError.prototype = Object.create(Error.prototype);
NfcError.prototype.constructor = NfcError;
NfcError.prototype.toString = function () { return this.message; };

function isNativeError(err) {
    return !!err && typeof err === 'object' && !(err instanceof NfcError) &&
        typeof err.code !== 'undefined' && typeof err.message !== 'undefined';
}

// Build the error value the app receives, honouring nfc.useErrorObjects().
function toAppError(err) {
    var code, message, details;
    if (err instanceof NfcError) {
        code = err.code; message = err.message; details = err;
    } else if (isNativeError(err)) {
        code = err.code; message = err.message; details = err;
    } else {
        if (!useErrorObjects) { return err; }
        code = 'UNKNOWN';
        message = (err === null || typeof err === 'undefined') ? 'Unknown NFC error' : String(err);
    }
    if (!useErrorObjects) { return message; }
    return new NfcError(code, message === null || typeof message === 'undefined' ? String(code) : String(message), details);
}

function wrapFailure(fail) {
    if (typeof fail !== 'function') { return fail; }
    return function (err) { fail(toAppError(err)); };
}

function nfcExec(win, fail, action, args) {
    cordova.exec(win, wrapFailure(fail), 'NfcPlugin', action, args || []);
}

// The callback-style APIs also return a Promise when they are called WITHOUT callbacks (1.8.0),
// so `await nfc.write(message)` really waits for the tag. With callbacks they behave as before.
function execOrPromise(win, fail, action, args) {
    if (typeof win !== 'function' && typeof fail !== 'function') {
        var promise = new Promise(function (resolve, reject) {
            nfcExec(resolve, reject, action, args);
        });
        // 1.7.x callers invoke these fire-and-forget (e.g. nfc.showSettings()); keep a failure there
        // from surfacing as an unhandled rejection. Callers that await still get the rejection.
        promise.catch(function () {});
        return promise;
    }
    nfcExec(win, fail, action, args);
}

var ndef = {

    // see android.nfc.NdefRecord for documentation about constants
    // http://developer.android.com/reference/android/nfc/NdefRecord.html
    TNF_EMPTY: 0x0,
    TNF_WELL_KNOWN: 0x01,
    TNF_MIME_MEDIA: 0x02,
    TNF_ABSOLUTE_URI: 0x03,
    TNF_EXTERNAL_TYPE: 0x04,
    TNF_UNKNOWN: 0x05,
    TNF_UNCHANGED: 0x06,
    TNF_RESERVED: 0x07,

    RTD_TEXT: [0x54], // "T"
    RTD_URI: [0x55], // "U"
    RTD_SMART_POSTER: [0x53, 0x70], // "Sp"
    RTD_ALTERNATIVE_CARRIER: [0x61, 0x63], // "ac"
    RTD_HANDOVER_CARRIER: [0x48, 0x63], // "Hc"
    RTD_HANDOVER_REQUEST: [0x48, 0x72], // "Hr"
    RTD_HANDOVER_SELECT: [0x48, 0x73], // "Hs"

    /**
     * Creates a JSON representation of a NDEF Record.
     *
     * @tnf 3-bit TNF (Type Name Format) - use one of the TNF_* constants
     * @type byte array, containing zero to 255 bytes, must not be null
     * @id byte array, containing zero to 255 bytes, must not be null
     * @payload byte array, containing zero to (2 ** 32 - 1) bytes, must not be null
     *
     * @returns JSON representation of a NDEF record
     *
     * @see Ndef.textRecord, Ndef.uriRecord and Ndef.mimeMediaRecord for examples
     */
    record: function (tnf, type, id, payload) {

        // handle null values
        if (!tnf) { tnf = ndef.TNF_EMPTY; }
        if (!type) { type = []; }
        if (!id) { id = []; }
        if (!payload) { payload = []; }

        // convert strings to arrays
        if (!Array.isArray(type)) {
            type = nfc.stringToBytes(type);
        }
        if (!Array.isArray(id)) {
            id = nfc.stringToBytes(id);
        }
        if (!Array.isArray(payload)) {
            payload = nfc.stringToBytes(payload);
        }

        return {
            tnf: tnf,
            type: type,
            id: id,
            payload: payload
        };
    },

    /**
     * Helper that creates an NDEF record containing plain text.
     *
     * @text String of text to encode
     * @languageCode ISO/IANA language code. Examples: “fi”, “en-US”, “fr- CA”, “jp”. (optional)
     * @id byte[] (optional)
     */
    textRecord: function (text, languageCode, id) {
        var payload = textHelper.encodePayload(text, languageCode);
        if (!id) { id = []; }
        return ndef.record(ndef.TNF_WELL_KNOWN, ndef.RTD_TEXT, id, payload);
    },

    /**
     * Helper that creates a NDEF record containing a URI.
     *
     * @uri String
     * @id byte[] (optional)
     */
    uriRecord: function (uri, id) {
        var payload = uriHelper.encodePayload(uri);
        if (!id) { id = []; }
        return ndef.record(ndef.TNF_WELL_KNOWN, ndef.RTD_URI, id, payload);
    },

    /**
     * Helper that creates a NDEF record containing an absolute URI.
     *
     * An Absolute URI record means the URI describes the payload of the record.
     *
     * For example a SOAP message could use "http://schemas.xmlsoap.org/soap/envelope/"
     * as the type and XML content for the payload.
     *
     * Absolute URI can also be used to write LaunchApp records for Windows.
     *
     * See 2.4.2 Payload Type of the NDEF Specification
     * http://www.nfc-forum.org/specs/spec_list#ndefts
     *
     * Note that by default, Android will open the URI defined in the type
     * field of an Absolute URI record (TNF=3) and ignore the payload.
     * BlackBerry and Windows do not open the browser for TNF=3.
     *
     * To write a URI as the payload use ndef.uriRecord(uri)
     *
     * @uri String
     * @payload byte[] or String
     * @id byte[] (optional)
     */
    absoluteUriRecord: function (uri, payload, id) {
        if (!id) { id = []; }
        if (!payload) { payload = []; }
        return ndef.record(ndef.TNF_ABSOLUTE_URI, uri, id, payload);
    },

    /**
     * Helper that creates a NDEF record containing an mimeMediaRecord.
     *
     * @mimeType String
     * @payload byte[]
     * @id byte[] (optional)
     */
    mimeMediaRecord: function (mimeType, payload, id) {
        if (!id) { id = []; }
        return ndef.record(ndef.TNF_MIME_MEDIA, nfc.stringToBytes(mimeType), id, payload);
    },

    /**
     * Helper that creates an NDEF record containing an Smart Poster.
     *
     * @ndefRecords array of NDEF Records
     * @id byte[] (optional)
     */
    smartPoster: function (ndefRecords, id) {
        var payload = [];

        if (!id) { id = []; }

        if (ndefRecords)
        {
            // make sure we have an array of something like NDEF records before encoding
            if (ndefRecords[0] instanceof Object && Object.prototype.hasOwnProperty.call(ndefRecords[0], 'tnf')) {
                payload = ndef.encodeMessage(ndefRecords);
            } else {
                // assume the caller has already encoded the NDEF records into a byte array
                payload = ndefRecords;
            }
        } else {
            console.log("WARNING: Expecting an array of NDEF records");
        }

        return ndef.record(ndef.TNF_WELL_KNOWN, ndef.RTD_SMART_POSTER, id, payload);
    },

    /**
     * Helper that creates an empty NDEF record.
     *
     */
    emptyRecord: function() {
        return ndef.record(ndef.TNF_EMPTY, [], [], []);
    },

    /**
     * Helper that creates an Android Application Record (AAR).
     * http://developer.android.com/guide/topics/connectivity/nfc/nfc.html#aar
     *
     */
    androidApplicationRecord: function(packageName) {
        return ndef.record(ndef.TNF_EXTERNAL_TYPE, "android.com:pkg", [], packageName);
    },

    /**
     * Encodes an NDEF Message into bytes that can be written to a NFC tag.
     *
     * @ndefRecords an Array of NDEF Records
     *
     * @returns byte array
     *
     * @see NFC Data Exchange Format (NDEF) http://www.nfc-forum.org/specs/spec_list/
     */
    encodeMessage: function (ndefRecords) {

        var encoded = [],
            tnf_byte,
            type_length,
            payload_length,
            id_length,
            i,
            mb, me, // messageBegin, messageEnd
            cf = false, // chunkFlag TODO implement
            sr, // boolean shortRecord
            il; // boolean idLengthFieldIsPresent

        for(i = 0; i < ndefRecords.length; i++) {

            mb = (i === 0);
            me = (i === (ndefRecords.length - 1));
            sr = (ndefRecords[i].payload.length < 0xFF);
            il = (ndefRecords[i].id.length > 0);
            tnf_byte = ndef.encodeTnf(mb, me, cf, sr, il, ndefRecords[i].tnf);
            encoded.push(tnf_byte);

            type_length = ndefRecords[i].type.length;
            encoded.push(type_length);

            if (sr) {
                payload_length = ndefRecords[i].payload.length;
                encoded.push(payload_length);
            } else {
                payload_length = ndefRecords[i].payload.length;
                // 4 bytes
                encoded.push((payload_length >> 24));
                encoded.push((payload_length >> 16));
                encoded.push((payload_length >> 8));
                encoded.push((payload_length & 0xFF));
            }

            if (il) {
                id_length = ndefRecords[i].id.length;
                encoded.push(id_length);
            }

            encoded = encoded.concat(ndefRecords[i].type);

            if (il) {
                encoded = encoded.concat(ndefRecords[i].id);
            }

            encoded = encoded.concat(ndefRecords[i].payload);
        }

        return encoded;
    },

    /**
     * Decodes an array bytes into an NDEF Message
     *
     * @bytes an array bytes read from a NFC tag
     *
     * @returns array of NDEF Records
     *
     * @see NFC Data Exchange Format (NDEF) http://www.nfc-forum.org/specs/spec_list/
     */
    decodeMessage: function (ndefBytes) {

        var bytes = ndefBytes.slice(0), // clone since parsing is destructive
            ndef_message = [],
            tnf_byte,
            header,
            type_length = 0,
            payload_length = 0,
            id_length = 0,
            record_type = [],
            id = [],
            payload = [];

        while(bytes.length) {
            tnf_byte = bytes.shift();
            header = ndef.decodeTnf(tnf_byte);

            type_length = bytes.shift();

            if (header.sr) {
                payload_length = bytes.shift();
            } else {
                // next 4 bytes are length
                payload_length = ((0xFF & bytes.shift()) << 24) |
                    ((0xFF & bytes.shift()) << 26) |
                    ((0xFF & bytes.shift()) << 8) |
                    (0xFF & bytes.shift());
            }

            if (header.il) {
                id_length = bytes.shift();
            }

            record_type = bytes.splice(0, type_length);
            id = bytes.splice(0, id_length);
            payload = bytes.splice(0, payload_length);

            ndef_message.push(
                ndef.record(header.tnf, record_type, id, payload)
            );

            if (header.me) { break; } // last message
        }

        return ndef_message;
    },

    /**
     * Decode the bit flags from a TNF Byte.
     *
     * @returns object with decoded data
     *
     *  See NFC Data Exchange Format (NDEF) Specification Section 3.2 RecordLayout
     */
    decodeTnf: function (tnf_byte) {
        return {
            mb: (tnf_byte & 0x80) !== 0,
            me: (tnf_byte & 0x40) !== 0,
            cf: (tnf_byte & 0x20) !== 0,
            sr: (tnf_byte & 0x10) !== 0,
            il: (tnf_byte & 0x8) !== 0,
            tnf: (tnf_byte & 0x7)
        };
    },

    /**
     * Encode NDEF bit flags into a TNF Byte.
     *
     * @returns tnf byte
     *
     *  See NFC Data Exchange Format (NDEF) Specification Section 3.2 RecordLayout
     */
    encodeTnf: function (mb, me, cf, sr, il, tnf) {

        var value = tnf;

        if (mb) {
            value = value | 0x80;
        }

        if (me) {
            value = value | 0x40;
        }

        // note if cf: me, mb, li must be false and tnf must be 0x6
        if (cf) {
            value = value | 0x20;
        }

        if (sr) {
            value = value | 0x10;
        }

        if (il) {
            value = value | 0x8;
        }

        return value;
    },

    /**
     * Decode the text of an NFC Forum Text record (RTD "T").
     */
    decodeTextRecord: function (record) {
        return textHelper.decodePayload(record.payload);
    },

    /**
     * Decode the URI of an NFC Forum URI record (RTD "U"), expanding the prefix code.
     */
    decodeUriRecord: function (record) {
        return uriHelper.decodePayload(record.payload);
    },

    /**
     * Convert TNF to String for user friendly display
     *
     */
    tnfToString: function (tnf) {
        var value = tnf;

        switch (tnf) {
            case ndef.TNF_EMPTY:
                value = "Empty";
                break;
            case ndef.TNF_WELL_KNOWN:
                value = "Well Known";
                break;
            case ndef.TNF_MIME_MEDIA:
                value = "Mime Media";
                break;
            case ndef.TNF_ABSOLUTE_URI:
                value = "Absolute URI";
                break;
            case ndef.TNF_EXTERNAL_TYPE:
                value = "External";
                break;
            case ndef.TNF_UNKNOWN:
                value = "Unknown";
                break;
            case ndef.TNF_UNCHANGED:
                value = "Unchanged";
                break;
            case ndef.TNF_RESERVED:
                value = "Reserved";
                break;
        }
        return value;
    }

};

// nfc provides javascript wrappers to the native phonegap implementation
var nfc = {
    
    addTagDiscoveredListener: function (callback, win, fail) {
        addListener("tag", callback);
        return execOrPromise(win, fail, "registerTag", []);
    },

    addMimeTypeListener: function (mimeType, callback, win, fail) {
        addListener("ndef-mime", callback);
        return execOrPromise(win, fail, "registerMimeType", [mimeType]);
    },

    addNdefListener: function (callback, win, fail) {
        addListener("ndef", callback);
        return execOrPromise(win, fail, "registerNdef", []);
    },

    addNdefFormatableListener: function (callback, win, fail) {
        addListener("ndef-formatable", callback);
        return execOrPromise(win, fail, "registerNdefFormatable", []);
    },

    write: function (ndefMessage, win, fail, options) {      
        
        if (cordova.platformId === "ios") {
            return execOrPromise(win, fail, "writeTag", [ndefMessage, options]);
        }
        return execOrPromise(win, fail, "writeTag", [ndefMessage]);
    },

    makeReadOnly: function (win, fail) {
        return execOrPromise(win, fail, "makeReadOnly", []);
    },

    share: function (ndefMessage, win, fail) {
        return execOrPromise(win, fail, "shareTag", [ndefMessage]);
    },

    unshare: function (win, fail) {
        return execOrPromise(win, fail, "unshareTag", []);
    },

    handover: function (uris, win, fail) {
        // if we get a single URI, wrap it in an array
        if (!Array.isArray(uris)) {
            uris = [ uris ];
        }
        return execOrPromise(win, fail, "handover", uris);
    },

    stopHandover: function (win, fail) {
        return execOrPromise(win, fail, "stopHandover", []);
    },

    erase: function (win, fail) {
        return execOrPromise(win, fail, "eraseTag", [[]]);
    },

    enabled: function (win, fail) {
        return execOrPromise(win, fail, "enabled", [[]]);
    },

    removeTagDiscoveredListener: function (callback, win, fail) {
        removeListener("tag", callback);
        return execOrPromise(win, fail, "removeTag", []);
    },

    removeMimeTypeListener: function(mimeType, callback, win, fail) {
        removeListener("ndef-mime", callback);
        return execOrPromise(win, fail, "removeMimeType", [mimeType]);
    },

    removeNdefListener: function (callback, win, fail) {
        removeListener("ndef", callback);
        return execOrPromise(win, fail, "removeNdef", []);
    },

    showSettings: function (win, fail) {
        return execOrPromise(win, fail, "showSettings", []);
    },

    // iOS only - scan for NFC NDEF tag using NFCNDEFReaderSession
    scanNdef: function (options) {
        return new Promise(function(resolve, reject) {
            nfcExec(resolve, reject, "scanNdef", [options]);
        });
    },

    // iOS only - scan for NFC Tag using NFCTagReaderSession
    scanTag: function (options) {
        return new Promise(function(resolve, reject) {
            nfcExec(resolve, reject, "scanTag", [options]);
        });
    },
    
    // iOS only - cancel NFC scan session
    cancelScan: function () {
        return new Promise(function(resolve, reject) {
            nfcExec(resolve, reject, "cancelScan", []);
        });
    },

    // iOS only - deprecated use scanNdef or scanTag
    beginSession: function (win, fail) {
        return execOrPromise(win, fail, "beginSession", []);
    },

    // iOS only - deprecated use cancelScan
    invalidateSession: function (win, fail) {
        return execOrPromise(win, fail, "invalidateSession", []);
    },

    // connect to begin transceive
    // Android resolves with {maxTransceiveLength} when the technology reports one.
    connect: function(tech, timeout) {
        return toAppPromise(rawExec('connect', [tech, timeout]).then(function (result) {
            lastConnection = { tech: tech, timeout: timeout };
            return result;
        }));
    },

    // close transceive connection
    close: function() {
        lastConnection = null;
        return toAppPromise(rawExec('close', []));
    },

    // data - ArrayBuffer, Uint8Array (only the view's bytes are sent), array of byte values,
    // or a hex string. Resolves with the response as an ArrayBuffer.
    transceive: function(data) {
        return toAppPromise(rawTransceive(data));
    },

    /**
     * Opt in to structured errors: failure callbacks and promise rejections receive an NfcError
     * ({name:'NfcError', code, message}) instead of the legacy message string.
     * Android codes: TAG_LOST, TAG_STALE, IO_ERROR, FORMAT_ERROR, ILLEGAL_STATE, NO_TAG, NOT_CONNECTED,
     * UNSUPPORTED_TECH, READ_ONLY, CAPACITY_EXCEEDED, NOT_NDEF, INVALID_ARGUMENT, NOT_SUPPORTED,
     * AUTH_FAILED, NO_NFC, NFC_DISABLED, UNKNOWN. iOS reader-session errors carry the numeric
     * NFCReaderError code (200 = user cancelled, 201 = timeout, ...) - see nfc.IOS_ERROR.
     */
    useErrorObjects: function (enabled) {
        useErrorObjects = enabled !== false;
        return useErrorObjects;
    },

    NfcError: NfcError,

    // iOS NFCReaderError codes, found in error.code of iOS reader-session errors when
    // nfc.useErrorObjects(true) is on (e.g. error.code === nfc.IOS_ERROR.USER_CANCELED).
    IOS_ERROR: {
        UNSUPPORTED_FEATURE: 1,
        SECURITY_VIOLATION: 2,
        INVALID_PARAMETER: 3,
        INVALID_PARAMETER_LENGTH: 4,
        PARAMETER_OUT_OF_BOUND: 5,
        RADIO_DISABLED: 6,
        TAG_CONNECTION_LOST: 100,
        RETRY_EXCEEDED: 101,
        TAG_RESPONSE_ERROR: 102,
        SESSION_INVALIDATED: 103,
        TAG_NOT_CONNECTED: 104,
        PACKET_TOO_LONG: 105,
        USER_CANCELED: 200,
        SESSION_TIMEOUT: 201,
        SESSION_TERMINATED_UNEXPECTEDLY: 202,
        SYSTEM_IS_BUSY: 203,
        FIRST_NDEF_TAG_READ: 204,
        TAG_COMMAND_CONFIGURATION_INVALID_PARAMETERS: 300,
        NDEF_TAG_NOT_WRITABLE: 400,
        NDEF_TAG_UPDATE_FAILURE: 401,
        NDEF_TAG_SIZE_TOO_SMALL: 402,
        NDEF_ZERO_LENGTH_MESSAGE: 403
    },

    // Android NfcAdapter.enableReaderMode flags 
    FLAG_READER_NFC_A: 0x1,
    FLAG_READER_NFC_B: 0x2,
    FLAG_READER_NFC_F: 0x4,
    FLAG_READER_NFC_V: 0x8,
    FLAG_READER_NFC_BARCODE: 0x10,
    FLAG_READER_SKIP_NDEF_CHECK: 0x80,
    FLAG_READER_NO_PLATFORM_SOUNDS: 0x100,
    
    // Android NfcAdapter.enabledReaderMode
    // options.presenceCheckDelay (ms, 1.8.0): time between the adapter's presence checks while a
    // tag is in the field (Android default ~125 ms).
    readerMode: function(flags, readCallback, errorCallback, options) {
        var args = options ? [flags, options] : [flags];
        nfcExec(readCallback, errorCallback, 'readerMode', args);
    },

    // ============================================================
    // NFC adapter state (Android, 1.8.0)
    // ============================================================

    /**
     * callback({state: 'on'|'off'|'turning_on'|'turning_off', enabled, initial}) is called with the
     * current state right away and then on every change - also while NFC is off, which is when an
     * app needs it. One listener at a time; a new call replaces the previous one.
     */
    addStateChangeListener: function (callback, fail) {
        if (cordova.platformId !== 'android') {
            if (typeof fail === 'function') { fail(toAppError(nativeError('NOT_SUPPORTED', 'NFC state events are Android only'))); }
            return;
        }
        nfcExec(callback, fail, 'registerStateChange', []);
    },

    removeStateChangeListener: function (win, fail) {
        if (cordova.platformId !== 'android') {
            if (typeof win === 'function') { win(); }
            return typeof win === 'function' || typeof fail === 'function' ? undefined : Promise.resolve();
        }
        return execOrPromise(win, fail, 'removeStateChange', []);
    },

    // ============================================================
    // MIFARE Classic (Android, after nfc.connect('android.nfc.tech.MifareClassic'), 1.8.0)
    // ============================================================

    /** Authenticate a sector with a 6-byte key (hex string, byte array or Uint8Array); keyType 'A' (default) or 'B'. */
    mifareClassicAuthenticate: function (sector, key, keyType) {
        var buffer = toCommandBuffer(key);
        if (!buffer || buffer.byteLength !== 6) {
            return Promise.reject(toAppError(nativeError('INVALID_ARGUMENT', 'A MIFARE Classic key is 6 bytes')));
        }
        return toAppPromise(rawExec('mifareClassicAuthenticate', [sector, buffer, keyType === 'B' ? 'B' : 'A']));
    },

    /** Read one 16-byte block of an authenticated sector. Resolves an ArrayBuffer. */
    mifareClassicReadBlock: function (block) {
        return toAppPromise(rawExec('mifareClassicReadBlock', [block]));
    },

    /** {type: 'Classic'|'Plus'|'Pro'|'Unknown', size, sectorCount, blockCount} */
    mifareClassicInfo: function () {
        return toAppPromise(rawExec('mifareClassicInfo', []));
    },

    disableReaderMode: function(successCallback, errorCallback) {
        return execOrPromise(successCallback, errorCallback, 'disableReaderMode', []);
    },

    // ============================================================
    // Advanced Tag Analysis Methods (for premium features)
    // ============================================================

    /**
     * Read raw memory pages from an NTAG/MIFARE Ultralight tag (Android, after connect()).
     * Uses READ (0x30), which returns 4 pages per command; the result is trimmed to exactly
     * numPages * 4 bytes, so pages past the end of the chip (which the READ command rolls over
     * to page 0) are never included.
     *
     * @param startPage - The starting page number (0-based)
     * @param numPages - Number of pages to read
     * @returns Promise<ArrayBuffer> - numPages * 4 bytes
     */
    readMemoryPages: function(startPage, numPages) {
        return toAppPromise(rawReadPages(startPage, numPages));
    },

    /**
     * Get NTAG / MIFARE Ultralight EV1 version information (GET_VERSION, 0x60).
     * icType, totalPages and configPage come from the NXP datasheet memory map for the
     * product type + subtype + storage size (null when the IC is not in the table).
     */
    getNtagVersion: function() {
        return toAppPromise(rawGetVersion());
    },

    /**
     * Memory map for a GET_VERSION result: {icType, totalPages, configPage, pwdPage, packPage}
     * or null for an IC that is not in the table. Pure function, no tag access.
     */
    getNtagMemoryMap: function(version) {
        return ntagMemoryMap(version);
    },

    /**
     * Read NTAG counter value (READ_CNT 0x39, counter 0x02). Resolves with the 24-bit value.
     */
    readNtagCounter: function() {
        return toAppPromise(rawTransceive(new Uint8Array([0x39, 0x02])).then(function (response) {
            var data = new Uint8Array(response);
            if (data.length < 3) {
                throw nativeError('IO_ERROR', 'Invalid READ_CNT response');
            }
            return data[0] | (data[1] << 8) | (data[2] << 16);
        }));
    },

    /**
     * Read the 32-byte NXP originality signature (READ_SIG 0x3C 0x00).
     * Verify it with nfc.verifyNtagSignature(uid, signature) or use nfc.checkNtagOriginality().
     */
    readNtagSignature: function() {
        return toAppPromise(rawReadSignature());
    },

    /**
     * Password protection status from the configuration pages (CFG0 / CFG1).
     *
     * @param configPage - optional CFG0 page. When omitted, GET_VERSION picks the right page for
     *                     the IC (NTAG213 0x29, NTAG215 0x83, NTAG216 0xE3, NTAG210 / UL EV1 MF0UL11
     *                     0x10, NTAG212 / MF0UL21 0x25).
     * @returns Promise<Object> - protectionStartPage (AUTH0), isProtected (AUTH0 inside the memory),
     *          writeProtected (= isProtected), readProtected (isProtected and PROT=1),
     *          authLimitEnabled / authLimitCounter (AUTHLIM, the configured limit),
     *          configLocked (CFGLCK), counterEnabled, counterPasswordProtected, configPage, icType.
     *          When the config pages are themselves read-protected the tag NAKs the READ: the result
     *          is then isProtected/readProtected/writeProtected true, configReadable false and the
     *          unknown fields null (authenticate with nfc.ntagAuthenticate() to read them).
     */
    getPasswordProtectionStatus: function(configPage) {
        return toAppPromise(resolveConfig(configPage).then(function (map) {
            return rawTransceive(new Uint8Array([0x30, map.configPage])).then(null, function (error) {
                if (!isRefusal(error)) { throw error; }
                // The configuration pages themselves are read-protected (AUTH0 <= CFG0 and PROT=1):
                // that alone proves read + write protection. The NAK halted the tag; re-select it.
                return reselect().then(function () { return null; });
            }).then(function (response) {
                if (response === null) {
                    return {
                        protectionStartPage: null,
                        isProtected: true,
                        readProtected: true,
                        writeProtected: true,
                        authLimitEnabled: null,
                        authLimitCounter: null,
                        configLocked: null,
                        counterEnabled: null,
                        counterPasswordProtected: null,
                        configReadable: false,
                        configPage: map.configPage,
                        icType: map.icType
                    };
                }
                var data = new Uint8Array(response);
                if (data.length < 8) {
                    throw nativeError('IO_ERROR', 'Invalid configuration page response');
                }
                var auth0 = data[3];
                var access = data[4];
                var isProtected = auth0 < map.totalPages;
                return {
                    protectionStartPage: auth0,
                    isProtected: isProtected,
                    readProtected: isProtected && (access & 0x80) !== 0,
                    writeProtected: isProtected,
                    authLimitEnabled: (access & 0x07) !== 0,
                    authLimitCounter: access & 0x07,
                    configLocked: (access & 0x40) !== 0,
                    counterEnabled: (access & 0x10) !== 0,
                    counterPasswordProtected: (access & 0x08) !== 0,
                    configReadable: true,
                    configPage: map.configPage,
                    icType: map.icType
                };
            });
        }));
    },

    /**
     * Full memory dump with IC detection (Android, after connect() with NfcA or MifareUltralight).
     * Resolves {success:true, tagType, version, totalPages, memoryDump, hexDump}.
     * Rejects with the same shape, success:false and error set — a failed read is reported as an
     * error, never relabelled as a different chip. Only when GET_VERSION itself is refused (an
     * original MIFARE Ultralight) does it re-select the tag and dump 16 pages.
     */
    fullMemoryDump: function() {
        var result = {
            success: false,
            tagType: 'unknown',
            totalPages: 0,
            memoryDump: null,
            hexDump: '',
            error: null
        };

        function finish(buffer) {
            result.memoryDump = buffer;
            result.hexDump = util.arrayBufferToHexString(buffer);
            result.success = true;
            return result;
        }

        return rawGetVersion().then(function (version) {
            result.tagType = version.icType;
            result.version = version;
            if (!version.totalPages) {
                throw nativeError('NOT_SUPPORTED', 'Unknown memory layout for ' + version.icType + '; use readMemoryPages()');
            }
            result.totalPages = version.totalPages;
            return rawReadPages(0, version.totalPages).then(finish);
        }, function (versionError) {
            if (!isRefusal(versionError)) {
                throw versionError;              // tag lost / not connected: report it as is
            }
            // GET_VERSION is not supported by the original MIFARE Ultralight (16 pages). The NAK
            // halts the tag, so it has to be re-selected before it answers READ again.
            return reselect().then(function () {
                return rawReadPages(0, 16);
            }).then(function (buffer) {
                result.tagType = 'MIFARE Ultralight (Classic)';
                result.totalPages = 16;
                return finish(buffer);
            });
        }).catch(function (error) {
            result.success = false;
            result.error = toAppError(error);
            throw result;
        });
    },

    // ============================================================
    // NTAG / Ultralight EV1 password (Android, after connect(), 1.8.0)
    // password: 4 bytes, pack: 2 bytes - hex string, byte array or Uint8Array
    // ============================================================

    /**
     * PWD_AUTH (0x1B). Resolves {pack: [b0, b1], packMatches: boolean|null}. A wrong password
     * rejects with code AUTH_FAILED (the tag is re-selected so it answers again). If expectedPack
     * is given and the tag answers a different PACK, rejects with AUTH_FAILED too.
     */
    ntagAuthenticate: function (password, expectedPack) {
        return toAppPromise(rawAuthenticate(password, expectedPack));
    },

    /**
     * Protect the tag with a password. options: pack (2 bytes, default 0000), startPage (AUTH0,
     * first protected page, default 4 = all user memory), protectReads (PROT, default false: only
     * writes need the password), authLimit (AUTHLIM 0-7, default 0 = unlimited attempts),
     * currentPassword (when the tag is already protected). Writes PWD, PACK, then ACCESS, then
     * AUTH0 last, preserving the other configuration bits.
     */
    ntagSetPassword: function (password, options) {
        return toAppPromise(rawSetPassword(password, options || {}));
    },

    /** Authenticate with the password, then disable protection (AUTH0 = 0xFF, PROT = 0) and reset PWD / PACK. */
    ntagRemovePassword: function (password) {
        return toAppPromise(rawRemovePassword(password));
    },

    // ============================================================
    // NXP originality signature (1.8.0)
    // ============================================================

    /**
     * Verify a READ_SIG signature (32 bytes, r || s) over the 7-byte UID with NXP's public keys:
     * ECDSA on secp128r1, the UID is used as the message without hashing (NXP AN11350 / AN11341).
     * Returns {valid, keyName} synchronously. options.publicKey (hex, uncompressed 04||X||Y) checks
     * against one specific key instead. Needs BigInt (Android WebView 67+, iOS 14+).
     */
    verifyNtagSignature: function (uid, signature, options) {
        return verifyOriginality(toBytes(uid), toBytes(signature), options || {});
    },

    /** Read the UID (page 0-1) and READ_SIG, then verify. Resolves {uid, signature, valid, keyName}. */
    checkNtagOriginality: function () {
        return toAppPromise(rawTransceive(new Uint8Array([0x30, 0x00])).then(function (response) {
            var p = new Uint8Array(response);
            if (p.length < 8) { throw nativeError('IO_ERROR', 'Invalid READ response'); }
            var uid = [p[0], p[1], p[2], p[4], p[5], p[6], p[7]];
            return rawReadSignature().then(function (sig) {
                var signature = Array.from(new Uint8Array(sig));
                var result = verifyOriginality(uid, signature, {});
                return {
                    uid: uid,
                    signature: util.bytesToHexString(signature),
                    valid: result.valid,
                    keyName: result.keyName
                };
            });
        }));
    },

    // ============================================================
    // ISO 15693 / NfcV (Android, after connect('android.nfc.tech.NfcV'), 1.8.0)
    // uid (optional): tag.id as reported by Android (least significant byte first); when given
    // the commands are sent in addressed mode.
    // ============================================================

    /** GET SYSTEM INFO (0x2B): {uid, dsfid, afi, blockCount, blockSize, icReference} (absent fields null). */
    nfcvGetSystemInfo: function (uid) {
        return toAppPromise(rawNfcvCommand(0x2B, [], uid).then(function (data) {
            var info = { uid: null, dsfid: null, afi: null, blockCount: null, blockSize: null, icReference: null };
            if (data.length < 9) { throw nativeError('IO_ERROR', 'Invalid GET SYSTEM INFO response'); }
            var flags = data[0];
            info.uid = Array.from(data.slice(1, 9));
            var i = 9;
            if (flags & 0x01) { info.dsfid = data[i++]; }
            if (flags & 0x02) { info.afi = data[i++]; }
            if (flags & 0x04) { info.blockCount = data[i] + 1; info.blockSize = (data[i + 1] & 0x1F) + 1; i += 2; }
            if (flags & 0x08) { info.icReference = data[i++]; }
            return info;
        }));
    },

    /** READ SINGLE BLOCK (0x20) for count blocks from firstBlock (0-255). Resolves the bytes as an ArrayBuffer. */
    nfcvReadBlocks: function (firstBlock, count, uid) {
        if (!isPageNumber(firstBlock, 255) || !isPageNumber(count, 256) || count < 1 || firstBlock + count > 256) {
            return Promise.reject(toAppError(nativeError('INVALID_ARGUMENT', 'firstBlock + count must stay within blocks 0-255')));
        }
        var chunks = [];
        var n = 0;
        function next() {
            if (n >= count) {
                var total = chunks.reduce(function (sum, c) { return sum + c.length; }, 0);
                var out = new Uint8Array(total);
                var offset = 0;
                chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
                return out.buffer;
            }
            return rawNfcvCommand(0x20, [firstBlock + n], uid).then(function (data) {
                chunks.push(data);
                n++;
                return next();
            });
        }
        return toAppPromise(Promise.resolve().then(next));
    },

    /**
     * IC name from GET_VERSION bytes. productSubtype is optional (older callers pass two args);
     * without it an NTAG I2C cannot be told apart from an NTAG216.
     * @private
     */
    _parseIcType: function(productType, storageSize, productSubtype) {
        var ic = findIc(productType, productSubtype, storageSize);
        if (ic) { return ic.name; }
        if (productType === 0x04) {
            if (productSubtype === 0x05) { return 'NTAG I2C'; }
            return 'NTAG (unknown variant)';
        } else if (productType === 0x03) {
            return 'MIFARE Ultralight (unknown variant)';
        }
        return 'Unknown NFC tag';
    }

};

// ------------------------------------------------------------------ NTAG internals (1.8.0)
// Everything below rejects with the RAW native error ({code, message} on Android); the public
// wrappers convert it once with toAppError so nfc.useErrorObjects() is honoured.

var lastConnection = null;   // {tech, timeout} of the last successful connect(), for re-selecting

// NXP datasheets: GET_VERSION productType / productSubtype / storageSize -> memory map.
// configPage = CFG0; CFG1, PWD and PACK follow it.
var NXP_TYPE2_ICS = [
    { type: 0x04, subtypes: [0x01], size: 0x0B, name: 'NTAG210', pages: 20, cfg: 0x10 },
    { type: 0x04, subtypes: [0x01], size: 0x0E, name: 'NTAG212', pages: 41, cfg: 0x25 },
    { type: 0x04, subtypes: [0x02], size: 0x0F, name: 'NTAG213', pages: 45, cfg: 0x29 },
    { type: 0x04, subtypes: [0x02], size: 0x11, name: 'NTAG215', pages: 135, cfg: 0x83 },
    { type: 0x04, subtypes: [0x02], size: 0x13, name: 'NTAG216', pages: 231, cfg: 0xE3 },
    { type: 0x03, subtypes: [0x01, 0x02], size: 0x0B, name: 'MIFARE Ultralight EV1 (48 bytes)', pages: 20, cfg: 0x10 },
    { type: 0x03, subtypes: [0x01, 0x02], size: 0x0E, name: 'MIFARE Ultralight EV1 (128 bytes)', pages: 41, cfg: 0x25 }
];

function findIc(productType, productSubtype, storageSize) {
    for (var i = 0; i < NXP_TYPE2_ICS.length; i++) {
        var ic = NXP_TYPE2_ICS[i];
        if (ic.type === productType && ic.size === storageSize &&
            (typeof productSubtype === 'undefined' || ic.subtypes.indexOf(productSubtype) !== -1)) {
            return ic;
        }
    }
    return null;
}

function ntagMemoryMap(version) {
    if (!version) { return null; }
    var ic = findIc(version.productType, version.productSubtype, version.storageSize);
    if (!ic) { return null; }
    return {
        icType: ic.name,
        totalPages: ic.pages,
        configPage: ic.cfg,
        accessPage: ic.cfg + 1,
        pwdPage: ic.cfg + 2,
        packPage: ic.cfg + 3
    };
}

function nativeError(code, message) {
    return { code: code, message: message };
}

function toAppPromise(promise) {
    return promise.then(null, function (error) { throw toAppError(error); });
}

function rawExec(action, args) {
    return new Promise(function (resolve, reject) {
        cordova.exec(resolve, reject, 'NfcPlugin', action, args || []);
    });
}

function toCommandBuffer(data) {
    if (typeof data === 'string') {
        return util.hexStringToArrayBuffer(data);
    } else if (data instanceof ArrayBuffer) {
        return data;
    } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(data)) {
        // only the bytes the view covers, not its whole backing buffer
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else if (Array.isArray(data)) {
        return new Uint8Array(data).buffer;
    }
    return null;
}

function rawTransceive(data) {
    var buffer;
    try {
        buffer = toCommandBuffer(data);
    } catch (e) {
        buffer = null;
    }
    if (!buffer) {
        return Promise.reject(nativeError('INVALID_ARGUMENT', 'Expecting an ArrayBuffer, Uint8Array, byte array or hex String'));
    }
    return rawExec('transceive', [buffer]);
}

// A command the tag answered with a NAK (Android reports IOException "Transceive failed"),
// as opposed to a tag that left the field or a missing connection.
function isRefusal(error) {
    if (error && typeof error === 'object') {
        return error.code === 'IO_ERROR' || error.code === 'FORMAT_ERROR';
    }
    return typeof error === 'string' && /transceive failed/i.test(error);
}

function reselect() {
    var connection = lastConnection;
    if (!connection) {
        return Promise.resolve();
    }
    return rawExec('close', []).then(null, function () { /* already closed */ }).then(function () {
        return rawExec('connect', [connection.tech, connection.timeout]);
    }).then(function () {
        lastConnection = connection;
    });
}

function isPageNumber(n, max) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 0 && n <= max;
}

function rawReadPages(startPage, numPages) {
    if (!isPageNumber(startPage, 255) || !isPageNumber(numPages, 256) || numPages < 1) {
        return Promise.reject(nativeError('INVALID_ARGUMENT', 'startPage must be 0-255 and numPages at least 1'));
    }
    var out = new Uint8Array(numPages * 4);
    var done = 0;

    function next() {
        if (done >= numPages) {
            return Promise.resolve(out.buffer);
        }
        var page = startPage + done;
        if (page > 255) {
            return Promise.reject(nativeError('INVALID_ARGUMENT', 'Page ' + page + ' is beyond the READ command range'));
        }
        return rawTransceive(new Uint8Array([0x30, page])).then(function (response) {
            var bytes = new Uint8Array(response);
            var available = Math.floor(bytes.length / 4);
            if (available < 1) {
                throw nativeError('IO_ERROR', 'Short READ response (' + bytes.length + ' bytes) at page ' + page);
            }
            var take = Math.min(4, available, numPages - done);
            out.set(bytes.subarray(0, take * 4), done * 4);
            done += take;
            return next();
        });
    }

    return next();
}

function rawGetVersion() {
    return rawTransceive(new Uint8Array([0x60])).then(function (response) {
        var data = new Uint8Array(response);
        if (data.length < 8) {
            throw nativeError('IO_ERROR', 'Invalid GET_VERSION response');
        }
        var version = {
            vendorId: data[1],
            productType: data[2],
            productSubtype: data[3],
            majorVersion: data[4],
            minorVersion: data[5],
            storageSize: data[6],
            protocolType: data[7],
            icType: nfc._parseIcType(data[2], data[6], data[3])
        };
        var map = ntagMemoryMap(version);
        version.totalPages = map ? map.totalPages : null;
        version.configPage = map ? map.configPage : null;
        return version;
    });
}

function rawReadSignature() {
    return rawTransceive(new Uint8Array([0x3C, 0x00])).then(function (response) {
        var data = new Uint8Array(response);
        if (data.length < 32) {
            throw nativeError('IO_ERROR', 'Invalid READ_SIG response');
        }
        return data.slice(0, 32).buffer;
    });
}

// ---- byte helpers
function toBytes(value) {
    if (typeof value === 'string') {
        var hex = value.replace(/[\s:-]/g, '').replace(/^0x/i, '');
        if (!/^([0-9a-f]{2})*$/i.test(hex)) { return null; }
        var out = [];
        for (var i = 0; i < hex.length; i += 2) { out.push(parseInt(hex.substr(i, 2), 16)); }
        return out;
    }
    if (value instanceof ArrayBuffer) { return Array.from(new Uint8Array(value)); }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
        return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    if (Array.isArray(value)) { return value.map(function (b) { return b & 0xFF; }); }
    return null;
}

function requireBytes(value, length, what) {
    var bytes = toBytes(value);
    if (!bytes || bytes.length !== length) {
        throw nativeError('INVALID_ARGUMENT', what + ' must be ' + length + ' bytes (hex string, byte array or Uint8Array)');
    }
    return bytes;
}

// ---- NTAG password
function rawWritePage(page, bytes) {
    return rawTransceive(new Uint8Array([0xA2, page, bytes[0], bytes[1], bytes[2], bytes[3]]));
}

function rawAuthenticate(password, expectedPack) {
    return Promise.resolve().then(function () {
        var pwd = requireBytes(password, 4, 'password');
        var expected = (expectedPack === undefined || expectedPack === null) ? null : requireBytes(expectedPack, 2, 'expectedPack');
        return rawTransceive(new Uint8Array([0x1B, pwd[0], pwd[1], pwd[2], pwd[3]])).then(function (response) {
            var pack = Array.from(new Uint8Array(response)).slice(0, 2);
            if (pack.length < 2) { throw nativeError('IO_ERROR', 'Invalid PWD_AUTH response'); }
            var packMatches = expected ? (pack[0] === expected[0] && pack[1] === expected[1]) : null;
            if (packMatches === false) {
                throw nativeError('AUTH_FAILED', 'The tag answered an unexpected PACK (' + util.bytesToHexString(pack) + ')');
            }
            return { pack: pack, packMatches: packMatches };
        }, function (error) {
            if (!isRefusal(error)) { throw error; }
            // NAK: wrong password. The tag is halted until re-selected.
            return reselect().then(function () {
                throw nativeError('AUTH_FAILED', 'Wrong password');
            });
        });
    });
}

function readConfig(map) {
    return rawTransceive(new Uint8Array([0x30, map.configPage])).then(function (response) {
        var data = Array.from(new Uint8Array(response));
        if (data.length < 8) { throw nativeError('IO_ERROR', 'Invalid configuration page response'); }
        return { cfg0: data.slice(0, 4), cfg1: data.slice(4, 8) };
    });
}

function rawSetPassword(password, options) {
    return Promise.resolve().then(function () {
        var pwd = requireBytes(password, 4, 'password');
        var pack = options.pack === undefined ? [0, 0] : requireBytes(options.pack, 2, 'pack');
        var startPage = options.startPage === undefined ? 4 : options.startPage;
        var authLimit = options.authLimit === undefined ? 0 : options.authLimit;
        if (!isPageNumber(startPage, 255)) { throw nativeError('INVALID_ARGUMENT', 'startPage must be 0-255'); }
        if (!isPageNumber(authLimit, 7)) { throw nativeError('INVALID_ARGUMENT', 'authLimit must be 0-7'); }
        var auth = options.currentPassword === undefined ? Promise.resolve() : rawAuthenticate(options.currentPassword);
        return auth.then(function () {
            return resolveConfig();
        }).then(function (map) {
            return readConfig(map).then(function (cfg) {
                if (cfg.cfg1[0] & 0x40) {
                    throw nativeError('NOT_SUPPORTED', 'The configuration of this tag is locked (CFGLCK)');
                }
                var access = (cfg.cfg1[0] & ~0x87) | (options.protectReads ? 0x80 : 0) | (authLimit & 0x07);
                return rawWritePage(map.pwdPage, pwd)
                    .then(function () { return rawWritePage(map.packPage, [pack[0], pack[1], 0, 0]); })
                    .then(function () { return rawWritePage(map.accessPage, [access, cfg.cfg1[1], cfg.cfg1[2], cfg.cfg1[3]]); })
                    // AUTH0 last: protection only starts once the password is in place
                    .then(function () { return rawWritePage(map.configPage, [cfg.cfg0[0], cfg.cfg0[1], cfg.cfg0[2], startPage]); })
                    .then(function () {
                        return {
                            icType: map.icType,
                            startPage: startPage,
                            protectReads: !!options.protectReads,
                            authLimit: authLimit,
                            pack: pack
                        };
                    });
            });
        });
    });
}

function rawRemovePassword(password) {
    return rawAuthenticate(password).then(function () {
        return resolveConfig();
    }).then(function (map) {
        return readConfig(map).then(function (cfg) {
            if (cfg.cfg1[0] & 0x40) {
                throw nativeError('NOT_SUPPORTED', 'The configuration of this tag is locked (CFGLCK)');
            }
            // AUTH0 first: protection is off before anything else changes
            return rawWritePage(map.configPage, [cfg.cfg0[0], cfg.cfg0[1], cfg.cfg0[2], 0xFF])
                .then(function () { return rawWritePage(map.accessPage, [cfg.cfg1[0] & ~0x87, cfg.cfg1[1], cfg.cfg1[2], cfg.cfg1[3]]); })
                .then(function () { return rawWritePage(map.pwdPage, [0xFF, 0xFF, 0xFF, 0xFF]); })
                .then(function () { return rawWritePage(map.packPage, [0, 0, 0, 0]); })
                .then(function () { return { icType: map.icType }; });
        });
    });
}

// ---- ISO 15693
function rawNfcvCommand(command, params, uid) {
    return Promise.resolve().then(function () {
        var frame;
        if (uid === undefined || uid === null) {
            frame = [0x02, command];                          // high data rate, non-addressed
        } else {
            frame = [0x22, command].concat(requireBytes(uid, 8, 'uid'));   // addressed
        }
        frame = frame.concat(params);
        return rawTransceive(new Uint8Array(frame));
    }).then(function (response) {
        var data = new Uint8Array(response);
        if (data.length < 1) { throw nativeError('IO_ERROR', 'Empty ISO 15693 response'); }
        if (data[0] & 0x01) {
            throw nativeError('IO_ERROR', 'ISO 15693 error 0x' + util.toHex(data.length > 1 ? data[1] : 0));
        }
        return data.slice(1);
    });
}

// ---- NXP originality signature: ECDSA verification on secp128r1 (SEC 2), no hashing
var ORIGINALITY_KEYS = [
    { name: 'NXP NTAG21x', key: '04494E1A386D3D3CFE3DC10E5DE68A499B1C202DB5B132393E89ED19FE5BE8BC61' },
    { name: 'NXP MIFARE Ultralight EV1', key: '0490933BDCD6E99B4E255E3DA55389A827564E11718E017292FAF23226A96614B8' }
];

function verifyOriginality(uid, signature, options) {
    if (typeof BigInt === 'undefined') {
        throw toAppError(nativeError('NOT_SUPPORTED', 'Signature verification needs BigInt (Android WebView 67+, iOS 14+)'));
    }
    if (!uid || !uid.length) { throw toAppError(nativeError('INVALID_ARGUMENT', 'uid is required')); }
    if (!signature || signature.length !== 32) { throw toAppError(nativeError('INVALID_ARGUMENT', 'signature must be 32 bytes')); }
    var keys = options.publicKey ? [{ name: 'custom', key: options.publicKey }] : ORIGINALITY_KEYS;
    for (var i = 0; i < keys.length; i++) {
        if (secp128r1Verify(keys[i].key, uid, signature)) {
            return { valid: true, keyName: keys[i].name };
        }
    }
    return { valid: false, keyName: null };
}

function secp128r1Verify(publicKeyHex, message, signature) {
    var B = BigInt;
    var P = B('0xFFFFFFFDFFFFFFFFFFFFFFFFFFFFFFFF');
    var A = B('0xFFFFFFFDFFFFFFFFFFFFFFFFFFFFFFFC');
    var N = B('0xFFFFFFFE0000000075A30D1B9038A115');
    var G = [B('0x161FF7528B899B2D0C28607CA52C5B86'), B('0xCF5AC8395BAFEB13C02DA292DDED7A83')];
    var ZERO = B(0);
    var ONE = B(1);
    var TWO = B(2);
    var THREE = B(3);
    function mod(a, m) { var r = a % m; return r < ZERO ? r + m : r; }
    function inv(a, m) {
        var t = ZERO, nt = ONE, r = m, nr = mod(a, m);
        while (nr !== ZERO) { var q = r / nr; var tmp = t - q * nt; t = nt; nt = tmp; tmp = r - q * nr; r = nr; nr = tmp; }
        return r === ONE ? mod(t, m) : null;
    }
    function add(p1, p2) {
        if (p1 === null) { return p2; }
        if (p2 === null) { return p1; }
        var l;
        if (p1[0] === p2[0]) {
            if (mod(p1[1] + p2[1], P) === ZERO) { return null; }
            l = mod((THREE * p1[0] * p1[0] + A) * inv(TWO * p1[1], P), P);
        } else {
            l = mod((p2[1] - p1[1]) * inv(p2[0] - p1[0], P), P);
        }
        var x = mod(l * l - p1[0] - p2[0], P);
        return [x, mod(l * (p1[0] - x) - p1[1], P)];
    }
    function mul(k, pt) {
        var result = null;
        var addend = pt;
        while (k > ZERO) {
            if (k & ONE) { result = add(result, addend); }
            addend = add(addend, addend);
            k >>= ONE;
        }
        return result;
    }
    function toInt(bytes) {
        var hex = bytes.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
        return hex ? B('0x' + hex) : ZERO;
    }
    var keyHex = String(publicKeyHex).replace(/\s/g, '');
    if (!/^04[0-9a-fA-F]{64}$/.test(keyHex)) { return false; }
    var Q = [B('0x' + keyHex.substr(2, 32)), B('0x' + keyHex.substr(34, 32))];
    // Q must be on the curve: y^2 = x^3 + ax + b
    var Bc = B('0xE87579C11079F43DD824993C2CEE5ED3');
    if (mod(Q[1] * Q[1] - (Q[0] * Q[0] * Q[0] + A * Q[0] + Bc), P) !== ZERO) { return false; }
    var r = toInt(signature.slice(0, 16));
    var s = toInt(signature.slice(16, 32));
    if (r <= ZERO || r >= N || s <= ZERO || s >= N) { return false; }
    var e = toInt(message);               // 7-byte UID, shorter than n: used as is
    var w = inv(s, N);
    if (w === null) { return false; }
    var X = add(mul(mod(e * w, N), G), mul(mod(r * w, N), Q));
    return X !== null && mod(X[0], N) === r;
}

// {configPage, totalPages, icType} for an explicit CFG0 page, or looked up with GET_VERSION.
function resolveConfig(configPage) {
    if (typeof configPage === 'number') {
        if (!isPageNumber(configPage, 252)) {
            return Promise.reject(nativeError('INVALID_ARGUMENT', 'configPage must be a page number 0-252'));
        }
        return Promise.resolve({ configPage: configPage, totalPages: configPage + 4, icType: null });
    }
    return rawGetVersion().then(function (version) {
        var map = ntagMemoryMap(version);
        if (!map) {
            throw nativeError('NOT_SUPPORTED', 'No password configuration pages known for ' + version.icType);
        }
        return map;
    });
}

var util = {
    // i must be <= 256
    toHex: function (i) {
        var hex;

        if (i < 0) {
            i += 256;
        }

        hex = i.toString(16);

        // zero padding
        if (hex.length === 1) {
            hex = "0" + hex;
        }

        return hex;
    },

    toPrintable: function(i) {

        if (i >= 0x20 & i <= 0x7F) {
            return String.fromCharCode(i);
        } else {
            return '.';
        }
    },

    bytesToString: function(bytes) {
        // based on http://ciaranj.blogspot.fr/2007/11/utf8-characters-encoding-in-javascript.html

        var result = "";
        var i, c, c2, c3;
        i = c = c2 = c3 = 0;

        // Perform byte-order check.
        if( bytes.length >= 3 ) {
            if( (bytes[0] & 0xef) == 0xef && (bytes[1] & 0xbb) == 0xbb && (bytes[2] & 0xbf) == 0xbf ) {
                // stream has a BOM at the start, skip over
                i = 3;
            }
        }

        while ( i < bytes.length ) {
            c = bytes[i] & 0xff;

            if ( c < 128 ) {

                result += String.fromCharCode(c);
                i++;

            } else if ( (c > 191) && (c < 224) ) {

                if ( i + 1 >= bytes.length ) {
                    throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                }
                c2 = bytes[i + 1] & 0xff;
                result += String.fromCharCode( ((c & 31) << 6) | (c2 & 63) );
                i += 2;

            } else {

                if ( i + 2 >= bytes.length  || i + 1 >= bytes.length ) {
                    throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                }
                c2 = bytes[i + 1] & 0xff;
                c3 = bytes[i + 2] & 0xff;
                result += String.fromCharCode( ((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63) );
                i += 3;

            }
        }
        return result;
    },

    stringToBytes: function(string) {
        // based on http://ciaranj.blogspot.fr/2007/11/utf8-characters-encoding-in-javascript.html

        var bytes = [];

        for (var n = 0; n < string.length; n++) {

            var c = string.charCodeAt(n);

            if (c < 128) {

                bytes[bytes.length]= c;

            } else if((c > 127) && (c < 2048)) {

                bytes[bytes.length] = (c >> 6) | 192;
                bytes[bytes.length] = (c & 63) | 128;

            } else {

                bytes[bytes.length] = (c >> 12) | 224;
                bytes[bytes.length] = ((c >> 6) & 63) | 128;
                bytes[bytes.length] = (c & 63) | 128;

            }

        }

        return bytes;
    },

    bytesToHexString: function (bytes) {
        var dec, hexstring, bytesAsHexString = "";
        for (var i = 0; i < bytes.length; i++) {
            if (bytes[i] >= 0) {
                dec = bytes[i];
            } else {
                dec = 256 + bytes[i];
            }
            hexstring = dec.toString(16);
            // zero padding
            if (hexstring.length === 1) {
                hexstring = "0" + hexstring;
            }
            bytesAsHexString += hexstring;
        }
        return bytesAsHexString;
    },

    // This function can be removed if record.type is changed to a String
    /**
     * Returns true if the record's TNF and type matches the supplied TNF and type.
     *
     * @record NDEF record
     * @tnf 3-bit TNF (Type Name Format) - use one of the TNF_* constants
     * @type byte array or String
     */
    isType: function(record, tnf, type) {
        if (record.tnf === tnf) { // TNF is 3-bit
            var recordType;
            if (typeof(type) === 'string') {
                recordType = type;
            } else {
                recordType = nfc.bytesToString(type);
            }
            return (nfc.bytesToString(record.type) === recordType);
        }
        return false;
    },

    /**
     * Convert an ArrayBuffer to a hex string
     *
     * @param {ArrayBuffer} buffer
     * @returns {srting} - hex representation of bytes e.g. 000407AF 
     */
    arrayBufferToHexString: function(buffer) {
        function toHexString(byte) {
            return ('0' + (byte & 0xFF).toString(16)).slice(-2);
        }
        var typedArray = new Uint8Array(buffer);
        var array = Array.from(typedArray);  // need to convert to [] so our map result is not typed
        var parts = array.map(function(i) { return toHexString(i) });

        return parts.join('');
    },

    /**
     * Convert a hex string to an ArrayBuffer.
     *
     * @param {string} hexString - hex representation of bytes
     * @return {ArrayBuffer} - The bytes in an ArrayBuffer.
     */
    hexStringToArrayBuffer: function(hexString) {

        // remove any delimiters - space, dash, or colon
        hexString = hexString.replace(/[\s-:]/g, '');

        // remove the leading 0x
        hexString = hexString.replace(/^0x/, '');

        // ensure even number of characters
        if (hexString.length % 2 != 0) {
            console.log('WARNING: expecting an even number of characters in the hexString');
        }

        // check for some non-hex characters
        var bad = hexString.match(/[G-Z\s]/i);
        if (bad) {
            console.log('WARNING: found non-hex characters', bad);
        }

        // split the string into pairs of octets
        var pairs = hexString.match(/[\dA-F]{2}/gi);

        // convert the octets to integers
        var ints = pairs.map(function(s) { return parseInt(s, 16) });

        var array = new Uint8Array(ints);
        return array.buffer;
    }

};

// this is a module in ndef-js
var textHelper = {

    decodePayload: function (data) {

        var languageCodeLength = (data[0] & 0x3F), // 6 LSBs
            languageCode = data.slice(1, 1 + languageCodeLength),
            utf16 = (data[0] & 0x80) !== 0; // assuming UTF-16BE

        // TODO need to deal with UTF in the future
        if (utf16) {
            console.log('WARNING: utf-16 data may not be handled properly for', languageCode);
        }
        // Use TextDecoder when we have enough browser support
        // new TextDecoder('utf-8').decode(data.slice(languageCodeLength + 1));
        // new TextDecoder('utf-16').decode(data.slice(languageCodeLength + 1));

        return util.bytesToString(data.slice(languageCodeLength + 1));
    },

    // encode text payload
    // @returns an array of bytes
    encodePayload: function(text, lang, encoding) {

        // ISO/IANA language code, but we're not enforcing
        if (!lang) { lang = 'en'; }

        var encoded = util.stringToBytes(lang + text);
        encoded.unshift(lang.length);

        return encoded;
    }

};

// this is a module in ndef-js
var uriHelper = {
    // URI identifier codes from URI Record Type Definition NFCForum-TS-RTD_URI_1.0 2006-07-24
    // index in array matches code in the spec
    protocols: [ "", "http://www.", "https://www.", "http://", "https://", "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.", "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://", "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:", "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://", "tcpobex://", "irdaobex://", "file://", "urn:epc:id:", "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:", "urn:nfc:" ],

    // decode a URI payload bytes
    // @returns a string
    decodePayload: function (data) {
        var prefix = uriHelper.protocols[data[0]];
        if (!prefix) { // 36 to 255 should be ""
            prefix = "";
        }
        return prefix + util.bytesToString(data.slice(1));
    },

    // shorten a URI with standard prefix
    // @returns an array of bytes
    encodePayload: function (uri) {

        var prefix,
            protocolCode,
            encoded;

        // check each protocol, unless we've found a match
        // "urn:" is the one exception where we need to keep checking
        // slice so we don't check ""
        uriHelper.protocols.slice(1).forEach(function(protocol) {
            if ((!prefix || prefix === "urn:") && uri.indexOf(protocol) === 0) {
                prefix = protocol;
            }
        });

        if (!prefix) {
            prefix = "";
        }

        encoded = util.stringToBytes(uri.slice(prefix.length));
        protocolCode = uriHelper.protocols.indexOf(prefix);
        // prepend protocol code
        encoded.unshift(protocolCode);

        return encoded;
    }
};

// added since WP8 must call a named function, also used by iOS
// TODO consider switching NFC events from JS events to using the PG callbacks
function fireNfcTagEvent(eventType, tagAsJson) {
    setTimeout(function () {
        var e = document.createEvent('Events');
        e.initEvent(eventType, true, false);
        e.tag = JSON.parse(tagAsJson);
        console.log(e.tag);
        document.dispatchEvent(e);
    }, 10);
}

// textHelper and uriHelper aren't exported, add a property
ndef.uriHelper = uriHelper;
ndef.textHelper = textHelper;

// create aliases
nfc.bytesToString = util.bytesToString;
nfc.stringToBytes = util.stringToBytes;
nfc.bytesToHexString = util.bytesToHexString;

// This channel receives nfcEvent data from native code
// and fires JavaScript events.
require('cordova/channel').onCordovaReady.subscribe(function() {
  require('cordova/exec')(success, null, 'NfcPlugin', 'channel', []);
  function success(message) {
    if (!message.type) {
        console.log(message);
    } else {
        console.log("Received NFC data, firing '" + message.type + "' event");
        if (message.launch) {
            deliverLaunchTag(message);
        }
        var e = document.createEvent('Events');
        e.initEvent(message.type);
        e.tag = message.tag;
        if (message.launch) {
            e.launch = true;
        }
        document.dispatchEvent(e);
    }
  }
});

// Export using same convention as SecurityPlugin
// NfcPlugin is the main export (clobbered via plugin.xml)
// NdefPlugin and NfcUtil are properties on the export
var NfcPluginExport = nfc;
NfcPluginExport.NdefPlugin = ndef;
NfcPluginExport.NfcUtil = util;
NfcPluginExport.fireNfcTagEvent = fireNfcTagEvent;

module.exports = NfcPluginExport;

// Legacy globals for backwards compatibility.
// @awesome-cordova-plugins/nfc and phonegap-nfc detect the plugin via window.nfc.
// These are additive and do not affect the NfcPlugin module export above.
window.nfc = nfc;
window.ndef = ndef;
window.util = util;
window.fireNfcTagEvent = fireNfcTagEvent;
