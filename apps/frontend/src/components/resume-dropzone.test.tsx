import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeDropzone } from './resume-dropzone';
import { changeLanguage } from '../i18n';

beforeEach(async () => {
  await changeLanguage('en');
});

afterEach(async () => {
  cleanup();
  await changeLanguage('uz');
});

describe('ResumeDropzone component', () => {
  it('renders idle state with instructions and file type requirements', () => {
    render(<ResumeDropzone onFileSelect={vi.fn()} />);
    expect(screen.getByText('Drag & drop your CV or browse')).toBeInTheDocument();
    expect(screen.getByText('PDF or DOCX · up to 5 MB · text-based documents')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse file' })).toBeInTheDocument();
  });

  it('renders replace text when a file already exists', () => {
    render(<ResumeDropzone onFileSelect={vi.fn()} hasExistingFile={true} fileName="sample.pdf" />);
    expect(screen.getByText('Replace CV')).toBeInTheDocument();
  });

  it('renders progress bar and upload status during uploading', () => {
    render(<ResumeDropzone onFileSelect={vi.fn()} uploading={true} />);
    expect(screen.getByText(/Uploading document and extracting text/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Browse file' })).not.toBeInTheDocument();
  });

  it('calls onFileSelect when a file is selected', async () => {
    const handleSelect = vi.fn();
    render(<ResumeDropzone onFileSelect={handleSelect} />);
    const file = new File(['dummy content'], 'resume.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Upload CV');

    fireEvent.change(input, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(handleSelect).toHaveBeenCalledWith(file);
    });
  });
});
