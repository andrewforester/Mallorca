import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Scene } from './Scene.tsx';

afterEach(cleanup);

describe('Scene', () => {
  it('is a quiet dark room with no photo', () => {
    const { container, getByTestId } = render(
      <Scene>
        <p>x</p>
      </Scene>,
    );
    expect(container.querySelector('picture')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(getByTestId('scene').getAttribute('style')).toBeNull();
  });

  it('dims the scene behind the start screen', () => {
    const { getByTestId } = render(
      <Scene dimmed>
        <p>x</p>
      </Scene>,
    );
    expect(getByTestId('scene').classList.contains('scene-dimmed')).toBe(true);
  });

  it('marks the simple table', () => {
    const { getByTestId } = render(
      <Scene simple>
        <p>x</p>
      </Scene>,
    );
    expect(getByTestId('scene').classList.contains('scene-simple')).toBe(true);
  });

  it('keeps its children inside the scene content', () => {
    const { getByTestId } = render(
      <Scene>
        <p data-testid="child">x</p>
      </Scene>,
    );
    expect(
      getByTestId('scene').querySelector('.scene-content [data-testid="child"]'),
    ).not.toBeNull();
  });
});
