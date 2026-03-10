import { useState, useRef } from 'react';
import { Modal } from 'antd';
import html2canvas from 'html2canvas';
import { trackEvent } from '../lib/track';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportBar({ data, filename }) {
  const [open, setOpen] = useState(false);
  const previewRef = useRef(null);

  if (!data || data.length === 0) return null;

  const exportTxt = () => {
    trackEvent('export');
    const codes = data.map(d => d.ts_code).filter(Boolean).join('\n');
    const blob = new Blob([codes], { type: 'text/plain' });
    downloadBlob(blob, `${filename}.txt`);
  };

  const downloadPng = async () => {
    trackEvent('export');
    if (!previewRef.current) return;
    const canvas = await html2canvas(previewRef.current, {
      backgroundColor: '#0f172a',
      scale: 2,
    });
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `${filename}.png`);
    });
  };

  return (
    <>
      <span className="relative inline-flex items-center ml-2 group">
        <span className="text-slate-500 cursor-default select-none">导出</span>
        <span className="absolute left-0 top-full hidden group-hover:inline-flex gap-1 z-50 bg-slate-800 border border-slate-600 rounded px-1.5 py-1 shadow-lg whitespace-nowrap">
          <button
            onClick={() => setOpen(true)}
            className="px-2 py-0.5 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300"
          >
            图片
          </button>
          <button
            onClick={exportTxt}
            className="px-2 py-0.5 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300"
          >
            TXT
          </button>
        </span>
      </span>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={
          <button
            onClick={downloadPng}
            className="px-3 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300"
          >
            下载图片
          </button>
        }
        width={480}
        title={null}
        closable
      >
        <div
          ref={previewRef}
          className="p-4 bg-slate-900 rounded-lg text-slate-200"
        >
          <div className="text-xs text-slate-400 mb-3">
            {filename} &middot; 共 {data.length} 只
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm font-mono">
            {data.map(d => (
              <div key={d.ts_code || d.code} className="flex gap-2">
                <span className="text-slate-400">{d.code}</span>
                <span className="text-slate-200 truncate">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
