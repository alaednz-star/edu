import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AttendanceStatus,
  EntityStatus,
  GroupRow,
  Level,
  LevelStage,
  RegistrationRow,
  RegistrationStatus,
  StudentRow,
  Subject,
  TeacherRow,
} from "./types";

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const schoolKeys = {
  levels: ["levels"] as const,
  subjects: ["subjects"] as const,
  teachers: ["teachers"] as const,
  students: ["students"] as const,
  groups: ["groups"] as const,
  registrations: ["registrations"] as const,
  settings: ["center-settings"] as const,
  /**
   * Root for everything derived from the `attendance` table.
   *
   * Every attendance query is namespaced under it, so one write invalidates all
   * of them -- including consumers added later. Previously each key had its own
   * root and `useSaveAttendance` invalidated exactly one, leaving the workspace
   * pending count, the student portal and the admin dashboard stale for the
   * global `staleTime` of 60s. Reproduced across two tabs: tab 1 still showed
   * "6 pending" after tab 2 completed 3 registers.
   */
  attendanceRoot: ["attendance"] as const,
  attendance: (groupId: string, date: string) => ["attendance", "roster", groupId, date] as const,
  markedSessions: (from: string) => ["attendance", "marked-sessions", from] as const,
  todayAttendance: (date: string) => ["attendance", "today", date] as const,
  myAttendance: (studentId: string) => ["attendance", "mine", studentId] as const,
  myRegistrations: (studentId: string) => ["my-registrations", studentId] as const,
};

/* ------------------------------ LEVELS ------------------------------ */

export function useLevels() {
  return useQuery({
    queryKey: schoolKeys.levels,
    queryFn: async (): Promise<Level[]> => {
      const rows = must(
        await supabase.from("levels").select("*").order("position", { ascending: true }),
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        stage: r.stage as LevelStage,
        position: r.position,
        status: r.status as EntityStatus,
      }));
    },
  });
}

export function useSaveLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Level> & { name: string; stage: LevelStage }) => {
      const payload = {
        name: input.name,
        stage: input.stage,
        position: input.position ?? 0,
        status: input.status ?? "active",
      };
      if (input.id) must(await supabase.from("levels").update(payload).eq("id", input.id).select());
      else must(await supabase.from("levels").insert(payload).select());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: schoolKeys.levels }),
  });
}

export function useDeleteLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("levels").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: schoolKeys.levels }),
  });
}

/* ----------------------------- SUBJECTS ----------------------------- */

/**
 * Slug for a custom subject's stable key: accent-folded, lowercase, underscored.
 * Mirrors the backfill in `20260808100000_subject_locale_keys.sql` so a subject
 * added through the UI is keyed the same way one added in SQL would be.
 */
function slugifySubject(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function useSubjects() {
  return useQuery({
    queryKey: schoolKeys.subjects,
    queryFn: async (): Promise<Subject[]> => {
      const rows = must(await supabase.from("subjects").select("*").order("name"));
      return rows.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        color: r.color,
        description: r.description,
        status: r.status as EntityStatus,
      }));
    },
  });
}

export function useSaveSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Subject> & { name: string }) => {
      // `key` is the subject's locale-independent identity and is NOT NULL.
      // A subject created through the UI derives one from its name; the six
      // built-in subjects already carry curated keys that map to the i18n
      // dictionaries, so those are never regenerated here.
      const payload = {
        name: input.name,
        key: input.key ?? slugifySubject(input.name),
        color: input.color ?? "#0F766E",
        description: input.description ?? null,
        status: input.status ?? "active",
      };
      if (input.id)
        must(await supabase.from("subjects").update(payload).eq("id", input.id).select());
      else must(await supabase.from("subjects").insert(payload).select());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: schoolKeys.subjects }),
  });
}

export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: schoolKeys.subjects }),
  });
}

/* ----------------------------- TEACHERS ----------------------------- */

export function useTeachers() {
  return useQuery({
    queryKey: schoolKeys.teachers,
    queryFn: async (): Promise<TeacherRow[]> => {
      const teachers = must(
        await supabase
          .from("teachers")
          .select(
            "id, experience_years, bio, status, profiles!inner(full_name, email, phone, avatar_url), teacher_subjects(subject_id, subjects(id, key, name))",
          ),
      );
      const groups = must(await supabase.from("groups").select("teacher_id"));
      return teachers.map((t) => ({
        id: t.id,
        fullName: t.profiles?.full_name ?? "—",
        email: t.profiles?.email ?? null,
        phone: t.profiles?.phone ?? null,
        avatarUrl: t.profiles?.avatar_url ?? null,
        experienceYears: t.experience_years,
        bio: t.bio ?? null,
        status: t.status as EntityStatus,
        subjects: (t.teacher_subjects ?? [])
          .map((ts) => ts.subjects?.name)
          .filter((n): n is string => !!n),
        subjectIds: (t.teacher_subjects ?? [])
          .map((ts) => ts.subject_id)
          .filter((id): id is string => !!id),
        groupCount: groups.filter((g) => g.teacher_id === t.id).length,
      }));
    },
  });
}

export function useUpdateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      experienceYears: number;
      status: EntityStatus;
      subjectIds: string[];
      phone: string | null;
      bio: string | null;
    }) => {
      must(
        await supabase
          .from("teachers")
          .update({
            experience_years: input.experienceYears,
            status: input.status,
            bio: input.bio,
          })
          .eq("id", input.id)
          .select(),
      );
      must(
        await supabase.from("profiles").update({ phone: input.phone }).eq("id", input.id).select(),
      );
      const { error: delErr } = await supabase
        .from("teacher_subjects")
        .delete()
        .eq("teacher_id", input.id);
      if (delErr) throw new Error(delErr.message);
      if (input.subjectIds.length > 0) {
        must(
          await supabase
            .from("teacher_subjects")
            .insert(input.subjectIds.map((s) => ({ teacher_id: input.id, subject_id: s })))
            .select(),
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schoolKeys.teachers });
      void qc.invalidateQueries({ queryKey: schoolKeys.groups });
    },
  });
}

/* ----------------------------- STUDENTS ----------------------------- */

export function useStudents() {
  return useQuery({
    queryKey: schoolKeys.students,
    queryFn: async (): Promise<StudentRow[]> => {
      // `user_roles!inner` is defence in depth, not the primary guarantee.
      // ADR-002 makes a non-student row in this table unrepresentable via a
      // composite FK on (id, role); this join means that even if a future
      // migration weakened that constraint, staff could not silently reappear
      // in a student list.
      const students = must(
        await supabase
          .from("students")
          .select(
            "id, level_id, stream_id, status, registered_at, profiles!inner(full_name, email, phone, avatar_url), levels(name), user_roles!inner(role)",
          )
          .eq("user_roles.role", "student")
          .order("registered_at", { ascending: false }),
      );
      const regs = must(
        await supabase.from("registrations").select("student_id").eq("status", "approved"),
      );
      return students.map((s) => ({
        id: s.id,
        fullName: s.profiles?.full_name ?? "—",
        email: s.profiles?.email ?? null,
        phone: s.profiles?.phone ?? null,
        avatarUrl: s.profiles?.avatar_url ?? null,
        levelId: s.level_id,
        levelName: s.levels?.name ?? null,
        streamId: s.stream_id,
        status: s.status as EntityStatus,
        registeredAt: s.registered_at,
        groupCount: regs.filter((r) => r.student_id === s.id).length,
      }));
    },
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      levelId: string | null;
      streamId?: string | null | undefined;
      status: EntityStatus;
      phone: string | null;
      fullName: string;
    }) => {
      must(
        await supabase
          .from("students")
          .update({
            level_id: input.levelId,
            ...(input.streamId !== undefined ? { stream_id: input.streamId } : {}),
            status: input.status,
          })
          .eq("id", input.id)
          .select(),
      );
      must(
        await supabase
          .from("profiles")
          .update({ phone: input.phone, full_name: input.fullName })
          .eq("id", input.id)
          .select(),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schoolKeys.students });
    },
  });
}

/* ------------------------------ GROUPS ------------------------------ */

export function useGroups() {
  return useQuery({
    queryKey: schoolKeys.groups,
    queryFn: async (): Promise<GroupRow[]> => {
      const groups = must(
        await supabase
          .from("groups")
          .select(
            "id, name, max_students, price_dzd, status, subject_id, teacher_id, level_id, stream_id, start_date, end_date, subjects(key, name, color), levels(name), group_schedules(id, weekday, start_time, end_time, room)",
          )
          .order("name"),
      );
      const [profiles, regs] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        supabase.from("registrations").select("group_id, status"),
      ]);
      const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
      const approved = (regs.data ?? []).filter((r) => r.status === "approved");

      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        subjectId: g.subject_id,
        subjectKey: g.subjects?.key ?? null,
        subjectName: g.subjects?.name ?? null,
        subjectColor: g.subjects?.color ?? null,
        teacherId: g.teacher_id,
        teacherName: g.teacher_id ? (names.get(g.teacher_id) ?? null) : null,
        levelId: g.level_id,
        levelName: g.levels?.name ?? null,
        streamId: g.stream_id,
        startDate: g.start_date,
        endDate: g.end_date,
        maxStudents: g.max_students,
        priceDzd: g.price_dzd,
        status: g.status as EntityStatus,
        enrolled: approved.filter((r) => r.group_id === g.id).length,
        schedules: (g.group_schedules ?? [])
          .map((s) => ({
            id: s.id,
            weekday: s.weekday,
            startTime: s.start_time.slice(0, 5),
            endTime: s.end_time.slice(0, 5),
            room: s.room,
          }))
          .sort((a, b) => a.weekday - b.weekday),
      }));
    },
  });
}

export interface GroupInput {
  id?: string;
  name: string;
  subjectId: string | null;
  teacherId: string | null;
  levelId: string | null;
  /** NULL means the group is open to every stream of its level. */
  streamId?: string | null | undefined;
  /** ISO date. Defaults to today server-side when omitted. */
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  maxStudents: number;
  priceDzd: number;
  status: EntityStatus;
  schedules: { weekday: number; startTime: string; endTime: string; room: string | null }[];
}

export function useSaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GroupInput) => {
      const payload = {
        name: input.name,
        subject_id: input.subjectId,
        teacher_id: input.teacherId,
        level_id: input.levelId,
        // Must be sent explicitly. Omitting it leaves stream_id untouched on
        // update (and NULL on insert), which the database rejects for a level
        // that offers streams.
        stream_id: input.streamId ?? null,
        // Sent explicitly so an edit cannot silently drop the term window.
        ...(input.startDate ? { start_date: input.startDate } : {}),
        end_date: input.endDate ?? null,
        max_students: input.maxStudents,
        price_dzd: input.priceDzd,
        status: input.status,
      };
      let groupId = input.id;
      if (groupId) {
        must(await supabase.from("groups").update(payload).eq("id", groupId).select());
      } else {
        const rows = must(await supabase.from("groups").insert(payload).select("id"));
        groupId = rows[0]?.id;
      }
      if (!groupId) throw new Error("Groupe introuvable.");

      const { error: delErr } = await supabase
        .from("group_schedules")
        .delete()
        .eq("group_id", groupId);
      if (delErr) throw new Error(delErr.message);
      if (input.schedules.length > 0) {
        must(
          await supabase
            .from("group_schedules")
            .insert(
              input.schedules.map((s) => ({
                group_id: groupId as string,
                weekday: s.weekday,
                start_time: s.startTime,
                end_time: s.endTime,
                room: s.room,
              })),
            )
            .select(),
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: schoolKeys.groups }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("groups").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: schoolKeys.groups }),
  });
}

/* --------------------------- REGISTRATIONS --------------------------- */

export function useRegistrations() {
  return useQuery({
    queryKey: schoolKeys.registrations,
    queryFn: async (): Promise<RegistrationRow[]> => {
      const rows = must(
        await supabase
          .from("registrations")
          .select(
            "id, student_id, group_id, status, created_at, groups(name, subjects(key, name), levels(name))",
          )
          .order("created_at", { ascending: false }),
      );
      const profiles = must(await supabase.from("profiles").select("id, full_name"));
      const names = new Map(profiles.map((p) => [p.id, p.full_name]));
      return rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: names.get(r.student_id) ?? "—",
        groupId: r.group_id,
        groupName: r.groups?.name ?? "—",
        subjectKey: r.groups?.subjects?.key ?? null,
        subjectName: r.groups?.subjects?.name ?? null,
        levelName: r.groups?.levels?.name ?? null,
        status: r.status as RegistrationStatus,
        createdAt: r.created_at,
      }));
    },
  });
}

export function useDecideRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RegistrationStatus }) => {
      must(
        await supabase
          .from("registrations")
          .update({ status, decided_at: new Date().toISOString() })
          .eq("id", id)
          .select(),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schoolKeys.registrations });
      void qc.invalidateQueries({ queryKey: schoolKeys.groups });
    },
  });
}

export function useMyRegistrations(studentId: string | undefined) {
  return useQuery({
    queryKey: schoolKeys.myRegistrations(studentId ?? "anon"),
    enabled: !!studentId,
    queryFn: async () => {
      const rows = must(
        await supabase
          .from("registrations")
          .select(
            "id, status, created_at, decided_at, group_id, groups(name, price_dzd, max_students, stream_id, start_date, end_date, subjects(key, name, color), levels(name), group_schedules(id, weekday, start_time, end_time, room), teacher_id)",
          )
          .eq("student_id", studentId as string)
          .order("created_at", { ascending: false }),
      );
      return rows;
    },
  });
}

export function useCreateRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId, groupId }: { studentId: string; groupId: string }) => {
      const rows = must(
        await supabase
          .from("registrations")
          .insert({ student_id: studentId, group_id: groupId })
          .select("id"),
      );
      // The confirmation page is addressed by registration id, so the caller
      // needs it back rather than just a success signal.
      return rows[0]?.id ?? null;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: schoolKeys.myRegistrations(vars.studentId) });
      void qc.invalidateQueries({ queryKey: schoolKeys.registrations });
    },
  });
}

/* ---------------------------- ATTENDANCE ---------------------------- */

/** One register that has been taken: a (group, date) pair. */
export interface MarkedSession {
  groupId: string;
  sessionDate: string;
}

/**
 * Which registers have already been taken since `from`.
 *
 * Deliberately narrow: only the two columns needed to answer "was this session
 * marked?". `useAttendance` returns a full roster for one group on one date,
 * which is the wrong granularity -- detecting forgotten registers spans every
 * group the teacher owns. RLS already limits rows to sessions they may see.
 */
export function useMarkedSessions(from: string) {
  return useQuery({
    queryKey: schoolKeys.markedSessions(from),
    queryFn: async (): Promise<MarkedSession[]> => {
      const rows = must(
        await supabase
          .from("attendance")
          .select("group_id, session_date")
          .gte("session_date", from),
      );
      // Many student rows collapse to one marked session.
      const seen = new Set<string>();
      const out: MarkedSession[] = [];
      for (const r of rows) {
        const key = `${r.group_id}|${r.session_date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ groupId: r.group_id, sessionDate: r.session_date });
      }
      return out;
    },
  });
}

export function useAttendance(groupId: string | undefined, date: string) {
  return useQuery({
    queryKey: schoolKeys.attendance(groupId ?? "none", date),
    enabled: !!groupId,
    queryFn: async () => {
      const [roster, marks] = await Promise.all([
        supabase
          .from("registrations")
          .select("student_id, profiles:students(id, profiles(full_name, avatar_url))")
          .eq("group_id", groupId as string)
          .eq("status", "approved"),
        supabase
          .from("attendance")
          .select("student_id, status")
          .eq("group_id", groupId as string)
          .eq("session_date", date),
      ]);
      if (roster.error) throw new Error(roster.error.message);
      if (marks.error) throw new Error(marks.error.message);

      const marked = new Map(marks.data.map((m) => [m.student_id, m.status as AttendanceStatus]));
      return (roster.data ?? []).map((r) => ({
        studentId: r.student_id,
        fullName: r.profiles?.profiles?.full_name ?? "—",
        avatarUrl: r.profiles?.profiles?.avatar_url ?? null,
        status: marked.get(r.student_id) ?? null,
      }));
    },
  });
}

export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      date: string;
      markedBy: string;
      entries: { studentId: string; status: AttendanceStatus }[];
    }) => {
      if (input.entries.length === 0) return;
      must(
        await supabase
          .from("attendance")
          .upsert(
            input.entries.map((e) => ({
              group_id: input.groupId,
              student_id: e.studentId,
              session_date: input.date,
              status: e.status,
              marked_by: input.markedBy,
            })),
            { onConflict: "group_id,student_id,session_date" },
          )
          .select(),
      );
    },
    // Invalidate the ROOT, not the one roster key. The workspace's pending
    // count, the student portal and the admin dashboard all read this table;
    // naming them individually meant each new consumer had to be remembered,
    // and three were already being missed.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schoolKeys.attendanceRoot });
    },
  });
}

export function useMyAttendance(studentId: string | undefined) {
  return useQuery({
    queryKey: schoolKeys.myAttendance(studentId ?? "anon"),
    enabled: !!studentId,
    queryFn: async () => {
      const rows = must(
        await supabase
          .from("attendance")
          .select("id, session_date, status, groups(name)")
          .eq("student_id", studentId as string)
          .order("session_date", { ascending: false })
          .limit(50),
      );
      return rows;
    },
  });
}

/* ------------------------ TODAY'S ATTENDANCE ------------------------ */

export function useTodayAttendance(date: string) {
  return useQuery({
    queryKey: schoolKeys.todayAttendance(date),
    queryFn: async () => {
      const rows = must(
        await supabase.from("attendance").select("status").eq("session_date", date),
      );
      return {
        total: rows.length,
        present: rows.filter((r) => r.status === "present").length,
      };
    },
  });
}

/* ----------------------------- SETTINGS ----------------------------- */

export interface CenterSettings {
  school_name: string;
  academic_year: string;
  default_language: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
}

export function useCenterSettings() {
  return useQuery({
    queryKey: schoolKeys.settings,
    queryFn: async (): Promise<CenterSettings | null> => {
      const { data, error } = await supabase
        .from("center_settings")
        .select("school_name, academic_year, default_language, phone, address, logo_url")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CenterSettings | null) ?? null;
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      schoolName: string;
      academicYear: string;
      defaultLanguage: string;
      phone: string | null;
      address: string | null;
      logoUrl: string | null;
    }) => {
      must(
        await supabase
          .from("center_settings")
          .update({
            school_name: input.schoolName,
            academic_year: input.academicYear,
            default_language: input.defaultLanguage,
            phone: input.phone,
            address: input.address,
            logo_url: input.logoUrl,
          })
          .eq("id", true)
          .select(),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: schoolKeys.settings }),
  });
}
