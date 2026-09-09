#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "sentry.h"

// The pinned SDK exports its JSON parser from src/sentry_json.h. Keep this
// declaration in sync when updating the vendored SDK; native tests exercise it.
SENTRY_API sentry_value_t sentry__value_from_json(const char *buf, size_t buflen);

extern int32_t inth_production_build(void);
extern const char *inth_build_revision(void);

typedef void (*receive_t)(const uint8_t *, size_t, void *);
typedef struct { receive_t receive; void *context; int delivered; } capture_t;

static void send_envelope(sentry_envelope_t *envelope, void *state) {
  capture_t *capture = state;
  size_t length = 0;
  char *body = sentry_envelope_serialize(envelope, &length);
  if (body && length && length <= 1024 * 1024 && !capture->delivered) {
    capture->receive((const uint8_t *)body, length, capture->context);
    capture->delivered = 1;
  }
  sentry_free(body);
  sentry_envelope_free(envelope);
}

static sentry_value_t select_fields(sentry_value_t source, const char **keys, size_t count) {
  sentry_value_t result = sentry_value_new_object();
  for (size_t i = 0; i < count; i++) {
    sentry_value_t value = sentry_value_get_by_key(source, keys[i]);
    if (!sentry_value_is_null(value)) sentry_value_set_by_key(result, keys[i], sentry_value_incref(value));
  }
  return result;
}

static void basename_field(sentry_value_t result, sentry_value_t source, const char *key) {
  const char *text = sentry_value_as_string(sentry_value_get_by_key(source, key));
  if (!text || !*text) return;
  const char *base = text;
  for (const char *cursor = text; *cursor; cursor++) {
    if (*cursor == '/' || *cursor == '\\') base = cursor + 1;
  }
  sentry_value_set_by_key(result, key, sentry_value_new_string(base));
}

static sentry_value_t scrub_event(sentry_value_t event, void *hint, void *state) {
  (void)hint; (void)state;
  // Keep only explicit event fields. SDK contexts, breadcrumbs, extras, hostnames,
  // and any future automatic fields are excluded by default.
  const char *keys[] = {"event_id", "timestamp", "platform", "release", "environment",
    "sdk", "user", "tags", "fingerprint", "level", "dist", "culprit"};
  sentry_value_t clean = select_fields(event, keys, sizeof(keys) / sizeof(keys[0]));
  sentry_value_t contexts = sentry_value_get_by_key(event, "contexts");
  sentry_value_t clean_contexts = sentry_value_new_object();
  const char *os_keys[] = {"name", "version"};
  sentry_value_set_by_key(clean_contexts, "os", select_fields(
    sentry_value_get_by_key(contexts, "os"), os_keys, 2));
  const char *cli_keys[] = {"json", "interactive", "elapsed_ms", "last_operation",
    "recent_operations", "stack_origin", "original_stack_available", "build_revision"};
  sentry_value_set_by_key(clean_contexts, "cli", select_fields(
    sentry_value_get_by_key(contexts, "cli"), cli_keys, sizeof(cli_keys) / sizeof(cli_keys[0])));
  sentry_value_t runtime = sentry_value_new_object();
  sentry_value_set_by_key(runtime, "name", sentry_value_new_string("Scriptc"));
  sentry_value_set_by_key(clean_contexts, "runtime", runtime);
  sentry_value_set_by_key(clean, "contexts", clean_contexts);
  // SDK module values are frozen. Rebuild them instead of attempting mutation.
  sentry_value_t images = sentry_value_get_by_key(sentry_value_get_by_key(event, "debug_meta"), "images");
  sentry_value_t clean_images = sentry_value_new_list();
  const char *image_keys[] = {"type", "debug_id", "code_id", "image_addr", "image_size", "image_vmaddr", "arch"};
  for (size_t i = 0; i < sentry_value_get_length(images); i++) {
    sentry_value_t image = sentry_value_get_by_index(images, i);
    sentry_value_t clean_image = select_fields(image, image_keys, sizeof(image_keys) / sizeof(image_keys[0]));
    basename_field(clean_image, image, "code_file");
    basename_field(clean_image, image, "debug_file");
    sentry_value_append(clean_images, clean_image);
  }
  sentry_value_t debug = sentry_value_new_object();
  sentry_value_set_by_key(debug, "images", clean_images);
  sentry_value_set_by_key(clean, "debug_meta", debug);
  sentry_value_t values = sentry_value_get_by_key(sentry_value_get_by_key(event, "exception"), "values");
  sentry_value_t clean_values = sentry_value_new_list();
  const char *exception_keys[] = {"type", "value", "mechanism"};
  const char *frame_keys[] = {"instruction_addr", "function", "in_app", "platform", "addr_mode"};
  for (size_t i = 0; i < sentry_value_get_length(values); i++) {
    sentry_value_t exception = sentry_value_get_by_index(values, i);
    sentry_value_t clean_exception = select_fields(exception, exception_keys, 3);
    sentry_value_t frames = sentry_value_get_by_key(sentry_value_get_by_key(
      exception, "stacktrace"), "frames");
    sentry_value_t clean_frames = sentry_value_new_list();
    for (size_t j = 0; j < sentry_value_get_length(frames); j++) {
      sentry_value_t frame = sentry_value_get_by_index(frames, j);
      sentry_value_append(clean_frames, select_fields(frame, frame_keys, sizeof(frame_keys) / sizeof(frame_keys[0])));
    }
    sentry_value_t stack = sentry_value_new_object();
    sentry_value_set_by_key(stack, "frames", clean_frames);
    sentry_value_set_by_key(clean_exception, "stacktrace", stack);
    sentry_value_append(clean_values, clean_exception);
  }
  sentry_value_t exceptions = sentry_value_new_object();
  sentry_value_set_by_key(exceptions, "values", clean_values);
  sentry_value_set_by_key(clean, "exception", exceptions);
  sentry_value_decref(event);
  return clean;
}

int32_t inth_sentry_capture(const uint8_t *dsn_bytes, size_t dsn_len,
    const uint8_t *release_bytes, size_t release_len,
    const uint8_t *command_bytes, size_t command_len,
    const uint8_t *type_bytes, size_t type_len,
    const uint8_t *diagnostic_bytes, size_t diagnostic_len,
    const uint8_t *user_bytes, size_t user_len,
    const uint8_t *database, size_t database_len, receive_t receive, void *context) {
  if (!inth_production_build()) return 1;
  if (!diagnostic_len || diagnostic_len > 4096 || memchr(diagnostic_bytes, 0, diagnostic_len)) return 1;
  sentry_value_t diagnostic = sentry__value_from_json((const char *)diagnostic_bytes, diagnostic_len);
  const char *code = sentry_value_as_string(sentry_value_get_by_key(diagnostic, "code"));
  const char *message = sentry_value_as_string(sentry_value_get_by_key(diagnostic, "message"));
  const char *operation = sentry_value_as_string(sentry_value_get_by_key(diagnostic, "last_operation"));
  if (!code || !*code || !message || !*message || !operation || !*operation) {
    sentry_value_decref(diagnostic);
    return 1;
  }
  if (!database_len || database_len > 4096
      || memchr(database, 0, database_len) || !receive) {
    sentry_value_decref(diagnostic);
    return 1;
  }
  const uint8_t *inputs[] = {dsn_bytes, release_bytes, command_bytes, type_bytes, user_bytes};
  size_t lengths[] = {dsn_len, release_len, command_len, type_len, user_len};
  char *strings[5] = {0};
  for (size_t i = 0; i < 5; i++) {
    if (!lengths[i] || lengths[i] > 2048 || memchr(inputs[i], 0, lengths[i])) goto fail;
    strings[i] = malloc(lengths[i] + 1);
    if (!strings[i]) goto fail;
    memcpy(strings[i], inputs[i], lengths[i]); strings[i][lengths[i]] = 0;
  }
  const char *dsn = strings[0], *release = strings[1], *command = strings[2],
    *type = strings[3], *user_id = strings[4];
  capture_t capture = {receive, context, 0};
  sentry_transport_t *transport = sentry_transport_new(send_envelope);
  sentry_transport_set_state(transport, &capture);
  sentry_options_t *options = sentry_options_new();
  sentry_options_set_transport(options, transport);
  sentry_options_set_dsn(options, dsn);
  sentry_options_set_database_path_n(options, (const char *)database, database_len);
  sentry_options_set_release(options, release);
  sentry_options_set_environment(options, "production");
  sentry_options_set_auto_session_tracking(options, 0);
  sentry_options_set_symbolize_stacktraces(options, 1);
  sentry_options_set_before_send(options, scrub_event, NULL);
  sentry_options_set_shutdown_timeout(options, 0);
  if (sentry_init(options) != 0) goto fail;
  sentry_set_tag("command", command);
  sentry_set_tag("source", "cli");
  sentry_set_tag("error_code", code);
  sentry_set_tag("last_operation", operation);
  sentry_set_tag("os", sentry_value_as_string(sentry_value_get_by_key(diagnostic, "os")));
  sentry_set_tag("arch", sentry_value_as_string(sentry_value_get_by_key(diagnostic, "arch")));
  const char *cli_keys[] = {"json", "interactive", "elapsed_ms", "last_operation", "recent_operations"};
  sentry_value_t cli = select_fields(diagnostic, cli_keys, sizeof(cli_keys) / sizeof(cli_keys[0]));
  sentry_value_set_by_key(cli, "stack_origin", sentry_value_new_string("report_site"));
  sentry_value_set_by_key(cli, "original_stack_available", sentry_value_new_bool(0));
  sentry_value_set_by_key(cli, "build_revision", sentry_value_new_string(inth_build_revision()));
  sentry_set_context("cli", cli);
  sentry_value_t user = sentry_value_new_object();
  sentry_value_set_by_key(user, "id", sentry_value_new_string(user_id));
  sentry_set_user(user);
  sentry_value_t event = sentry_value_new_event();
  sentry_value_set_by_key(event, "culprit", sentry_value_new_string(operation));
  sentry_value_set_by_key(event, "dist", sentry_value_new_string(inth_build_revision()));
  sentry_value_t exception = sentry_value_new_exception(type, message);
  sentry_value_t mechanism = sentry_value_new_object();
  sentry_value_set_by_key(mechanism, "type", sentry_value_new_string("inth.caught"));
  sentry_value_set_by_key(mechanism, "handled", sentry_value_new_bool(1));
  sentry_value_set_by_key(mechanism, "description", sentry_value_new_string(
    "Captured at the CLI reporting boundary. The original TypeScript throw stack is unavailable."));
  sentry_value_set_by_key(exception, "mechanism", mechanism);
  sentry_value_set_stacktrace(exception, NULL, 0);
  sentry_event_add_exception(event, exception);
  sentry_value_t fingerprint = sentry_value_new_list();
  // Report-site frames identify the reporter, not the failure. Group by safe
  // diagnostic fields so unrelated failures are not merged by that common stack.
  sentry_value_append(fingerprint, sentry_value_new_string("inth-cli-v1"));
  sentry_value_append(fingerprint, sentry_value_new_string(command));
  sentry_value_append(fingerprint, sentry_value_new_string(type));
  sentry_value_append(fingerprint, sentry_value_new_string(code));
  sentry_value_append(fingerprint, sentry_value_new_string(operation));
  sentry_value_set_by_key(event, "fingerprint", fingerprint);
  sentry_capture_event(event);
  sentry_close();
  for (size_t i = 0; i < 5; i++) free(strings[i]);
  sentry_value_decref(diagnostic);
  return capture.delivered ? 0 : 1;
fail:
  sentry_value_decref(diagnostic);
  for (size_t i = 0; i < 5; i++) free(strings[i]);
  return 1;
}
