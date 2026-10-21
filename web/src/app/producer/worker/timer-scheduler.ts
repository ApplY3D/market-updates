import { Scheduler } from './ports';

export const timerScheduler: Scheduler = {
  now: () => performance.now(),
  schedule: (task, delayMs) => {
    const id = setTimeout(task, delayMs);
    return () => clearTimeout(id);
  },
};
