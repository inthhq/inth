#include <errno.h>
#include <stdlib.h>

#include "../../src/native/native-file-identity.c"

static void print_identity(const uint8_t *value, size_t length, void *context) {
  (void)context;
  if (fwrite(value, 1, length, stdout) != length) exit(1);
}

static uint64_t argument(const char *text) {
  char *end;
  if (!*text || *text == '-') exit(1);
  errno = 0;
  unsigned long long value = strtoull(text, &end, 10);
  if (errno || *end || value > UINT64_MAX) exit(1);
  return (uint64_t)value;
}

int main(int argc, char **argv) {
  if (argc != 3) return 1;
  if (deliver_identity(argument(argv[1]), argument(argv[2]), print_identity, NULL)) return 1;
  return putchar('\n') == EOF ? 1 : 0;
}
