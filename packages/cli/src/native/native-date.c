#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <math.h>

// RFC 9110 section 5.6.7 requires IMF-fixdate, RFC 850, and asctime dates.
double inth_http_date(const uint8_t *value, size_t length) {
  if (!length || length >= 64 || memchr(value, 0, length)) return NAN;
  char text[64], canonical[64], month[4] = {0}, weekday[10] = {0};
  memcpy(text, value, length); text[length] = 0;
  int year = 0, day = 0, hour = 0, minute = 0, second = 0, used = 0, format = 0;
  if (sscanf(text, "%3s, %2d %3s %4d %2d:%2d:%2d GMT%n", weekday, &day, month,
      &year, &hour, &minute, &second, &used) == 7 && used == (int)length) {
    format = 1;
    snprintf(canonical, sizeof(canonical), "%s, %02d %s %04d %02d:%02d:%02d GMT", weekday, day, month, year, hour, minute, second);
  } else {
    used = 0;
    if (sscanf(text, "%9[^,], %2d-%3s-%2d %2d:%2d:%2d GMT%n", weekday, &day, month,
        &year, &hour, &minute, &second, &used) == 7 && used == (int)length) {
      format = 2;
      snprintf(canonical, sizeof(canonical), "%s, %02d-%s-%02d %02d:%02d:%02d GMT", weekday, day, month, year, hour, minute, second);
    } else {
      used = 0;
      if (sscanf(text, "%3s %3s %2d %2d:%2d:%2d %4d%n", weekday, month, &day,
          &hour, &minute, &second, &year, &used) != 7 || used != (int)length) return NAN;
      format = 3;
      snprintf(canonical, sizeof(canonical), "%s %s %2d %02d:%02d:%02d %04d", weekday, month, day, hour, minute, second, year);
    }
  }
  if (strcmp(text, canonical)) return NAN;
  const char *short_days[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  const char *long_days[] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
  int week = 0;
  while (week < 7 && strcmp(weekday, format == 2 ? long_days[week] : short_days[week])) week++;
  if (week == 7) return NAN;
  const char *months[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  int index = 0;
  while (index < 12 && strcmp(month, months[index])) index++;
  if (index == 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return NAN;
  if (format == 2) {
    if (year < 0 || year > 99) return NAN;
    time_t now = time(NULL);
    struct tm *current = gmtime(&now);
    if (!current) return NAN;
    int this_year = current->tm_year + 1900;
    year += (this_year / 100) * 100;
    // Compare the whole timestamp at the 50-year boundary, not just its year.
    if (year > this_year + 50 || (year == this_year + 50 &&
        (index > current->tm_mon || (index == current->tm_mon &&
        (day > current->tm_mday || (day == current->tm_mday &&
        (hour > current->tm_hour || (hour == current->tm_hour &&
        (minute > current->tm_min || (minute == current->tm_min && second > current->tm_sec)))))))))) year -= 100;
  }
  const int days[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  int leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
  if (year < 1601 || year > 9999 || day < 1 || day > days[index] + (index == 1 && leap)) return NAN;
  // Convert Gregorian calendar days directly to UTC seconds on every platform.
  int adjusted = year - (index < 2);
  int era = adjusted / 400, within = adjusted - era * 400;
  int shifted_month = index + (index > 1 ? -2 : 10);
  int day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
  int day_of_era = within * 365 + within / 4 - within / 100 + day_of_year;
  int64_t epoch_days = (int64_t)era * 146097 + day_of_era - 719468;
  return (double)(epoch_days * 86400 + hour * 3600 + minute * 60 + second) * 1000.0;
}
