'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface UpiQrProps {
  value: string;
  size?: number;
  dark?: string;
  light?: string;
}

export function UpiQr({ value, size = 168, dark = '#0f172a', light = '#ffffff' }: UpiQrProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 2, color: { dark, light } })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc(null);
      });
    return () => {
      active = false;
    };
  }, [value, size, dark, light]);

  if (!src) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-slate-950/5 text-xs text-slate-400"
        style={{ width: size, height: size }}
      >
        Loading QR…
      </div>
    );
  }
  return <img src={src} width={size} height={size} alt="Payment QR" className="rounded-md" />;
}