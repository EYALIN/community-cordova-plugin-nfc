//
//  NfcPlugin.m
//  PhoneGap NFC - Cordova Plugin
//
//  (c) 2107-2020 Don Coleman

#import "NfcPlugin.h"
#import <CoreNFC/CoreNFC.h>

@interface NfcPlugin() {
    NSString* sessionCallbackId;
    NSString* channelCallbackId;
    id<NFCNDEFTag> connectedTag API_AVAILABLE(ios(13.0));
    NFCNDEFStatus connectedTagStatus API_AVAILABLE(ios(13.0));
    // Held when an ISO 7816 tag is connected and keepSessionOpen=YES so that
    // subsequent JS calls to nfc.transceive() can exchange APDUs. (v1.7.0)
    id<NFCISO7816Tag> connectedISO7816Tag API_AVAILABLE(ios(13.0));
}
@property (nonatomic, assign) BOOL writeMode;
@property (nonatomic, assign) BOOL shouldUseTagReaderSession;
@property (nonatomic, assign) BOOL sendCallbackOnSessionStart;
@property (nonatomic, assign) BOOL returnTagInCallback;
@property (nonatomic, assign) BOOL returnTagInEvent;
@property (nonatomic, assign) BOOL keepSessionOpen;
// scanTag({pollFeliCa:true}): also poll ISO 18092 (FeliCa). Needs the app's
// com.apple.developer.nfc.readersession.felica.systemcodes Info.plist entry, so it is opt-in.
@property (nonatomic, assign) BOOL pollFeliCa;
@property (strong, nonatomic) NFCReaderSession *nfcSession API_AVAILABLE(ios(11.0));
@property (strong, nonatomic) NFCNDEFMessage *messageToWrite API_AVAILABLE(ios(11.0));
// Sessions that were cancelled or replaced but have not delivered didInvalidate yet, mapped to the
// callback id of the JS call that started them. Their late callbacks go to THAT call, never to
// the scan that replaced them (fork #1 / upstream #493).
@property (strong, nonatomic) NSMapTable *retiredSessionCallbacks;
// A scan requested while the previous session was still live: it begins once that session has
// invalidated (beginning earlier fails with "System resources unavailable").
@property (strong, nonatomic) CDVInvokedUrlCommand *pendingScanCommand;
@end

@implementation NfcPlugin

- (void)pluginInitialize {

    NSLog(@"PhoneGap NFC - Cordova Plugin");
    NSLog(@"(c) 2017-2020 Don Coleman");

    [super pluginInitialize];
    self.retiredSessionCallbacks = [NSMapTable strongToStrongObjectsMapTable];
    
    if (@available(iOS 11, *)) {
        if (![NFCNDEFReaderSession readingAvailable]) {
            NSLog(@"NFC Support is NOT available");
        }
    } else {
        NSLog(@"NFC Support is NOT available before iOS 11");
    }
}

#pragma mark - Cordova Plugin Methods

- (void)channel:(CDVInvokedUrlCommand *)command {
    // the channel is used to send NFC tag data to the web view
    channelCallbackId = [command.callbackId copy];
}

- (void)beginSession:(CDVInvokedUrlCommand*)command {
    NSLog(@"beginSession");
    NSLog(@"WARNING: beginSession is deprecated. Use scanNdef or scanTag.");

    self.shouldUseTagReaderSession = NO;
    self.sendCallbackOnSessionStart = YES;  // Not sure why we were doing this
    self.returnTagInCallback = NO;
    self.returnTagInEvent = YES;
    self.keepSessionOpen = NO;

    [self startScanSession:command];
}

- (void)scanNdef:(CDVInvokedUrlCommand*)command {
    NSLog(@"scanNdef");

    self.shouldUseTagReaderSession = NO;
    self.sendCallbackOnSessionStart = NO;
    self.returnTagInCallback = YES;
    self.returnTagInEvent = NO;
    self.pollFeliCa = NO;

    // boolValue: assigning the NSNumber itself made every non-nil value (including @NO) YES
    self.keepSessionOpen = [self boolOption:@"keepSessionOpen" in:[command argumentAtIndex:0]];

    [self startScanSession:command];
}

- (void)scanTag:(CDVInvokedUrlCommand*)command {
    NSLog(@"scanTag");

    self.shouldUseTagReaderSession = YES;
    self.sendCallbackOnSessionStart = NO;
    self.returnTagInCallback = YES;
    self.returnTagInEvent = NO;

    self.keepSessionOpen = [self boolOption:@"keepSessionOpen" in:[command argumentAtIndex:0]];
    self.pollFeliCa = [self boolOption:@"pollFeliCa" in:[command argumentAtIndex:0]];

    [self startScanSession:command];
}

- (void)writeTag:(CDVInvokedUrlCommand*)command API_AVAILABLE(ios(13.0)){
    NSLog(@"writeTag");
    
    self.writeMode = YES;
    self.shouldUseTagReaderSession = NO;
    BOOL reusingSession = NO;
    
    NSArray<NSDictionary *> *ndefData = [command argumentAtIndex:0];

    // Create the NDEF Message
    NSMutableArray<NFCNDEFPayload*> *payloads = [NSMutableArray new];
                              
    @try {
        for (id recordData in ndefData) {
            NSNumber *tnfNumber = [recordData objectForKey:@"tnf"];
            NFCTypeNameFormat tnf = (uint8_t)[tnfNumber intValue];
            NSData *type = [self uint8ArrayToNSData:[recordData objectForKey:@"type"]];
            // records use `id` everywhere else (ndef.record, Android, what scans return); 1.7.1 read
            // `identifiers` here, so ids were dropped on every iOS write / copy
            id recordId = [recordData objectForKey:@"id"];
            if (![recordId isKindOfClass:[NSArray class]]) {
                recordId = [recordData objectForKey:@"identifiers"];
            }
            NSData *identifier = [recordId isKindOfClass:[NSArray class]] ? [self uint8ArrayToNSData:recordId] : [NSData data];
            NSData *payload  = [self uint8ArrayToNSData:[recordData objectForKey:@"payload"]];
            NFCNDEFPayload *record = [[NFCNDEFPayload alloc] initWithFormat:tnf type:type identifier:identifier payload:payload];
            [payloads addObject:record];
        }
        NSLog(@"%@", payloads);
        NFCNDEFMessage *message = [[NFCNDEFMessage alloc] initWithNDEFRecords:payloads];
        self.messageToWrite = message;
    } @catch(NSException *e) {
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"INVALID_ARGUMENT" message:@"Invalid NDEF Message"]];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
        return;
    }

    if (self.nfcSession && self.nfcSession.isReady) {       // reuse existing session
        reusingSession = YES;
    } else {                                                // create a new session
        if (self.shouldUseTagReaderSession) {
            NSLog(@"Using NFCTagReaderSession");

            self.nfcSession = [[NFCTagReaderSession alloc]
                       initWithPollingOption:(NFCPollingISO14443 | NFCPollingISO15693)
                       delegate:self queue:dispatch_get_main_queue()];

        } else {
            NSLog(@"Using NFCTagReaderSession");
            self.nfcSession = [[NFCNDEFReaderSession alloc]initWithDelegate:self queue:dispatch_get_main_queue() invalidateAfterFirstRead:FALSE];
        }
    }

    self.nfcSession.alertMessage = [self localizeString:@"NFCHoldNearWritableTag" defaultValue:@"Hold near writable NFC tag to update."];
    sessionCallbackId = [command.callbackId copy];

    if (reusingSession) {                   // reusing a read session to write
        self.keepSessionOpen = NO;          // close session after writing
        [self writeNDEFTag:self.nfcSession status:connectedTagStatus tag:connectedTag];
    } else {
        [self.nfcSession beginSession];
    }
}

- (void)cancelScan:(CDVInvokedUrlCommand*)command API_AVAILABLE(ios(11.0)){
    NSLog(@"cancelScan");
    [self rejectPendingScan];
    // The cancelled scan still gets its own "cancelled" rejection when didInvalidate arrives, but
    // that late callback can no longer reach a scan started right after this one.
    [self retireCurrentSession];
    connectedTag = NULL;
    connectedTagStatus = NFCNDEFStatusNotSupported;
    if (@available(iOS 13.0, *)) {
        connectedISO7816Tag = NULL;
    }
    CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
    [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
}

- (void)invalidateSession:(CDVInvokedUrlCommand*)command {
    NSLog(@"invalidateSession");
    NSLog(@"WARNING: invalidateSession is deprecated. Use cancelScan.");
    
    [self retireCurrentSession];
    // Always return OK. Alternately could send status from the NFCNDEFReaderSessionDelegate
    CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
    [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
}

// Nothing happens here, the event listener is registered in JavaScript
- (void)registerNdef:(CDVInvokedUrlCommand *)command {
    NSLog(@"registerNdef");
    CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
    [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
}

// Nothing happens here, the event listener is removed in JavaScript
- (void)removeNdef:(CDVInvokedUrlCommand *)command {
    NSLog(@"removeNdef");
    CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
    [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
}

- (void)enabled:(CDVInvokedUrlCommand *)command {
    NSLog(@"enabled");
    CDVPluginResult *pluginResult;
    if (@available(iOS 11.0, *)) {
        if ([NFCNDEFReaderSession readingAvailable]) {
            pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
        } else {
            pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"NO_NFC" message:@"NO_NFC"]];
        }
    } else {
        pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"NO_NFC" message:@"NO_NFC"]];
    }
    [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
}

// nfc.transceive(buffer) — added v1.7.0 to match Android IsoDep.transceive.
// Requires an ISO 7816-compatible tag detected via scanTag({keepSessionOpen:true}).
// Resolves with an ArrayBuffer containing the APDU response data with sw1/sw2
// appended (Android IsoDep semantics).
- (void)transceive:(CDVInvokedUrlCommand *)command {
    NSLog(@"transceive");

    if (@available(iOS 13.0, *)) {
        if (self.nfcSession == nil || !self.nfcSession.isReady) {
            CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"NOT_CONNECTED" message:@"No active NFC session. Call nfc.scanTag({keepSessionOpen:true}) first."]];
            [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
            return;
        }

        if (connectedISO7816Tag == nil) {
            CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"NOT_CONNECTED" message:@"No ISO 7816 tag connected. Only ISO 7816-compatible tags support transceive on iOS."]];
            [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
            return;
        }

        // Cordova-iOS converts a JS ArrayBuffer argument into an NSData.
        id arg = [command argumentAtIndex:0];
        NSData *apduData = nil;
        if ([arg isKindOfClass:[NSData class]]) {
            apduData = (NSData *)arg;
        } else if ([arg isKindOfClass:[NSArray class]]) {
            // Fallback if a uint8 array was sent instead of an ArrayBuffer.
            apduData = [self uint8ArrayToNSData:(NSArray *)arg];
        }

        if (apduData == nil || apduData.length < 4) {
            CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"INVALID_ARGUMENT" message:@"Invalid APDU: expected at least 4 bytes (CLA INS P1 P2)."]];
            [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
            return;
        }

        NFCISO7816APDU *apdu = [[NFCISO7816APDU alloc] initWithData:apduData];
        if (apdu == nil) {
            CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"INVALID_ARGUMENT" message:@"Invalid APDU encoding."]];
            [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
            return;
        }

        NSString *callbackId = [command.callbackId copy];

        [connectedISO7816Tag sendCommandAPDU:apdu completionHandler:^(NSData * _Nonnull responseData, uint8_t sw1, uint8_t sw2, NSError * _Nullable error) {
            if (error) {
                NSLog(@"transceive error: %@", error);
                CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorFromNSError:error]];
                [self.commandDelegate sendPluginResult:pluginResult callbackId:callbackId];
                return;
            }

            // Match Android IsoDep.transceive: response data with sw1/sw2 appended.
            NSMutableData *full = [NSMutableData dataWithData:responseData ?: [NSData data]];
            [full appendBytes:&sw1 length:1];
            [full appendBytes:&sw2 length:1];

            CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsArrayBuffer:full];
            [self.commandDelegate sendPluginResult:pluginResult callbackId:callbackId];
        }];
    } else {
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"NOT_SUPPORTED" message:@"transceive requires iOS 13 or later."]];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
    }
}

#pragma mark - NFCNDEFReaderSessionDelegate

// iOS 11 & 12
- (void) readerSession:(NFCNDEFReaderSession *)session didDetectNDEFs:(NSArray<NFCNDEFMessage *> *)messages API_AVAILABLE(ios(11.0)) {
    NSLog(@"NFCNDEFReaderSession didDetectNDEFs");
    if ([self isStaleSession:session]) { return; }
    
    session.alertMessage = [self localizeString:@"NFCTagRead" defaultValue:@"Tag successfully read."];
    for (NFCNDEFMessage *message in messages) {
        [self fireNdefEvent: message];
    }
}

// iOS 13
- (void) readerSession:(NFCNDEFReaderSession *)session didDetectTags:(NSArray<__kindof id<NFCNDEFTag>> *)tags API_AVAILABLE(ios(13.0)) {
    if ([self isStaleSession:session]) { return; }

    if (tags.count > 1) {
        session.alertMessage = [self localizeString:@"NFCMoreThanOneTag" defaultValue:@"More than 1 tag detected. Please remove all tags and try again."];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            NSLog(@"restaring polling");
            [session restartPolling];
        });
        return;
    }
    
    id<NFCNDEFTag> tag = [tags firstObject];
    
    [session connectToTag:tag completionHandler:^(NSError * _Nullable error) {
        if (error) {
            NSLog(@"%@", error);
            [self closeSession:session withErrorCode:@"IO_ERROR" message:[self localizeString:@"NFCErrorTagConnection" defaultValue:@"Error connecting to tag."]];
            return;
        }
        
        [self processNDEFTag:session tag:tag];
    }];
    
}

- (void) readerSession:(NFCNDEFReaderSession *)session didInvalidateWithError:(NSError *)error API_AVAILABLE(ios(11.0)) {
    NSLog(@"readerSession ended");
    [self session:session didInvalidateWithError:error];
}

- (void) readerSessionDidBecomeActive:(nonnull NFCReaderSession *)session API_AVAILABLE(ios(11.0)) {
    NSLog(@"readerSessionDidBecomeActive");
    if ([self isStaleSession:session]) { return; }
    [self sessionDidBecomeActive:session];
}

#pragma mark - NFCTagReaderSessionDelegate

- (void)tagReaderSessionDidBecomeActive:(NFCTagReaderSession *)session API_AVAILABLE(ios(13.0)) {
    NSLog(@"tagReaderSessionDidBecomeActive");
    if ([self isStaleSession:session]) { return; }
    [self sessionDidBecomeActive:session];
}

- (void)tagReaderSession:(NFCTagReaderSession *)session didDetectTags:(NSArray<__kindof id<NFCTag>> *)tags API_AVAILABLE(ios(13.0)) {
    NSLog(@"tagReaderSession didDetectTags");
    if ([self isStaleSession:session]) { return; }
    
    if (tags.count > 1) {
        session.alertMessage = [self localizeString:@"NFCMoreThanOneTag" defaultValue:@"More than 1 tag detected. Please remove all tags and try again."];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            NSLog(@"restaring polling");
            [session restartPolling];
        });
        return;
    }
    
    id<NFCTag> tag = [tags firstObject];
    NSMutableDictionary *tagMetaData = [self getTagInfo:tag];
    id<NFCNDEFTag> ndefTag = (id<NFCNDEFTag>)tag;

    [session connectToTag:tag completionHandler:^(NSError * _Nullable error) {
        if (error) {
            NSLog(@"%@", error);
            [self closeSession:session withErrorCode:@"IO_ERROR" message:[self localizeString:@"NFCErrorTagConnection" defaultValue:@"Error connecting to tag."]];
            return;
        }

        // ISO 7816 + keepSessionOpen path (v1.7.0): hold the tag for subsequent
        // nfc.transceive() APDU exchanges. Skip the NDEF path entirely since
        // ISO 7816 tags (gov ID, banking, health) are typically non-NDEF and
        // processNDEFTag would close the session on NFCNDEFStatusNotSupported.
        if (tag.type == NFCTagTypeISO7816Compatible && self.keepSessionOpen) {
            self->connectedISO7816Tag = [tag asNFCISO7816Tag];
            session.alertMessage = [self localizeString:@"NFCTagRead" defaultValue:@"Tag successfully read."];
            [self fireTagEvent:tagMetaData];
            return;
        }

        [self processNDEFTag:session tag:ndefTag metaData:tagMetaData];
    }];
}

- (void)tagReaderSession:(NFCTagReaderSession *)session didInvalidateWithError:(NSError *)error API_AVAILABLE(ios(13.0)) {
    NSLog(@"tagReaderSession ended");
    [self session:session didInvalidateWithError:error];
}

#pragma mark - Session lifecycle (1.8.0)

// YES when a delegate callback comes from a session that is no longer self.nfcSession
// (cancelled or replaced). Such callbacks must not touch the current scan.
- (BOOL)isStaleSession:(NFCReaderSession *)session API_AVAILABLE(ios(11.0)) {
    if (session != self.nfcSession) {
        NSLog(@"Ignoring a callback from a stale NFC session");
        return YES;
    }
    return NO;
}

// Detach the current session (and its JS callback) and invalidate it if it is still running.
// Its didInvalidate is routed to its own callback via retiredSessionCallbacks.
- (void)retireCurrentSession API_AVAILABLE(ios(11.0)) {
    NFCReaderSession *old = self.nfcSession;
    if (!old) {
        return;
    }
    if (sessionCallbackId) {
        [self.retiredSessionCallbacks setObject:sessionCallbackId forKey:old];
    }
    self.nfcSession = nil;
    sessionCallbackId = NULL;
    connectedTag = NULL;
    connectedTagStatus = NFCNDEFStatusNotSupported;
    if (@available(iOS 13.0, *)) {
        connectedISO7816Tag = NULL;
    }
    if (old.isReady) {
        [old invalidateSession];
    } else {
        // Already invalidated: no didInvalidate will come, nothing to wait for.
        [self.retiredSessionCallbacks removeObjectForKey:old];
    }
}

// Common didInvalidate handling for both session types.
- (void)session:(NFCReaderSession *)session didInvalidateWithError:(NSError *)error API_AVAILABLE(ios(11.0)) {
    BOOL firstReadDone = [session isKindOfClass:[NFCNDEFReaderSession class]] &&
        error.code == NFCReaderSessionInvalidationErrorFirstNDEFTagRead;   // not an error

    if (session == self.nfcSession) {
        if (firstReadDone) {
            NSLog(@"Session ended after successful NDEF tag read");
        } else {
            [self sendNSError:error];
        }
        self.nfcSession = nil;
    } else {
        NSString *retiredCallbackId = [self.retiredSessionCallbacks objectForKey:session];
        [self.retiredSessionCallbacks removeObjectForKey:session];
        if (retiredCallbackId.length > 0 && !firstReadDone) {
            // the cancelled / replaced scan still learns how it ended - on its OWN callback
            CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorFromNSError:error]];
            [self.commandDelegate sendPluginResult:pluginResult callbackId:retiredCallbackId];
        }
    }

    [self beginPendingScanIfIdle];
}

// A scan that was parked (waiting for the previous session to invalidate) and is now cancelled or
// superseded never began: answer it the way a cancelled session is answered, so its JS promise
// settles instead of hanging.
- (void)rejectPendingScan API_AVAILABLE(ios(11.0)) {
    CDVInvokedUrlCommand *pending = self.pendingScanCommand;
    self.pendingScanCommand = nil;
    if (pending) {
        NSDictionary *error = @{ @"code": @(NFCReaderSessionInvalidationErrorUserCanceled),
                                 @"message": @"Session invalidated by user",
                                 @"domain": NFCErrorDomain };
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:error];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:pending.callbackId];
    }
}

- (void)beginPendingScanIfIdle API_AVAILABLE(ios(11.0)) {
    CDVInvokedUrlCommand *pending = self.pendingScanCommand;
    if (pending && (self.nfcSession == nil || !self.nfcSession.isReady) && self.retiredSessionCallbacks.count == 0) {
        self.pendingScanCommand = nil;
        [self beginScanSession:pending];
    }
}

- (BOOL)boolOption:(NSString *)key in:(id)options {
    if (![options isKindOfClass:[NSDictionary class]]) {
        return NO;
    }
    id value = [(NSDictionary *)options objectForKey:key];
    if ([value respondsToSelector:@selector(boolValue)]) {
        return [value boolValue];
    }
    return NO;
}

#pragma mark - Common NDEF Processing

// Handles scanNdef, scanTag, and beginSession
- (void)startScanSession:(CDVInvokedUrlCommand*)command {
    if (@available(iOS 11.0, *)) {
        if (self.nfcSession && self.nfcSession.isReady) {
            // A session is still live (e.g. a rescan right after cancel): invalidate it and begin the
            // new one only after its didInvalidate, with a fallback in case that never arrives.
            NSLog(@"Previous NFC session still active; starting the new scan after it invalidates");
            [self rejectPendingScan];
            self.pendingScanCommand = command;
            [self retireCurrentSession];
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1500 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
                if (self.pendingScanCommand == command) {
                    NSLog(@"didInvalidate did not arrive in time; starting the pending scan");
                    self.pendingScanCommand = nil;
                    [self beginScanSession:command];
                }
            });
            return;
        }
        if (self.retiredSessionCallbacks.count > 0) {
            // a cancelled session is still shutting down
            [self rejectPendingScan];
            self.pendingScanCommand = command;
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1500 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
                if (self.pendingScanCommand == command) {
                    self.pendingScanCommand = nil;
                    [self beginScanSession:command];
                }
            });
            return;
        }
    }
    [self beginScanSession:command];
}

- (void)beginScanSession:(CDVInvokedUrlCommand*)command {

    self.writeMode = NO;
    
    NSLog(@"shouldUseTagReaderSession %d", self.shouldUseTagReaderSession);
    NSLog(@"callbackOnSessionStart %d", self.sendCallbackOnSessionStart);
    NSLog(@"returnTagInCallback %d", self.returnTagInCallback);
    NSLog(@"returnTagInEvent %d", self.returnTagInEvent);
    
    if (@available(iOS 13.0, *)) {
        
        if (self.shouldUseTagReaderSession) {
            NSLog(@"Using NFCTagReaderSession");
            NFCPollingOption polling = NFCPollingISO14443 | NFCPollingISO15693;
            if (self.pollFeliCa) {
                polling |= NFCPollingISO18092;
            }
            self.nfcSession = [[NFCTagReaderSession alloc]
                           initWithPollingOption:polling
                           delegate:self queue:dispatch_get_main_queue()];
        } else {
            NSLog(@"Using NFCNDEFReaderSession");
            self.nfcSession = [[NFCNDEFReaderSession alloc]initWithDelegate:self queue:dispatch_get_main_queue() invalidateAfterFirstRead:TRUE];
        }
        sessionCallbackId = [command.callbackId copy];
        self.nfcSession.alertMessage = [self localizeString:@"NFCHoldNearTag" defaultValue:@"Hold near NFC tag to scan."];
        [self.nfcSession beginSession];
        
    } else if (@available(iOS 11.0, *)) {
        NSLog(@"iOS < 13, using NFCNDEFReaderSession");
        self.nfcSession = [[NFCNDEFReaderSession alloc]initWithDelegate:self queue:dispatch_get_main_queue() invalidateAfterFirstRead:TRUE];
        sessionCallbackId = [command.callbackId copy];
        self.nfcSession.alertMessage = [self localizeString:@"NFCHoldNearTag" defaultValue:@"Hold near NFC tag to scan."];
        [self.nfcSession beginSession];
    } else {
        NSLog(@"iOS < 11, no NFC support");
        CDVPluginResult *pluginResult;
        pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:[self errorWithCode:@"NO_NFC" message:@"NFC requires iOS 11"]];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
    }
        
}

- (void)processNDEFTag: (NFCReaderSession *)session tag:(__kindof id<NFCNDEFTag>)tag API_AVAILABLE(ios(13.0)) {
    [self processNDEFTag:session tag:tag metaData:[NSMutableDictionary new]];
}

- (void)processNDEFTag: (NFCReaderSession *)session tag:(__kindof id<NFCNDEFTag>)tag metaData: (NSMutableDictionary * _Nonnull)metaData API_AVAILABLE(ios(13.0)) {
                            
    [tag queryNDEFStatusWithCompletionHandler:^(NFCNDEFStatus status, NSUInteger capacity, NSError * _Nullable error) {
        if (!error && status != NFCNDEFStatusNotSupported) {
            metaData[@"maxSize"] = @(capacity);   // same field as Android's Ndef.getMaxSize()
        }
        if (error) {
            NSLog(@"%@", error);
            [self closeSession:session withErrorCode:@"IO_ERROR" message:[self localizeString:@"NFCErrorTagStatus" defaultValue:@"Error getting tag status."]];
            return;
        }
                
        if (self.writeMode) {
            [self writeNDEFTag:session status:status tag:tag];
        } else {
            // save tag & status so we can re-use in write
            if (self.keepSessionOpen) {
                self->connectedTagStatus = status;
                self->connectedTag = tag;
            }
            [self readNDEFTag:session status:status tag:tag metaData:metaData];
        }

    }];
}

- (void)readNDEFTag:(NFCReaderSession * _Nonnull)session status:(NFCNDEFStatus)status tag:(id<NFCNDEFTag>)tag metaData:(NSMutableDictionary * _Nonnull)metaData  API_AVAILABLE(ios(13.0)){
        
    if (status == NFCNDEFStatusNotSupported) {
        NSLog(@"Tag does not support NDEF");
        [self fireTagEvent:metaData];
        [self closeSession:session];
        return;
    }
    
    if (status == NFCNDEFStatusReadOnly) {
        metaData[@"isWritable"] = @FALSE;
    } else if (status == NFCNDEFStatusReadWrite) {
        metaData[@"isWritable"] = @TRUE;
    }
    
    [tag readNDEFWithCompletionHandler:^(NFCNDEFMessage * _Nullable message, NSError * _Nullable error) {

        // Error Code=403 "NDEF tag does not contain any NDEF message" is not an error for this plugin
        if (error && error.code != 403) {
            NSLog(@"%@", error);
            [self closeSession:session withErrorCode:@"IO_ERROR" message:[self localizeString:@"NFCDataReadFailed" defaultValue:@"Read Failed."]];
            return;
        } else {
            NSLog(@"%@", message);
            session.alertMessage = [self localizeString:@"NFCTagRead" defaultValue:@"Tag successfully read."];
            [self fireNdefEvent:message metaData:metaData];
            [self closeSession:session];
        }

    }];

}

- (void)writeNDEFTag:(NFCReaderSession * _Nonnull)session status:(NFCNDEFStatus)status tag:(id<NFCNDEFTag>)tag  API_AVAILABLE(ios(13.0)){
    switch (status) {
        case NFCNDEFStatusNotSupported:
            [self closeSession:session withErrorCode:@"NOT_NDEF" message:[self localizeString:@"NFCNotNdefCompliant" defaultValue:@"Tag is not NDEF compliant."]];  // alternate message "Tag does not support NDEF."
            break;
        case NFCNDEFStatusReadOnly:
            [self closeSession:session withErrorCode:@"READ_ONLY" message:[self localizeString:@"NFCReadOnlyTag" defaultValue:@"Tag is read only."]];
            break;
        case NFCNDEFStatusReadWrite: {
            
            [tag writeNDEF: self.messageToWrite completionHandler:^(NSError * _Nullable error) {
                if (error) {
                    NSLog(@"%@", error);
                    [self closeSession:session withErrorCode:@"IO_ERROR" message:[self localizeString:@"NFCDataWriteFailed" defaultValue:@"Write failed."]];
                } else {
                    session.alertMessage = [self localizeString:@"NFCDataWrote" defaultValue:@"Wrote data to NFC tag."];
                    CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
                    [self.commandDelegate sendPluginResult:pluginResult callbackId:self->sessionCallbackId];
                    [self closeSession:session];
                }
            }];
            break;
            
        }
        default:
            [self closeSession:session withErrorCode:@"UNKNOWN" message:[self localizeString:@"NFCUnknownNdefTag" defaultValue:@"Unknown NDEF tag status."]];
    }
}

#pragma mark - Tag Reader Helper Functions

// Gets the tag meta data - type and uid
- (NSMutableDictionary *) getTagInfo:(id<NFCTag>)tag API_AVAILABLE(ios(13.0)) {
    
    NSMutableDictionary *tagInfo = [NSMutableDictionary new];
    
    NSData *uid;
    NSString *type;
    
    switch (tag.type) {
        case NFCTagTypeFeliCa: {
            type = @"NFCTagTypeFeliCa";
            id<NFCFeliCaTag> felica = [tag asNFCFeliCaTag];
            uid = felica.currentIDm;
            if (felica.currentSystemCode) {
                [tagInfo setValue:[self uint8ArrayFromNSData:felica.currentSystemCode] forKey:@"systemCode"];
            }
            break;
        }
        case NFCTagTypeMiFare: {
            type = @"NFCTagTypeMiFare";
            id<NFCMiFareTag> mifare = [tag asNFCMiFareTag];
            uid = mifare.identifier;
            [tagInfo setValue:[self mifareFamilyName:mifare.mifareFamily] forKey:@"mifareFamily"];
            break;
        }
        case NFCTagTypeISO15693:
            type = @"NFCTagTypeISO15693";
            uid = [[tag asNFCISO15693Tag] identifier];
            break;
        case NFCTagTypeISO7816Compatible:
            type = @"NFCTagTypeISO7816Compatible";
            uid = [[tag asNFCISO7816Tag] identifier];
            break;
        default:
            type = @"Unknown";
            uid = nil;
            break;
    }
                    
    NSLog(@"getTagInfo: %@ with uid %@", type, uid);
    
    [tagInfo setValue:type forKey:@"type"];
    if (uid) {
        [tagInfo setValue:uid forKey:@"id"];
    }
    return tagInfo;
}

- (NSString *) mifareFamilyName:(NFCMiFareFamily)family API_AVAILABLE(ios(13.0)) {
    switch (family) {
        case NFCMiFareUltralight: return @"Ultralight";
        case NFCMiFarePlus: return @"Plus";
        case NFCMiFareDESFire: return @"DESFire";
        default: return @"Unknown";
    }
}

#pragma mark - internal implementation

// Errors reach JS as {code, message[, domain]}: CoreNFC NSErrors keep their numeric NFCReaderError
// code (200 = user cancelled, 201 = timeout, 203 = system busy, ...); plugin errors use the same
// string codes as Android. www/phonegap-nfc.js turns this back into the message string unless the
// app called nfc.useErrorObjects(true).
- (NSDictionary *) errorWithCode:(id)code message:(NSString *)message {
    return @{ @"code": code ?: @"UNKNOWN", @"message": message ?: @"" };
}

- (NSDictionary *) errorFromNSError:(NSError *)error {
    return @{
        @"code": @(error.code),
        @"message": error.localizedDescription ?: @"",
        @"domain": error.domain ?: @""
    };
}

- (void) sendErrorResult:(NSDictionary *)error {
    // only send the error if the callback id exists
    if (sessionCallbackId) {
        NSLog(@"sendError: %@", error);
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:error];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:sessionCallbackId];
    }
}

- (void) sendNSError:(NSError *)error {
    [self sendErrorResult:[self errorFromNSError:error]];
}

- (void) sessionDidBecomeActive:(NFCReaderSession *) session  API_AVAILABLE(ios(11.0)){
    if (sessionCallbackId && self.sendCallbackOnSessionStart) {
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
        [pluginResult setKeepCallback:@YES];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:sessionCallbackId];
    }
}

- (void) closeSession:(NFCReaderSession *) session  API_AVAILABLE(ios(11.0)){

    // this is a hack to keep a read session open to allow writing
    if (self.keepSessionOpen) {
        return;
    }

    // kill the callback so the Cordova doesn't get "Session invalidated by user"
    sessionCallbackId = NULL;
    connectedTag = NULL;
    connectedTagStatus = NFCNDEFStatusNotSupported;
    if (@available(iOS 13.0, *)) {
        connectedISO7816Tag = NULL;
    }
    [self markSessionClosing:session];
    [session invalidateSession];
}

// A session this plugin is closing: a new scan waits for its didInvalidate, and that late
// callback has no JS call to answer.
- (void) markSessionClosing:(NFCReaderSession *) session API_AVAILABLE(ios(11.0)) {
    if (session.isReady) {
        [self.retiredSessionCallbacks setObject:@"" forKey:session];
    }
    if (session == self.nfcSession) {
        self.nfcSession = nil;
    }
}

- (void) closeSession:(NFCReaderSession *) session withErrorCode:(NSString *) code message:(NSString *) errorMessage  API_AVAILABLE(ios(11.0)){
    [self sendErrorResult:[self errorWithCode:code message:errorMessage]];

    // kill the callback so Cordova doesn't get "Session invalidated by user"
    sessionCallbackId = NULL;
    connectedTag = NULL;
    connectedTagStatus = NFCNDEFStatusNotSupported;
    if (@available(iOS 13.0, *)) {
        connectedISO7816Tag = NULL;
    }

    [self markSessionClosing:session];
    if (@available(iOS 13.0, *)) {
        [session invalidateSessionWithErrorMessage:errorMessage];
    } else {
        [session invalidateSession];
    }
}

-(void) fireTagEvent:(NSDictionary *)metaData API_AVAILABLE(ios(11.0)) {
    // Data is from a tag, but still ends up as an NDEF event in Javascript
    [self fireNdefEvent:nil metaData:metaData];
}

-(void) fireNdefEvent:(NFCNDEFMessage *) ndefMessage API_AVAILABLE(ios(11.0)) {
    [self fireNdefEvent:ndefMessage metaData:nil];
}

// TODO rename method since we're using the channel or callback instead of firing an event
-(void) fireNdefEvent:(NFCNDEFMessage *) ndefMessage metaData:(NSDictionary *)metaData API_AVAILABLE(ios(11.0)) {
    NSLog(@"fireNdefEvent");
    
    NSMutableDictionary *nfcEvent = [NSMutableDictionary new];
    nfcEvent[@"type"] = @"ndef";
    nfcEvent[@"tag"] = [self buildTagDictionary:ndefMessage metaData:metaData];

    if (sessionCallbackId && self.returnTagInCallback) {
        NSLog(@"Sending NFC data via sessionCallbackId");
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:nfcEvent[@"tag"]];
//        [pluginResult setKeepCallback:[NSNumber numberWithBool:YES]];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:sessionCallbackId];
        sessionCallbackId = NULL;
    }
    
    if (channelCallbackId && self.returnTagInEvent) {
        NSLog(@"Sending NFC data via channelCallbackId so an NDEF event fires)");
        
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:nfcEvent];
        [pluginResult setKeepCallback:[NSNumber numberWithBool:YES]];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:channelCallbackId];
    }
}

// NSDictionary representing an NFC tag
// NSData fields are converted to uint8_t arrays
-(NSDictionary *) buildTagDictionary:(NFCNDEFMessage *) ndefMessage metaData: (NSDictionary *)metaData API_AVAILABLE(ios(11.0)) {
    
    NSMutableDictionary *dictionary = [NSMutableDictionary new];
    
    // start with tag meta data
    if (metaData) {
        [dictionary setDictionary:metaData];
    }

    // convert uid from NSData to a uint8_t array
    NSData *uid = [dictionary objectForKey:@"id"];
    if (uid) {
        dictionary[@"id"] = [self uint8ArrayFromNSData: uid];
    }
    
    if (ndefMessage) {
        NSMutableArray *array = [NSMutableArray new];
        for (NFCNDEFPayload *record in ndefMessage.records){
            NSDictionary* recordDictionary = [self ndefRecordToNSDictionary:record];
            [array addObject:recordDictionary];
        }
        [dictionary setObject:array forKey:@"ndefMessage"];
    }
    
    return [dictionary copy];
}

-(NSDictionary *) ndefRecordToNSDictionary:(NFCNDEFPayload *) ndefRecord API_AVAILABLE(ios(11.0)) {
    NSMutableDictionary *dict = [NSMutableDictionary new];
    dict[@"tnf"] = [NSNumber numberWithInt:(int)ndefRecord.typeNameFormat];
    dict[@"type"] = [self uint8ArrayFromNSData: ndefRecord.type];
    dict[@"id"] = [self uint8ArrayFromNSData: ndefRecord.identifier];
    dict[@"payload"] = [self uint8ArrayFromNSData: ndefRecord.payload];
    NSDictionary *copy = [dict copy];
    return copy;
}

- (NSArray *) uint8ArrayFromNSData:(NSData *) data {
    const void *bytes = [data bytes];
    NSMutableArray *array = [NSMutableArray array];
    for (NSUInteger i = 0; i < [data length]; i += sizeof(uint8_t)) {
        uint8_t elem = OSReadLittleInt(bytes, i);
        [array addObject:[NSNumber numberWithInt:elem]];
    }
    return array;
}

- (NSData *) uint8ArrayToNSData:(NSArray *) array {
    // NSLog(@"nsDataFromUint8Array input %@", array);
    
    NSMutableData *data = [[NSMutableData alloc] initWithCapacity: [array count]];
    for (NSNumber *number in array) {
        uint8_t b = (uint8_t)[number unsignedIntValue];
        // NSLog(@"> %hhu", b);
        [data appendBytes:&b length:1];
    }
    return data;
}

- (NSString*) dictionaryAsJSONString:(NSDictionary *)dict {
    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:dict options:0 error:&error];
    NSString *jsonString;
    if (! jsonData) {
        jsonString = [NSString stringWithFormat:@"Error creating JSON for NDEF Message: %@", error];
        NSLog(@"%@", jsonString);
    } else {
        jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    }
    return jsonString;
}

// Sheet texts can be translated by the app: add the keys listed in the README ("Localizing the iOS
// NFC sheet") to the app's <lang>.lproj/Localizable.strings. A missing key falls back to English.
- (NSString*) localizeString:(NSString *)key defaultValue:(NSString*) defaultValue {
    NSString *localized = [[NSBundle mainBundle] localizedStringForKey:key value:nil table:nil];
    // Foundation returns the key itself when there is no translation. Compare the text, not the
    // pointer (1.7.1 used !=, which only worked because Foundation happened to hand back the
    // same object).
    if (localized.length == 0 || [localized isEqualToString:key]) {
        return defaultValue;
    }
    return localized;
}

@end
