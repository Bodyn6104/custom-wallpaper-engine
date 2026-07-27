// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptBox from '../../src/renderer/src/components/PromptBox';

describe('PromptBox', () => {
  it('calls onSubmit with the trimmed prompt text', () => {
    const onSubmit = vi.fn();
    render(<PromptBox onSubmit={onSubmit} isGenerating={false} />);
    fireEvent.change(screen.getByPlaceholderText(/describe a wallpaper/i), {
      target: { value: '  a nebula  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    expect(onSubmit).toHaveBeenCalledWith('a nebula');
  });

  it('disables the button while generating', () => {
    render(<PromptBox onSubmit={vi.fn()} isGenerating={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
