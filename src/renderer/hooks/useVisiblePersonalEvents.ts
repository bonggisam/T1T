import { useMemo } from 'react';
import type { PersonalEvent } from '@shared/types';
import { usePersonalEventStore } from '../store/personalEventStore';
import { usePersonalHidden } from '../store/privacyStore';

const NONE: PersonalEvent[] = [];

/** 화면에 그려도 되는 개인 일정. 수업 중이거나 단축키로 가렸으면 비어 있다. 화면은 이 값만 쓴다. */
export function useVisiblePersonalEvents(): PersonalEvent[] {
  const hidden = usePersonalHidden();
  const personalEvents = usePersonalEventStore((s) => s.personalEvents);
  const externalEvents = usePersonalEventStore((s) => s.externalEvents);
  const allPersonalEvents = usePersonalEventStore((s) => s.allPersonalEvents);
  return useMemo(
    () => (hidden ? NONE : allPersonalEvents()),
    [hidden, personalEvents, externalEvents, allPersonalEvents],
  );
}
