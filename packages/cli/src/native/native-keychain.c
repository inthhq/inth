#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdint.h>
#include <stdio.h>
#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#include <curl/curl.h>
#include <math.h>
#include <spawn.h>
#include <sys/wait.h>

extern char **environ;

typedef void (*inth_secret_callback)(const uint8_t *, size_t, void *);

int32_t inth_prepare_directory(const uint8_t *path, size_t length) {
  if (!length || length > 4096 || memchr(path, 0, length)) return -1;
  char *name = malloc(length + 1);
  if (!name) return -1;
  memcpy(name, path, length);
  name[length] = 0;
  int status = mkdir(name, 0700);
  if (status != 0 && errno != EEXIST) { free(name); return -1; }
  struct stat info;
  status = lstat(name, &info);
  free(name);
  if (status || !S_ISDIR(info.st_mode) || info.st_uid != geteuid() ||
      (info.st_mode & 077)) return -1;
  return 0;
}

int32_t inth_open_browser(const uint8_t *url, size_t length) {
  if (!length || length > 16384 || memchr(url, 0, length)) return -1;
  char *value = malloc(length + 1);
  if (!value) return -1;
  memcpy(value, url, length);
  value[length] = 0;
  char *args[] = {"/usr/bin/open", value, NULL};
  pid_t child;
  int result = posix_spawn(&child, args[0], NULL, NULL, args, environ);
  free(value);
  if (result) return -1;
  int status;
  while (waitpid(child, &status, 0) < 0) { if (errno != EINTR) return -1; }
  return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : -1;
}

double inth_http_date(const uint8_t *value, size_t length) {
  if (!length || length > 4096 || memchr(value, 0, length)) return NAN;
  char *text = malloc(length + 1);
  if (!text) return NAN;
  memcpy(text, value, length);
  text[length] = 0;
  time_t result = curl_getdate(text, NULL);
  free(text);
  return result == (time_t)-1 ? NAN : (double)result * 1000.0;
}

int32_t inth_remove_directory(const uint8_t *path, size_t length) {
  if (!length || length > 4096 || memchr(path, 0, length)) return -1;
  char *name = malloc(length + 1);
  if (!name) return -1;
  memcpy(name, path, length);
  name[length] = 0;
  int status = rmdir(name);
  free(name);
  return status;
}

int32_t inth_lock_acquire(const uint8_t *path, size_t length) {
  if (!length || length > 4096 || memchr(path, 0, length)) return -1;
  char *name = malloc(length + 1);
  if (!name) return -1;
  memcpy(name, path, length);
  name[length] = 0;
  int fd = open(name, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, 0600);
  free(name);
  if (fd < 0) return -1;
  struct stat info;
  if (fstat(fd, &info) || !S_ISREG(info.st_mode) || info.st_uid != geteuid() ||
      (info.st_mode & 077) || info.st_nlink != 1) { close(fd); return -1; }
  if (flock(fd, LOCK_EX | LOCK_NB)) {
    int status = errno == EWOULDBLOCK ? -2 : -1;
    close(fd);
    return status;
  }
  return fd;
}

int32_t inth_lock_release(int32_t fd) {
  int status = flock(fd, LOCK_UN);
  int closed = close(fd);
  return status || closed ? -1 : 0;
}

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

// Atomic owner-only configuration replacement. Credentials never use this path.
int32_t inth_write_config(const uint8_t *path, size_t length,
                          const uint8_t *value, size_t value_length) {
  if (!length || length > 4096 || memchr(path, 0, length) || value_length > 16384) return -1;
  char *name = malloc(length + 1);
  char *temporary = malloc(length + 12);
  if (!name || !temporary) { free(name); free(temporary); return -1; }
  memcpy(name, path, length); name[length] = 0;
  snprintf(temporary, length + 12, "%s.XXXXXX", name);
  int fd = mkstemp(temporary);
  int result = -1;
  if (fd >= 0) {
    size_t offset = 0;
    while (offset < value_length) {
      ssize_t written = write(fd, value + offset, value_length - offset);
      if (written < 0 && errno == EINTR) continue;
      if (written <= 0) break;
      offset += (size_t)written;
    }
    int synced = fsync(fd);
    int closed = close(fd);
    if (offset == value_length && !synced && !closed) result = rename(temporary, name);
    if (result) unlink(temporary);
  }
  free(name); free(temporary);
  return result;
}
