import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfToday } from "./format";

export const profileQuery = (uid: string) =>
  queryOptions({
    queryKey: ["profile", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").eq("id", uid).maybeSingle();
      if (error) throw error;
      return data ? { ...data, shop_name: data.name } : null;
    },
  });

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*").order("name");
    if (error) throw error;
    return data;
  },
});

export const todaySalesQuery = queryOptions({
  queryKey: ["sales", "today"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .gte("created_at", startOfToday().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const weekSalesQuery = queryOptions({
  queryKey: ["sales", "week"],
  queryFn: async () => {
    const d = startOfToday();
    d.setDate(d.getDate() - 6);
    const { data, error } = await supabase.from("sales").select("total, created_at").gte("created_at", d.toISOString());
    if (error) throw error;
    return data;
  },
});

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: async () => {
    const [c, s, p] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase.from("sales").select("id, customer_id, total, items_count, created_at").eq("is_credit", true).order("created_at", { ascending: false }),
      supabase.from("credit_payments").select("*").order("created_at", { ascending: false }),
    ]);
    if (c.error) throw c.error;
    if (s.error) throw s.error;
    if (p.error) throw p.error;
    return c.data.map((cu) => {
      const sales = s.data.filter((x) => x.customer_id === cu.id);
      const payments = p.data.filter((x) => x.customer_id === cu.id);
      const owed = sales.reduce((a, x) => a + Number(x.total), 0) - payments.reduce((a, x) => a + Number(x.amount), 0);
      return { ...cu, sales, payments, owed };
    });
  },
});

export const membershipQuery = (uid: string) =>
  queryOptions({
    queryKey: ["membership", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", uid).maybeSingle();
      if (error) throw error;
      return { shopId: data?.organization_id ?? uid, isAdmin: !data || data.role === "admin" };
    },
  });

export const teamQuery = (uid: string) =>
  queryOptions({
    queryKey: ["team", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("organization_members").select("*").eq("organization_id", uid).eq("role", "cashier").order("created_at");
      if (error) throw error;
      return data;
    },
  });

export const expensesQuery = queryOptions({
  queryKey: ["expenses"],
  queryFn: async () => {
    const { data, error } = await supabase.from("expenses").select("*").order("spent_on", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
