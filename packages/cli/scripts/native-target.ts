export interface NativeTarget {
  platform: string;
  arch: string;
  executable: string;
  compiler: string;
  compilerArgs: string[];
  sources: string[];
  systemLibraries: string[];
}
const targetPlatform = (target: string): string => {
  if (target.includes("windows")) {
    return "win32";
  }
  if (target.includes("linux")) {
    return "linux";
  }
  if (target.includes("macos") || target.includes("darwin")) {
    return "darwin";
  }
  return "unsupported";
};
const targetArch = (target: string): string => {
  if (target.startsWith("aarch64")) {
    return "arm64";
  }
  if (target.startsWith("x86_64")) {
    return "x64";
  }
  return "unsupported";
};
export const nativeTarget = (
  hostPlatform: string,
  hostArch: string,
  target = "",
  cc = ""
): NativeTarget => {
  if (target && cc !== "zigcc") {
    throw new Error("Cross-compilation requires SCRIPTC_CC=zigcc.");
  }
  const platform = target ? targetPlatform(target) : hostPlatform;
  const arch = target ? targetArch(target) : hostArch;
  if (
    !["darwin-arm64", "linux-arm64", "linux-x64", "win32-x64"].includes(
      `${platform}-${arch}`
    )
  ) {
    throw new Error(
      `Unsupported native target: ${platform}-${arch}. Use an Apple silicon Mac, Linux arm64/x64, or Windows x64.`
    );
  }
  if (cc && !["clang", "zigcc"].includes(cc)) {
    throw new Error("SCRIPTC_CC must be clang or zigcc.");
  }
  const compilerArgs = cc === "zigcc" ? ["cc", "-fno-sanitize=undefined"] : [];
  if (target) {
    compilerArgs.push("-target", target);
  }
  if (platform === "linux") {
    compilerArgs.push("-D_GNU_SOURCE");
  }
  let sources = [
    "native-keychain",
    "native-terminal",
    "native-date",
    "native-secret-macos",
  ];
  let systemLibraries: string[] = [];
  if (platform === "linux") {
    sources = [
      "native-keychain",
      "native-terminal",
      "native-date",
      "native-secret-linux",
    ];
    systemLibraries = ["dl"];
  }
  if (platform === "win32") {
    sources = ["native-windows", "native-terminal-windows", "native-date"];
    systemLibraries = ["advapi32", "shell32", "bcrypt"];
  }
  sources.push("native-url");
  return {
    arch,
    compiler: cc === "zigcc" ? "zig" : "clang",
    compilerArgs,
    executable: platform === "win32" ? "inth.exe" : "inth",
    platform,
    sources,
    systemLibraries,
  };
};
