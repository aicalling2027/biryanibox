import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Download, Copy, Printer, X, QrCode as QrIcon, Check, Loader, ExternalLink } from 'lucide-react';

// Where a scanned table QR should land.
// Set VITE_PUBLIC_URL in a deployed environment so QRs generated from a local
// dashboard still point at the live storefront.
const storefrontOrigin = () => {
  const configured = import.meta.env?.VITE_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return window.location.origin;
};

export const tableMenuUrl = (table) => {
  const ref = table?.table_number ?? table?.label ?? '';
  return `${storefrontOrigin()}/?table=${encodeURIComponent(ref)}`;
};

export const tableDisplayName = (table) => {
  if (!table) return 'Table';
  const lbl = table.label || String(table.table_number || '');
  const n = parseInt(lbl, 10);
  return (!isNaN(n) && String(n) === lbl.trim()) ? `Table ${n}` : lbl;
};

// Small live QR preview shown on each table card in the dashboard.
// Clicking it opens the full modal (download PNG / print / copy link).
export const TableQRThumb = ({ table, onOpen }) => {
  const [src, setSrc] = useState('');
  const url = table ? tableMenuUrl(table) : '';

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 192, margin: 1, color: { dark: '#111111', light: '#ffffff' } })
      .then(d => { if (!cancelled) setSrc(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  return (
    <button type="button" onClick={onOpen} title={`${tableDisplayName(table)} QR — view / download`}
      className="w-9 h-9 rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-white/20 hover:ring-2 hover:ring-primary transition-all shrink-0 group/qr relative">
      {src
        ? <img src={src} alt={`${tableDisplayName(table)} QR code`} className="w-full h-full object-contain" />
        : <QrIcon size={14} className="text-neutral-400" />}
      <span className="absolute inset-0 bg-black/50 opacity-0 group-hover/qr:opacity-100 flex items-center justify-center transition-opacity">
        <Download size={12} className="text-white" />
      </span>
    </button>
  );
};

const TableQRModal = ({ table, onClose }) => {
  const [dataUrl, setDataUrl] = useState('');
  const [error,  setError]  = useState('');
  const [copied, setCopied] = useState(false);

  const url  = table ? tableMenuUrl(table) : '';
  const name = tableDisplayName(table);

  useEffect(() => {
    if (!table) return;
    let cancelled = false;
    setDataUrl(''); setError(''); setCopied(false);

    QRCode.toDataURL(url, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then(d => { if (!cancelled) setDataUrl(d); })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not generate the QR code.'); });

    return () => { cancelled = true; };
  }, [table, url]);

  if (!table) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select the link below and copy it manually.');
    }
  };

  const handlePrint = () => {
    if (!dataUrl) return;
    const win = window.open('', '_blank', 'width=460,height=640');
    if (!win) return;
    const doc = win.document;
    doc.title = `${name} — QR`;

    const wrap = doc.createElement('div');
    wrap.style.cssText = 'font-family:system-ui,sans-serif;text-align:center;padding:32px';

    const title = doc.createElement('h1');
    title.textContent = name;
    title.style.cssText = 'font-size:26px;margin:0 0 4px';

    const sub = doc.createElement('p');
    sub.textContent = 'Scan to view the menu & order';
    sub.style.cssText = 'color:#666;margin:0 0 24px;font-size:13px;letter-spacing:.08em;text-transform:uppercase';

    const img = doc.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'width:320px;height:320px;image-rendering:pixelated';

    const link = doc.createElement('p');
    link.textContent = url;
    link.style.cssText = 'font-size:11px;color:#888;margin-top:20px;word-break:break-all';

    wrap.append(title, sub, img, link);
    doc.body.appendChild(wrap);
    win.focus();
    win.print();
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#1a1a1a] rounded-3xl border border-white/10 w-full max-w-sm shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto"
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <h3 className="text-lg font-black text-white flex items-center gap-2">
            <QrIcon size={18} className="text-primary" /> Table QR
          </h3>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="text-center">
            <p className="text-xl font-black text-white">{name}</p>
            <p className="text-[10px] text-text-muted uppercase tracking-widest mt-1">
              {table.capacity ? `${table.capacity} seats` : 'Table'}
              {table.type && table.type !== 'regular' ? ` · ${table.type}` : ''}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 flex items-center justify-center min-h-[220px]">
            {error ? (
              <p className="text-red-600 text-xs font-bold text-center px-4">{error}</p>
            ) : dataUrl ? (
              <img src={dataUrl} alt={`${name} QR code`} className="w-full max-w-[200px] h-auto" />
            ) : (
              <Loader size={26} className="animate-spin text-neutral-400" />
            )}
          </div>

          <div className="text-center">
            <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1">Scan opens</p>
            <p className="text-[11px] text-white/60 break-all font-mono">{url}</p>
            <p className="text-[10px] text-text-muted mt-1">Customers land on the menu with this table pre-selected.</p>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
              <ExternalLink size={11} /> Preview menu
            </a>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleDownload} disabled={!dataUrl}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
              <Download size={13} /> PNG
            </button>
            <button onClick={handlePrint} disabled={!dataUrl}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
              <Printer size={13} /> Print
            </button>
          </div>

          <button onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 text-[11px] font-black uppercase tracking-widest transition-all">
            {copied ? <><Check size={13} className="text-green-400" /> Link Copied</> : <><Copy size={13} /> Copy Link</>}
          </button>

          <button onClick={onClose}
            className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white rounded-2xl text-sm font-black uppercase tracking-wider transition-all shadow-lg shadow-primary/20">
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TableQRModal;
