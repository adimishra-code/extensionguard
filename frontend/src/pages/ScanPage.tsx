import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Shield, AlertCircle, CheckCircle, X } from 'lucide-react';
import { scansApi } from '../lib/api';
import { cn } from '../lib/utils';
import type { ScanType } from '@extension-guard/shared';

const scanTypes: { value: ScanType; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'quick', label: 'Quick Scan', description: 'Manifest + static analysis (~30s)', icon: Shield },
  { value: 'deep', label: 'Deep Scan', description: 'Full static + data flow + network analysis (~2-5min)', icon: FileText },
  { value: 'sandbox', label: 'Sandbox Scan', description: 'Runtime behavior analysis in isolated browser (~5-10min)', icon: AlertCircle },
  { value: 'full', label: 'Full Analysis', description: 'All of the above combined (~10-15min)', icon: CheckCircle },
];

export function ScanPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [scanType, setScanType] = useState<ScanType>('quick');
  const [dragActive, setDragActive] = useState(false);

  const { mutate: createScan, isPending, error } = useMutation({
    mutationFn: ({ file, scanType }: { file: File; scanType: ScanType }) => 
      scansApi.create(file, scanType).then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      window.location.href = `/scans/${data.scan_id}`;
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      createScan({ file, scanType });
    }
  };

  const removeFile = () => setFile(null);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Security Scan</h1>
        <p className="text-gray-500 mt-1">Upload a Chrome extension (.zip or .crx) to analyze for security and privacy risks</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6">
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
              dragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="extension-file"
              accept=".zip,.crx"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isPending}
            />
            <label htmlFor="extension-file" className="cursor-pointer">
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900">Drop extension file here or click to browse</p>
              <p className="text-sm text-gray-500 mt-1">Supports .zip and .crx files (max 50MB)</p>
            </label>
            
            {file && (
              <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary-600" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="text-gray-400 hover:text-gray-600 p-1"
                    aria-label="Remove file"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Scan Type</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {scanTypes.map(type => {
              const Icon = type.icon;
              const isSelected = scanType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setScanType(type.value)}
                  className={cn(
                    'relative p-4 rounded-xl border-2 text-left transition-all',
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300'
                  )}
                  disabled={isPending}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('p-2 rounded-lg', isSelected ? 'bg-primary-100' : 'bg-gray-100')}>
                      <Icon className={cn('h-5 w-5', isSelected ? 'text-primary-600' : 'text-gray-600')} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{type.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{type.description}</p>
                    </div>
                    {isSelected && (
                      <CheckCircle className="h-5 w-5 text-primary-600 mt-0.5" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="card p-4 border-danger-200 bg-danger-50">
            <div className="flex items-center gap-3 text-danger-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p>{error instanceof Error ? error.message : 'Failed to create scan'}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!file || isPending}
            className="btn-primary px-8"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Starting scan...
              </span>
            ) : (
              'Start Analysis'
            )}
          </button>
        </div>
      </form>

      <div className="card p-6 bg-gray-50">
        <h3 className="font-semibold text-gray-900 mb-3">What gets analyzed</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> Manifest permissions & host permissions</li>
          <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> JavaScript/TypeScript AST analysis for dangerous APIs</li>
          <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> Obfuscation detection (eval, base64, string arrays)</li>
          <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> Hardcoded URLs & suspicious domain extraction</li>
          <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> Data flow heuristics (source → sink tracking)</li>
          {scanType !== 'quick' && (
            <>
              <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> Content script injection analysis</li>
              <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> Cross-origin request patterns</li>
            </>
          )}
          {['sandbox', 'full'].includes(scanType) && (
            <li className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary-600" /> Runtime behavior in isolated Chromium sandbox</li>
          )}
        </ul>
      </div>
    </div>
  );
}