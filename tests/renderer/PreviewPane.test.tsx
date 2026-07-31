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

// This previously asserted that a param-uniform preamble was PREPENDED here, which
// is the defect the final whole-branch review caught: the preamble landed above the
// shader's own `precision mediump float;` (a hard GLSL ES 1.00 error) and redeclared
// uniforms the model had already declared, while generateScene validated the raw
// shader and saw none of it. The model now declares its own u_<param> uniforms, so
// the source that is validated, previewed, and written to the package is one string.
describe('buildFragmentSource', () => {
  it('returns the generated shader unchanged, so the validated source is the rendered source', () => {
    const shaderCode = `precision mediump float;
uniform float u_speed;
uniform vec3 u_tint;
uniform bool u_glow;
void main(){ gl_FragColor = vec4(u_tint * u_speed, u_glow ? 1.0 : 0.5); }`;
    const source = buildFragmentSource({
      shaderCode,
      params: [
        { name: 'speed', type: 'float', default: 0.5, label: 'Speed' },
        { name: 'tint', type: 'color', default: '#ff0000', label: 'Tint' },
        { name: 'glow', type: 'bool', default: true, label: 'Glow' },
      ],
      suggestedTitle: 'T',
      isAnimated: true,
    });
    expect(source).toBe(shaderCode);
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
