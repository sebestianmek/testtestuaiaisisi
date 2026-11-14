import { useState } from 'react';

interface SebAiMarkProps {
  size?: number;
}

export function SebAiMark({ size = 32 }: SebAiMarkProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div
        style={{ width: size, height: size, borderRadius: Math.round(size / 4) }}
        className="flex items-center justify-center bg-indigo-600 text-white font-display font-bold text-sm shrink-0 border border-indigo-400/30"
        aria-hidden="true"
      >
        S
      </div>
    );
  }

  return (
    <img
      src="https://sebaioffical.lovable.app/api/logo"
      alt="Seb AI"
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      style={{ width: size, height: size, borderRadius: Math.round(size / 4) }}
      className="object-cover shrink-0 bg-slate-900"
    />
  );
}
