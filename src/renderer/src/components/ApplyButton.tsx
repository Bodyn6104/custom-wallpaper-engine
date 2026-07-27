// src/renderer/src/components/ApplyButton.tsx
import { useState } from 'react';
import type { GenerationResult } from '../../../core/generation/types';

interface ApplyButtonProps {
  result: GenerationResult | null;
}

export default function ApplyButton({ result }: ApplyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');

  async function handleClick() {
    if (!result) return;
    setStatus('applying');
    try {
      await window.cwe.applyWallpaper(result);
      setStatus('applied');
    } catch {
      setStatus('error');
    }
  }

  const label =
    status === 'applying'
      ? 'Applying…'
      : status === 'applied'
        ? 'Applied ✓'
        : status === 'error'
          ? 'Failed — retry'
          : 'Apply to Desktop';

  return (
    <button onClick={handleClick} disabled={!result || status === 'applying'}>
      {label}
    </button>
  );
}
