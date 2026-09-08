#include <stdint.h>
#include <stdio.h>
#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#include <spawn.h>
#include <sys/wait.h>

extern char **environ;


int32_t inth_prepare_directory(const uint8_t *path, size_t length) {
  if (!length || length > 4096 || memchr(path, 0, length)) return -1;
  char *name = malloc(length + 1);
  if (!name) return -1;
  memcpy(name, path, length);
  name[length] = 0;
  int status = mkdir(name, 0700);
  if (status != 0 && errno != EEXIST) { free(name); return -1; }
  struct stat info;
  status = lstat(name, &info);
  free(name);
  if (status || !S_ISDIR(info.st_mode) || info.st_uid != geteuid() ||
      (info.st_mode & 077)) return -1;
  return 0;
}

int32_t inth_open_browser(const uint8_t *url, size_t length) {
  extern int32_t inth_browser_url_valid(const uint8_t *, size_t);
  if (!inth_browser_url_valid(url, length)) return -1;
  char *value = malloc(length + 1);
  if (!value) return -1;
  memcpy(value, url, length);
  value[length] = 0;
#ifdef __APPLE__
  char *args[] = {"/usr/bin/open", value, NULL};
#else
  char *args[] = {"xdg-open", value, NULL};
#endif
  pid_t child;
  int result = posix_spawnp(&child, args[0], NULL, NULL, args, environ);
  free(value);
  if (result) return -1;
  int status;
  while (waitpid(child, &status, 0) < 0) { if (errno != EINTR) return -1; }
  return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : -1;
}

int32_t inth_remove_directory(const uint8_t *path, size_t length) {
  if (!length || length > 4096 || memchr(path, 0, length)) return -1;
  char *name = malloc(length + 1);
  if (!name) return -1;
  memcpy(name, path, length);
  name[length] = 0;
  int status = rmdir(name);
  free(name);
  return status;
}

int32_t inth_lock_acquire(const uint8_t *path, size_t length) {
  if (!length || length > 4096 || memchr(path, 0, length)) return -1;
  char *name = malloc(length + 1);
  if (!name) return -1;
  memcpy(name, path, length);
  name[length] = 0;
  int fd = open(name, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, 0600);
  free(name);
  if (fd < 0) return -1;
  struct stat info;
  if (fstat(fd, &info) || !S_ISREG(info.st_mode) || info.st_uid != geteuid() ||
      (info.st_mode & 077) || info.st_nlink != 1) { close(fd); return -1; }
  if (flock(fd, LOCK_EX | LOCK_NB)) {
    int status = errno == EWOULDBLOCK ? -2 : -1;
    close(fd);
    return status;
  }
  return fd;
}

int32_t inth_lock_release(int32_t fd) {
  int status = flock(fd, LOCK_UN);
  int closed = close(fd);
  return status || closed ? -1 : 0;
}

// Atomic owner-only configuration replacement. Credentials never use this path.
int32_t inth_write_config(const uint8_t *path, size_t length,
                          const uint8_t *value, size_t value_length) {
  if (!length || length > 4096 || memchr(path, 0, length) || value_length > 4 * 1024 * 1024) return -1;
  char *name = malloc(length + 1);
  char *temporary = malloc(length + 12);
  if (!name || !temporary) { free(name); free(temporary); return -1; }
  memcpy(name, path, length); name[length] = 0;
  snprintf(temporary, length + 12, "%s.XXXXXX", name);
  int fd = mkstemp(temporary);
  int result = -1;
  if (fd >= 0) {
    size_t offset = 0;
    while (offset < value_length) {
      ssize_t written = write(fd, value + offset, value_length - offset);
      if (written < 0 && errno == EINTR) continue;
      if (written <= 0) break;
      offset += (size_t)written;
    }
    int synced = fsync(fd);
    int closed = close(fd);
    if (offset == value_length && !synced && !closed) result = rename(temporary, name);
    if (result) {
      unlink(temporary);
    } else {
      char *slash = strrchr(name, '/');
      const char *parent = ".";
      if (slash) {
        *slash = 0;
        parent = slash == name ? "/" : name;
      }
      int parent_fd = open(parent, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
      if (parent_fd < 0) {
        result = -1;
      } else {
        int synced_parent = fsync(parent_fd);
        int closed_parent = close(parent_fd);
        result = synced_parent || closed_parent ? -1 : 0;
      }
    }
  }
  free(name); free(temporary);
  return result;
}
