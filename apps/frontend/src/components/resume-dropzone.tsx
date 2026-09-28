import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';

export interface ResumeDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  uploading?: boolean;
  hasExistingFile?: boolean;
  fileName?: string | null;
  className?: string;
}

export function ResumeDropzone({
  onFileSelect,
  disabled = false,
  uploading = false,
  hasExistingFile = false,
  fileName,
  className = '',
}: ResumeDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !disabled && !uploading) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect, disabled, uploading],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    disabled: disabled || uploading,
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024, // 5MB
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
  });

  return (
    <div className={`w-full ${className}`}>
      <Card
        {...getRootProps()}
        className={`group relative flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all duration-200 border-2 border-dashed ${
          disabled || uploading
            ? 'opacity-60 cursor-not-allowed border-slate-200 bg-slate-50/50'
            : isDragReject
              ? 'border-red-400 bg-red-50/50 ring-2 ring-red-200'
              : isDragActive
                ? 'border-[#1a5d4c] bg-[#eaf5ef]/60 ring-4 ring-[#1a5d4c]/10 scale-[1.01]'
                : 'border-slate-200 hover:border-[#1a5d4c] hover:bg-[#f8fafc] bg-white'
        }`}
      >
        <input {...getInputProps()} aria-label="Upload CV" />

        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl mb-3.5 transition-all duration-200 ${
            isDragActive
              ? 'bg-[#1a5d4c] text-white scale-110 shadow-lg shadow-[#1a5d4c]/20'
              : isDragReject
                ? 'bg-red-100 text-red-600'
                : 'bg-[#eaf5ef] text-[#1a5d4c] group-hover:scale-105 group-hover:bg-[#1a5d4c] group-hover:text-white'
          }`}
        >
          {isDragReject ? (
            <AlertCircle size={28} />
          ) : isDragActive ? (
            <CheckCircle2 size={28} className="animate-bounce" />
          ) : (
            <UploadCloud size={28} />
          )}
        </div>

        <div className="space-y-1.5 max-w-sm">
          <p className="text-sm font-semibold text-slate-900 transition-colors">
            {isDragReject
              ? 'Only PDF or DOCX files are supported'
              : isDragActive
                ? 'Drop the file here'
                : hasExistingFile
                  ? 'Replace CV'
                  : 'Drag & drop your CV or browse'}
          </p>
          <p className="text-xs text-slate-500">
            PDF or DOCX · up to 5 MB · text-based documents
          </p>
        </div>

        {!uploading && !disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 h-9 px-4 rounded-xl border-slate-200 bg-white font-medium text-slate-700 shadow-sm transition-all group-hover:border-[#1a5d4c] group-hover:text-[#1a5d4c]"
          >
            Browse file
          </Button>
        )}

        {uploading && (
          <div className="mt-4 w-full max-w-xs space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-600">
              <span>Uploading document and extracting text…</span>
              <span>60%</span>
            </div>
            <Progress value={60} className="h-1.5 w-full bg-slate-100" />
          </div>
        )}
      </Card>
    </div>
  );
}
