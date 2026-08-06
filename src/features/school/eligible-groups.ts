import { useMemo } from "react";
import { useGroups, useMyRegistrations } from "@/features/school/queries";
import { useStudentStream } from "@/features/school/streams";
import { groupMatchesStream } from "@/features/school/streams";
import type { GroupRow, RegistrationStatus } from "@/features/school/types";

/**
 * Why a group cannot be joined right now, or `null` when it can.
 *
 * `takenSubject` -- the student already holds an active enrolment for this
 * subject and level in a DIFFERENT group. The database enforces one active
 * enrolment per (subject, level); surfacing it here means the student is told
 * before they apply rather than by a rejected write.
 */
export type GroupBlockReason = RegistrationStatus | "full" | "takenSubject";

export interface EligibleGroup {
  group: GroupRow;
  /** Existing decision on this group, if the student already applied. */
  registrationStatus: RegistrationStatus | null;
  seatsLeft: number;
  isFull: boolean;
  /** `null` means the Register button should be shown. */
  blockedBy: GroupBlockReason | null;
}

/**
 * The groups a student may actually see and join.
 *
 * Row-level security already restricts `groups` to the student's own level and
 * stream (Task 2C migration), so this is defence in depth rather than the only
 * gate: if the policy were ever loosened, the client would still not offer an
 * ineligible group. The stream rule itself is not re-expressed here -- it comes
 * from `groupMatchesStream`, shared with the rest of the app.
 */
export function useEligibleGroups(studentId: string | undefined) {
  const groupsQuery = useGroups();
  const registrationsQuery = useMyRegistrations(studentId);
  const identityQuery = useStudentStream(studentId);

  const items = useMemo<EligibleGroup[]>(() => {
    const identity = identityQuery.data;
    if (!identity?.levelId) return [];

    const decisions = new Map<string, RegistrationStatus>();
    // Which (subject, level) pairs the student already occupies, and in which
    // group. Mirrors the database rule: one active enrolment per subject+level.
    const takenSubjects = new Map<string, string>();

    const allGroups = groupsQuery.data ?? [];
    for (const r of registrationsQuery.data ?? []) {
      decisions.set(r.group_id, r.status as RegistrationStatus);
      if (r.status !== "pending" && r.status !== "approved") continue;
      const g = allGroups.find((x) => x.id === r.group_id);
      if (g?.subjectId && g.levelId) {
        takenSubjects.set(`${g.subjectId}|${g.levelId}`, r.group_id);
      }
    }

    return (groupsQuery.data ?? [])
      .filter(
        (g) =>
          g.status === "active" &&
          g.levelId === identity.levelId &&
          groupMatchesStream(g.streamId, identity.streamId),
      )
      .map((group) => {
        const seatsLeft = Math.max(0, group.maxStudents - group.enrolled);
        const isFull = group.maxStudents > 0 && seatsLeft === 0;
        const registrationStatus = decisions.get(group.id) ?? null;

        // Already holds this subject+level in another group?
        const holder =
          group.subjectId && group.levelId
            ? takenSubjects.get(`${group.subjectId}|${group.levelId}`)
            : undefined;
        const takenElsewhere = !!holder && holder !== group.id;

        // Precedence: a decision on THIS group is the most specific fact, then
        // the subject already being taken, then capacity. A student enrolled
        // here should read "Enrolled", never "Full".
        const blockedBy: GroupBlockReason | null =
          registrationStatus ?? (takenElsewhere ? "takenSubject" : isFull ? "full" : null);

        return { group, registrationStatus, seatsLeft, isFull, blockedBy };
      })
      .sort((a, b) => a.group.name.localeCompare(b.group.name));
  }, [groupsQuery.data, registrationsQuery.data, identityQuery.data]);

  return {
    items,
    /** The student's own academic identity, for the read-only context banner. */
    identity: identityQuery.data ?? null,
    isLoading: groupsQuery.isLoading || registrationsQuery.isLoading || identityQuery.isLoading,
    isFetching: groupsQuery.isFetching || registrationsQuery.isFetching || identityQuery.isFetching,
    error: groupsQuery.error ?? registrationsQuery.error ?? identityQuery.error,
    refetch: () => {
      void groupsQuery.refetch();
      void registrationsQuery.refetch();
      void identityQuery.refetch();
    },
  };
}
