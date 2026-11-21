/**
 * Turns a photo the user picked into a small square JPEG, as a data URL.
 * The middle of the picture is kept. Nothing leaves the computer: this all happens here.
 */
export async function toThumbnail(file: Blob, size = 192): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read. Try a JPEG or PNG."));
      img.src = url;
    });

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("That image could not be read. Try a JPEG or PNG.");

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("That image could not be read. Try a JPEG or PNG.");

    // JPEG has no transparency, so see-through areas become white rather than black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
