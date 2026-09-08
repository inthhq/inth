#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <assert.h>
#include <stdio.h>
#include <wchar.h>
#include "../../src/native/native-terminal-windows.c"

int main(int argc, char **argv) {
  if (argc > 1) {
    if (argv[1][0] == '1') { inth_output_columns(); return 0; }
    if (argv[1][0] == '2') inth_output_columns();
    assert(inth_terminal_begin() == 0);
    if (argv[1][0] >= '4') inth_output_columns();
    if (argv[1][0] != '3' && argv[1][0] != '5') inth_terminal_end();
    return 0;
  }
  // Allocate a private console so these checks cannot alter the CI shell.
  FreeConsole(); assert(AllocConsole());
  SECURITY_ATTRIBUTES attributes = {sizeof(attributes), NULL, TRUE};
  HANDLE input = CreateFileW(L"CONIN$", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &attributes, OPEN_EXISTING, 0, NULL);
  HANDLE output = CreateFileW(L"CONOUT$", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &attributes, OPEN_EXISTING, 0, NULL);
  HANDLE error = CreateConsoleScreenBuffer(GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &attributes, CONSOLE_TEXTMODE_BUFFER, NULL);
  assert(input != INVALID_HANDLE_VALUE && output != INVALID_HANDLE_VALUE && error != INVALID_HANDLE_VALUE);
  DWORD input_mode, output_mode = ENABLE_PROCESSED_OUTPUT | ENABLE_WRAP_AT_EOL_OUTPUT;
  assert(GetConsoleMode(input, &input_mode));
  assert(SetConsoleMode(output, output_mode)); assert(SetConsoleMode(error, output_mode));
  assert(SetConsoleCP(437)); assert(SetConsoleOutputCP(437));
  wchar_t executable[32768]; assert(GetModuleFileNameW(NULL, executable, 32768));
  for (int scenario = 1; scenario <= 6; scenario++) {
    wchar_t command[32800]; swprintf(command, 32800, L"\"%ls\" %d", executable, scenario);
    STARTUPINFOW startup = {0}; startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = input; startup.hStdOutput = output;
    startup.hStdError = scenario == 6 ? output : error;
    PROCESS_INFORMATION child = {0};
    assert(CreateProcessW(NULL, command, NULL, NULL, TRUE, 0, NULL, NULL, &startup, &child));
    assert(WaitForSingleObject(child.hProcess, 10000) == WAIT_OBJECT_0);
    DWORD code, mode;
    assert(GetExitCodeProcess(child.hProcess, &code) && code == 0);
    CloseHandle(child.hThread); CloseHandle(child.hProcess);
    assert(GetConsoleMode(input, &mode) && mode == input_mode);
    assert(GetConsoleMode(output, &mode) && mode == output_mode);
    assert(GetConsoleMode(error, &mode) && mode == output_mode);
    assert(GetConsoleCP() == 437 && GetConsoleOutputCP() == 437);
  }
  CloseHandle(input); CloseHandle(output); CloseHandle(error); FreeConsole();
  puts("Windows console: ordinary output, picker completion, and process-exit restoration passed.");
  return 0;
}
