#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "../../vendor/tomlc99/toml.h"

// -1 malformed/ambiguous, 0 absent, 1 Inth, 2 another server occupies the name.
int32_t inth_mcp_toml_status(const uint8_t *source, size_t length) {
  if (length > 4 * 1024 * 1024 || memchr(source, 0, length)) return -1;
  char *text = malloc(length + 1); if (!text) return -1;
  memcpy(text, source, length); text[length] = 0;
  char error[200]; toml_table_t *root = toml_parse(text, error, sizeof(error));
  free(text); if (!root) return -1;
  int status = 0;
  toml_table_t *servers = toml_table_in(root, "mcp_servers");
  if (!servers && toml_key_exists(root, "mcp_servers")) status = -1;
  if (servers && toml_key_exists(servers, "inth")) {
    toml_table_t *inth = toml_table_in(servers, "inth");
    if (inth) {
      toml_datum_t url = toml_string_in(inth, "url");
      status = url.ok && strcmp(url.u.s, "https://api.inth.com/mcp") == 0 ? 1 : 2;
      if (url.ok) free(url.u.s);
    } else status = 2;
  }
  toml_free(root); return status;
}
