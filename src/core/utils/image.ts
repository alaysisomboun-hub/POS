export async function compressProductImageFile(
  file: File,
  maxDimension = 220,
  maxChars = 42000,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ไม่สามารถถอดรหัสรูปภาพได้'));
    image.src = dataUrl;
  });

  const ratio = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const targetWidth = Math.max(1, Math.round(img.width * ratio));
  const targetHeight = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('เบราว์เซอร์ไม่รองรับการย่อขนาดรูปภาพ');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  let quality = 0.72;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > maxChars && quality > 0.3) {
    quality -= 0.1;
    output = canvas.toDataURL('image/jpeg', quality);
  }

  if (output.length > maxChars) {
    throw new Error('รูปภาพมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลงหรือใส่ลิงก์ URL แทน');
  }

  return output;
}
