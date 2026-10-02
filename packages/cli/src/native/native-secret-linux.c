// Load Secret Service only when browser credentials are used. API-key commands
// also work on headless installations without libsecret or a session bus.
// Status -3: libsecret is missing. -4: the session bus is unreachable, as in a
// headless session or an agent sandbox. -5: no Secret Service is running.
// -6: any other Secret Service error, reported with its status.
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

typedef void (*inth_secret_callback)(const uint8_t *, size_t, void *);
// Leading fields of GLib's GError, which is a stable public struct.
typedef struct { uint32_t domain; int code; char *message; } inth_gerror;
static void *library;
static void *schema;
static char *(*lookup)(void *, void *, void **, ...);
static int (*store)(void *, const char *, const char *, const char *, void *, void **, ...);
static int (*clear)(void *, void *, void **, ...);
static void (*free_password)(char *);
static void (*free_error)(void *);
static const char *(*quark_name)(uint32_t);
static int initialize(void) {
  if (schema) return 0;
  library = dlopen("libsecret-1.so.0", RTLD_NOW | RTLD_LOCAL);
  if (!library) return -3;
  void *(*create)(const char *, int, ...) = dlsym(library, "secret_schema_new");
  lookup = dlsym(library, "secret_password_lookup_sync");
  store = dlsym(library, "secret_password_store_sync");
  clear = dlsym(library, "secret_password_clear_sync");
  free_password = dlsym(library, "secret_password_free");
  free_error = dlsym(library, "g_error_free");
  quark_name = dlsym(library, "g_quark_to_string");
  if (!create || !lookup || !store || !clear || !free_password || !free_error || !quark_name) return -3;
  schema = create("com.inth.cli", 0, "service", 0, "account", 0, NULL);
  return schema ? 0 : -3;
}
// GIO reports a failure to reach the bus in its I/O error domain. A remote
// error from the service uses the same domain with G_IO_ERROR_DBUS_ERROR (36).
static int32_t failure(void *error) {
  const inth_gerror *value = error;
  const char *domain = quark_name(value->domain);
  int32_t status = -6;
  if (domain && !strcmp(domain, "g-io-error-quark") && value->code != 36) status = -4;
  // G_DBUS_ERROR_SERVICE_UNKNOWN: nothing provides org.freedesktop.secrets.
  else if (domain && !strcmp(domain, "g-dbus-error-quark") && value->code == 2) status = -5;
  free_error(error);
  return status;
}
static char *copy(const uint8_t *value, size_t length) {
  if (length > 1024 * 1024 || memchr(value, 0, length)) return NULL;
  char *text = malloc(length + 1);
  if (text) { memcpy(text, value, length); text[length] = 0; }
  return text;
}
int32_t inth_secret_read(const uint8_t *service, size_t service_len, const uint8_t *account,
                        size_t account_len, inth_secret_callback callback, void *context) {
  if (initialize()) return -3;
  char *s = copy(service, service_len), *a = copy(account, account_len);
  if (!s || !a) { free(s); free(a); return -1; }
  void *error = NULL;
  char *value = lookup(schema, NULL, &error, "service", s, "account", a, NULL);
  free(s); free(a);
  if (error) { if (value) free_password(value); return failure(error); }
  if (!value) return -25300;
  size_t length = strlen(value);
  if (length < 9 || strncmp(value, "inth:hex:", 9) || (length - 9) % 2) { free_password(value); return -1; }
  size_t decoded_len = (length - 9) / 2;
  uint8_t *decoded = malloc(decoded_len + 1);
  if (!decoded) { free_password(value); return -1; }
  for (size_t index = 0; index < decoded_len; index++) {
    unsigned int byte;
    if (sscanf(value + 9 + index * 2, "%2x", &byte) != 1) { free(decoded); free_password(value); return -1; }
    decoded[index] = (uint8_t)byte;
  }
  callback(decoded, decoded_len, context);
  memset(decoded, 0, decoded_len); free(decoded);
  free_password(value);
  return 0;
}
int32_t inth_secret_write(const uint8_t *service, size_t service_len, const uint8_t *account,
                         size_t account_len, const uint8_t *value, size_t value_len) {
  if (initialize()) return -3;
  if (value_len > 1024 * 1024) return -1;
  char *s = copy(service, service_len), *a = copy(account, account_len), *v = malloc(value_len * 2 + 10);
  if (v) {
    memcpy(v, "inth:hex:", 9);
    for (size_t index = 0; index < value_len; index++) sprintf(v + 9 + index * 2, "%02x", value[index]);
    v[9 + value_len * 2] = 0;
  }
  if (!s || !a || !v) { free(s); free(a); free(v); return -1; }
  void *error = NULL;
  int result = store(schema, "default", "Inth CLI", v, NULL, &error, "service", s, "account", a, NULL);
  memset(v, 0, value_len * 2 + 9); free(v); free(s); free(a);
  if (error) return failure(error);
  return result ? 0 : -6;
}
int32_t inth_secret_delete(const uint8_t *service, size_t service_len, const uint8_t *account, size_t account_len) {
  if (initialize()) return -3;
  char *s = copy(service, service_len), *a = copy(account, account_len);
  if (!s || !a) { free(s); free(a); return -1; }
  void *error = NULL;
  int result = clear(schema, NULL, &error, "service", s, "account", a, NULL);
  free(s); free(a);
  if (error) return failure(error);
  return result ? 0 : -25300;
}
