import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';

interface ProductThumbProps {
  src?: string;
  name: string;
  variant?: 'card' | 'row';
}

export function ProductThumb({ src, name, variant = 'row' }: ProductThumbProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (variant === 'card') {
    if (!src || imgError) {
      return (
        <div className="w-full h-24 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-slate-400 gap-1">
          <Package className="w-6 h-6 stroke-[1.5]" />
          <span className="text-[11px] text-slate-400">ບໍ່ມີຮູບສິນຄ້າ</span>
        </div>
      );
    }

    return (
      <div className="w-full h-24 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (!src || imgError) {
    return (
      <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
        <Package className="w-4 h-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-50"
    />
  );
}
