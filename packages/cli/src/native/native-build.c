#include <stdint.h>

#ifndef INTH_PRODUCTION
#define INTH_PRODUCTION 0
#endif

int32_t inth_production_build(void) {
  return INTH_PRODUCTION == 1;
}

#ifndef INTH_BUILD_REVISION
#define INTH_BUILD_REVISION "unknown"
#endif

const char *inth_build_revision(void) {
  return INTH_BUILD_REVISION;
}
