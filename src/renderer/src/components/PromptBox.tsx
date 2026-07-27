// src/renderer/src/components/PromptBox.tsx
import React, { useState } from 'react';

interface PromptBoxProps {
  onSubmit: (prompt: string) => void;
  isGenerating: boolean;
}

export default function PromptBox({ onSubmit, isGenerating }: PromptBoxProps) {
  const [prompt, setPrompt] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim() && !isGenerating) {
      onSubmit(prompt.trim());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="prompt-box">
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe a wallpaper, e.g. 'slow drifting nebula'"
        disabled={isGenerating}
      />
      <button type="submit" disabled={isGenerating || !prompt.trim()}>
        {isGenerating ? 'Generating…' : 'Generate'}
      </button>
    </form>
  );
}
