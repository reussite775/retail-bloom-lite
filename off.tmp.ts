import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!);
const { data: a } = await sb.auth.signInWithPassword({ email: "test.boutique2@boutik-test.app", password: "TestBoutik2026!" });
const uid = a.user!.id; const mode = process.argv[2];
if (mode === "setup") {
  console.log(await sb.from("organizations").update({ business_mode: "online" }).eq("id", uid));
  console.log(await sb.from("products").insert({ name: "OFFTEST", purchase_price: 500, sale_price: 1000, stock: 10 }).select());
} else if (mode === "check") {
  console.log("products", (await sb.from("products").select("name,stock")).data);
  console.log("sales", (await sb.from("sales").select("total,created_at")).data);
  console.log("customers", (await sb.from("customers").select("name,phone")).data);
  console.log("orders", (await sb.from("online_orders").select("customer_name,amount")).data);
} else {
  await sb.from("online_orders").delete().eq("organization_id", uid);
  console.log("cleanup", await sb.from("organizations").update({ business_mode: "physical" }).eq("id", uid));
}
