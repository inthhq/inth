#include <errno.h>
#include <inttypes.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <io.h>
#else
#include <sys/stat.h>
#endif

typedef void (*inth_identity_callback)(const uint8_t *, size_t, void *);

static int32_t deliver_identity(uint64_t device, uint64_t inode,
                               inth_identity_callback receive, void *context) {
  char token[42];
  int length = snprintf(token, sizeof(token), "%" PRIu64 ":%" PRIu64, device, inode);
  if (length < 0 || (size_t)length >= sizeof(token)) return -1;
  receive((const uint8_t *)token, (size_t)length, context);
  return 0;
}

int32_t inth_file_identity(const uint8_t *path, size_t length, int32_t descriptor,
                           int32_t follow, inth_identity_callback receive, void *context) {
#ifdef _WIN32
  HANDLE handle;
  int owned = descriptor < 0;
  if (owned) {
    if (!length || length > INT_MAX || memchr(path, 0, length)) return -1;
    int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                                  (const char *)path, (int)length, NULL, 0);
    if (!count || count > 32760) return -1;
    wchar_t *wide = calloc((size_t)count + 1, sizeof(wchar_t));
    if (!wide) return -1;
    if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                            (const char *)path, (int)length, wide, count)) {
      free(wide); return -1;
    }
    DWORD flags = FILE_FLAG_BACKUP_SEMANTICS;
    if (!follow) flags |= FILE_FLAG_OPEN_REPARSE_POINT;
    handle = CreateFileW(wide, FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL, OPEN_EXISTING, flags, NULL);
    DWORD error = GetLastError();
    free(wide);
    if (handle == INVALID_HANDLE_VALUE)
      return error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND ||
             error == ERROR_DIRECTORY ? 1 : -1;
  } else {
    handle = (HANDLE)_get_osfhandle(descriptor);
    if (handle == INVALID_HANDLE_VALUE) return -1;
  }
  BY_HANDLE_FILE_INFORMATION info;
  int success = GetFileInformationByHandle(handle, &info);
  int closed = !owned || CloseHandle(handle);
  if (!success || !closed) return -1;
  return deliver_identity(info.dwVolumeSerialNumber,
      ((uint64_t)info.nFileIndexHigh << 32) | info.nFileIndexLow,
      receive, context);
#else
  struct stat info;
  int result;
  if (descriptor >= 0) {
    result = fstat(descriptor, &info);
  } else {
    if (!length || length == SIZE_MAX || memchr(path, 0, length)) return -1;
    char *name = malloc(length + 1);
    if (!name) return -1;
    memcpy(name, path, length); name[length] = 0;
    result = follow ? stat(name, &info) : lstat(name, &info);
    int error = errno;
    free(name);
    if (result) return error == ENOENT || error == ENOTDIR ? 1 : -1;
  }
  if (result) return -1;
  return deliver_identity((uint64_t)info.st_dev, (uint64_t)info.st_ino, receive, context);
#endif
}
