#include <stdint.h>
#include <stddef.h>
#include <string.h>

int32_t inth_browser_url_valid(const uint8_t *url, size_t length) {
  if (length < 9 || length > 16384 || memcmp(url, "https://", 8)) return 0;
  size_t authority_end = 8;
  while (authority_end < length && url[authority_end] != '/' && url[authority_end] != '?' && url[authority_end] != '#') authority_end++;
  if (authority_end == 8 || memchr(url + 8, '@', authority_end - 8)) return 0;
  for (size_t index = 0; index < length; index++) {
    if (url[index] <= 0x20 || url[index] == 0x7f || url[index] == '\\' || url[index] == '#') return 0;
  }
  return 1;
}
