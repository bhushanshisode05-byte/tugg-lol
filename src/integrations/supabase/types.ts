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
          dodo_order_id: string | null
          dodo_payment_id: string | null
          email: string | null
          environment: string
          id: string
          matchup_id: string
          payglocal_order_id: string | null
          payment_intent: string | null
          refunded: boolean
          stripe_session_id: string | null
          tier: string
        }
        Insert: {
          created_at?: string
          dodo_order_id?: string | null
          dodo_payment_id?: string | null
          email?: string | null
          environment?: string
          id?: string
          matchup_id: string
          payglocal_order_id?: string | null
          payment_intent?: string | null
          refunded?: boolean
          stripe_session_id?: string | null
          tier: string
        }
        Update: {
          created_at?: string
          dodo_order_id?: string | null
          dodo_payment_id?: string | null
          email?: string | null
          environment?: string
          id?: string
          matchup_id?: string
          payglocal_order_id?: string | null
          payment_intent?: string | null
          refunded?: boolean
          stripe_session_id?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "creators_dodo_order_id_fkey"
            columns: ["dodo_order_id"]
            isOneToOne: false
            referencedRelation: "dodo_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_payglocal_order_id_fkey"
            columns: ["payglocal_order_id"]
            isOneToOne: false
            referencedRelation: "payglocal_orders"
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
      dodo_orders: {
        Row: {
          checkout_id: string | null
          created_at: string
          environment: string
          expected_cents: number
          id: string
          kind: string
          matchup_id: string | null
          payment_id: string | null
          processing_until: string | null
          product_id: string
          refund_id: string | null
          refund_status: string | null
          review_allowed: boolean | null
          review_reason: string | null
          status: string
          wallet_id: string | null
        }
        Insert: {
          checkout_id?: string | null
          created_at?: string
          environment: string
          expected_cents: number
          id?: string
          kind: string
          matchup_id?: string | null
          payment_id?: string | null
          processing_until?: string | null
          product_id: string
          refund_id?: string | null
          refund_status?: string | null
          review_allowed?: boolean | null
          review_reason?: string | null
          status?: string
          wallet_id?: string | null
        }
        Update: {
          checkout_id?: string | null
          created_at?: string
          environment?: string
          expected_cents?: number
          id?: string
          kind?: string
          matchup_id?: string | null
          payment_id?: string | null
          processing_until?: string | null
          product_id?: string
          refund_id?: string | null
          refund_status?: string | null
          review_allowed?: boolean | null
          review_reason?: string | null
          status?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dodo_orders_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dodo_orders_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "pull_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      dodo_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          environment: string
          event_type: string
          id: string
          lease_until: string | null
          payload: Json
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          environment: string
          event_type: string
          id: string
          lease_until?: string | null
          payload: Json
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          environment?: string
          event_type?: string
          id?: string
          lease_until?: string | null
          payload?: Json
          status?: string
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
      payglocal_funnel_events: {
        Row: {
          bundle: number
          created_at: string
          environment: string
          funnel_id: string
          id: string
          mode: string
          step: string
        }
        Insert: {
          bundle: number
          created_at?: string
          environment: string
          funnel_id: string
          id?: string
          mode?: string
          step: string
        }
        Update: {
          bundle?: number
          created_at?: string
          environment?: string
          funnel_id?: string
          id?: string
          mode?: string
          step?: string
        }
        Relationships: []
      }
      payglocal_ledger: {
        Row: {
          amount_cents: number
          created_at: string
          entry_type: string
          gid: string
          id: string
          order_id: string
          pull_id: string | null
          quantity: number
        }
        Insert: {
          amount_cents: number
          created_at?: string
          entry_type: string
          gid: string
          id?: string
          order_id: string
          pull_id?: string | null
          quantity: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          entry_type?: string
          gid?: string
          id?: string
          order_id?: string
          pull_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "payglocal_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "payglocal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payglocal_ledger_pull_id_fkey"
            columns: ["pull_id"]
            isOneToOne: false
            referencedRelation: "pulls"
            referencedColumns: ["id"]
          },
        ]
      }
      payglocal_orders: {
        Row: {
          billing_country: string
          created_at: string
          display_name: string
          environment: string
          expected_cents: number
          funnel_id: string | null
          gid: string | null
          id: string
          kind: string
          matchup_id: string | null
          merchant_unique_id: string
          paid_at: string | null
          processing_key: string | null
          processing_until: string | null
          provider_status: string | null
          quantity: number
          reconcile_count: number
          reconcile_result: string | null
          reconciled_at: string | null
          refund_gid: string | null
          refund_status: string | null
          return_path: string
          review_allowed: boolean | null
          review_reason: string | null
          shout_out: string
          side_id: string | null
          status: string
          status_url: string | null
        }
        Insert: {
          billing_country?: string
          created_at?: string
          display_name?: string
          environment: string
          expected_cents: number
          funnel_id?: string | null
          gid?: string | null
          id?: string
          kind: string
          matchup_id?: string | null
          merchant_unique_id: string
          paid_at?: string | null
          processing_key?: string | null
          processing_until?: string | null
          provider_status?: string | null
          quantity?: number
          reconcile_count?: number
          reconcile_result?: string | null
          reconciled_at?: string | null
          refund_gid?: string | null
          refund_status?: string | null
          return_path: string
          review_allowed?: boolean | null
          review_reason?: string | null
          shout_out?: string
          side_id?: string | null
          status?: string
          status_url?: string | null
        }
        Update: {
          billing_country?: string
          created_at?: string
          display_name?: string
          environment?: string
          expected_cents?: number
          funnel_id?: string | null
          gid?: string | null
          id?: string
          kind?: string
          matchup_id?: string | null
          merchant_unique_id?: string
          paid_at?: string | null
          processing_key?: string | null
          processing_until?: string | null
          provider_status?: string | null
          quantity?: number
          reconcile_count?: number
          reconcile_result?: string | null
          reconciled_at?: string | null
          refund_gid?: string | null
          refund_status?: string | null
          return_path?: string
          review_allowed?: boolean | null
          review_reason?: string | null
          shout_out?: string
          side_id?: string | null
          status?: string
          status_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payglocal_orders_matchup_id_fkey"
            columns: ["matchup_id"]
            isOneToOne: false
            referencedRelation: "matchups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payglocal_orders_side_id_fkey"
            columns: ["side_id"]
            isOneToOne: false
            referencedRelation: "sides"
            referencedColumns: ["id"]
          },
        ]
      }
      pull_wallet_ledger: {
        Row: {
          amount_cents: number
          created_at: string
          delta: number
          environment: string
          id: string
          kind: string
          order_id: string | null
          payment_id: string | null
          pull_id: string | null
          refund_id: string | null
          request_id: string | null
          wallet_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          delta: number
          environment: string
          id?: string
          kind: string
          order_id?: string | null
          payment_id?: string | null
          pull_id?: string | null
          refund_id?: string | null
          request_id?: string | null
          wallet_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          delta?: number
          environment?: string
          id?: string
          kind?: string
          order_id?: string | null
          payment_id?: string | null
          pull_id?: string | null
          refund_id?: string | null
          request_id?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pull_wallet_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "dodo_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pull_wallet_ledger_pull_id_fkey"
            columns: ["pull_id"]
            isOneToOne: false
            referencedRelation: "pulls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pull_wallet_ledger_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "pull_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      pull_wallets: {
        Row: {
          balance: number
          billing_country: string | null
          created_at: string
          environment: string
          flagged: boolean
          id: string
          token_hash: string
        }
        Insert: {
          balance?: number
          billing_country?: string | null
          created_at?: string
          environment: string
          flagged?: boolean
          id?: string
          token_hash: string
        }
        Update: {
          balance?: number
          billing_country?: string | null
          created_at?: string
          environment?: string
          flagged?: boolean
          id?: string
          token_hash?: string
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
          wallet_ledger_id: string | null
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
          wallet_ledger_id?: string | null
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
          wallet_ledger_id?: string | null
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
      side_image_reports: {
        Row: {
          created_at: string
          id: string
          image_id: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_id: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          image_id?: string
          ip_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "side_image_reports_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "side_image_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      side_image_uploads: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          ip_hash: string
          matchup_id: string | null
          png_path: string
          reason: string | null
          renderer_failed: boolean
          rights_confirmed: boolean
          status: string
          webp_path: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_hash: string
          matchup_id?: string | null
          png_path: string
          reason?: string | null
          renderer_failed?: boolean
          rights_confirmed?: boolean
          status?: string
          webp_path: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_hash?: string
          matchup_id?: string | null
          png_path?: string
          reason?: string | null
          renderer_failed?: boolean
          rights_confirmed?: boolean
          status?: string
          webp_path?: string
        }
        Relationships: []
      }
      sides: {
        Row: {
          all_time_cents: number
          best_streak: number
          color: string
          current_streak: number
          emoji: string
          id: string
          image_id: string | null
          image_report_count: number | null
          image_status: string | null
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
          image_id?: string | null
          image_report_count?: number | null
          image_status?: string | null
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
          image_id?: string | null
          image_report_count?: number | null
          image_status?: string | null
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
      apply_payglocal_payment: {
        Args: {
          p_cents: number
          p_country: string
          p_env: string
          p_gid: string
          p_order: string
        }
        Returns: Json
      }
      attach_side_images: {
        Args: { p_a: string; p_b: string; p_ip: string; p_matchup: string }
        Returns: boolean
      }
      claim_dodo_event: { Args: { p_id: string }; Returns: boolean }
      claim_dodo_order: {
        Args: { p_env: string; p_order: string; p_payment: string }
        Returns: boolean
      }
      claim_payglocal_order: {
        Args: { p_env: string; p_key: string; p_order: string }
        Returns: boolean
      }
      claim_tugg_owner: {
        Args: { p_email: string; p_user: string }
        Returns: boolean
      }
      cleanup_stale_matchups: { Args: never; Returns: number }
      close_due_rounds: { Args: never; Returns: number }
      close_round: { Args: { p_round: string }; Returns: undefined }
      credit_dodo_wallet: {
        Args: {
          p_cents: number
          p_country: string
          p_env: string
          p_order: string
          p_payment: string
        }
        Returns: Json
      }
      ensure_open_round: { Args: { p_matchup: string }; Returns: string }
      next_utc_midnight: { Args: never; Returns: string }
      payglocal_reconcile_due: { Args: { p_env: string }; Returns: Json }
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
      refund_dodo_wallet: {
        Args: { p_cents: number; p_order: string; p_refund: string }
        Returns: undefined
      }
      report_side_image: {
        Args: { p_image: string; p_ip: string }
        Returns: Json
      }
      retire_idle_ai_matchups: { Args: { p_live: boolean }; Returns: number }
      spend_wallet_pull: {
        Args: {
          p_env: string
          p_hash: string
          p_name: string
          p_quantity: number
          p_request: string
          p_shout: string
          p_side: string
        }
        Returns: Json
      }
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
      tugg_dodo_summary: { Args: never; Returns: Json }
      tugg_payglocal_funnel: { Args: never; Returns: Json }
      tugg_payglocal_summary: { Args: never; Returns: Json }
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
