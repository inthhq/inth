#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "sentry.h"

int32_t inth_sentry_probe_init(const uint8_t *dsn, size_t dsn_len,
    const uint8_t *database, size_t database_len) {
  if (!dsn_len || !database_len || memchr(dsn, 0, dsn_len)
      || memchr(database, 0, database_len)) return 1;
  sentry_options_t *options = sentry_options_new();
  sentry_options_set_dsn_n(options, (const char *)dsn, dsn_len);
  sentry_options_set_database_path_n(options, (const char *)database, database_len);
  sentry_options_set_release(options, "inth-cli@native-probe");
  sentry_options_set_environment(options, "local-probe");
  sentry_options_set_auto_session_tracking(options, 0);
  sentry_options_set_symbolize_stacktraces(options, 1);
  sentry_options_set_shutdown_timeout(options, 500);
  sentry_options_set_transfer_timeout(options, 500);
  int result = sentry_init(options);
  if (result != 0) return result;
  sentry_set_tag("command", "probe");
  sentry_value_t user = sentry_value_new_object();
  sentry_value_set_by_key(user, "id", sentry_value_new_string("cli:synthetic-probe"));
  sentry_set_user(user);
  return 0;
}

int32_t inth_sentry_probe_capture(void) {
  sentry_value_t event = sentry_value_new_event();
  sentry_value_t exception = sentry_value_new_exception(
      "ProbeError", "Synthetic native Sentry probe");
  // This captures the C/Scriptc call stack here, not the original TS throw site.
  sentry_value_set_stacktrace(exception, NULL, 0);
  sentry_event_add_exception(event, exception);
  sentry_uuid_t id = sentry_capture_event(event);
  return sentry_uuid_is_nil(&id);
}

int32_t inth_sentry_probe_close(void) {
  int flushed = sentry_flush(500);
  int dumped = sentry_close();
  return flushed != 0 || dumped != 0;
}

int32_t inth_sentry_probe_crash(void) {
  abort();
}
