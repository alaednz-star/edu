export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      attendance: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          marked_by: string | null;
          session_date: string;
          status: Database["public"]["Enums"]["attendance_status"];
          student_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          marked_by?: string | null;
          session_date?: string;
          status?: Database["public"]["Enums"]["attendance_status"];
          student_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          marked_by?: string | null;
          session_date?: string;
          status?: Database["public"]["Enums"]["attendance_status"];
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          details: Json;
          id: string;
          target_email: string | null;
          target_id: string | null;
        };
        Insert: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          target_email?: string | null;
          target_id?: string | null;
        };
        Update: {
          action?: Database["public"]["Enums"]["audit_action"];
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          target_email?: string | null;
          target_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      center_settings: {
        Row: {
          academic_year: string;
          address: string | null;
          default_language: string;
          id: boolean;
          logo_url: string | null;
          phone: string | null;
          school_name: string;
          updated_at: string;
        };
        Insert: {
          academic_year?: string;
          address?: string | null;
          default_language?: string;
          id?: boolean;
          logo_url?: string | null;
          phone?: string | null;
          school_name?: string;
          updated_at?: string;
        };
        Update: {
          academic_year?: string;
          address?: string | null;
          default_language?: string;
          id?: boolean;
          logo_url?: string | null;
          phone?: string | null;
          school_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      group_schedules: {
        Row: {
          end_time: string;
          group_id: string;
          id: string;
          room: string | null;
          start_time: string;
          weekday: number;
        };
        Insert: {
          end_time: string;
          group_id: string;
          id?: string;
          room?: string | null;
          start_time: string;
          weekday: number;
        };
        Update: {
          end_time?: string;
          group_id?: string;
          id?: string;
          room?: string | null;
          start_time?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: "group_schedules_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          level_id: string | null;
          max_students: number;
          name: string;
          price_dzd: number;
          start_date: string;
          status: Database["public"]["Enums"]["entity_status"];
          stream_id: string | null;
          subject_id: string | null;
          teacher_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          level_id?: string | null;
          max_students?: number;
          name: string;
          price_dzd?: number;
          start_date?: string;
          status?: Database["public"]["Enums"]["entity_status"];
          stream_id?: string | null;
          subject_id?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          level_id?: string | null;
          max_students?: number;
          name?: string;
          price_dzd?: number;
          start_date?: string;
          status?: Database["public"]["Enums"]["entity_status"];
          stream_id?: string | null;
          subject_id?: string | null;
          teacher_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_stream_id_fkey";
            columns: ["stream_id"];
            isOneToOne: false;
            referencedRelation: "streams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      levels: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          position: number;
          stage: Database["public"]["Enums"]["level_stage"];
          status: Database["public"]["Enums"]["entity_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          position?: number;
          stage: Database["public"]["Enums"]["level_stage"];
          status?: Database["public"]["Enums"]["entity_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          position?: number;
          stage?: Database["public"]["Enums"]["level_stage"];
          status?: Database["public"]["Enums"]["entity_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          params: Json;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          params?: Json;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          params?: Json;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          locale: string;
          password_change_required: boolean;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
          locale?: string;
          password_change_required?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          locale?: string;
          password_change_required?: boolean;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      registrations: {
        Row: {
          created_at: string;
          decided_at: string | null;
          group_id: string;
          id: string;
          level_id: string | null;
          note: string | null;
          status: Database["public"]["Enums"]["registration_status"];
          student_id: string;
          subject_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          group_id: string;
          id?: string;
          level_id?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["registration_status"];
          student_id: string;
          subject_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          group_id?: string;
          id?: string;
          level_id?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["registration_status"];
          student_id?: string;
          subject_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registrations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registrations_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registrations_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registrations_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      streams: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          level_id: string;
          name_ar: string;
          name_en: string;
          name_fr: string;
          position: number;
          status: Database["public"]["Enums"]["entity_status"];
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          level_id: string;
          name_ar: string;
          name_en: string;
          name_fr: string;
          position?: number;
          status?: Database["public"]["Enums"]["entity_status"];
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          level_id?: string;
          name_ar?: string;
          name_en?: string;
          name_fr?: string;
          position?: number;
          status?: Database["public"]["Enums"]["entity_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "streams_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
        ];
      };
      student_notes: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_notes_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          address: string | null;
          created_at: string;
          date_of_birth: string | null;
          gender: Database["public"]["Enums"]["gender"] | null;
          guardian_name: string | null;
          guardian_phone: string | null;
          id: string;
          level_id: string | null;
          onboarded_at: string | null;
          registered_at: string;
          role: Database["public"]["Enums"]["app_role"] | null;
          status: Database["public"]["Enums"]["entity_status"];
          stream_id: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          gender?: Database["public"]["Enums"]["gender"] | null;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          id: string;
          level_id?: string | null;
          onboarded_at?: string | null;
          registered_at?: string;
          role?: Database["public"]["Enums"]["app_role"] | null;
          status?: Database["public"]["Enums"]["entity_status"];
          stream_id?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          gender?: Database["public"]["Enums"]["gender"] | null;
          guardian_name?: string | null;
          guardian_phone?: string | null;
          id?: string;
          level_id?: string | null;
          onboarded_at?: string | null;
          registered_at?: string;
          role?: Database["public"]["Enums"]["app_role"] | null;
          status?: Database["public"]["Enums"]["entity_status"];
          stream_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_id_role_fkey";
            columns: ["id", "role"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["user_id", "role"];
          },
          {
            foreignKeyName: "students_level_id_fkey";
            columns: ["level_id"];
            isOneToOne: false;
            referencedRelation: "levels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_stream_id_fkey";
            columns: ["stream_id"];
            isOneToOne: false;
            referencedRelation: "streams";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          color: string;
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          name: string;
          status: Database["public"]["Enums"]["entity_status"];
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          name: string;
          status?: Database["public"]["Enums"]["entity_status"];
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          name?: string;
          status?: Database["public"]["Enums"]["entity_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      teacher_subjects: {
        Row: {
          subject_id: string;
          teacher_id: string;
        };
        Insert: {
          subject_id: string;
          teacher_id: string;
        };
        Update: {
          subject_id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      teachers: {
        Row: {
          bio: string | null;
          created_at: string;
          experience_years: number;
          id: string;
          role: Database["public"]["Enums"]["app_role"] | null;
          status: Database["public"]["Enums"]["entity_status"];
          status_changed_at: string | null;
          status_reason: string | null;
          updated_at: string;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          experience_years?: number;
          id: string;
          role?: Database["public"]["Enums"]["app_role"] | null;
          status?: Database["public"]["Enums"]["entity_status"];
          status_changed_at?: string | null;
          status_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          experience_years?: number;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"] | null;
          status?: Database["public"]["Enums"]["entity_status"];
          status_changed_at?: string | null;
          status_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teachers_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teachers_id_role_fkey";
            columns: ["id", "role"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["user_id", "role"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      /**
       * Approved-only enrolment count per group. Generated from the local
       * schema; see `20260808180000_session_aggregates.sql`.
       *
       * Columns are nullable because Postgres cannot prove non-nullability
       * through a view -- callers must coalesce. `group_enrollment_counts`
       * always emits a row per group, so a null `group_id` never occurs in
       * practice.
       */
      group_enrollment_counts: {
        Row: {
          enrolled_count: number | null;
          group_id: string | null;
        };
        Relationships: [];
      };
      /** One row per (group_id, session_date) = one session, per ADR-003. */
      session_attendance_summary: {
        Row: {
          absent_count: number | null;
          excused_count: number | null;
          group_id: string | null;
          last_marked_at: string | null;
          late_count: number | null;
          marked_count: number | null;
          present_count: number | null;
          session_date: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "group_enrollment_counts";
            referencedColumns: ["group_id"];
          },
          {
            foreignKeyName: "attendance_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      entity_dependencies: {
        Args: { _entity: string; _id: string };
        Returns: {
          relationship: string;
          row_count: number;
          severity: string;
          source_table: string;
        }[];
      };
      provision_staff: {
        Args: {
          _bio?: string;
          _experience_years?: number;
          _phone?: string;
          _role: Database["public"]["Enums"]["app_role"];
          _target: string;
        };
        Returns: undefined;
      };
      set_teacher_lifecycle: {
        Args: {
          _next: Database["public"]["Enums"]["entity_status"];
          _reason?: string;
          _teacher: string;
        };
        Returns: undefined;
      };
      teacher_deletion_blockers: {
        Args: { _teacher: string };
        Returns: {
          attendance_marked: number;
          audit_entries: number;
          deletable: boolean;
          groups_assigned: number;
          notes_authored: number;
        }[];
      };
      teacher_workload: {
        Args: { _teacher: string };
        Returns: {
          group_count: number;
          student_count: number;
          subject_count: number;
          weekly_minutes: number;
        }[];
      };
    };
    Enums: {
      app_role: "admin" | "teacher" | "student";
      attendance_status: "present" | "absent" | "late" | "excused";
      audit_action:
        | "teacher_created"
        | "teacher_updated"
        | "teacher_disabled"
        | "teacher_enabled"
        | "teacher_password_reset"
        | "role_granted"
        | "role_revoked"
        | "teacher_suspended"
        | "teacher_reactivated"
        | "teacher_archived"
        | "teacher_restored"
        | "teacher_deleted";
      entity_status: "active" | "inactive" | "_probe_val" | "suspended" | "archived";
      gender: "male" | "female";
      level_stage: "primary" | "middle" | "high";
      notification_kind:
        | "registration_approved"
        | "registration_rejected"
        | "attendance_marked"
        | "teacher_assigned"
        | "group_updated"
        | "announcement";
      registration_status: "pending" | "approved" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "teacher", "student"],
      attendance_status: ["present", "absent", "late", "excused"],
      audit_action: [
        "teacher_created",
        "teacher_updated",
        "teacher_disabled",
        "teacher_enabled",
        "teacher_password_reset",
        "role_granted",
        "role_revoked",
        "teacher_suspended",
        "teacher_reactivated",
        "teacher_archived",
        "teacher_restored",
        "teacher_deleted",
      ],
      entity_status: ["active", "inactive", "_probe_val", "suspended", "archived"],
      gender: ["male", "female"],
      level_stage: ["primary", "middle", "high"],
      notification_kind: [
        "registration_approved",
        "registration_rejected",
        "attendance_marked",
        "teacher_assigned",
        "group_updated",
        "announcement",
      ],
      registration_status: ["pending", "approved", "rejected"],
    },
  },
} as const;
