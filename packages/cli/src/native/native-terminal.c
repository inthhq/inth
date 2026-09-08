// Terminal operations missing from Scriptc's Node compatibility layer.
#include <errno.h>
#include <locale.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <unistd.h>
#include <wchar.h>

static struct termios saved;
static int active;
static void restore_terminal(void) {
  if (!active) return;
  tcsetattr(STDIN_FILENO, TCSANOW, &saved);
  fputs("\033[?25h", stderr);
  fflush(stderr);
  active = 0;
}
int32_t inth_terminal_begin(void) {
  if (active || !isatty(STDIN_FILENO) || !isatty(STDERR_FILENO) ||
      tcgetattr(STDIN_FILENO, &saved)) return -1;
  struct termios raw = saved;
  raw.c_lflag &= ~(ICANON | ECHO | ISIG);
  raw.c_iflag &= ~(IXON | ICRNL);
  raw.c_cc[VMIN] = 1;
  raw.c_cc[VTIME] = 0;
  if (tcsetattr(STDIN_FILENO, TCSANOW, &raw)) return -1;
  active = 1;
  atexit(restore_terminal);
  setlocale(LC_CTYPE, "");
  fputs("\033[?25l", stderr);
  return 0;
}
int32_t inth_terminal_end(void) { restore_terminal(); return 0; }
static int read_byte(int timeout) {
  struct pollfd descriptor = {STDIN_FILENO, POLLIN, 0};
  int result = poll(&descriptor, 1, timeout);
  if (result == 0 || (result < 0 && errno == EINTR)) return -2;
  if (result < 0) return -1;
  unsigned char key;
  if (read(STDIN_FILENO, &key, 1) != 1) return -1;
  return key;
}
// 0 idle, 1 up, 2 down, 3 submit, 4 cancel, 5 home, 6 end, -1 closed.
int32_t inth_terminal_key(void) {
  int key = read_byte(25);
  if (key == -2) return 0;
  if (key < 0) return -1;
  if (key == 3 || key == 4) return 4;
  if (key == '\r' || key == '\n') return 3;
  if (key == 'k') return 1;
  if (key == 'j' || key == '\t') return 2;
  if (key != 27) return 0;
  key = read_byte(75);
  if (key == -2 || key < 0) return 4;
  if (key != '[' && key != 'O') return 0;
  // Consume an entire CSI sequence so unknown keys cannot become a selection.
  for (int count = 0; count < 16; count++) {
    key = read_byte(75);
    if (key < 0) return 0;
    if (key >= 0x40 && key <= 0x7e) {
      if (key == 'A' || key == 'D') return 1;
      if (key == 'B' || key == 'C') return 2;
      if (key == 'H') return 5;
      if (key == 'F') return 6;
      return 0;
    }
  }
  return 0;
}
int32_t inth_terminal_rows(void) {
  struct winsize size;
  return ioctl(STDERR_FILENO, TIOCGWINSZ, &size) == 0 && size.ws_row > 0
    ? size.ws_row : 24;
}
int32_t inth_output_columns(void) {
  struct winsize size;
  return ioctl(STDOUT_FILENO, TIOCGWINSZ, &size) == 0 && size.ws_col > 0
    ? size.ws_col : 80;
}
// Clip by terminal cells, not bytes, keeping wide Unicode labels on one row.
int32_t inth_terminal_line(const uint8_t *text, size_t length) {
  struct winsize size;
  int columns = ioctl(STDERR_FILENO, TIOCGWINSZ, &size) == 0 && size.ws_col > 0
    ? size.ws_col : 80;
  mbstate_t state = {0};
  size_t offset = 0;
  int width = 0;
  while (offset < length) {
    wchar_t character;
    size_t bytes = mbrtowc(&character, (const char *)text + offset, length - offset, &state);
    if (bytes == (size_t)-1 || bytes == (size_t)-2 || bytes == 0) break;
    int cells = wcwidth(character);
    if (cells < 0) { offset += bytes; continue; }
    if (width + cells > columns - 1) break;
    fwrite(text + offset, 1, bytes, stderr);
    width += cells;
    offset += bytes;
  }
  fputc('\n', stderr);
  fflush(stderr);
  return 0;
}
