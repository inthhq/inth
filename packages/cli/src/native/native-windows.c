#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincred.h>
#include <aclapi.h>
#include <sddl.h>
#include <shellapi.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

typedef void (*inth_secret_callback)(const uint8_t *, size_t, void *);
static wchar_t *wide(const uint8_t *value, size_t length) {
  if (!length || length > 32760 || memchr(value, 0, length)) return NULL;
  int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, (const char *)value, (int)length, NULL, 0);
  if (!count) return NULL;
  wchar_t *text = calloc((size_t)count + 1, sizeof(wchar_t));
  if (text) MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, (const char *)value, (int)length, text, count);
  return text;
}
static wchar_t *target(const uint8_t *service, size_t service_len, const uint8_t *account, size_t account_len) {
  if (service_len + account_len > 16000) return NULL;
  uint8_t *text = malloc(service_len + account_len + 1);
  if (!text) return NULL;
  memcpy(text, service, service_len); text[service_len] = ':';
  memcpy(text + service_len + 1, account, account_len);
  wchar_t *result = wide(text, service_len + account_len + 1);
  free(text); return result;
}
int32_t inth_secret_read(const uint8_t *service, size_t service_len, const uint8_t *account,
                        size_t account_len, inth_secret_callback callback, void *context) {
  wchar_t *name = target(service, service_len, account, account_len);
  if (!name) return -1;
  PCREDENTIALW credential = NULL;
  BOOL ok = CredReadW(name, CRED_TYPE_GENERIC, 0, &credential);
  DWORD error = GetLastError(); free(name);
  if (!ok) return error == ERROR_NOT_FOUND ? -25300 : -1;
  callback(credential->CredentialBlob, credential->CredentialBlobSize, context);
  CredFree(credential); return 0;
}
int32_t inth_secret_write(const uint8_t *service, size_t service_len, const uint8_t *account,
                         size_t account_len, const uint8_t *value, size_t value_len) {
  wchar_t *name = target(service, service_len, account, account_len);
  if (!name || value_len > CRED_MAX_CREDENTIAL_BLOB_SIZE) { free(name); return -1; }
  CREDENTIALW credential = {0};
  credential.Type = CRED_TYPE_GENERIC; credential.TargetName = name;
  credential.CredentialBlobSize = (DWORD)value_len; credential.CredentialBlob = (LPBYTE)value;
  credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
  BOOL ok = CredWriteW(&credential, 0); free(name);
  return ok ? 0 : -1;
}
int32_t inth_secret_delete(const uint8_t *service, size_t service_len, const uint8_t *account, size_t account_len) {
  wchar_t *name = target(service, service_len, account, account_len);
  if (!name) return -1;
  BOOL ok = CredDeleteW(name, CRED_TYPE_GENERIC, 0);
  DWORD error = GetLastError(); free(name);
  return ok ? 0 : error == ERROR_NOT_FOUND ? -25300 : -1;
}
static TOKEN_USER *current_user(void) {
  HANDLE token; DWORD size = 0;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return NULL;
  GetTokenInformation(token, TokenUser, NULL, 0, &size);
  TOKEN_USER *user = malloc(size);
  if (user && !GetTokenInformation(token, TokenUser, user, size, &size)) { free(user); user = NULL; }
  CloseHandle(token); return user;
}
static PSECURITY_DESCRIPTOR private_security(void) {
  TOKEN_USER *user = current_user(); LPWSTR sid = NULL;
  if (!user) return NULL;
  if (!ConvertSidToStringSidW(user->User.Sid, &sid)) { free(user); return NULL; }
  wchar_t sddl[512];
  // Elevated tokens can default ownership to Administrators. Set the user
  // explicitly so newly created files pass the same private-owner checks.
  swprintf(sddl, 512, L"O:%lsD:P(A;;FA;;;%ls)(A;;FA;;;SY)", sid, sid);
  PSECURITY_DESCRIPTOR descriptor = NULL;
  ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SDDL_REVISION_1, &descriptor, NULL);
  LocalFree(sid); free(user); return descriptor;
}
static int private_handle(HANDLE handle) {
  TOKEN_USER *user = current_user(); PSID owner = NULL; PACL acl = NULL;
  PSECURITY_DESCRIPTOR descriptor = NULL;
  if (!user) return 0;
  DWORD result = GetSecurityInfo(handle, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
      &owner, NULL, &acl, NULL, &descriptor);
  int valid = result == ERROR_SUCCESS && owner && EqualSid(owner, user->User.Sid) && acl;
  BYTE system_buffer[SECURITY_MAX_SID_SIZE]; DWORD system_size = sizeof(system_buffer);
  if (!CreateWellKnownSid(WinLocalSystemSid, NULL, system_buffer, &system_size)) valid = 0;
  for (DWORD index = 0; valid && index < acl->AceCount; index++) {
    ACCESS_ALLOWED_ACE *ace;
    if (!GetAce(acl, index, (void **)&ace)) { valid = 0; break; }
    if (ace->Header.AceType == ACCESS_ALLOWED_ACE_TYPE &&
        !EqualSid(&ace->SidStart, user->User.Sid) && !EqualSid(&ace->SidStart, system_buffer)) valid = 0;
  }
  if (descriptor) LocalFree(descriptor);
  free(user); return valid;
}
int32_t inth_prepare_directory(const uint8_t *path, size_t length) {
  wchar_t *name = wide(path, length); PSECURITY_DESCRIPTOR descriptor = private_security();
  if (!name || !descriptor) { free(name); if (descriptor) LocalFree(descriptor); return -1; }
  SECURITY_ATTRIBUTES attributes = {sizeof(attributes), descriptor, FALSE};
  BOOL created = CreateDirectoryW(name, &attributes); DWORD error = GetLastError();
  LocalFree(descriptor);
  if (!created && error != ERROR_ALREADY_EXISTS) { free(name); return -1; }
  HANDLE handle = CreateFileW(name, READ_CONTROL, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      NULL, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
  free(name); BY_HANDLE_FILE_INFORMATION info;
  int valid = handle != INVALID_HANDLE_VALUE && GetFileInformationByHandle(handle, &info) &&
      (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) && !(info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) && private_handle(handle);
  if (handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
  return valid ? 0 : -1;
}
static HANDLE locks[64];
int32_t inth_lock_acquire(const uint8_t *path, size_t length) {
  wchar_t *name = wide(path, length); PSECURITY_DESCRIPTOR descriptor = private_security();
  if (!name || !descriptor) { free(name); if (descriptor) LocalFree(descriptor); return -1; }
  int slot = 0; while (slot < 64 && locks[slot]) slot++;
  if (slot == 64) { free(name); LocalFree(descriptor); return -1; }
  SECURITY_ATTRIBUTES attributes = {sizeof(attributes), descriptor, FALSE};
  HANDLE handle = CreateFileW(name, GENERIC_READ | GENERIC_WRITE | READ_CONTROL,
      FILE_SHARE_READ | FILE_SHARE_WRITE, &attributes, OPEN_ALWAYS, FILE_FLAG_OPEN_REPARSE_POINT, NULL);
  free(name); LocalFree(descriptor);
  if (handle == INVALID_HANDLE_VALUE) return -1;
  BY_HANDLE_FILE_INFORMATION info;
  if (!GetFileInformationByHandle(handle, &info) || info.nNumberOfLinks != 1 ||
      (info.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY)) || !private_handle(handle)) {
    CloseHandle(handle); return -1;
  }
  OVERLAPPED overlap = {0};
  if (!LockFileEx(handle, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &overlap)) {
    DWORD error = GetLastError(); CloseHandle(handle);
    return error == ERROR_LOCK_VIOLATION ? -2 : -1;
  }
  locks[slot] = handle; return slot;
}
int32_t inth_lock_release(int32_t slot) {
  if (slot < 0 || slot >= 64 || !locks[slot]) return -1;
  OVERLAPPED overlap = {0}; BOOL unlocked = UnlockFileEx(locks[slot], 0, 1, 0, &overlap);
  BOOL closed = CloseHandle(locks[slot]); locks[slot] = NULL;
  return unlocked && closed ? 0 : -1;
}
int32_t inth_remove_directory(const uint8_t *path, size_t length) {
  wchar_t *name = wide(path, length); if (!name) return -1;
  BOOL ok = RemoveDirectoryW(name); free(name); return ok ? 0 : -1;
}
int32_t inth_open_browser(const uint8_t *url, size_t length) {
  if (length < 9 || memcmp(url, "https://", 8)) return -1;
  if (url[8] == '/' || url[8] == '?' || memchr(url, '@', length) || memchr(url, '#', length)) return -1;
  for (size_t index = 0; index < length; index++) if (url[index] <= 0x20 || url[index] == 0x7f || url[index] == '\\') return -1;
  wchar_t *name = wide(url, length); if (!name) return -1;
  INT_PTR result = (INT_PTR)ShellExecuteW(NULL, L"open", name, NULL, NULL, SW_SHOWNORMAL);
  free(name); return result > 32 ? 0 : -1;
}
int32_t inth_write_config(const uint8_t *path, size_t length, const uint8_t *value, size_t value_length) {
  wchar_t *name = wide(path, length); PSECURITY_DESCRIPTOR descriptor = private_security();
  if (!name || !descriptor || value_length > 4 * 1024 * 1024) { free(name); if (descriptor) LocalFree(descriptor); return -1; }
  size_t size = wcslen(name) + 80;
  wchar_t *temporary = calloc(size, sizeof(wchar_t));
  if (!temporary) { free(name); LocalFree(descriptor); return -1; }
  SECURITY_ATTRIBUTES attributes = {sizeof(attributes), descriptor, FALSE};
  HANDLE handle = INVALID_HANDLE_VALUE;
  for (unsigned int attempt = 0; attempt < 100; attempt++) {
    swprintf(temporary, size, L"%ls.%lu.%llu.%u.tmp", name, GetCurrentProcessId(), GetTickCount64(), attempt);
    handle = CreateFileW(temporary, GENERIC_WRITE, 0, &attributes, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (handle != INVALID_HANDLE_VALUE || GetLastError() != ERROR_FILE_EXISTS) break;
  }
  LocalFree(descriptor); int result = -1;
  if (handle != INVALID_HANDLE_VALUE) {
    DWORD written = 0;
    BOOL ok = WriteFile(handle, value, (DWORD)value_length, &written, NULL);
    BOOL flushed = FlushFileBuffers(handle); BOOL closed = CloseHandle(handle);
    if (ok && written == value_length && flushed && closed &&
        MoveFileExW(temporary, name, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) result = 0;
    if (result) DeleteFileW(temporary);
  }
  free(temporary); free(name); return result;
}
