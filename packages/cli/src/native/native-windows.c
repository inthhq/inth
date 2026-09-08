#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincred.h>
#include <bcrypt.h>
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
// Keep small credentials in their original format. Large values use independent
// protected entries; publish their manifest only after every chunk is written.
#define INTH_SECRET_LIMIT (1024 * 1024)
#define INTH_MANIFEST_SIZE 32
// This is part of the storage format. SDK headers disagree on the platform
// maximum; keep existing sessions readable when the compiler is upgraded.
#define INTH_CHUNK_SIZE 512
static const BYTE manifest_magic[8] = {'I', 'N', 'T', 'H', 0, 'C', 'R', '1'};
static DWORD manifest_length(const PCREDENTIALW credential) {
  if (credential->CredentialBlobSize != INTH_MANIFEST_SIZE ||
      memcmp(credential->CredentialBlob, manifest_magic, sizeof(manifest_magic))) return 0;
  DWORD length;
  memcpy(&length, credential->CredentialBlob + 8, sizeof(length));
  return length > INTH_CHUNK_SIZE && length <= INTH_SECRET_LIMIT ? length : 0;
}
static wchar_t *chunk_target(const wchar_t *name, const BYTE *manifest, DWORD index) {
  size_t length = wcslen(name) + 64;
  wchar_t *result = calloc(length, sizeof(wchar_t));
  if (!result) return NULL;
  wchar_t generation[33];
  for (int byte = 0; byte < 16; byte++) swprintf(generation + byte * 2, 3, L"%02x", manifest[12 + byte]);
  swprintf(result, length, L"%ls:chunk:%ls:%lu", name, generation, (unsigned long)index);
  return result;
}
static int write_credential(wchar_t *name, const BYTE *value, DWORD length) {
  CREDENTIALW credential = {0};
  credential.Type = CRED_TYPE_GENERIC; credential.TargetName = name;
  credential.CredentialBlobSize = length; credential.CredentialBlob = (LPBYTE)value;
  credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
  return CredWriteW(&credential, 0) ? 0 : -1;
}
static void delete_chunks(const wchar_t *name, const BYTE *manifest, DWORD length) {
  DWORD count = (length + INTH_CHUNK_SIZE - 1) / INTH_CHUNK_SIZE;
  for (DWORD index = 0; index < count; index++) {
    wchar_t *chunk = chunk_target(name, manifest, index);
    if (chunk) { CredDeleteW(chunk, CRED_TYPE_GENERIC, 0); free(chunk); }
  }
}
int32_t inth_secret_read(const uint8_t *service, size_t service_len, const uint8_t *account,
                        size_t account_len, inth_secret_callback callback, void *context) {
  wchar_t *name = target(service, service_len, account, account_len);
  if (!name) return -1;
  int result = -1;
  for (int attempt = 0; attempt < 3; attempt++) {
    PCREDENTIALW credential = NULL;
    if (!CredReadW(name, CRED_TYPE_GENERIC, 0, &credential)) {
      result = GetLastError() == ERROR_NOT_FOUND ? -25300 : -1; break;
    }
    DWORD length = manifest_length(credential);
    if (!length) {
      callback(credential->CredentialBlob, credential->CredentialBlobSize, context);
      CredFree(credential); result = 0; break;
    }
    BYTE *value = malloc(length);
    if (!value) { CredFree(credential); break; }
    DWORD offset = 0, index = 0;
    while (offset < length) {
      wchar_t *chunk = chunk_target(name, credential->CredentialBlob, index++);
      PCREDENTIALW part = NULL;
      BOOL ok = chunk && CredReadW(chunk, CRED_TYPE_GENERIC, 0, &part);
      free(chunk);
      if (!ok) break;
      DWORD expected = length - offset;
      if (expected > INTH_CHUNK_SIZE) expected = INTH_CHUNK_SIZE;
      if (part->CredentialBlobSize != expected) { CredFree(part); break; }
      memcpy(value + offset, part->CredentialBlob, expected);
      offset += expected; CredFree(part);
    }
    CredFree(credential);
    if (offset == length) { callback(value, length, context); result = 0; }
    SecureZeroMemory(value, length); free(value);
    if (!result) break;
    // A concurrent refresh can retire the old chunks while we read them.
    // Re-read the published manifest instead of returning a partial session.
  }
  free(name); return result;
}
int32_t inth_secret_write(const uint8_t *service, size_t service_len, const uint8_t *account,
                         size_t account_len, const uint8_t *value, size_t value_len) {
  if (value_len > INTH_SECRET_LIMIT) return -1;
  wchar_t *name = target(service, service_len, account, account_len);
  if (!name) return -1;
  PCREDENTIALW previous = NULL;
  if (!CredReadW(name, CRED_TYPE_GENERIC, 0, &previous) && GetLastError() != ERROR_NOT_FOUND) { free(name); return -1; }
  int result = -1;
  if (value_len <= INTH_CHUNK_SIZE) {
    result = write_credential(name, value, (DWORD)value_len);
  } else {
    BYTE manifest[INTH_MANIFEST_SIZE] = {0};
    DWORD length = (DWORD)value_len;
    memcpy(manifest, manifest_magic, sizeof(manifest_magic));
    memcpy(manifest + 8, &length, sizeof(length));
    if (BCryptGenRandom(NULL, manifest + 12, 16, BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0) {
      DWORD offset = 0, index = 0;
      while (offset < length) {
        DWORD size = length - offset;
        if (size > INTH_CHUNK_SIZE) size = INTH_CHUNK_SIZE;
        wchar_t *chunk = chunk_target(name, manifest, index++);
        int written = chunk ? write_credential(chunk, value + offset, size) : -1;
        free(chunk);
        if (written) break;
        offset += size;
      }
      if (offset == length) result = write_credential(name, manifest, sizeof(manifest));
      if (result) delete_chunks(name, manifest, length);
    }
  }
  if (!result && previous) {
    DWORD length = manifest_length(previous);
    if (length) delete_chunks(name, previous->CredentialBlob, length);
  }
  if (previous) CredFree(previous);
  free(name); return result;
}
int32_t inth_secret_delete(const uint8_t *service, size_t service_len, const uint8_t *account, size_t account_len) {
  wchar_t *name = target(service, service_len, account, account_len);
  if (!name) return -1;
  PCREDENTIALW previous = NULL;
  if (!CredReadW(name, CRED_TYPE_GENERIC, 0, &previous)) {
    DWORD error = GetLastError(); free(name);
    return error == ERROR_NOT_FOUND ? -25300 : -1;
  }
  BOOL ok = CredDeleteW(name, CRED_TYPE_GENERIC, 0);
  DWORD error = GetLastError();
  if (ok) {
    DWORD length = manifest_length(previous);
    if (length) delete_chunks(name, previous->CredentialBlob, length);
  }
  CredFree(previous); free(name);
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
  extern int32_t inth_browser_url_valid(const uint8_t *, size_t);
  if (!inth_browser_url_valid(url, length)) return -1;
  wchar_t *name = wide(url, length); if (!name) return -1;
  INT_PTR result = (INT_PTR)ShellExecuteW(NULL, L"open", name, NULL, NULL, SW_SHOWNORMAL);
  free(name); return result > 32 ? 0 : -1;
}
static int32_t write_config(const uint8_t *path, size_t length, const uint8_t *value, size_t value_length, int preserve) {
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
    if (ok && written == value_length && flushed && closed) {
      if (preserve) {
        // ReplaceFile preserves the destination DACL and attributes. Never ignore ACL errors.
        if (ReplaceFileW(name, temporary, NULL, 0, NULL, NULL)) result = 0;
        else if (GetLastError() == ERROR_FILE_NOT_FOUND &&
            MoveFileExW(temporary, name, MOVEFILE_WRITE_THROUGH)) result = 0;
      } else if (MoveFileExW(temporary, name, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) result = 0;
    }
    if (result) DeleteFileW(temporary);
  }
  free(temporary); free(name); return result;
}

int32_t inth_write_config(const uint8_t *path, size_t length,
                          const uint8_t *value, size_t value_length) {
  return write_config(path, length, value, value_length, 0);
}
int32_t inth_write_mcp_config(const uint8_t *path, size_t length,
                              const uint8_t *value, size_t value_length) {
  return write_config(path, length, value, value_length, 1);
}
