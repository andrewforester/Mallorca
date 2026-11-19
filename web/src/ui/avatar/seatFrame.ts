import { restingFaceOf } from '../../game/index.ts';
import type { FaceFrame, PersonalityKey, Session } from '../../game/index.ts';

export const seatFrame = (session: Session, character: PersonalityKey | undefined): FaceFrame =>
  session.getState().faceNow() ?? restingFaceOf(character ?? 'mallorca');
