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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      checkout_attempts: {
        Row: {
          created_at: string
          id: number
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: number
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: number
          ip_hash?: string
        }
        Relationships: []
      }
      creators: {
        Row: {
          created_at: string
          email: string | null
          environment: string
          id: string
          matchup_id: string
          payment_intent: string | null
          refunded: boolean
          stripe_session_id: string | null
          tier: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          environment?: string
          id?: string
          matchup_id: string
          payment_intent?: string | null
          refunded?: boolean
          stripe_session_id?: string | null
          tier: string
        }
        Update: {
          created_at?: string
          email?: string | null
          environment?: string
          id?: string
          matchup_id?: string
          payment_intent?: string | null
          refunded?: boolean
          stripe_session_id?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "creators_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          detail: Json
          id: string
          kind: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          kind: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          day: string
          detail: Json
          finished_at: string | null
          job: string
          started_at: string
          status: string
        }
        Insert: {
          day: string
          detail?: Json
          finished_at?: string | null
          job: string
          started_at?: string
          status?: string
        }
        Update: {
          day?: string
          detail?: Json
          finished_at?: string | null
          job?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      job_state: {
        Row: {
          job: string
          paused: boolean
          reason: string | null
          status: number | null
          updated_at: string
        }
        Insert: {
          job: string
          paused?: boolean
          reason?: string | null
          status?: number | null
          updated_at?: string
        }
        Update: {
          job?: string
          paused?: boolean
          reason?: string | null
          status?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      matchups: {
        Row: {
          category: string
          created_at: string
          description: string
          featured_until: string | null
          id: string
          slug: string
          source: string
          status: string
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          featured_until?: string | null
          id?: string
          slug: string
          source?: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          featured_until?: string | null
          id?: string
          slug?: string
          source?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      moderation_log: {
        Row: {
          content: string | null
          created_at: string
          id: string
          reason: string | null
          subject_id: string | null
          subject_type: string
          verdict: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          subject_type: string
          verdict: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          subject_type?: string
          verdict?: string
        }
        Relationships: []
      }
      pulls: {
        Row: {
          amount_cents: number
          country: string | null
          created_at: string
          display_name: string | null
          environment: string
          id: string
          matchup_id: string
          round_id: string
          shout_out: string | null
          side_id: string
          stripe_session_id: string
        }
        Insert: {
          amount_cents: number
          country?: string | null
          created_at?: string
          display_name?: string | null
          environment?: string
          id?: string
          matchup_id: string
          round_id: string
          shout_out?: string | null
          side_id: string
          stripe_session_id: string
        }
        Update: {
          amount_cents?: number
          country?: string | null
          created_at?: string
          display_name?: string | null
          environment?: string
          id?: string
          matchup_id?: string
          round_id?: string
          shout_out?: string | null
          side_id?: string
          stripe_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pulls_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulls_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pulls_side_id_fkey"
            columns: ["side_id"]
            isOneToOne: false
            referencedRelation: "sides"
            referencedColumns: ["id"]
          },
        ]
      }
      recaps: {
        Row: {
          body: Json
          created_at: string
          day: string
          facts: Json
          summary: string
        }
        Insert: {
          body?: Json
          created_at?: string
          day: string
          facts?: Json
          summary: string
        }
        Update: {
          body?: Json
          created_at?: string
          day?: string
          facts?: Json
          summary?: string
        }
        Relationships: []
      }
      rounds: {
        Row: {
          closed_at: string | null
          ends_at: string
          extensions: number
          id: string
          matchup_id: string
          pullers: number
          result_note: string | null
          starts_at: string
          status: string
          total_a_cents: number
          total_b_cents: number
          winner_side_id: string | null
        }
        Insert: {
          closed_at?: string | null
          ends_at: string
          extensions?: number
          id?: string
          matchup_id: string
          pullers?: number
          result_note?: string | null
          starts_at?: string
          status?: string
          total_a_cents?: number
          total_b_cents?: number
          winner_side_id?: string | null
        }
        Update: {
          closed_at?: string | null
          ends_at?: string
          extensions?: number
          id?: string
          matchup_id?: string
          pullers?: number
          result_note?: string | null
          starts_at?: string
          status?: string
          total_a_cents?: number
          total_b_cents?: number
          winner_side_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_winner_side_id_fkey"
            columns: ["winner_side_id"]
            isOneToOne: false
            referencedRelation: "sides"
            referencedColumns: ["id"]
          },
        ]
      }
      sides: {
        Row: {
          all_time_cents: number
          best_streak: number
          color: string
          current_streak: number
          emoji: string
          id: string
          matchup_id: string
          name: string
          position: number
          wins: number
        }
        Insert: {
          all_time_cents?: number
          best_streak?: number
          color?: string
          current_streak?: number
          emoji?: string
          id?: string
          matchup_id: string
          name: string
          position: number
          wins?: number
        }
        Update: {
          all_time_cents?: number
          best_streak?: number
          color?: string
          current_streak?: number
          emoji?: string
          id?: string
          matchup_id?: string
          name?: string
          position?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "sides_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ai_state: {
        Row: {
          id: string
          paused: boolean
          reason: string | null
          status: number | null
          updated_at: string
        }
        Insert: {
          id: string
          paused?: boolean
          reason?: string | null
          status?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          paused?: boolean
          reason?: string | null
          status?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      support_threads: {
        Row: {
          ai_reply: string | null
          channel: string
          created_at: string
          email: string | null
          id: string
          message: string
          name: string | null
          payment_error: boolean
          status: string
        }
        Insert: {
          ai_reply?: string | null
          channel: string
          created_at?: string
          email?: string | null
          id?: string
          message: string
          name?: string | null
          payment_error?: boolean
          status?: string
        }
        Update: {
          ai_reply?: string | null
          channel?: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          name?: string | null
          payment_error?: boolean
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_tugg_owner: {
        Args: { p_email: string; p_user: string }
        Returns: boolean
      }
      cleanup_stale_matchups: { Args: never; Returns: number }
      close_due_rounds: { Args: never; Returns: number }
      close_round: { Args: { p_round: string }; Returns: undefined }
      ensure_open_round: { Args: { p_matchup: string }; Returns: string }
      next_utc_midnight: { Args: never; Returns: string }
      record_pull: {
        Args: {
          p_amount: number
          p_country: string
          p_env: string
          p_name: string
          p_session: string
          p_shout: string
          p_side: string
        }
        Returns: Json
      }
      retire_idle_ai_matchups: { Args: { p_live: boolean }; Returns: number }
      take_checkout_slot: {
        Args: { p_ip: string; p_max: number; p_window_minutes: number }
        Returns: boolean
      }
      tugg_admin_summary: { Args: never; Returns: Json }
      tugg_countries: {
        Args: { p_limit?: number; p_live: boolean; p_matchup?: string }
        Returns: {
          cents: number
          country: string
          pulls: number
        }[]
      }
      tugg_creation_revenue: { Args: never; Returns: Json }
      tugg_day_facts: {
        Args: { p_from: string; p_live: boolean; p_to: string }
        Returns: Json
      }
      tugg_recent_pulls: {
        Args: { p_limit?: number; p_live: boolean; p_matchup?: string }
        Returns: {
          amount_cents: number
          country: string
          created_at: string
          display_name: string
          id: string
          matchup_id: string
          shout_out: string
          side_id: string
        }[]
      }
      tugg_round_leaders: {
        Args: { p_limit?: number; p_live: boolean; p_open_only: boolean }
        Returns: {
          ends_at: string
          matchup_id: string
          pullers: number
          round_id: string
          status: string
          total_a_cents: number
          total_b_cents: number
        }[]
      }
      tugg_round_totals: {
        Args: { p_live: boolean; p_rounds: string[] }
        Returns: {
          pullers: number
          round_id: string
          total_a_cents: number
          total_b_cents: number
        }[]
      }
      tugg_side_totals: {
        Args: { p_live: boolean; p_matchups: string[] }
        Returns: {
          cents: number
          side_id: string
        }[]
      }
      tugg_stats: {
        Args: { p_live: boolean }
        Returns: {
          countries: number
          pulls_today: number
          today_cents: number
          total_cents: number
          total_pulls: number
        }[]
      }
      tugg_top_pullers: {
        Args: { p_limit?: number; p_live: boolean; p_round: string }
        Returns: {
          cents: number
          name: string
          side_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
