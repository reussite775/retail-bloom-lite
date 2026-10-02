import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfToday } from "./format";

export const profileQuery = (uid: string) =>
  queryOptions({
    queryKey: ["profile", uid],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (error) throw error;
      return data;
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
