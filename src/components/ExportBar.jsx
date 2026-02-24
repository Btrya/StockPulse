import html2canvas from 'html2canvas';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportBar({ data, tableRef, filename }) {
  const disabled = !data || data.length === 0;

  const exportImage = async () => {
    if (!tableRef?.current) return;
    const canvas = await html2canvas(tableRef.current, { backgroundColor: '#0f172a' });
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `${filename}.png`);
    });
  };

  const exportTxt = () => {
    const codes = data.map(d => d.ts_code).filter(Boolean).join('\n');
    const blob = new Blob([codes], { type: 'text/plain' });
    downloadBlob(blob, `${filename}.txt`);
  };

  if (disabled) return null;

  return (
    <span className="relative inline-flex items-center ml-2 group">
      <span className="text-slate-500 cursor-default select-none">导出</span>
      <span className="absolute left-0 top-full mt-1 hidden group-hover:inline-flex gap-1 z-10 bg-slate-800 border border-slate-600 rounded px-1.5 py-1 shadow-lg whitespace-nowrap">
        <button
          onClick={exportImage}
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
  );
}
