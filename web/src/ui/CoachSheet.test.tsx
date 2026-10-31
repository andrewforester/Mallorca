import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachSheet } from './CoachSheet.tsx';
import { readyCoach } from './coachFixtures.ts';

afterEach(cleanup);

describe('CoachSheet', () => {
  it('shows the coach and closes by the button, the scrim and Escape', () => {
    const onClose = vi.fn();
    render(<CoachSheet state={readyCoach()} onClose={onClose} />);
    expect(screen.getByTestId('coach-hint')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('coach-close'));
    fireEvent.click(screen.getByTestId('coach-close'));
    fireEvent.click(screen.getByTestId('coach-scrim'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
