import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Image as ImageIcon, Printer, X } from 'lucide-react';
import { PlanSheet } from './PlanSheet';
import { Button } from './ui';
import { useToast } from '../context/ToastContext';
import { downloadDataUrl, makeFilename } from '../lib/download';
import { todayStamp } from '../../shared/format';
import type { PlanResult } from '../../shared/types';

interface ExportDialogProps {
  open: boolean;
  name: string;
  result: PlanResult | null;
  planId?: number;
  createdAt?: string;
  onClose: () => void;
}

export function ExportDialog({ open, name, result, planId, createdAt, onClose }: ExportDialogProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('export-open');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('export-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !result) return null;

  const print = () => {
    window.print();
  };

  const exportPng = async () => {
    if (!sheetRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(sheetRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      downloadDataUrl(makeFilename(`${name}-加工单-${todayStamp()}`, 'png'), dataUrl);
      toast('加工单 PNG 已生成');
    } catch (cause) {
      console.error(cause);
      toast('PNG 生成失败，请改用打印 / 另存为 PDF', 'error');
    } finally {
      setExporting(false);
    }
  };

  return createPortal(
    <div className="export-overlay print-portal">
      <div className="export-toolbar no-print">
        <div className="export-toolbar-info">
          <strong>加工单预览</strong>
          <span>打印时选择“另存为 PDF”，即可得到可直接下发的 PDF 文件。</span>
        </div>
        <div className="export-toolbar-actions">
          <Button variant="secondary" onClick={onClose}>
            <X size={16} />
            关闭
          </Button>
          <Button variant="secondary" onClick={exportPng} loading={exporting}>
            <ImageIcon size={16} />
            下载 PNG
          </Button>
          <Button variant="primary" onClick={print}>
            <Printer size={16} />
            打印 / 另存为 PDF
          </Button>
        </div>
      </div>
      <div className="export-tip no-print">
        <Download size={14} /> PNG 适合发到车间群；PDF 建议用 A4 纵向、边距默认打印。
      </div>
      <div className="export-stage">
        <PlanSheet
          ref={sheetRef}
          name={name}
          result={result}
          planId={planId}
          createdAt={createdAt}
        />
      </div>
    </div>,
    document.body,
  );
}
