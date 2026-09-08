#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>
#include <string.h>

static DWORD saved_input, saved_error;
static UINT saved_input_page, saved_output_page;
static int active;
static DWORD saved_output;
static UINT original_output_page;
static HANDLE output_handle;
static int output_active, registered;
static void restore_terminal(void) {
  if (!active) return;
  fputs("\033[?25h", stderr); fflush(stderr);
  SetConsoleMode(GetStdHandle(STD_INPUT_HANDLE), saved_input);
  SetConsoleMode(GetStdHandle(STD_ERROR_HANDLE), saved_error);
  SetConsoleCP(saved_input_page); SetConsoleOutputCP(saved_output_page);
  active = 0;
}
static void restore_all(void) {
  restore_terminal();
  if (output_active) {
    fflush(stdout); fflush(stderr);
    SetConsoleMode(output_handle, saved_output);
    SetConsoleOutputCP(original_output_page);
    output_active = 0;
  }
}
static BOOL WINAPI console_signal(DWORD event) {
  (void)event; restore_all(); return FALSE;
}
static int register_restoration(void) {
  if (registered) return 1;
  if (atexit(restore_all)) return 0;
  if (!SetConsoleCtrlHandler(console_signal, TRUE)) return 0;
  registered = 1;
  return 1;
}
static int capture_output(void) {
  if (output_active) return 1;
  DWORD mode;
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  if (!GetConsoleMode(output, &mode) || !register_restoration()) return 0;
  output_handle = output; saved_output = mode;
  original_output_page = active ? saved_output_page : GetConsoleOutputCP();
  output_active = 1;
  return 1;
}
static void utf8_output(void) {
  if (capture_output()) {
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleMode(output_handle, saved_output | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
  }
}
int32_t inth_terminal_begin(void) {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE), error = GetStdHandle(STD_ERROR_HANDLE);
  if (active || !GetConsoleMode(input, &saved_input) || !GetConsoleMode(error, &saved_error)) return -1;
  if (!register_restoration()) return -1;
  // stdout and stderr can refer to the same screen buffer. Snapshot stdout
  // before the picker changes stderr's mode, even if columns are queried later.
  capture_output();
  saved_input_page = GetConsoleCP(); saved_output_page = GetConsoleOutputCP();
  if (!SetConsoleMode(input, (saved_input & ~(ENABLE_LINE_INPUT | ENABLE_ECHO_INPUT | ENABLE_PROCESSED_INPUT)) | ENABLE_WINDOW_INPUT)) return -1;
  if (!SetConsoleMode(error, saved_error | ENABLE_VIRTUAL_TERMINAL_PROCESSING)) {
    SetConsoleMode(input, saved_input); return -1;
  }
  active = 1; SetConsoleCP(CP_UTF8); SetConsoleOutputCP(CP_UTF8);
  fputs("\033[?25l", stderr); fflush(stderr); return 0;
}
int32_t inth_terminal_end(void) { restore_terminal(); return 0; }
int32_t inth_terminal_key(void) {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  DWORD result = WaitForSingleObject(input, 25);
  if (result == WAIT_TIMEOUT) return 0;
  if (result != WAIT_OBJECT_0) return -1;
  INPUT_RECORD record; DWORD read;
  if (!ReadConsoleInputW(input, &record, 1, &read) || read != 1) return -1;
  if (record.EventType != KEY_EVENT || !record.Event.KeyEvent.bKeyDown) return 0;
  KEY_EVENT_RECORD key = record.Event.KeyEvent;
  if (key.wVirtualKeyCode == VK_UP || key.wVirtualKeyCode == VK_LEFT || key.uChar.UnicodeChar == L'k') return 1;
  if (key.wVirtualKeyCode == VK_DOWN || key.wVirtualKeyCode == VK_RIGHT || key.wVirtualKeyCode == VK_TAB || key.uChar.UnicodeChar == L'j') return 2;
  if (key.wVirtualKeyCode == VK_RETURN) return 3;
  if (key.wVirtualKeyCode == VK_ESCAPE || key.uChar.UnicodeChar == 3 || key.uChar.UnicodeChar == 4) return 4;
  if (key.wVirtualKeyCode == VK_HOME) return 5;
  if (key.wVirtualKeyCode == VK_END) return 6;
  return 0;
}
static int columns(DWORD stream) {
  CONSOLE_SCREEN_BUFFER_INFO info;
  return GetConsoleScreenBufferInfo(GetStdHandle(stream), &info) ? info.srWindow.Right - info.srWindow.Left + 1 : 80;
}
int32_t inth_output_columns(void) { utf8_output(); return columns(STD_OUTPUT_HANDLE); }
int32_t inth_terminal_rows(void) {
  CONSOLE_SCREEN_BUFFER_INFO info;
  return GetConsoleScreenBufferInfo(GetStdHandle(STD_ERROR_HANDLE), &info) ? info.srWindow.Bottom - info.srWindow.Top + 1 : 24;
}
static int cells(uint32_t c) {
  if ((c >= 0x300 && c <= 0x36f) || (c >= 0x200b && c <= 0x200f) || (c >= 0xfe00 && c <= 0xfe0f)) return 0;
  if ((c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe10 && c <= 0xfe6f) || (c >= 0xff01 && c <= 0xff60) ||
      (c >= 0x1f000 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3ffff)) return 2;
  return 1;
}
int32_t inth_terminal_line(const uint8_t *text, size_t length) {
  size_t offset = 0; int width = 0, limit = columns(STD_ERROR_HANDLE) - 1;
  while (offset < length) {
    uint32_t code = text[offset]; size_t count = 1;
    if ((code & 0xe0) == 0xc0) { code &= 0x1f; count = 2; }
    else if ((code & 0xf0) == 0xe0) { code &= 0x0f; count = 3; }
    else if ((code & 0xf8) == 0xf0) { code &= 7; count = 4; }
    else if (code >= 0x80) break;
    if (offset + count > length) break;
    for (size_t index = 1; index < count; index++) code = (code << 6) | (text[offset + index] & 0x3f);
    int size = cells(code);
    if (width + size > limit) break;
    if (code >= 0x20 && code != 0x7f) { fwrite(text + offset, 1, count, stderr); width += size; }
    offset += count;
  }
  fputc('\n', stderr); fflush(stderr); return 0;
}
