// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ApplyButton from '../../src/renderer/src/components/ApplyButton';

const fixture = { shaderCode: 'void main(){}', params: [], suggestedTitle: 'T', isAnimated: true };

beforeEach(() => {
  (window as any).cwe = { applyWallpaper: vi.fn().mockResolvedValue({ appliedPath: 'C:\\tmp\\x' }) };
});

describe('ApplyButton', () => {
  it('is disabled when there is no result', () => {
    render(<ApplyButton result={null} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls applyWallpaper and shows Applied on success', async () => {
    render(<ApplyButton result={fixture} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/applied/i)).toBeInTheDocument());
    expect((window as any).cwe.applyWallpaper).toHaveBeenCalledWith(fixture);
  });

  it('surfaces a retry affordance when applying fails', async () => {
    (window as any).cwe.applyWallpaper = vi.fn().mockRejectedValue(new Error('Lively not found'));
    render(<ApplyButton result={fixture} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/retry/i)).toBeInTheDocument());
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
