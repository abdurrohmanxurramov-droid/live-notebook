export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          compensated: boolean
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          note: string | null
          owner_id: string
          status: string
          student_id: string
        }
        Insert: {
          compensated?: boolean
          created_at?: string
          date: string
          deleted_at?: string | null
          id?: string
          note?: string | null
          owner_id: string
          status: string
          student_id: string
        }
        Update: {
          compensated?: boolean
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          note?: string | null
          owner_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_fk"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string | null
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          name?: string | null
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string | null
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      finance: {
        Row: {
          amount: number
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          is_paid: boolean
          owner_id: string
          pay_date: string | null
          student_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_paid?: boolean
          owner_id: string
          pay_date?: string | null
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          is_paid?: boolean
          owner_id?: string
          pay_date?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_student_fk"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      homework: {
        Row: {
          assigned_date: string
          created_at: string
          deleted_at: string | null
          due_date: string | null
          id: string
          note: string | null
          owner_id: string
          status: string
          student_id: string
          task: string
        }
        Insert: {
          assigned_date?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          note?: string | null
          owner_id: string
          status?: string
          student_id: string
          task: string
        }
        Update: {
          assigned_date?: string
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          note?: string | null
          owner_id?: string
          status?: string
          student_id?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_student_fk"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          created_at: string
          deleted_at: string | null
          duration_min: number
          id: string
          moved_from_id: string | null
          notes: string | null
          owner_id: string
          scheduled_date: string
          scheduled_time: string
          source_slot_id: string | null
          status: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          duration_min?: number
          id?: string
          moved_from_id?: string | null
          notes?: string | null
          owner_id: string
          scheduled_date: string
          scheduled_time: string
          source_slot_id?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          duration_min?: number
          id?: string
          moved_from_id?: string | null
          notes?: string | null
          owner_id?: string
          scheduled_date?: string
          scheduled_time?: string
          source_slot_id?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_moved_from_id_fkey"
            columns: ["moved_from_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          owner_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          owner_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          owner_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      rates: {
        Row: {
          id: string
          owner_id: string
          updated_at: string
          usd_to_egp: number
          usd_to_rub: number
          usdt_to_egp: number
        }
        Insert: {
          id?: string
          owner_id: string
          updated_at?: string
          usd_to_egp?: number
          usd_to_rub?: number
          usdt_to_egp?: number
        }
        Update: {
          id?: string
          owner_id?: string
          updated_at?: string
          usd_to_egp?: number
          usd_to_rub?: number
          usdt_to_egp?: number
        }
        Relationships: []
      }
      schedule_slots: {
        Row: {
          created_at: string
          day_of_week: number
          deleted_at: string | null
          duration_min: number
          id: string
          owner_id: string
          start_time: string
          student_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          deleted_at?: string | null
          duration_min?: number
          id?: string
          owner_id: string
          start_time: string
          student_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          deleted_at?: string | null
          duration_min?: number
          id?: string
          owner_id?: string
          start_time?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_student_fk"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          days_per_week: number
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          phone: string | null
          status: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          days_per_week?: number
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          phone?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          days_per_week?: number
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          phone?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          default_currency: string
          default_lesson_duration: number
          default_lesson_price: number
          locale: string
          remind_before_min: number
          remind_homework: boolean
          remind_lessons: boolean
          remind_payments: boolean
          updated_at: string
          user_id: string
          week_starts_on: number
        }
        Insert: {
          created_at?: string
          default_currency?: string
          default_lesson_duration?: number
          default_lesson_price?: number
          locale?: string
          remind_before_min?: number
          remind_homework?: boolean
          remind_lessons?: boolean
          remind_payments?: boolean
          updated_at?: string
          user_id: string
          week_starts_on?: number
        }
        Update: {
          created_at?: string
          default_currency?: string
          default_lesson_duration?: number
          default_lesson_price?: number
          locale?: string
          remind_before_min?: number
          remind_homework?: boolean
          remind_lessons?: boolean
          remind_payments?: boolean
          updated_at?: string
          user_id?: string
          week_starts_on?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_lessons_conducted: {
        Row: {
          lessons_done: number | null
          owner_id: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      lesson_status: "planned" | "completed" | "cancelled" | "moved"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      lesson_status: ["planned", "completed", "cancelled", "moved"],
    },
  },
} as const
