import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const PUBLIC_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pastebaw.duckdns.org';

export function generateImageKey(extension: string = 'webp'): string {
  const uuid = uuidv4();
  return `images/${uuid}.${extension}`;
}

export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const filePath = path.join(UPLOAD_DIR, key);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, buffer);

  return `${PUBLIC_URL}/uploads/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, key);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export async function getSignedR2Url(key: string, expiresIn: number = 3600): Promise<string> {
  return `${PUBLIC_URL}/uploads/${key}`;
}
