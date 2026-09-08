#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <math.h>

// Retry-After uses the HTTP IMF-fixdate format and always denotes UTC.
double inth_http_date(const uint8_t *value, size_t length) {
  if (length != 29 || memchr(value, 0, length)) return NAN;
  char text[30], month[4], weekday[4], zone[4];
  memcpy(text, value, length); text[length] = 0;
  struct tm date = {0};
  int year, day, hour, minute, second;
  if (sscanf(text, "%3s, %d %3s %d %d:%d:%d %3s", weekday, &day, month,
      &year, &hour, &minute, &second, zone) != 8 || strcmp(zone, "GMT")) return NAN;
  const char *months[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  int index = 0;
  while (index < 12 && strcmp(month, months[index])) index++;
  if (index == 12 || year < 1970 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return NAN;
  date.tm_year = year - 1900; date.tm_mon = index; date.tm_mday = day;
  date.tm_hour = hour; date.tm_min = minute; date.tm_sec = second;
#ifdef _WIN32
  time_t result = _mkgmtime(&date);
#else
  time_t result = timegm(&date);
#endif
  return result == (time_t)-1 ? NAN : (double)result * 1000.0;
}
