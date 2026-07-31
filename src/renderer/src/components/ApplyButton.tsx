// src/renderer/src/components/ApplyButton.tsx
import { useState } from 'react';
import type { GenerationResult } from '../../../core/generation/types';

interface ApplyButtonProps {
  result: GenerationResult | null;
}

export default function ApplyButton({ result }: ApplyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!result) return;
    setStatus('applying');
    setError(null);
    try {
      await window.cwe.applyWallpaper(result);
      setStatus('applied');
    } catch (e) {
      // "Lively is not installed", "LOCALAPPDATA unset" and "package write failed"
      // are otherwise indistinguishable to the user.
      setError(e instanceof Error ? e.message : String(e));
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
    <>
      <button onClick={handleClick} disabled={!result || status === 'applying'}>
        {label}
      </button>
      {status === 'error' && error && (
        <p className="apply-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
