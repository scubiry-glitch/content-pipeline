import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// 设置 PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFPreviewProps {
  pdfUrl: string;
}

export function PDFPreview({ pdfUrl }: PDFPreviewProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(err: Error) {
    setLoading(false);
    setError('PDF 加载失败: ' + err.message);
  }

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3.0));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= numPages) {
      setPageNumber(value);
    }
  };

  return (
    <div className="pdf-preview-container" ref={containerRef}>
      {/* 工具栏 */}
      <div className="pdf-toolbar">
        <div className="pdf-nav">
          <button
            className="pdf-btn"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
          >
            ◀ 上一页
          </button>
          <span className="pdf-page-info">
            <input
              type="number"
              min={1}
              max={numPages}
              value={pageNumber}
              onChange={handlePageInput}
              className="pdf-page-input"
            />
            <span> / {numPages}</span>
          </span>
          <button
            className="pdf-btn"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
          >
            下一页 ▶
          </button>
        </div>
        <div className="pdf-zoom">
          <button className="pdf-btn" onClick={zoomOut}>
            🔍-
          </button>
          <span className="pdf-scale">{Math.round(scale * 100)}%</span>
          <button className="pdf-btn" onClick={zoomIn}>
            🔍+
          </button>
        </div>
      </div>

      {/* PDF 内容 */}
      <div className="pdf-content">
        {loading && (
          <div className="pdf-loading">
            <div className="loading-spinner"></div>
            <p>正在加载 PDF...</p>
          </div>
        )}

        {error && (
          <div className="pdf-error">
            <p>❌ {error}</p>
            <button
              className="pdf-btn"
              onClick={() => window.open(pdfUrl, '_blank')}
            >
              在新窗口打开
            </button>
          </div>
        )}

        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
          error={null}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            loading={
              <div className="pdf-page-loading">
                <div className="loading-spinner"></div>
              </div>
            }
          />
        </Document>
      </div>
    </div>
  );
}
