// src/renderer/src/App.tsx
import { useState } from 'react';
import PromptBox from './components/PromptBox';
import PreviewPane from './components/PreviewPane';
import ApplyButton from './components/ApplyButton';
import type { GenerationResult } from '../../core/generation/types';

export default function App() {
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(prompt: string) {
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await window.cwe.generateScene(prompt);
      setResult(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="app">
      <PromptBox onSubmit={handleSubmit} isGenerating={isGenerating} />
      {error && <div className="error">{error}</div>}
      <PreviewPane result={result} />
      <ApplyButton result={result} />
    </div>
  );
}
