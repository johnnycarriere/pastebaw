import { NextRequest, NextResponse } from 'next/server';
import { createPaste } from '@/lib/services/paste-service';
import { createPasteSchema } from '@/lib/validations';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let body: {
      content?: string;
      language?: string;
      expiration?: string;
      password?: string;
      image?: string;
      pasteType?: string;
      originalFormat?: string;
      fileName?: string;
      fileSize?: number;
      fileMimeType?: string;
      fileBuffer?: Buffer;
    } = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      body = {
        content: (formData.get('content') as string) || '',
        language: formData.get('language') as string,
        expiration: formData.get('expiration') as string,
        password: (formData.get('password') as string) || '',
        pasteType: (formData.get('pasteType') as string) || 'text',
        originalFormat: formData.get('originalFormat') as string,
      };

      const imageFile = formData.get('image') as File;
      if (imageFile && imageFile.size > 0) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        body.image = `data:${imageFile.type};base64,${buffer.toString('base64')}`;
      }

      const uploadFile = formData.get('file') as File;
      if (uploadFile && uploadFile.size > 0) {
        if (uploadFile.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.` },
            { status: 413 }
          );
        }

        const arrayBuffer = await uploadFile.arrayBuffer();
        body.fileBuffer = Buffer.from(arrayBuffer);
        body.fileName = uploadFile.name;
        body.fileSize = uploadFile.size;
        body.fileMimeType = uploadFile.type || 'application/octet-stream';
        body.pasteType = 'file';
      }
    } else {
      body = await request.json();
    }

    const result = createPasteSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: result.error.format() },
        { status: 400 }
      );
    }

    const paste = await createPaste(result.data);

    return NextResponse.json(paste, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create paste' },
      { status: 500 }
    );
  }
}