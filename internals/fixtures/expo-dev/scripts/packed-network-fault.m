#import <Foundation/Foundation.h>

// Injected into one Simulator process. The packed SDK and its request URLs are unchanged.
@interface PackedNetworkFault : NSURLProtocol
@end
@implementation PackedNetworkFault
+ (void)load {
  [NSURLProtocol registerClass:self];
  [@"loaded before app main\n" writeToFile:[NSHomeDirectory() stringByAppendingPathComponent:@"Library/Caches/packed-network-fault-loaded.txt"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}
+ (BOOL)canInitWithRequest:(NSURLRequest *)request {
  return [@[@"https", @"http"] containsObject:request.URL.scheme.lowercaseString];
}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request { return request; }
- (void)startLoading {
  NSDictionary *event = @{@"url": self.request.URL.absoluteString,
    @"method": self.request.HTTPMethod ?: @"GET", @"error": @(-1009),
    @"process": @(NSProcessInfo.processInfo.processIdentifier),
    @"at": @([NSDate date].timeIntervalSince1970)};
  NSData *json = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
  NSString *path = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Caches/packed-network-fault.jsonl"];
  @synchronized(PackedNetworkFault.class) {
    if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
      [[NSFileManager defaultManager] createFileAtPath:path contents:nil attributes:nil];
    }
    NSFileHandle *file = [NSFileHandle fileHandleForWritingAtPath:path];
    [file seekToEndOfFile]; [file writeData:json]; [file writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]]; [file closeFile];
  }
  [self.client URLProtocol:self didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNotConnectedToInternet userInfo:nil]];
}
- (void)stopLoading {}
@end
