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
      credit_payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          id?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_org_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          organization_id: string
          spent_on: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          organization_id?: string
          spent_on?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          organization_id?: string
          spent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          display_name: string
          email: string
          organization_id: string
          role: Database["public"]["Enums"]["shop_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string
          organization_id: string
          role?: Database["public"]["Enums"]["shop_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["shop_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string
          contact: string
          created_at: string
          id: string
          logo_url: string
          name: string
          owner_id: string
          plan: string
          slogan: string
          subscription_active: boolean
          subscription_ends_at: string | null
          trial_ends_at: string
        }
        Insert: {
          address?: string
          contact?: string
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          owner_id: string
          plan?: string
          slogan?: string
          subscription_active?: boolean
          subscription_ends_at?: string | null
          trial_ends_at?: string
        }
        Update: {
          address?: string
          contact?: string
          created_at?: string
          id?: string
          logo_url?: string
          name?: string
          owner_id?: string
          plan?: string
          slogan?: string
          subscription_active?: boolean
          subscription_ends_at?: string | null
          trial_ends_at?: string
        }
        Relationships: []
      }
      payment_checkouts: {
        Row: {
          amount: number
          billing: string
          created_at: string
          created_by: string | null
          id: string
          months: number
          organization_id: string
          paid_at: string | null
          plan: string
          provider: string
          provider_ref: string | null
          raw_event: Json | null
          status: string
        }
        Insert: {
          amount: number
          billing: string
          created_at?: string
          created_by?: string | null
          id?: string
          months: number
          organization_id: string
          paid_at?: string | null
          plan: string
          provider?: string
          provider_ref?: string | null
          raw_event?: Json | null
          status?: string
        }
        Update: {
          amount?: number
          billing?: string
          created_at?: string
          created_by?: string | null
          id?: string
          months?: number
          organization_id?: string
          paid_at?: string | null
          plan?: string
          provider?: string
          provider_ref?: string | null
          raw_event?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_checkouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          contact_email: string
          contact_whatsapp: string
          id: boolean
          payment_instructions: string
          price_amount: number
          price_period: string
          updated_at: string
        }
        Insert: {
          contact_email?: string
          contact_whatsapp?: string
          id?: boolean
          payment_instructions?: string
          price_amount?: number
          price_period?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string
          contact_whatsapp?: string
          id?: boolean
          payment_instructions?: string
          price_amount?: number
          price_period?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          purchase_price: number
          sale_price: number
          stock: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          purchase_price?: number
          sale_price?: number
          stock?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          purchase_price?: number
          sale_price?: number
          stock?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_org_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string
          contact: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_suspended: boolean
          logo_url: string
          shop_name: string
          slogan: string
          subscription_active: boolean
          subscription_ends_at: string | null
          suspended_at: string | null
          trial_ends_at: string
        }
        Insert: {
          address?: string
          contact?: string
          created_at?: string
          email?: string
          full_name?: string
          id: string
          is_suspended?: boolean
          logo_url?: string
          shop_name?: string
          slogan?: string
          subscription_active?: boolean
          subscription_ends_at?: string | null
          suspended_at?: string | null
          trial_ends_at?: string
        }
        Update: {
          address?: string
          contact?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_suspended?: boolean
          logo_url?: string
          shop_name?: string
          slogan?: string
          subscription_active?: boolean
          subscription_ends_at?: string | null
          suspended_at?: string | null
          trial_ends_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          unit_cost: number
          unit_price: number
          user_id: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id: string
          unit_cost: number
          unit_price: number
          user_id: string
        }
        Update: {
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          unit_cost?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_org_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          is_credit: boolean
          items_count: number
          profit: number
          seller_id: string | null
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          is_credit?: boolean
          items_count?: number
          profit?: number
          seller_id?: string | null
          total?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          is_credit?: boolean
          items_count?: number
          profit?: number
          seller_id?: string | null
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_org_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_members: {
        Row: {
          created_at: string
          display_name: string
          email: string
          role: Database["public"]["Enums"]["shop_role"]
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string
          role?: Database["public"]["Enums"]["shop_role"]
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          role?: Database["public"]["Enums"]["shop_role"]
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          note: string
          recorded_by: string | null
          shop_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          note?: string
          recorded_by?: string | null
          shop_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          note?: string
          recorded_by?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      debt_payments: {
        Row: {
          amount: number | null
          created_at: string | null
          customer_id: string | null
          id: string | null
          organization_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          organization_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          amount: number | null
          created_at: string | null
          customer_id: string | null
          id: string | null
          organization_id: string | null
          seller_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          organization_id?: string | null
          seller_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          organization_id?: string | null
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_credit_sale: {
        Args: { _customer_id: string; _items: Json }
        Returns: string
      }
      create_sale: { Args: { _items: Json }; Returns: string }
      current_shop: { Args: never; Returns: string }
      customer_debt: { Args: { _cid: string }; Returns: number }
      has_access: { Args: { _uid: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_shop_admin: { Args: never; Returns: boolean }
      mark_checkout_paid: {
        Args: {
          _checkout: string
          _event: Json
          _method: string
          _provider_ref: string
        }
        Returns: boolean
      }
      record_payment: {
        Args: { _amount: number; _customer_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin"
      shop_role: "admin" | "cashier"
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
    Enums: {
      app_role: ["super_admin"],
      shop_role: ["admin", "cashier"],
    },
  },
} as const
