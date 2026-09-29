import { LOGICAL_DATE_SQL } from '@/domain/days';

// Raw statements kept free of Expo imports so Jest can run them against
// node:sqlite with the real migrations (see __tests__/sql.test.ts).

/** Re-derives local_date for every task that follows the global cutoff. */
export const REGROUP_DEFAULT_CUTOFF_TASKS_SQL = `UPDATE entries SET local_date = ${LOGICAL_DATE_SQL}
WHERE task_id IN (SELECT id FROM tasks WHERE day_start_min IS NULL)`;

/** Re-derives local_date for one task. */
export const REGROUP_TASK_SQL = `UPDATE entries SET local_date = ${LOGICAL_DATE_SQL}
WHERE task_id = :task_id`;
