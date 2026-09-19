#import <React/RCTBridgeModule.h>

// Nome do modulo exposto ao JS: "FilePicker" (mesmo do Android, consumido em
// src/screens/ConfImportScreen.tsx via NativeModules.FilePicker).
@interface RCT_EXTERN_MODULE(FilePicker, NSObject)

RCT_EXTERN_METHOD(pickConf:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
