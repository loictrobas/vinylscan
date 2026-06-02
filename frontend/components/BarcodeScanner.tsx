"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const detectedRef = useRef(false);

  useEffect(() => {
    let codeReader: import("@zxing/browser").BrowserMultiFormatReader | null = null;
    let stopped = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped) return;
        codeReader = new BrowserMultiFormatReader();
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCamera = devices.find((d) =>
          /back|rear|environment/i.test(d.label)
        ) ?? devices[devices.length - 1];

        if (!backCamera) {
          setError("No camera found");
          setStarting(false);
          return;
        }

        setStarting(false);
        await codeReader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current!,
          (result, err) => {
            if (result && !detectedRef.current) {
              detectedRef.current = true;
              onDetected(result.getText());
            }
          }
        );
      } catch (e: unknown) {
        if (!stopped) {
          setError(e instanceof Error ? e.message : "Camera error");
          setStarting(false);
        }
      }
    }

    start();

    return () => {
      stopped = true;
      try { (codeReader as { reset?: () => void })?.reset?.(); } catch {}
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4">
        <p className="text-white font-medium">Scan barcode</p>
        <button onClick={onClose} className="text-white p-1">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {starting && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={32} className="text-white animate-spin" />
          </div>
        )}
        {error ? (
          <p className="text-white text-center px-8">{error}</p>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {/* targeting reticle */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-32 border-2 border-white rounded-lg opacity-80" />
            </div>
            <p className="absolute bottom-8 text-white text-sm text-center px-4 opacity-70">
              Point at barcode on record sleeve
            </p>
          </>
        )}
      </div>
    </div>
  );
}
