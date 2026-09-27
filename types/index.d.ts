/*
 * Community Cordova NFC Plugin - TypeScript Definitions
 * Licensed under MIT License
 *
 * These declarations describe www/phonegap-nfc.js exactly. tests/unit/typings-parity.test.js
 * fails when a runtime export has no declaration here or a declaration has no runtime export,
 * and tests/types/usage.ts is compiled with `tsc --noEmit` in CI.
 */

// ============================================
// NDEF Record Types
// ============================================

/** NDEF Record structure */
export interface INdefRecord {
    /** Type Name Format (0-7) */
    tnf: number;
    /** Type as byte array */
    type: number[];
    /** Record ID as byte array */
    id: number[];
    /** Payload as byte array */
    payload: number[];
}

/** NDEF Tag/Event structure */
export interface INdefTag {
    /** Tag type (e.g. "NFC Forum Type 2", or on iOS "NFCTagTypeMiFare") */
    type?: string;
    /** Tag UID as byte array */
    id?: number[];
    /** Tech types available on the tag (Android) */
    techTypes?: string[];
    /** Maximum NDEF message size in bytes */
    maxSize?: number;
    /** Whether the tag is writable */
    isWritable?: boolean;
    /** Whether the tag can be made read-only (null when the platform cannot tell) */
    canMakeReadOnly?: boolean | null;
    /** NDEF message (array of records) */
    ndefMessage?: INdefRecord[];
    /** iOS scanTag: MIFARE family of an NFCTagTypeMiFare tag (1.8.0) */
    mifareFamily?: 'Ultralight' | 'Plus' | 'DESFire' | 'Unknown';
    /** iOS scanTag with pollFeliCa: current FeliCa system code (1.8.0) */
    systemCode?: number[];
    /** Any other platform-specific field */
    [key: string]: unknown;
}

/** NFC Event fired when a tag is detected */
export interface INfcEvent extends Event {
    tag: INdefTag;
    /** Android: true for the tag that launched the app via NFC_INTENT_FILTERS (1.8.0) */
    launch?: boolean;
}

// ============================================
// Errors
// ============================================

/** Error codes sent by the Android implementation (iOS reader-session errors use NFCReaderError numbers). */
export type NfcErrorCode =
    | 'TAG_LOST'
    | 'TAG_STALE'
    | 'IO_ERROR'
    | 'FORMAT_ERROR'
    | 'ILLEGAL_STATE'
    | 'NO_TAG'
    | 'NOT_CONNECTED'
    | 'UNSUPPORTED_TECH'
    | 'READ_ONLY'
    | 'CAPACITY_EXCEEDED'
    | 'NOT_NDEF'
    | 'INVALID_ARGUMENT'
    | 'NOT_SUPPORTED'
    | 'AUTH_FAILED'
    | 'NO_NFC'
    | 'NFC_DISABLED'
    | 'UNKNOWN';

/**
 * Structured error, delivered only after `nfc.useErrorObjects(true)`. Without it, failure callbacks
 * and rejections receive the plain message string (1.7.x behaviour).
 */
export interface NfcError extends Error {
    name: 'NfcError';
    code: NfcErrorCode | number | string;
    message: string;
    /** iOS: the NSError domain of a reader-session error */
    domain?: string;
    [key: string]: unknown;
}

export interface NfcErrorConstructor {
    new (code: NfcErrorCode | number | string, message: string, details?: object): NfcError;
    readonly prototype: NfcError;
}

/** What a failure callback / rejection receives: a message string (default) or an NfcError. */
export type NfcFailure = string | NfcError;

// ============================================
// Advanced Tag Analysis Types
// ============================================

/** NTAG/MIFARE Ultralight version information from GET_VERSION command */
export interface INtagVersionInfo {
    /** Vendor ID (0x04 = NXP) */
    vendorId: number;
    /** Product type (0x04 = NTAG, 0x03 = MIFARE Ultralight) */
    productType: number;
    /** Product subtype */
    productSubtype: number;
    /** Major product version */
    majorVersion: number;
    /** Minor product version */
    minorVersion: number;
    /** Storage size indicator */
    storageSize: number;
    /** Protocol type */
    protocolType: number;
    /** Human-readable IC type (e.g. "NTAG215", "MIFARE Ultralight EV1 (48 bytes)") */
    icType: string;
    /** Total pages from the NXP memory map, null for an IC not in the table (1.8.0) */
    totalPages: number | null;
    /** CFG0 page, null for an IC not in the table (1.8.0) */
    configPage: number | null;
}

/** NXP Type 2 memory map (1.8.0) */
export interface INtagMemoryMap {
    icType: string;
    totalPages: number;
    /** CFG0: MIRROR, RFUI, MIRROR_PAGE, AUTH0 */
    configPage: number;
    /** CFG1: ACCESS (PROT, CFGLCK, NFC_CNT_EN, NFC_CNT_PWD_PROT, AUTHLIM) */
    accessPage: number;
    pwdPage: number;
    packPage: number;
}

/** Password protection status for NTAG */
export interface INtagPasswordStatus {
    /** AUTH0: first protected page (null when the config pages are themselves read-protected) */
    protectionStartPage: number | null;
    /** Whether AUTH0 lies inside the memory, i.e. protection is active */
    isProtected: boolean;
    /** Whether reads from AUTH0 on need the password (PROT = 1) */
    readProtected: boolean;
    /** Whether writes from AUTH0 on need the password */
    writeProtected: boolean;
    /** Whether AUTHLIM (a limit on failed attempts) is configured */
    authLimitEnabled: boolean | null;
    /** AUTHLIM: the configured failed-attempt limit exponent (0-7) */
    authLimitCounter: number | null;
    /** CFGLCK: configuration locked (1.8.0) */
    configLocked?: boolean | null;
    /** NFC_CNT_EN (1.8.0) */
    counterEnabled?: boolean | null;
    /** NFC_CNT_PWD_PROT (1.8.0) */
    counterPasswordProtected?: boolean | null;
    /** false when the config pages could not be read without the password (1.8.0) */
    configReadable?: boolean;
    configPage?: number;
    icType?: string | null;
}

/** Complete memory dump result (also the shape of the rejection, with success false and error set) */
export interface IFullMemoryDump {
    success: boolean;
    tagType: string;
    version?: INtagVersionInfo;
    totalPages: number;
    memoryDump: ArrayBuffer | null;
    hexDump: string;
    error?: NfcFailure | null;
}

/** NFC adapter state event (Android, 1.8.0) */
export interface INfcStateEvent {
    state: 'on' | 'off' | 'turning_on' | 'turning_off';
    enabled: boolean;
    /** true for the first call, which reports the state at registration */
    initial: boolean;
}

/** Reader mode options (Android, 1.8.0) */
export interface IReaderModeOptions {
    /** ms between the adapter's presence checks while a tag is in the field (default ~125) */
    presenceCheckDelay?: number;
}

/** Bytes accepted by the 1.8.0 helpers */
export type ByteInput = string | number[] | ArrayBuffer | ArrayBufferView;

export interface INtagAuthResult {
    /** PACK returned by the tag */
    pack: number[];
    /** true / false when an expected PACK was given, otherwise null */
    packMatches: boolean | null;
}

export interface INtagSetPasswordOptions {
    /** PACK the tag returns on a successful PWD_AUTH (2 bytes, default 0000) */
    pack?: ByteInput;
    /** AUTH0: first protected page (default 4 = all user memory) */
    startPage?: number;
    /** PROT: reads from startPage on also need the password (default false) */
    protectReads?: boolean;
    /** AUTHLIM 0-7 (default 0 = unlimited attempts) */
    authLimit?: number;
    /** the tag's current password, when it is already protected */
    currentPassword?: ByteInput;
}

export interface INtagSetPasswordResult {
    icType: string;
    startPage: number;
    protectReads: boolean;
    authLimit: number;
    pack: number[];
}

export interface IOriginalityResult {
    valid: boolean;
    /** which NXP key verified it ("NXP NTAG21x", "NXP MIFARE Ultralight EV1", "custom") */
    keyName: string | null;
}

export interface IOriginalityCheck extends IOriginalityResult {
    uid: number[];
    /** READ_SIG as hex */
    signature: string;
}

export interface INfcVSystemInfo {
    uid: number[];
    dsfid: number | null;
    afi: number | null;
    blockCount: number | null;
    blockSize: number | null;
    icReference: number | null;
}

export interface IMifareClassicInfo {
    type: 'Classic' | 'Plus' | 'Pro' | 'Unknown';
    size: number;
    sectorCount: number;
    blockCount: number;
}

/** Result of connect() */
export interface IConnectResult {
    /** From the technology's getMaxTransceiveLength(), when it has one */
    maxTransceiveLength?: number;
}

// ============================================
// Options
// ============================================

/** Options for scanNdef and scanTag (iOS) */
export interface IScanOptions {
    /** Keep the session open after reading, e.g. to write or transceive next (iOS only) */
    keepSessionOpen?: boolean;
    /**
     * scanTag only: also poll FeliCa (ISO 18092). The app must list its FeliCa system codes under
     * com.apple.developer.nfc.readersession.felica.systemcodes in Info.plist (1.8.0).
     */
    pollFeliCa?: boolean;
}

/** Options for write() on iOS */
export interface IWriteOptions {
    [key: string]: unknown;
}

/** Callback-style success/failure pair */
export type SuccessCallback<T = unknown> = (result?: T) => void;
export type FailureCallback = (error: NfcFailure) => void;

// ============================================
// NFC Plugin Interface
// ============================================

export interface INfcPlugin {
    // ========== Errors ==========

    /** Opt in to NfcError objects for every failure callback / rejection. Returns the new setting. */
    useErrorObjects(enabled?: boolean): boolean;

    /** The NfcError class (for instanceof checks) */
    NfcError: NfcErrorConstructor;

    // ========== Listeners (Android; iOS uses scanNdef/scanTag) ==========
    // Each returns a Promise when called without win/fail, otherwise void.

    addTagDiscoveredListener(callback: (event: INfcEvent) => void): Promise<void>;
    addTagDiscoveredListener(callback: (event: INfcEvent) => void, win?: SuccessCallback, fail?: FailureCallback): void;

    addMimeTypeListener(mimeType: string, callback: (event: INfcEvent) => void): Promise<void>;
    addMimeTypeListener(mimeType: string, callback: (event: INfcEvent) => void, win?: SuccessCallback, fail?: FailureCallback): void;

    addNdefListener(callback: (event: INfcEvent) => void): Promise<void>;
    addNdefListener(callback: (event: INfcEvent) => void, win?: SuccessCallback, fail?: FailureCallback): void;

    addNdefFormatableListener(callback: (event: INfcEvent) => void): Promise<void>;
    addNdefFormatableListener(callback: (event: INfcEvent) => void, win?: SuccessCallback, fail?: FailureCallback): void;

    /** Pass the SAME function that was given to addTagDiscoveredListener, or it stays registered. */
    removeTagDiscoveredListener(callback: (event: INfcEvent) => void): Promise<void>;
    removeTagDiscoveredListener(callback: (event: INfcEvent) => void, win?: SuccessCallback, fail?: FailureCallback): void;

    /** Pass the SAME function that was given to addMimeTypeListener, or it stays registered. */
    removeMimeTypeListener(mimeType: string, callback: (event: INfcEvent) => void): Promise<void>;
    removeMimeTypeListener(mimeType: string, callback: (event: INfcEvent) => void, win?: SuccessCallback, fail?: FailureCallback): void;

    /** Pass the SAME function that was given to addNdefListener, or it stays registered. */
    removeNdefListener(callback: (event: INfcEvent) => void): Promise<void>;
    removeNdefListener(callback: (event: INfcEvent) => void, win?: SuccessCallback, fail?: FailureCallback): void;

    // ========== Tag operations ==========

    /** Write an NDEF message to the last scanned tag (iOS: opens a write session; options only used there) */
    write(ndefMessage: INdefRecord[]): Promise<void>;
    write(ndefMessage: INdefRecord[], win?: SuccessCallback, fail?: FailureCallback, options?: IWriteOptions): void;

    /** Make the last scanned tag read-only (permanent!) - Android */
    makeReadOnly(): Promise<void>;
    makeReadOnly(win?: SuccessCallback, fail?: FailureCallback): void;

    /** Erase the last scanned tag (writes an empty NDEF record) - Android */
    erase(): Promise<void>;
    erase(win?: SuccessCallback, fail?: FailureCallback): void;

    /** Android Beam was removed in Android 10: always fails with NOT_SUPPORTED */
    share(ndefMessage: INdefRecord[]): Promise<void>;
    share(ndefMessage: INdefRecord[], win?: SuccessCallback, fail?: FailureCallback): void;

    /** Android Beam was removed in Android 10: always fails with NOT_SUPPORTED */
    unshare(): Promise<void>;
    unshare(win?: SuccessCallback, fail?: FailureCallback): void;

    /** Android Beam was removed in Android 10: always fails with NOT_SUPPORTED */
    handover(uris: string | string[]): Promise<void>;
    handover(uris: string | string[], win?: SuccessCallback, fail?: FailureCallback): void;

    /** Android Beam was removed in Android 10: always fails with NOT_SUPPORTED */
    stopHandover(): Promise<void>;
    stopHandover(win?: SuccessCallback, fail?: FailureCallback): void;

    // ========== NFC status ==========

    /** Resolves "NFC_OK"; fails with "NO_NFC" or "NFC_DISABLED" */
    enabled(): Promise<string>;
    enabled(win?: SuccessCallback<string>, fail?: FailureCallback): void;

    /** Open the NFC settings (Android 10+: the NFC settings panel) */
    showSettings(): Promise<void>;
    showSettings(win?: SuccessCallback, fail?: FailureCallback): void;

    // ========== iOS sessions ==========

    /** Scan for an NDEF tag (iOS 13+) */
    scanNdef(options?: IScanOptions): Promise<INdefTag>;

    /** Scan for any tag with tag info (iOS 13+) */
    scanTag(options?: IScanOptions): Promise<INdefTag>;

    /** Cancel the active scan session (iOS) */
    cancelScan(): Promise<void>;

    /** @deprecated use scanNdef / scanTag (iOS) */
    beginSession(): Promise<void>;
    beginSession(win?: SuccessCallback, fail?: FailureCallback): void;

    /** @deprecated use cancelScan (iOS) */
    invalidateSession(): Promise<void>;
    invalidateSession(win?: SuccessCallback, fail?: FailureCallback): void;

    // ========== Low-level transceive ==========

    /** Connect to the last scanned tag with a technology, e.g. "android.nfc.tech.NfcA" (Android) */
    connect(tech: string, timeout?: number): Promise<IConnectResult>;

    /** Close the connect() session */
    close(): Promise<void>;

    /** Send a raw command. Android: any connected tech; iOS: ISO 7816 APDUs after scanTag({keepSessionOpen:true}) */
    transceive(command: ArrayBuffer | ArrayBufferView | number[] | string): Promise<ArrayBuffer>;

    // ========== iOS error codes ==========

    /** NFCReaderError codes carried by iOS reader-session errors (with nfc.useErrorObjects(true)) */
    IOS_ERROR: {
        UNSUPPORTED_FEATURE: 1;
        SECURITY_VIOLATION: 2;
        INVALID_PARAMETER: 3;
        INVALID_PARAMETER_LENGTH: 4;
        PARAMETER_OUT_OF_BOUND: 5;
        RADIO_DISABLED: 6;
        TAG_CONNECTION_LOST: 100;
        RETRY_EXCEEDED: 101;
        TAG_RESPONSE_ERROR: 102;
        SESSION_INVALIDATED: 103;
        TAG_NOT_CONNECTED: 104;
        PACKET_TOO_LONG: 105;
        USER_CANCELED: 200;
        SESSION_TIMEOUT: 201;
        SESSION_TERMINATED_UNEXPECTEDLY: 202;
        SYSTEM_IS_BUSY: 203;
        FIRST_NDEF_TAG_READ: 204;
        TAG_COMMAND_CONFIGURATION_INVALID_PARAMETERS: 300;
        NDEF_TAG_NOT_WRITABLE: 400;
        NDEF_TAG_UPDATE_FAILURE: 401;
        NDEF_TAG_SIZE_TOO_SMALL: 402;
        NDEF_ZERO_LENGTH_MESSAGE: 403;
    };

    // ========== Reader mode (Android) ==========

    FLAG_READER_NFC_A: number;
    FLAG_READER_NFC_B: number;
    FLAG_READER_NFC_F: number;
    FLAG_READER_NFC_V: number;
    FLAG_READER_NFC_BARCODE: number;
    FLAG_READER_SKIP_NDEF_CHECK: number;
    FLAG_READER_NO_PLATFORM_SOUNDS: number;

    /** Android NfcAdapter.enableReaderMode: readCallback runs for every tag until disableReaderMode */
    readerMode(flags: number, readCallback: (tag: INdefTag) => void, errorCallback?: FailureCallback, options?: IReaderModeOptions): void;

    /** Android NfcAdapter.disableReaderMode */
    disableReaderMode(): Promise<void>;
    disableReaderMode(successCallback?: SuccessCallback, errorCallback?: FailureCallback): void;

    // ========== NFC adapter state (Android, 1.8.0) ==========

    /** Called with the current state, then on every change (works while NFC is off). iOS: fails with NOT_SUPPORTED. */
    addStateChangeListener(callback: (event: INfcStateEvent) => void, fail?: FailureCallback): void;
    removeStateChangeListener(): Promise<void>;
    removeStateChangeListener(win?: SuccessCallback, fail?: FailureCallback): void;

    // ========== MIFARE Classic (Android, after connect('android.nfc.tech.MifareClassic'), 1.8.0) ==========

    mifareClassicAuthenticate(sector: number, key: ByteInput, keyType?: 'A' | 'B'): Promise<void>;
    /** 16 bytes of an authenticated sector */
    mifareClassicReadBlock(block: number): Promise<ArrayBuffer>;
    mifareClassicInfo(): Promise<IMifareClassicInfo>;

    // ========== NTAG password (Android, after connect, 1.8.0) ==========

    /** PWD_AUTH; rejects AUTH_FAILED on a wrong password or an unexpected PACK */
    ntagAuthenticate(password: ByteInput, expectedPack?: ByteInput): Promise<INtagAuthResult>;
    ntagSetPassword(password: ByteInput, options?: INtagSetPasswordOptions): Promise<INtagSetPasswordResult>;
    ntagRemovePassword(password: ByteInput): Promise<{ icType: string }>;

    // ========== NXP originality signature (1.8.0) ==========

    /** ECDSA secp128r1 over the raw UID with NXP's public keys; synchronous; needs BigInt */
    verifyNtagSignature(uid: ByteInput, signature: ByteInput, options?: { publicKey?: string }): IOriginalityResult;
    /** Reads UID + READ_SIG from the connected tag and verifies them (Android) */
    checkNtagOriginality(): Promise<IOriginalityCheck>;

    // ========== ISO 15693 / NfcV (Android, after connect('android.nfc.tech.NfcV'), 1.8.0) ==========

    nfcvGetSystemInfo(uid?: ByteInput): Promise<INfcVSystemInfo>;
    /** READ SINGLE BLOCK for count blocks from firstBlock (0-255) */
    nfcvReadBlocks(firstBlock: number, count: number, uid?: ByteInput): Promise<ArrayBuffer>;

    // ========== NTAG / MIFARE Ultralight (Android, after connect) ==========

    /** READ pages; resolves exactly numPages * 4 bytes */
    readMemoryPages(startPage: number, numPages: number): Promise<ArrayBuffer>;

    /** GET_VERSION (0x60) */
    getNtagVersion(): Promise<INtagVersionInfo>;

    /** Memory map for a GET_VERSION result, or null for an unknown IC. No tag access. */
    getNtagMemoryMap(version: INtagVersionInfo | Pick<INtagVersionInfo, 'productType' | 'productSubtype' | 'storageSize'>): INtagMemoryMap | null;

    /** READ_CNT (0x39) 24-bit counter */
    readNtagCounter(): Promise<number>;

    /** READ_SIG (0x3C): 32-byte originality signature */
    readNtagSignature(): Promise<ArrayBuffer>;

    /** AUTH0 / PROT status; the config page is found with GET_VERSION when omitted */
    getPasswordProtectionStatus(configPage?: number): Promise<INtagPasswordStatus>;

    /** Complete memory dump with IC detection */
    fullMemoryDump(): Promise<IFullMemoryDump>;

    /** @private IC name from GET_VERSION bytes */
    _parseIcType(productType: number, storageSize: number, productSubtype?: number): string;

    // ========== Byte helpers (aliases of NfcUtil) ==========

    bytesToString(bytes: number[]): string;
    stringToBytes(str: string): number[];
    bytesToHexString(bytes: number[]): string;
}

// ============================================
// NDEF Helper Utilities
// ============================================

export interface ITextHelper {
    decodePayload(data: number[]): string;
    encodePayload(text: string, lang?: string, encoding?: string): number[];
}

export interface IUriHelper {
    protocols: string[];
    decodePayload(data: number[]): string;
    encodePayload(uri: string): number[];
}

export interface INdefTnfFlags {
    mb: boolean;
    me: boolean;
    cf: boolean;
    sr: boolean;
    il: boolean;
    tnf: number;
}

export interface INdefUtil extends ITnf {
    RTD_TEXT: number[];
    RTD_URI: number[];
    RTD_SMART_POSTER: number[];
    RTD_ALTERNATIVE_CARRIER: number[];
    RTD_HANDOVER_CARRIER: number[];
    RTD_HANDOVER_REQUEST: number[];
    RTD_HANDOVER_SELECT: number[];

    /** Generic record; string type/id/payload are UTF-8 encoded */
    record(tnf: number, type: number[] | string, id: number[] | string, payload: number[] | string): INdefRecord;
    textRecord(text: string, languageCode?: string, id?: number[]): INdefRecord;
    uriRecord(uri: string, id?: number[]): INdefRecord;
    absoluteUriRecord(uri: string, payload?: number[] | string, id?: number[]): INdefRecord;
    mimeMediaRecord(mimeType: string, payload: string | number[], id?: number[]): INdefRecord;
    smartPoster(ndefRecords: INdefRecord[] | number[], id?: number[]): INdefRecord;
    emptyRecord(): INdefRecord;
    androidApplicationRecord(packageName: string): INdefRecord;

    encodeMessage(ndefRecords: INdefRecord[]): number[];
    decodeMessage(bytes: number[]): INdefRecord[];
    decodeTnf(tnfByte: number): INdefTnfFlags;
    encodeTnf(mb: boolean, me: boolean, cf: boolean, sr: boolean, il: boolean, tnf: number): number;
    tnfToString(tnf: number): string;

    /** Text of an NFC Forum Text record (1.8.0) */
    decodeTextRecord(record: INdefRecord): string;
    /** URI of an NFC Forum URI record, prefix expanded (1.8.0) */
    decodeUriRecord(record: INdefRecord): string;

    uriHelper: IUriHelper;
    textHelper: ITextHelper;
}

export interface IUtil {
    toHex(i: number): string;
    toPrintable(i: number): string;
    bytesToString(bytes: number[]): string;
    stringToBytes(str: string): number[];
    bytesToHexString(bytes: number[]): string;
    /** True if the record's TNF and type match */
    isType(record: INdefRecord, tnf: number, type: number[] | string): boolean;
    arrayBufferToHexString(buffer: ArrayBuffer): string;
    hexStringToArrayBuffer(hexString: string): ArrayBuffer;
}

// ============================================
// Type Name Format Constants
// ============================================

export interface ITnf {
    TNF_EMPTY: 0;
    TNF_WELL_KNOWN: 1;
    TNF_MIME_MEDIA: 2;
    TNF_ABSOLUTE_URI: 3;
    TNF_EXTERNAL_TYPE: 4;
    TNF_UNKNOWN: 5;
    TNF_UNCHANGED: 6;
    TNF_RESERVED: 7;
}

// ============================================
// Combined Plugin Interface
// ============================================

export interface NfcManager extends INfcPlugin {
    /** NDEF helper utilities */
    NdefPlugin: INdefUtil;
    /** General utilities */
    NfcUtil: IUtil;
    /** Fire an NFC event on document (used by the iOS / legacy code paths) */
    fireNfcTagEvent: (eventType: string, tagAsJson: string) => void;
}

// ============================================
// Global Declarations
// ============================================

declare global {
    interface Window {
        /** Also exposed as the legacy globals window.nfc / window.ndef / window.util, which are not
         *  declared here to avoid clashing with other libraries' declarations of those names. */
        NfcPlugin: NfcManager;
    }

    /** NFC Plugin instance */
    var NfcPlugin: NfcManager;
}

export default NfcManager;
