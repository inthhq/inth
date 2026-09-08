// Terminal operations missing from Scriptc's Node compatibility layer.
#include <errno.h>
#include <locale.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <wchar.h>

static struct termios saved;
static volatile sig_atomic_t active;
static int registered;
static const int terminal_signals[] = {SIGTERM, SIGHUP, SIGQUIT};
static struct sigaction previous_handlers[3];

static void restore_terminal(void) {
  if (!active) return;
  tcsetattr(STDIN_FILENO, TCSANOW, &saved);
  // write and tcsetattr are async-signal-safe; stdio is not.
  const char cursor[] = "\033[?25h";
  (void)write(STDERR_FILENO, cursor, sizeof(cursor) - 1);
  active = 0;
  for (size_t index = 0; index < 3; index++) {
    sigaction(terminal_signals[index], &previous_handlers[index], NULL);
  }
}
static void terminate_terminal(int signal_number) {
  restore_terminal();
  // Preserve the process's original handler, including Scriptc's cancellation handler.
  kill(getpid(), signal_number);
}
int32_t inth_terminal_begin(void) {
  if (active || !isatty(STDIN_FILENO) || !isatty(STDERR_FILENO) ||
      tcgetattr(STDIN_FILENO, &saved)) return -1;
  if (!registered) {
    if (atexit(restore_terminal)) return -1;
    registered = 1;
  }
  sigset_t blocked, original_mask;
  sigemptyset(&blocked);
  for (size_t index = 0; index < 3; index++) sigaddset(&blocked, terminal_signals[index]);
  if (sigprocmask(SIG_BLOCK, &blocked, &original_mask)) return -1;
  struct sigaction handler = {0};
  handler.sa_handler = terminate_terminal;
  handler.sa_mask = blocked;
  size_t installed = 0;
  for (; installed < 3; installed++) {
    if (sigaction(terminal_signals[installed], &handler, &previous_handlers[installed])) break;
  }
  struct termios raw = saved;
  raw.c_lflag &= ~(ICANON | ECHO | ISIG);
  raw.c_iflag &= ~(IXON | ICRNL);
  raw.c_cc[VMIN] = 1;
  raw.c_cc[VTIME] = 0;
  if (installed != 3 || tcsetattr(STDIN_FILENO, TCSANOW, &raw)) {
    for (size_t index = 0; index < installed; index++) {
      sigaction(terminal_signals[index], &previous_handlers[index], NULL);
    }
    sigprocmask(SIG_SETMASK, &original_mask, NULL);
    return -1;
  }
  active = 1;
  setlocale(LC_CTYPE, "");
  fputs("\033[?25l", stderr);
  fflush(stderr);
  sigprocmask(SIG_SETMASK, &original_mask, NULL);
  return 0;
}
int32_t inth_terminal_end(void) { restore_terminal(); return 0; }
static int64_t monotonic_ms(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) return -1;
  return (int64_t)now.tv_sec * 1000 + now.tv_nsec / 1000000;
}
static int read_byte(int timeout) {
  int64_t start = monotonic_ms();
  if (start < 0) return -1;
  int64_t deadline = start + timeout;
  for (;;) {
    struct pollfd descriptor = {STDIN_FILENO, POLLIN, 0};
    int result = poll(&descriptor, 1, timeout);
    if (result == 0) return -2;
    if (result > 0) {
      unsigned char key;
      ssize_t length = read(STDIN_FILENO, &key, 1);
      if (length == 1) return key;
      if (length == 0 || errno != EINTR) return -1;
    } else if (errno != EINTR) {
      return -1;
    }
    // Signals must not turn an incomplete arrow key into an Escape press.
    int64_t now = monotonic_ms();
    if (now < 0) return -1;
    if (now >= deadline) return -2;
    timeout = (int)(deadline - now);
  }
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
  // Allow delayed escape-sequence fragments from SSH and busy terminals.
  // A standalone Escape still cancels within a quarter of a second.
  key = read_byte(250);
  if (key == -2 || key < 0) return 4;
  if (key != '[' && key != 'O') return 0;
  // Consume an entire CSI sequence so unknown keys cannot become a selection.
  for (int count = 0; count < 16; count++) {
    key = read_byte(250);
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
