/*
 * Community Cordova NFC Plugin - TypeScript Definitions
 * Licensed under MIT License
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
    /** Tag type (e.g., "NFCTagTypeMiFare") */
    type?: string;
    /** Tag UID as byte array */
    id?: number[];
    /** Tech types available on the tag */
    techTypes?: string[];
    /** Maximum NDEF message size */
    maxSize?: number;
    /** Whether the tag is writable */
    isWritable?: boolean;
    /** Whether the tag can be made read-only */
    canMakeReadOnly?: boolean;
    /** NDEF message (array of records) */
    ndefMessage?: INdefRecord[];
}

/** NFC Event fired when tag is detected */
export interface INfcEvent extends Event {
    tag: INdefTag;
}

// ============================================
// Advanced Tag Analysis Types (v1.5.0+)
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
    /** Human-readable IC type (e.g., "NTAG215", "MIFARE Ultralight EV1") */
    icType: string;
}

/** Password protection status for NTAG */
export interface INtagPasswordStatus {
    /** Page number where protection starts */
    protectionStartPage: number;
    /** Whether any protection is enabled */
    isProtected: boolean;
    /** Whether read operations are protected */
    readProtected: boolean;
    /** Whether write operations are protected */
    writeProtected: boolean;
    /** Whether authentication attempt limiting is enabled */
    authLimitEnabled: boolean;
    /** Current authentication attempt counter (0-7) */
    authLimitCounter: number;
}

/** Complete memory dump result */
export interface IFullMemoryDump {
    /** Whether the dump was successful */
    success: boolean;
    /** Detected tag type string */
    tagType: string;
    /** Version info if available */
    version?: INtagVersionInfo;
    /** Total number of pages in the tag */
    totalPages: number;
    /** Raw memory data as ArrayBuffer */
    memoryDump: ArrayBuffer | null;
    /** Hex string representation of all memory */
    hexDump: string;
    /** Error message if failed */
    error?: string;
}

// ============================================
// Scan Options
// ============================================

/** Options for scanNdef and scanTag */
export interface IScanOptions {
    /** Keep session open after reading (iOS only) */
    keepSessionOpen?: boolean;
}

// ============================================
// NFC Plugin Interface
// ============================================

export interface INfcPlugin {
    // ========== Core NDEF Operations ==========

    /**
     * Scan for NDEF tags (iOS 13+)
     * @param options - Scan options
     * @returns Promise with tag data
     */
    scanNdef(options?: IScanOptions): Promise<INdefTag>;

    /**
     * Scan for any NFC tag with full tag info (iOS 13+)
     * @param options - Scan options
     * @returns Promise with tag data
     */
    scanTag(options?: IScanOptions): Promise<INdefTag>;

    /**
     * Write NDEF message to a tag
     * @param ndefMessage - Array of NDEF records to write
     * @returns Promise that resolves on success
     */
    write(ndefMessage: INdefRecord[]): Promise<void>;

    /**
     * Make a tag read-only (permanent!)
     * @returns Promise that resolves on success
     */
    makeReadOnly(): Promise<void>;

    /**
     * Erase a tag (write empty NDEF message)
     * @returns Promise that resolves on success
     */
    erase(): Promise<void>;

    /**
     * Cancel active NFC scan session
     * @returns Promise that resolves on success
     */
    cancelScan(): Promise<void>;

    // ========== Event Registration (Android) ==========

    /**
     * Register for NDEF tag events
     * @param callback - Called when tag is detected
     * @param onSuccess - Called on successful registration
     * @param onError - Called on error
     */
    addNdefListener(
        callback: (event: INfcEvent) => void,
        onSuccess?: () => void,
        onError?: (error: string) => void
    ): void;

    /**
     * Register for NDEF formatted tag events
     * @param callback - Called when NDEF formatted tag is detected
     * @param onSuccess - Called on successful registration
     * @param onError - Called on error
     */
    addNdefFormatableListener(
        callback: (event: INfcEvent) => void,
        onSuccess?: () => void,
        onError?: (error: string) => void
    ): void;

    /**
     * Register for MIME type events
     * @param mimeType - MIME type to filter (e.g., "text/plain")
     * @param callback - Called when matching tag is detected
     * @param onSuccess - Called on successful registration
     * @param onError - Called on error
     */
    addMimeTypeListener(
        mimeType: string,
        callback: (event: INfcEvent) => void,
        onSuccess?: () => void,
        onError?: (error: string) => void
    ): void;

    /**
     * Remove all NDEF listeners
     * @param onSuccess - Called on success
     * @param onError - Called on error
     */
    removeNdefListener(
        onSuccess?: () => void,
        onError?: (error: string) => void
    ): void;

    /**
     * Register for tag discovered events (non-NDEF tags and NDEF tags)
     * @param callback - Called when tag is detected
     * @param onSuccess - Called on successful registration
     * @param onError - Called on error
     */
    addTagDiscoveredListener(
        callback: (event: INfcEvent) => void,
        onSuccess?: () => void,
        onError?: (error: string) => void
    ): void;

    /**
     * Remove tag discovered listener
     * @param onSuccess - Called on success
     * @param onError - Called on error
     */
    removeTagDiscoveredListener(
        onSuccess?: () => void,
        onError?: (error: string) => void
    ): void;

    // ========== NFC Status ==========

    /**
     * Check if NFC is enabled
     * @returns Promise that resolves if enabled, rejects if disabled
     */
    enabled(): Promise<void>;

    /**
     * Open device NFC settings
     */
    showSettings(): void;

    // ========== Low-level Transceive (Android) ==========

    /**
     * Connect to a tag for transceive operations
     * @param tech - Tech type (e.g., "android.nfc.tech.NfcA")
     * @param timeout - Connection timeout in ms
     * @returns Promise that resolves on connection
     */
    connect(tech: string, timeout?: number): Promise<void>;

    /**
     * Close connection to tag
     * @returns Promise that resolves on close
     */
    close(): Promise<void>;

    /**
     * Send raw command to tag and receive response
     * @param command - Command bytes as ArrayBuffer
     * @returns Promise with response as ArrayBuffer
     */
    transceive(command: ArrayBuffer): Promise<ArrayBuffer>;

    // ========== Advanced Tag Analysis (v1.5.0+) ==========

    /**
     * Read raw memory pages from NTAG/MIFARE Ultralight
     * Uses READ command (0x30) which reads 4 pages at a time
     * @param startPage - Starting page number (0-based)
     * @param numPages - Number of pages to read
     * @returns Promise with raw memory data
     */
    readMemoryPages(startPage: number, numPages: number): Promise<ArrayBuffer>;

    /**
     * Get NTAG version information using GET_VERSION command (0x60)
     * @returns Promise with version info
     */
    getNtagVersion(): Promise<INtagVersionInfo>;

    /**
     * Read NTAG counter value (24-bit tap counter)
     * Uses READ_CNT command (0x39)
     * @returns Promise with counter value
     */
    readNtagCounter(): Promise<number>;

    /**
     * Read NTAG originality signature (32-byte ECC)
     * Uses READ_SIG command (0x3C)
     * @returns Promise with signature as ArrayBuffer
     */
    readNtagSignature(): Promise<ArrayBuffer>;

    /**
     * Get password protection status from configuration pages
     * @param configPage - Config page number (varies by tag type)
     * @returns Promise with protection status
     */
    getPasswordProtectionStatus(configPage?: number): Promise<INtagPasswordStatus>;

    /**
     * Perform complete memory dump with automatic tag detection
     * @returns Promise with full memory dump
     */
    fullMemoryDump(): Promise<IFullMemoryDump>;
}

// ============================================
// NDEF Helper Utilities
// ============================================

export interface INdefUtil {
    /**
     * Create a generic NDEF record
     * @param tnf - Type Name Format (0-7)
     * @param type - Record type as byte array or string
     * @param id - Record ID as byte array or string
     * @param payload - Payload as byte array or string
     * @returns NDEF record
     */
    record(tnf: number, type: number[] | string, id: number[] | string, payload: number[] | string): INdefRecord;

    /**
     * Create a text record
     * @param text - Text content
     * @param languageCode - Language code (default: "en")
     * @param id - Optional record ID
     * @returns NDEF record
     */
    textRecord(text: string, languageCode?: string, id?: number[]): INdefRecord;

    /**
     * Create a URI record
     * @param uri - Full URI string
     * @param id - Optional record ID
     * @returns NDEF record
     */
    uriRecord(uri: string, id?: number[]): INdefRecord;

    /**
     * Create an Android Application Record (AAR)
     * @param packageName - Android package name
     * @returns NDEF record
     */
    androidApplicationRecord(packageName: string): INdefRecord;

    /**
     * Create a MIME type record
     * @param mimeType - MIME type string
     * @param payload - Payload as string or byte array
     * @param id - Optional record ID
     * @returns NDEF record
     */
    mimeMediaRecord(mimeType: string, payload: string | number[], id?: number[]): INdefRecord;

    /**
     * Create an empty record
     * @returns Empty NDEF record
     */
    emptyRecord(): INdefRecord;

    /**
     * Decode text payload from NDEF record
     * @param record - NDEF record
     * @returns Decoded text string
     */
    decodeTextRecord(record: INdefRecord): string;

    /**
     * Decode URI from NDEF record
     * @param record - NDEF record
     * @returns Decoded URI string
     */
    decodeUriRecord(record: INdefRecord): string;
}

export interface IUtil {
    /**
     * Convert byte array to string
     * @param bytes - Byte array
     * @returns String
     */
    bytesToString(bytes: number[]): string;

    /**
     * Convert string to byte array
     * @param str - String
     * @returns Byte array
     */
    stringToBytes(str: string): number[];

    /**
     * Convert byte array to hex string
     * @param bytes - Byte array
     * @returns Hex string
     */
    bytesToHexString(bytes: number[]): string;

    /**
     * Convert ArrayBuffer to hex string
     * @param buffer - ArrayBuffer
     * @returns Hex string
     */
    arrayBufferToHexString(buffer: ArrayBuffer): string;

    /**
     * Check if two byte arrays are equal
     * @param a - First byte array
     * @param b - Second byte array
     * @returns True if equal
     */
    isType(a: number[], b: number[]): boolean;
}

// ============================================
// Type Name Format Constants
// ============================================

export interface ITnf {
    /** Record is empty */
    TNF_EMPTY: 0;
    /** NFC Forum well-known type */
    TNF_WELL_KNOWN: 1;
    /** Media type (RFC 2046) */
    TNF_MIME_MEDIA: 2;
    /** Absolute URI (RFC 3986) */
    TNF_ABSOLUTE_URI: 3;
    /** NFC Forum external type */
    TNF_EXTERNAL_TYPE: 4;
    /** Unknown type */
    TNF_UNKNOWN: 5;
    /** Unchanged (for chunked records) */
    TNF_UNCHANGED: 6;
    /** Reserved */
    TNF_RESERVED: 7;
}

// ============================================
// Combined Plugin Interface (following SecurityPlugin pattern)
// ============================================

export interface NfcManager extends INfcPlugin {
    /** NDEF helper utilities */
    NdefPlugin: INdefUtil;
    /** General utilities */
    NfcUtil: IUtil;
    /** Fire NFC tag event */
    fireNfcTagEvent: (eventType: string, tagAsJson: string) => void;
}

// ============================================
// Global Declarations
// ============================================

declare global {
    interface Window {
        NfcPlugin: NfcManager;
    }

    /** NFC Plugin instance (following SecurityPlugin pattern) */
    var NfcPlugin: NfcManager;
}

export default NfcManager;
