#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdint.h>
typedef void (*inth_secret_callback)(const uint8_t *, size_t, void *);

static CFMutableDictionaryRef query(const uint8_t *service, size_t service_len,
                                    const uint8_t *account, size_t account_len) {
  if (service_len > INT32_MAX || account_len > INT32_MAX) return NULL;
  CFStringRef s = CFStringCreateWithBytes(NULL, service, (CFIndex)service_len,
                                        kCFStringEncodingUTF8, false);
  CFStringRef a = CFStringCreateWithBytes(NULL, account, (CFIndex)account_len,
                                        kCFStringEncodingUTF8, false);
  if (!s || !a) {
    if (s) CFRelease(s);
    if (a) CFRelease(a);
    return NULL;
  }
  CFMutableDictionaryRef q = CFDictionaryCreateMutable(NULL, 0,
      &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  if (q) {
    CFDictionarySetValue(q, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(q, kSecAttrService, s);
    CFDictionarySetValue(q, kSecAttrAccount, a);
  }
  CFRelease(s);
  CFRelease(a);
  return q;
}

int32_t inth_secret_read(const uint8_t *service, size_t service_len,
                        const uint8_t *account, size_t account_len,
                        inth_secret_callback callback, void *context) {
  CFMutableDictionaryRef q = query(service, service_len, account, account_len);
  if (!q) return errSecParam;
  CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
  CFDictionarySetValue(q, kSecMatchLimit, kSecMatchLimitOne);
  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching(q, &result);
  CFRelease(q);
  if (status == errSecSuccess) {
    if (!result || CFGetTypeID(result) != CFDataGetTypeID()) {
      status = errSecDecode;
    } else {
      CFDataRef data = (CFDataRef)result;
      // Scriptc copies these borrowed bytes before this callback returns.
      callback(CFDataGetBytePtr(data), (size_t)CFDataGetLength(data), context);
    }
  }
  if (result) CFRelease(result);
  return status;
}

int32_t inth_secret_write(const uint8_t *service, size_t service_len,
                         const uint8_t *account, size_t account_len,
                         const uint8_t *value, size_t value_len) {
  if (value_len > INT32_MAX) return errSecParam;
  CFMutableDictionaryRef q = query(service, service_len, account, account_len);
  if (!q) return errSecParam;
  CFDataRef data = CFDataCreate(NULL, value, (CFIndex)value_len);
  CFMutableDictionaryRef changes = CFDictionaryCreateMutable(NULL, 0,
      &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  if (!data || !changes) {
    if (data) CFRelease(data);
    if (changes) CFRelease(changes);
    CFRelease(q);
    return errSecAllocate;
  }
  CFDictionarySetValue(changes, kSecValueData, data);
  OSStatus status = SecItemUpdate(q, changes);
  if (status == errSecItemNotFound) {
    CFDictionarySetValue(q, kSecValueData, data);
    status = SecItemAdd(q, NULL);
  }
  CFRelease(changes);
  CFRelease(data);
  CFRelease(q);
  return status;
}

int32_t inth_secret_delete(const uint8_t *service, size_t service_len,
                          const uint8_t *account, size_t account_len) {
  CFMutableDictionaryRef q = query(service, service_len, account, account_len);
  if (!q) return errSecParam;
  OSStatus status = SecItemDelete(q);
  CFRelease(q);
  return status;
}
