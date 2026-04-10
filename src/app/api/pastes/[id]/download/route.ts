import { NextRequest, NextResponse } from 'next/server';
import { getPaste } from '@/lib/services/paste-service';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> & { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Paste ID is required' }, { status: 400 });
    }

    const paste = await getPaste({ id });

    // Handle file downloads
    if (paste.pasteType === 'file' && paste.fileUrl) {
      const fileKey = (paste as any).fileKey;
      
      // Try to read from local filesystem first
      if (fileKey) {
        const filePath = path.join(UPLOAD_DIR, fileKey);
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          const fileName = paste.fileName || 'download';
          const mimeType = paste.fileMimeType || 'application/octet-stream';

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `attachment; filename="${fileName}"`,
              'Content-Length': fileBuffer.length.toString(),
              'Cache-Control': 'public, max-age=31536000',
            },
          });
        }
      }

      // Fallback: fetch from URL
      const fileResponse = await fetch(paste.fileUrl);
      if (!fileResponse.ok) {
        return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 });
      }

      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
      const fileName = paste.fileName || 'download';
      const mimeType = paste.fileMimeType || 'application/octet-stream';

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    // Handle image downloads (existing logic)
    const format = request.nextUrl.searchParams.get('format') || 'original';

    if (!paste.hasImage || !paste.imageUrl) {
      return NextResponse.json({ error: 'Not an image paste' }, { status: 400 });
    }

    const imageResponse = await fetch(paste.imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    let targetFormat = format === 'original' ? paste.originalFormat || 'jpeg' : format;
    let mimeType: string;
    let outputBuffer: Buffer;
    const sharpImage = sharp(Buffer.from(imageBuffer));

    switch (targetFormat.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        outputBuffer = await sharpImage.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        mimeType = 'image/jpeg';
        targetFormat = 'jpg';
        break;
      case 'png':
        outputBuffer = await sharpImage
          .png({
            compressionLevel: 9,
            adaptiveFiltering: true,
          })
          .toBuffer();
        mimeType = 'image/png';
        targetFormat = 'png';
        break;
      case 'webp':
        outputBuffer = await sharpImage.webp({ quality: 90 }).toBuffer();
        mimeType = 'image/webp';
        targetFormat = 'webp';
        break;
      case 'avif':
        outputBuffer = await sharpImage.avif({ quality: 80 }).toBuffer();
        mimeType = 'image/avif';
        targetFormat = 'avif';
        break;
      default:
        outputBuffer = await sharpImage.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        mimeType = 'image/jpeg';
        targetFormat = 'jpg';
    }

    const filename = `pastebaw-${id.split('.')[0]}.${targetFormat}`;

    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download paste' },
      { status: 500 }
    );
  }
}
