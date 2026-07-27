// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PreviewPane from '../../src/renderer/src/components/PreviewPane';
import { buildFragmentSource, paramUniformValue } from '../../src/renderer/src/components/PreviewPane';

describe('PreviewPane', () => {
  it('shows an empty state when there is no result', () => {
    render(<PreviewPane result={null} />);
    expect(screen.getByText(/describe a wallpaper/i)).toBeInTheDocument();
  });

  it('renders a canvas when a result is provided', () => {
    const { container } = render(
      <PreviewPane
        result={{
          shaderCode: 'void main(){gl_FragColor=vec4(1.0,0.0,0.0,1.0);}',
          params: [],
          suggestedTitle: 'Test',
          isAnimated: true,
        }}
      />
    );
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});

// The preview must compile the same source the Lively package does (livelyPackage.ts
// buildIndexHtml), or the desktop wallpaper won't match what the user previewed.
describe('buildFragmentSource', () => {
  it('prepends a uniform declaration per param, matching the Lively package preamble', () => {
    const source = buildFragmentSource({
      shaderCode: 'void main(){}',
      params: [
        { name: 'speed', type: 'float', default: 0.5, label: 'Speed' },
        { name: 'tint', type: 'color', default: '#ff0000', label: 'Tint' },
        { name: 'glow', type: 'bool', default: true, label: 'Glow' },
      ],
      suggestedTitle: 'T',
      isAnimated: true,
    });
    expect(source).toContain('uniform float u_speed;');
    expect(source).toContain('uniform vec3 u_tint;');
    expect(source).toContain('uniform bool u_glow;');
    expect(source.indexOf('uniform float u_speed;')).toBeLessThan(source.indexOf('void main(){}'));
  });
});

describe('paramUniformValue', () => {
  it('converts a "#RRGGBB" color default to normalized rgb', () => {
    expect(paramUniformValue({ name: 'tint', type: 'color', default: '#ff8000', label: 'T' })).toEqual([
      1, 128 / 255, 0,
    ]);
  });

  it('passes float defaults through and coerces bool defaults to 0/1', () => {
    expect(paramUniformValue({ name: 'speed', type: 'float', default: 0.25, label: 'S' })).toBe(0.25);
    expect(paramUniformValue({ name: 'glow', type: 'bool', default: true, label: 'G' })).toBe(1);
    expect(paramUniformValue({ name: 'glow', type: 'bool', default: false, label: 'G' })).toBe(0);
  });
});
