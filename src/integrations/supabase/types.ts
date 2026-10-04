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
        Relationships: []
      }
      profiles: {
        Row: {
          address: string
          contact: string
          created_at: string
          id: string
          logo_url: string
          shop_name: string
          slogan: string
          subscription_active: boolean
          trial_ends_at: string
        }
        Insert: {
          address?: string
          contact?: string
          created_at?: string
          id: string
          logo_url?: string
          shop_name?: string
          slogan?: string
          subscription_active?: boolean
          trial_ends_at?: string
        }
        Update: {
          address?: string
          contact?: string
          created_at?: string
          id?: string
          logo_url?: string
          shop_name?: string
          slogan?: string
          subscription_active?: boolean
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_credit_sale: {
        Args: { _customer_id: string; _items: Json }
        Returns: string
      }
      create_sale: { Args: { _items: Json }; Returns: string }
      customer_debt: { Args: { _cid: string }; Returns: number }
      has_access: { Args: { _uid: string }; Returns: boolean }
      record_payment: {
        Args: { _amount: number; _customer_id: string }
        Returns: string
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
