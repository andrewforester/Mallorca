import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachSheet } from './CoachSheet.tsx';
import { readyCoach } from './coachFixtures.ts';

afterEach(cleanup);

describe('CoachSheet', () => {
  it('is a named section with no scrim and closes by Hide and Escape', () => {
    const onClose = vi.fn();
    render(<CoachSheet state={readyCoach()} onClose={onClose} />);
    const sheet = document.getElementById('coach-sheet');
    expect(sheet?.tagName).toBe('SECTION');
    expect(sheet?.getAttribute('aria-label')).toBe('Coach');
    expect(screen.queryByTestId('coach-scrim')).toBeNull();
    expect(screen.getByTestId('coach-hint')).not.toBeNull();
    const hide = screen.getByTestId('coach-close');
    expect(document.activeElement).toBe(hide);
    expect(hide.textContent).toBe('Hide');
    fireEvent.click(hide);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
