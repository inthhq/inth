import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { prepareUploadFile } from "./upload-file.ts";

export const detectedImageType = (bytes: Uint8Array): string => {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  ) {
    return "image/jpeg";
  }
  const header = new TextDecoder().decode(bytes.subarray(0, 6));
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    [82, 73, 70, 70].every((value, index) => bytes[index] === value) &&
    [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)
  ) {
    return "image/webp";
  }
  return "";
};
export const prepareImageInput = async (
  options: CliArguments,
  signal: AbortSignal
): Promise<void> => {
  const file = await prepareUploadFile(options, signal, true);
  try {
    const bytes = await file.readBytes(signal);
    if (detectedImageType(bytes) !== file.mediaType) {
      throw new CliError(
        "usage_error",
        "Image signature must match its PNG, JPEG, WebP or GIF media type."
      );
    }
    options.preparedImageBytes = bytes;
    options.preparedImageMediaType = file.mediaType;
  } finally {
    file.close();
  }
};
