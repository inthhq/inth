#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincred.h>
#include <assert.h>

static int fail_write, writes;
static BOOL WINAPI checked_write(PCREDENTIALW credential, DWORD flags);
#define CredWriteW checked_write
#include "../../src/native/native-windows.c"
#undef CredWriteW
static BOOL WINAPI checked_write(PCREDENTIALW credential, DWORD flags) {
  if (++writes == fail_write) { SetLastError(ERROR_WRITE_FAULT); return FALSE; }
  return CredWriteW(credential, flags);
}
static int matched;
static const BYTE *expected;
static size_t expected_length;
static void receive(const uint8_t *value, size_t length, void *context) {
  (void)context;
  matched = length == expected_length && !memcmp(value, expected, length);
}
static void round_trip(const char *account, const BYTE *value, size_t length) {
  matched = 0; expected = value; expected_length = length;
  assert(inth_secret_read((const BYTE *)"inth-test", 9, (const BYTE *)account, strlen(account), receive, NULL) == 0);
  assert(matched);
}
static DWORD entries(const char *account) {
  wchar_t pattern[200];
  swprintf(pattern, 200, L"inth-test:%hs*", account);
  DWORD count = 0; PCREDENTIALW *credentials = NULL;
  if (CredEnumerateW(pattern, 0, &count, &credentials)) CredFree(credentials);
  else assert(GetLastError() == ERROR_NOT_FOUND);
  return count;
}
int main(void) {
  char account[80]; snprintf(account, sizeof(account), "chunks-%lu-%llu", GetCurrentProcessId(), GetTickCount64());
  BYTE large[9000]; memset(large, 'x', sizeof(large));
  const DWORD chunk_count = (sizeof(large) + INTH_CHUNK_SIZE - 1) / INTH_CHUNK_SIZE;
  const BYTE small[] = "previous session";
  size_t account_len = strlen(account);
  assert(inth_secret_write((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len, small, sizeof(small)) == 0);
  fail_write = 2; writes = 0;
  assert(inth_secret_write((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len, large, sizeof(large)) == -1);
  round_trip(account, small, sizeof(small)); assert(entries(account) == 1);
  fail_write = 0;
  assert(inth_secret_write((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len, large, sizeof(large)) == 0);
  round_trip(account, large, sizeof(large)); assert(entries(account) == chunk_count + 1);
  // Fail the manifest commit after all new chunks have been written.
  fail_write = (int)chunk_count + 1; writes = 0;
  assert(inth_secret_write((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len, large, sizeof(large)) == -1);
  round_trip(account, large, sizeof(large)); assert(entries(account) == chunk_count + 1);
  fail_write = 0; large[0] = 'y';
  assert(inth_secret_write((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len, large, sizeof(large)) == 0);
  round_trip(account, large, sizeof(large)); assert(entries(account) == chunk_count + 1);
  assert(inth_secret_write((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len, small, sizeof(small)) == 0);
  round_trip(account, small, sizeof(small)); assert(entries(account) == 1);
  assert(inth_secret_delete((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len) == 0);
  assert(entries(account) == 0);
  assert(inth_secret_write((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len, large, sizeof(large)) == 0);
  assert(inth_secret_delete((const BYTE *)"inth-test", 9, (const BYTE *)account, account_len) == 0);
  assert(entries(account) == 0);
  puts("Windows credentials: large sessions, rotation, failed chunk/manifest writes, and cleanup passed.");
  return 0;
}
