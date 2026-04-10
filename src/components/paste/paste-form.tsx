'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MonacoEditor, MonacoEditorRef } from '@/components/editor/monaco-editor';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXPIRATION_OPTIONS } from '@/lib/constants';
import { detectLanguage } from '@/lib/utils/language-detector';
import { ImageIcon, FileIcon, X } from 'lucide-react';
import { formatBytes } from '@/lib/utils/helpers';

export function PasteForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MonacoEditorRef>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [expiration, setExpiration] = useState('never');
  const [password, setPassword] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pasteType, setPasteType] = useState<'text' | 'image' | 'file'>('text');

  useEffect(() => {
    if (content.trim().length > 5) {
      const detectedLang = detectLanguage(content);
      setLanguage(detectedLang);
    }
  }, [content]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'image/avif',
      'image/tiff',
      'image/bmp',
    ];
    if (!validTypes.includes(file.type)) {
      toast.error(
        'Invalid file type. Please upload a supported image format (JPEG, PNG, WebP, GIF, HEIC, etc).'
      );
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Image is too large. Maximum size is 50MB.');
      return;
    }

    setImage(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      toast.error('File is too large. Maximum size is 100MB.');
      return;
    }

    setUploadFile(file);
  };

  const handleRemoveFile = () => {
    setUploadFile(null);
    if (uploadFileInputRef.current) {
      uploadFileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);

          if (fileInputRef.current) {
            fileInputRef.current.files = dataTransfer.files;

            const event = new Event('change', { bubbles: true });
            fileInputRef.current.dispatchEvent(event);
          } else {
            handleImageChange({
              target: {
                files: dataTransfer.files,
              },
            } as React.ChangeEvent<HTMLInputElement>);
          }

          e.preventDefault();
          return;
        }
      }
    }
  };

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
      }

      if (!content.trim() && !image && !uploadFile) {
        toast.error('Please enter some content, upload an image, or upload a file');
        return;
      }

      setIsSubmitting(true);

      try {
        if (pasteType === 'text' && !content.trim()) {
          toast.error('Please enter some text content');
          setIsSubmitting(false);
          return;
        }

        if (pasteType === 'image' && !image) {
          toast.error('Please upload an image');
          setIsSubmitting(false);
          return;
        }

        if (pasteType === 'file' && !uploadFile) {
          toast.error('Please select a file to upload');
          setIsSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append('content', content);
        formData.append('language', language);
        formData.append('expiration', expiration);
        formData.append('pasteType', pasteType);
        formData.append('password', password || '');

        if (image) {
          formData.append('image', image);
          const format = image.type.split('/')[1] || '';
          formData.append('originalFormat', format);
        }

        if (uploadFile) {
          formData.append('file', uploadFile);
        }

        const response = await fetch('/api/pastes', {
          method: 'POST',
          body: formData,
        });

        if (response.status === 429) {
          const error = await response.json();
          const resetTime = error.resetTime ? new Date(error.resetTime) : null;
          const resetTimeStr = resetTime
            ? resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'some time';

          toast.error(`Rate limit reached. You can create more pastes after ${resetTimeStr}.`, {
            duration: 8000,
            description: error.message || 'Too many pastes created recently.',
          });

          setIsSubmitting(false);
          return;
        }

        if (response.status === 413) {
          const error = await response.json();
          toast.error(error.error || 'File too large');
          setIsSubmitting(false);
          return;
        }

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create paste');
        }

        const paste = await response.json();
        toast.success('Paste created successfully!');
        router.push(`/${paste.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create paste');
      } finally {
        setIsSubmitting(false);
      }
    },
    [content, image, uploadFile, language, expiration, password, pasteType, router]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (editorRef.current && pasteType === 'text') {
        editorRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [pasteType]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSubmit]);

  // File type icon mapping
  const getFileIcon = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const icons: Record<string, string> = {
      apk: '\u{1F916}', pdf: '\u{1F4C4}', zip: '\u{1F4E6}', tar: '\u{1F4E6}', gz: '\u{1F4E6}',
      '7z': '\u{1F4E6}', rar: '\u{1F4E6}', doc: '\u{1F4DD}', docx: '\u{1F4DD}',
      xls: '\u{1F4CA}', xlsx: '\u{1F4CA}', mp4: '\u{1F3AC}', mkv: '\u{1F3AC}',
      mp3: '\u{1F3B5}', wav: '\u{1F3B5}', exe: '\u{2699}', dmg: '\u{1F4BF}', iso: '\u{1F4BF}',
    };
    return icons[ext] || '\u{1F4CE}';
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full flex-col"
      suppressHydrationWarning
      onPaste={handlePaste}
    >
      <div className="flex flex-col border-b p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex rounded-md border">
              <Button
                type="button"
                variant={pasteType === 'text' ? 'default' : 'outline'}
                className="flex items-center rounded-r-none rounded-l-md px-2 sm:px-3"
                onClick={() => {
                  setPasteType('text');
                  if (image) handleRemoveImage();
                  if (uploadFile) handleRemoveFile();
                }}
              >
                <svg
                  className="mr-1 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M7 9H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 13H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 17H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Text
              </Button>
              <Button
                type="button"
                variant={pasteType === 'image' ? 'default' : 'outline'}
                className="flex items-center rounded-none border-x-0 px-2 sm:px-3"
                onClick={() => {
                  setPasteType('image');
                  if (content) setContent('');
                  if (uploadFile) handleRemoveFile();
                }}
              >
                <ImageIcon className="mr-1 h-4 w-4" />
                Image
              </Button>
              <Button
                type="button"
                variant={pasteType === 'file' ? 'default' : 'outline'}
                className="flex items-center rounded-l-none rounded-r-md px-2 sm:px-3"
                onClick={() => {
                  setPasteType('file');
                  if (content) setContent('');
                  if (image) handleRemoveImage();
                }}
              >
                <FileIcon className="mr-1 h-4 w-4" />
                File
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              id="image-upload"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/tiff,image/bmp"
              onChange={handleImageChange}
              className="hidden"
            />

            <input
              ref={uploadFileInputRef}
              type="file"
              id="file-upload"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div>
            <span className="text-muted-foreground text-xs">
              {pasteType === 'text'
                ? 'Share code snippets, logs, or any text'
                : pasteType === 'image'
                  ? 'Share images up to 50MB'
                  : 'Share any file up to 100MB'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col border-b p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="w-full sm:w-44">
              <Select value={expiration} onValueChange={setExpiration}>
                <SelectTrigger id="expiration" className="h-10 w-full">
                  <SelectValue placeholder="Expiration" />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRATION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-44">
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="border-input bg-background h-10 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Password (optional)"
                suppressHydrationWarning
              />
            </div>
          </div>

          <div className="flex flex-col items-center sm:items-end">
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {pasteType === 'file' ? 'Uploading...' : 'Creating...'}
                </>
              ) : (
                pasteType === 'file' ? 'Upload File' : 'Create Paste'
              )}
            </Button>
            <span className="text-muted-foreground mt-1 hidden text-xs sm:inline">
              or press{' '}
              {typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
                ? '\u2318+Enter'
                : 'Ctrl+Enter'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 pb-6 sm:p-4 sm:pb-8">
        {pasteType === 'text' ? (
          <div className="flex h-full min-h-[300px] flex-col overflow-auto rounded-md border">
            <MonacoEditor
              ref={editorRef}
              value={content}
              onChange={setContent}
              language={language}
              height="100%"
              showSyntaxHighlighting={false}
              placeholder="Paste or type your code here..."
            />
          </div>
        ) : pasteType === 'image' ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center overflow-auto rounded-md border">
            {imagePreview ? (
              <div className="relative w-full max-w-full overflow-hidden">
                <div className="absolute top-2 right-2 z-10">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 w-8 rounded-full p-0"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-[300px] w-full object-contain sm:max-h-[500px]"
                />
              </div>
            ) : (
              <div className="text-center">
                <ImageIcon className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <h3 className="mb-2 text-lg font-medium">Upload an Image</h3>
                <p className="text-muted-foreground mb-4 max-w-md">
                  Drag and drop an image here, or click the button below to select one from your device.
                </p>
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mx-auto flex items-center"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Select Image
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center overflow-auto rounded-md border">
            {uploadFile ? (
              <div className="flex w-full max-w-md flex-col items-center gap-4 p-8">
                <div className="absolute top-2 right-2 z-10" style={{ position: 'relative' }}>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 w-8 rounded-full p-0"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-6xl">{getFileIcon(uploadFile.name)}</div>
                <div className="text-center">
                  <p className="text-lg font-medium break-all">{uploadFile.name}</p>
                  <p className="text-muted-foreground text-sm">{formatBytes(uploadFile.size)}</p>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <FileIcon className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <h3 className="mb-2 text-lg font-medium">Upload a File</h3>
                <p className="text-muted-foreground mb-4 max-w-md">
                  Upload any file up to 100MB \u2014 APKs, PDFs, ZIPs, videos, documents, and more.
                  Get a shareable download link.
                </p>
                <Button
                  type="button"
                  onClick={() => uploadFileInputRef.current?.click()}
                  className="mx-auto flex items-center"
                >
                  <FileIcon className="mr-2 h-4 w-4" />
                  Select File
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
